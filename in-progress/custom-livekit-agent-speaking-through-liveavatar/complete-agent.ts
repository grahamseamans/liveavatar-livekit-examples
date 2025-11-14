/**
 * Complete LiveAvatar Agent with Pipeline Interception
 *
 * This combines:
 * 1. LiveAvatar session spawning (from liveavatar-agent-standard)
 * 2. TTS pipeline interception to route audio to avatar WebSocket
 */

import 'dotenv/config';
import {
  type JobContext,
  type JobProcess,
  WorkerOptions,
  cli,
  defineAgent,
  llm,
  voice,
  initializeLogger,
} from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import * as openai from '@livekit/agents-plugin-openai';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import { AudioFrame } from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import crypto from 'crypto';
import { z } from 'zod';

// Initialize logger
initializeLogger({ pretty: true, level: 'info' });

console.log('🚀 Starting Complete LiveAvatar Agent');

const AVATAR_IDENTITY = 'liveavatar-bot';
const AVATAR_NAME = 'LiveAvatar';

// ============================================================================
// MOCK TOOL IMPLEMENTATIONS
// ============================================================================

// Utility to simulate network latency
async function simulateLatency(minMs: number = 300, maxMs: number = 1500): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  console.log(`  ⏱️  Simulating latency: ${delay}ms`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

// Utility to simulate random failures
function shouldFail(failureRate: number = 0.2): boolean {
  return Math.random() < failureRate;
}

// Mock flight data
const MOCK_FLIGHTS = [
  { id: 'UA123', airline: 'United Airlines', departure: '6:00 AM', arrival: '9:15 AM', price: 450, stops: 1, duration: '5h 15m' },
  { id: 'AA456', airline: 'American Airlines', departure: '7:30 AM', arrival: '10:45 AM', price: 380, stops: 1, duration: '5h 15m' },
  { id: 'DL789', airline: 'Delta', departure: '5:45 AM', arrival: '11:30 AM', price: 520, stops: 2, duration: '7h 45m' },
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
    await simulateLatency(400, 1200);
    if (shouldFail(0.15)) throw new Error('Flight search service temporarily unavailable. Please try again.');

    let flights = [...MOCK_FLIGHTS];
    if (arrivalBefore) {
      const targetTime = arrivalBefore.toLowerCase().includes('am') ? parseInt(arrivalBefore) : parseInt(arrivalBefore) + 12;
      flights = flights.filter(f => {
        const arrTime = f.arrival.toLowerCase().includes('am') ? parseInt(f.arrival) : parseInt(f.arrival) + 12;
        return arrTime <= targetTime;
      });
    }
    if (maxPrice) flights = flights.filter(f => f.price <= maxPrice);
    flights.sort((a, b) => a.price - b.price);
    console.log(`  ✅ Found ${flights.length} flights`);
    return { success: true, flights, message: flights.length === 0 ? 'No flights found matching your criteria' : `Found ${flights.length} flight(s) to ${destination}` };
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
    await simulateLatency(300, 1000);
    if (shouldFail(0.25)) throw new Error('Calendar service rate limit exceeded. Retrying...');
    const isMorning = timeRange.toLowerCase().includes('morning') || timeRange.toLowerCase().includes('am');
    const isAvailable = isMorning ? Math.random() > 0.2 : Math.random() > 0.5;
    console.log(`  ✅ Calendar: ${isAvailable ? 'Available' : 'Busy'}`);
    return { success: true, available: isAvailable, conflicts: isAvailable ? [] : ['Team meeting at 9:30 AM'], message: isAvailable ? `You're available during ${timeRange} on ${date}` : `You have conflicts during ${timeRange} on ${date}` };
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
    await simulateLatency(200, 800);
    if (shouldFail(0.1)) throw new Error('Weather service connection timeout. Retrying...');
    const conditions = ['Clear', 'Partly Cloudy', 'Foggy', 'Light Rain'];
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    const hasFog = condition === 'Foggy';
    const temp = Math.floor(Math.random() * 20) + 50;
    console.log(`  ✅ Weather: ${condition}, ${temp}°F`);
    return { success: true, condition, temperature: temp, delayRisk: hasFog ? 'high' : 'low', message: hasFog ? `Foggy conditions expected in ${location} - potential delays` : `${condition} weather expected in ${location} - low delay risk` };
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
    await simulateLatency(800, 1800);
    if (shouldFail(0.2)) throw new Error('Payment processing failed. Please try again.');
    const flight = MOCK_FLIGHTS.find(f => f.id === flightId);
    if (!flight) return { success: false, message: `Flight ${flightId} not found` };
    const confirmationNumber = `${flightId}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    console.log(`  ✅ Booking confirmed: ${confirmationNumber}`);
    return { success: true, confirmationNumber, flight, message: `Successfully booked ${flight.airline} flight ${flightId} for ${passengerName}. Confirmation: ${confirmationNumber}` };
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
    await simulateLatency(400, 1200);
    if (shouldFail(0.15)) throw new Error('Email service temporarily unavailable. Retrying...');
    console.log('  ✅ Email sent successfully');
    return { success: true, messageId: `msg-${Math.random().toString(36).substring(2, 10)}`, message: `Confirmation email sent to ${recipient}` };
  },
});

// Custom Agent that intercepts TTS and sends to LiveAvatar WebSocket
class LiveAvatarPipelineAgent extends voice.Agent {
  ws: WebSocket | null = null;
  wsUrl: string | null = null;

  // Override ttsNode to intercept audio
  async ttsNode(
    text: ReadableStream<string>,
    modelSettings: voice.ModelSettings,
  ): Promise<ReadableStream<AudioFrame> | null> {
    console.log('🎯 Intercepting TTS audio for LiveAvatar');

    // Get audio from default TTS pipeline
    const audioStream = await voice.Agent.default.ttsNode(this, text, modelSettings);
    if (!audioStream) return null;

    const ws = this.ws;
    const eventId = crypto.randomUUID();

    // Send start event if connected
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'agent.speak_started', event_id: eventId }));
    }

    // Return modified stream
    return new ReadableStream<AudioFrame>({
      async start(controller) {
        const reader = audioStream.getReader();
        let audioBuffer: number[] = [];

        try {
          while (true) {
            const { done, value: frame } = await reader.read();
            if (done) break;

            // Extract audio samples
            if (frame?.data) {
              const samples = Array.from(new Int16Array(frame.data));
              audioBuffer.push(...samples);

              // Send chunks of audio to LiveAvatar WebSocket
              while (audioBuffer.length >= 2400 && ws?.readyState === WebSocket.OPEN) {
                const chunk = audioBuffer.splice(0, 2400);
                const base64 = Buffer.from(new Int16Array(chunk).buffer).toString('base64');

                ws.send(JSON.stringify({
                  type: 'agent.speak',
                  event_id: eventId,
                  audio: base64,
                }));
              }
            }

            // DON'T pass audio to LiveKit - avatar handles playback
            // controller.enqueue(frame);  // SUPPRESSED
          }

          // Send any remaining audio
          if (audioBuffer.length > 0 && ws?.readyState === WebSocket.OPEN) {
            const base64 = Buffer.from(new Int16Array(audioBuffer).buffer).toString('base64');
            ws.send(JSON.stringify({
              type: 'agent.speak',
              event_id: eventId,
              audio: base64,
            }));
          }

          // Send end event
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'agent.speak_end', event_id: eventId }));
          }
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });
  }
}

/**
 * Start LiveAvatar session and get WebSocket URL
 */
async function startLiveAvatarSession(
  room: any,
  localIdentity: string
): Promise<{ sessionId: string; wsUrl: string }> {
  console.log('🎭 Starting LiveAvatar session...');

  // Step 1: Get avatar ID
  const avatarsResponse = await fetch('https://api.liveavatar.com/v1/avatars/public', {
    headers: { 'X-API-KEY': process.env.LIVE_AVATAR_API_KEY! },
  });

  if (!avatarsResponse.ok) {
    throw new Error(`Failed to fetch avatars: ${avatarsResponse.status}`);
  }

  const avatarsData = await avatarsResponse.json();
  const activeAvatars = avatarsData.data.results.filter((a: any) => a.status === 'ACTIVE');
  const avatarId = process.env.LIVE_AVATAR_ID || activeAvatars[0]?.id;

  if (!avatarId) {
    throw new Error('No avatar ID provided and no active avatars found');
  }

  console.log(`Using avatar: ${avatarId}`);

  // Step 2: Create LiveKit token for avatar
  const avatarToken = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!
  );
  avatarToken.identity = AVATAR_IDENTITY;
  avatarToken.name = AVATAR_NAME;
  avatarToken.kind = 'agent';
  avatarToken.ttl = '60s';
  avatarToken.attributes = { 'lk.publish_on_behalf': localIdentity };
  avatarToken.addGrant({
    roomJoin: true,
    room: room.name,
    canPublish: true,
    canPublishData: true,  // Required for LiveAvatar
    canSubscribe: true
  });

  const jwt = await avatarToken.toJwt();

  // Step 3: Create LiveAvatar session
  const tokenPayload = {
    mode: 'CUSTOM',
    avatar_id: avatarId,
    livekit_config: {
      livekit_url: process.env.LIVEKIT_URL!,
      livekit_room: room.name,
      livekit_client_token: jwt,
    },
  };

  const tokenResponse = await fetch('https://api.liveavatar.com/v1/sessions/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': process.env.LIVE_AVATAR_API_KEY!,
    },
    body: JSON.stringify(tokenPayload),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Failed to create session token: ${tokenResponse.status} - ${error}`);
  }

  const tokenData = await tokenResponse.json();
  const sessionToken = tokenData.data.session_token;
  const sessionId = tokenData.data.session_id;

  console.log(`Session token created: ${sessionId}`);

  // Step 4: Start LiveAvatar session and get WebSocket URL
  const startResponse = await fetch('https://api.liveavatar.com/v1/sessions/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({}),
  });

  if (!startResponse.ok) {
    const error = await startResponse.text();
    throw new Error(`Failed to start session: ${startResponse.status} - ${error}`);
  }

  const startData = await startResponse.json();
  const wsUrl = startData.data.ws_url || 'wss://api.heygen.com/v1/streaming.avatar.ws';

  console.log('✅ LiveAvatar session started');
  console.log(`📡 WebSocket URL: ${wsUrl}`);

  return { sessionId, wsUrl };
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    await ctx.connect();
    console.log(`✅ Connected to room: ${ctx.room.name}`);

    const participant = await ctx.waitForParticipant();
    console.log(`👤 Participant connected: ${participant.identity}`);

    // Get local agent identity
    const localIdentity = ctx.room.localParticipant?.identity || 'agent';

    // Start LiveAvatar session
    const { sessionId, wsUrl } = await startLiveAvatarSession(ctx.room, localIdentity);

    // Create custom agent with flight booking capabilities
    const agent = new LiveAvatarPipelineAgent({
      instructions:
        'You are a proactive flight booking assistant with a visual avatar. Be direct and action-oriented.\n\n' +
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

    // Store WebSocket URL
    agent.wsUrl = wsUrl;

    // Connect to LiveAvatar WebSocket
    agent.ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      agent.ws!.on('open', () => {
        console.log('✅ Connected to LiveAvatar WebSocket');
        resolve(undefined);
      });
      agent.ws!.on('error', reject);
    });

    // Handle WebSocket messages from LiveAvatar
    agent.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        // Only log important events, skip verbose audio buffer messages
        const importantEvents = ['error', 'agent.speak_started', 'agent.speak_ended', 'agent.idle_started', 'agent.idle_ended'];
        if (importantEvents.includes(message.type)) {
          console.log('📨 LiveAvatar:', message.type);
        }
      } catch (e) {
        // Handle non-JSON messages
      }
    });

    // Create session with plugins
    const session = new voice.AgentSession({
      stt: new deepgram.STT(),
      llm: new openai.LLM(),
      tts: new elevenlabs.TTS({
        voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel
      }),
      vad: ctx.proc.userData.vad,
    });

    // Start session
    await session.start({
      agent,
      room: ctx.room,
      participant,
      outputOptions: {
        audioEnabled: true,  // Must be true for TTS pipeline to run (we suppress in ttsNode)
      },
    });

    console.log('🚀 Agent running - TTS audio routed to LiveAvatar');
    console.log(`📺 Avatar should appear in room as "${AVATAR_IDENTITY}"`);
  },
});

// Run with CLI
cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));