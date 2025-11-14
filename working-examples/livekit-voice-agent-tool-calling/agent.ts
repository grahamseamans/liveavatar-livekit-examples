import {
    type JobContext,
    type JobProcess,
    WorkerOptions,
    cli,
    defineAgent,
    llm,
    voice,
} from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as openai from '@livekit/agents-plugin-openai';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

// Load environment variables from project root .env file
config({ path: resolve(process.cwd(), '.env') });

// ============================================================================
// MOCK TOOL IMPLEMENTATIONS WITH ARTIFICIAL LATENCY AND ERRORS
// ============================================================================

// Utility to simulate network latency (reduced for snappier responses)
async function simulateLatency(minMs: number = 300, maxMs: number = 1500): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    console.log(`  ⏱️  Simulating network latency: ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
}

// Utility to simulate random failures (20% failure rate)
function shouldFail(failureRate: number = 0.2): boolean {
    return Math.random() < failureRate;
}

// Mock flight data
const MOCK_FLIGHTS = [
    {
        id: 'UA123',
        airline: 'United Airlines',
        departure: '6:00 AM',
        arrival: '9:15 AM',
        price: 450,
        stops: 1,
        duration: '5h 15m',
    },
    {
        id: 'AA456',
        airline: 'American Airlines',
        departure: '7:30 AM',
        arrival: '10:45 AM',
        price: 380,
        stops: 1,
        duration: '5h 15m',
    },
    {
        id: 'DL789',
        airline: 'Delta',
        departure: '5:45 AM',
        arrival: '11:30 AM',
        price: 520,
        stops: 2,
        duration: '7h 45m',
    },
];

// Tool 1: Search for flights
const searchFlights = llm.tool({
    description: 'Search for available flights to a destination with optional filters for arrival time and price',
    parameters: z.object({
        destination: z.string().describe('Destination city (e.g., "San Francisco", "SF")'),
        arrivalBefore: z.string().nullable().optional().describe('Latest acceptable arrival time (e.g., "10:00 AM")'),
        maxPrice: z.number().nullable().optional().describe('Maximum price in USD'),
    }),
    execute: async ({ destination, arrivalBefore, maxPrice }) => {
        console.log('\n🔍 TOOL CALL: searchFlights');
        console.log(`  📍 Destination: ${destination}`);
        console.log(`  ⏰ Arrival before: ${arrivalBefore ?? 'any time'}`);
        console.log(`  💰 Max price: ${maxPrice ? `$${maxPrice}` : 'any price'}`);

        await simulateLatency(400, 1200);

        if (shouldFail(0.15)) {
            console.log('  ❌ Flight search API temporarily unavailable');
            throw new Error('Flight search service temporarily unavailable. Please try again.');
        }

        // Filter flights based on criteria
        let flights = [...MOCK_FLIGHTS];

        if (arrivalBefore) {
            const targetTime = arrivalBefore.toLowerCase().includes('am') ?
                parseInt(arrivalBefore) : parseInt(arrivalBefore) + 12;
            flights = flights.filter(f => {
                const arrTime = f.arrival.toLowerCase().includes('am') ?
                    parseInt(f.arrival) : parseInt(f.arrival) + 12;
                return arrTime <= targetTime;
            });
        }

        if (maxPrice) {
            flights = flights.filter(f => f.price <= maxPrice);
        }

        flights.sort((a, b) => a.price - b.price);

        console.log(`  ✅ Found ${flights.length} flights`);

        return {
            success: true,
            flights,
            message: flights.length === 0
                ? 'No flights found matching your criteria'
                : `Found ${flights.length} flight(s) to ${destination}`,
            hasDirectFlights: false,
        };
    },
});

// Tool 2: Check calendar availability
const checkCalendar = llm.tool({
    description: 'Check the user\'s calendar for availability at a specific time',
    parameters: z.object({
        date: z.string().describe('Date to check (e.g., "tomorrow", "2024-01-15")'),
        timeRange: z.string().describe('Time range to check (e.g., "morning", "9:00 AM - 12:00 PM")'),
    }),
    execute: async ({ date, timeRange }) => {
        console.log('\n📅 TOOL CALL: checkCalendar');
        console.log(`  📆 Date: ${date}`);
        console.log(`  ⏰ Time range: ${timeRange}`);

        await simulateLatency(300, 1000);

        if (shouldFail(0.25)) {
            console.log('  ❌ Calendar API rate limit exceeded');
            throw new Error('Calendar service rate limit exceeded. Retrying...');
        }

        // Mock calendar check - assume morning is usually free
        const isMorning = timeRange.toLowerCase().includes('morning') ||
            timeRange.toLowerCase().includes('am');
        const isAvailable = isMorning ? Math.random() > 0.2 : Math.random() > 0.5;

        console.log(`  ✅ Calendar checked: ${isAvailable ? 'Available' : 'Busy'}`);

        return {
            success: true,
            available: isAvailable,
            conflicts: isAvailable ? [] : ['Team meeting at 9:30 AM'],
            message: isAvailable
                ? `You're available during ${timeRange} on ${date}`
                : `You have conflicts during ${timeRange} on ${date}`,
        };
    },
});

// Tool 3: Get weather forecast
const getWeather = llm.tool({
    description: 'Get weather forecast for a location to check for potential flight delays',
    parameters: z.object({
        location: z.string().describe('City or airport code'),
        date: z.string().describe('Date for forecast (e.g., "tomorrow", "2024-01-15")'),
    }),
    execute: async ({ location, date }) => {
        console.log('\n🌤️  TOOL CALL: getWeather');
        console.log(`  📍 Location: ${location}`);
        console.log(`  📆 Date: ${date}`);

        await simulateLatency(200, 800);

        if (shouldFail(0.1)) {
            console.log('  ❌ Weather API connection timeout');
            throw new Error('Weather service connection timeout. Retrying...');
        }

        // Mock weather data
        const conditions = ['Clear', 'Partly Cloudy', 'Foggy', 'Light Rain'];
        const condition = conditions[Math.floor(Math.random() * conditions.length)];
        const hasFog = condition === 'Foggy';
        const temp = Math.floor(Math.random() * 20) + 50;

        console.log(`  ✅ Weather: ${condition}, ${temp}°F`);

        return {
            success: true,
            condition,
            temperature: temp,
            delayRisk: hasFog ? 'high' : 'low',
            message: hasFog
                ? `Foggy conditions expected in ${location} - potential delays`
                : `${condition} weather expected in ${location} - low delay risk`,
        };
    },
});

// Tool 4: Book a flight
const bookFlight = llm.tool({
    description: 'Book a specific flight by flight ID',
    parameters: z.object({
        flightId: z.string().describe('Flight ID to book (e.g., "UA123")'),
        passengerName: z.string().describe('Passenger name'),
    }),
    execute: async ({ flightId, passengerName }) => {
        console.log('\n✈️  TOOL CALL: bookFlight');
        console.log(`  🎫 Flight ID: ${flightId}`);
        console.log(`  👤 Passenger: ${passengerName}`);

        await simulateLatency(800, 1800);

        if (shouldFail(0.2)) {
            console.log('  ❌ Booking system error - payment processing failed');
            throw new Error('Payment processing failed. Please try again.');
        }

        const flight = MOCK_FLIGHTS.find(f => f.id === flightId);
        if (!flight) {
            console.log('  ❌ Flight not found');
            return {
                success: false,
                message: `Flight ${flightId} not found`,
            };
        }

        const confirmationNumber = `${flightId}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        console.log(`  ✅ Booking confirmed: ${confirmationNumber}`);

        return {
            success: true,
            confirmationNumber,
            flight,
            message: `Successfully booked ${flight.airline} flight ${flightId} for ${passengerName}. Confirmation: ${confirmationNumber}`,
        };
    },
});

// Tool 5: Send confirmation email
const sendEmail = llm.tool({
    description: 'Send flight confirmation email with itinerary details',
    parameters: z.object({
        recipient: z.string().describe('Email recipient'),
        subject: z.string().describe('Email subject'),
        confirmationNumber: z.string().describe('Booking confirmation number'),
        flightDetails: z.string().describe('Flight details to include in email'),
    }),
    execute: async ({ recipient, subject, confirmationNumber, flightDetails }) => {
        console.log('\n📧 TOOL CALL: sendEmail');
        console.log(`  📬 To: ${recipient}`);
        console.log(`  📝 Subject: ${subject}`);
        console.log(`  🎫 Confirmation: ${confirmationNumber}`);

        await simulateLatency(400, 1200);

        if (shouldFail(0.15)) {
            console.log('  ❌ Email service temporarily unavailable');
            throw new Error('Email service temporarily unavailable. Retrying...');
        }

        console.log('  ✅ Email sent successfully');

        return {
            success: true,
            messageId: `msg-${Math.random().toString(36).substring(2, 10)}`,
            message: `Confirmation email sent to ${recipient}`,
        };
    },
});

export default defineAgent({
    // Prewarm runs once when process starts - load heavy models here
    prewarm: async (proc: JobProcess) => {
        console.log('Prewarming agent: Loading VAD model...');
        proc.userData.vad = await silero.VAD.load();
        console.log('VAD model loaded successfully');
    },

    // Entry runs for each job - create and start your agent here
    entry: async (ctx: JobContext) => {
        console.log('Agent entry: Starting new job');

        // Connect to LiveKit room
        await ctx.connect();
        console.log('Connected to room:', ctx.room.name);

        // Wait for a participant to join
        const participant = await ctx.waitForParticipant();
        console.log('Participant joined:', participant.identity);

        // Create the voice agent with flight booking capabilities
        const agent = new voice.Agent({
            instructions:
                'You are a proactive flight booking assistant. Be direct and action-oriented.\n\n' +
                'IMPORTANT BEHAVIOR:\n' +
                '- Make reasonable assumptions from context (e.g., "morning" = 9-11 AM)\n' +
                '- ALWAYS announce when you\'re about to use a tool: "Let me search for flights..."\n' +
                '- ALWAYS confirm tool results: "Found 3 flights" or "Checked your calendar - you\'re free"\n' +
                '- Only ask questions when absolutely necessary (missing destination, passenger name, email)\n' +
                '- Be concise - avoid long explanations\n\n' +
                'WORKFLOW:\n' +
                '1. Announce: "Let me search for flights..."\n' +
                '2. Use searchFlights, checkCalendar, getWeather in parallel\n' +
                '3. Summarize results briefly: "Found 3 options, you\'re available, weather looks good"\n' +
                '4. Present best option and ask for confirmation\n' +
                '5. Book immediately when confirmed\n' +
                '6. Send email confirmation\n\n' +
                'Handle failures gracefully but briefly: "Search failed, retrying..."',
            tools: {
                searchFlights,
                checkCalendar,
                getWeather,
                bookFlight,
                sendEmail,
            },
        });

        // Create agent session with direct provider plugins (more reliable)
        const session = new voice.AgentSession({
            stt: new deepgram.STT(),
            llm: new openai.LLM({ model: 'gpt-4o-mini' }),
            tts: new elevenlabs.TTS({
                voiceId: '21m00Tcm4TlvDq8ikWAM',
                model: 'eleven_turbo_v2'
            }),

            // Use preloaded VAD
            vad: ctx.proc.userData.vad as silero.VAD,

            // Voice interaction options
            voiceOptions: {
                allowInterruptions: true,
                minInterruptionDuration: 500,
                minInterruptionWords: 0,
                maxEndpointingDelay: 6000,
            },
        });

        // Listen to session events for monitoring
        session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
            console.log(`\n🤖 Agent state: ${ev.oldState} -> ${ev.newState}`);
        });

        session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
            console.log('\n👤 User said:', ev.transcript);
        });

        session.on(voice.AgentSessionEventTypes.Error, (ev) => {
            console.error('\n❌ Agent error:', ev.error);
        });

        // Start the session
        await session.start({
            agent,
            room: ctx.room,
        });

        console.log('Agent session started');

        // Greet the user
        console.log('\n👋 Greeting user...');
        await session.generateReply({
            instructions: 'Greet the user briefly: "Hi! I can help you book flights. Where would you like to go?"',
        });
    },
});

// Initialize worker with configuration
// Agent Dispatch Modes:
// - NO agentName: AUTOMATIC dispatch - agent joins ALL new rooms automatically (best for local dev)
// - WITH agentName: EXPLICIT dispatch - agent waits for manual dispatch command (use for prod/multi-agent setups)
cli.runApp(
    new WorkerOptions({
        agent: fileURLToPath(import.meta.url),
        // agentName not set = auto-dispatch enabled - agent will join all new rooms
        port: 3829,
        numIdleProcesses: 1,
    })
);