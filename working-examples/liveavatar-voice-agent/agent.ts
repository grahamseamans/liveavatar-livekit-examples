/**
 * LiveAvatar Voice Agent
 *
 * This agent:
 * 1. Handles conversation with STT -> LLM -> TTS
 * 2. Sends TTS audio to LiveAvatar's WebSocket
 * 3. LiveAvatar generates video and publishes to room
 */

// Polyfill ErrorEvent for Node.js
if (typeof ErrorEvent === 'undefined') {
  (global as any).ErrorEvent = class ErrorEvent extends Error {
    constructor(message: string) {
      super(message);
      this.message = message;
    }
  };
}

import 'dotenv/config';
import {
  type JobContext,
  type JobProcess,
  WorkerOptions,
  cli,
  defineAgent,
  voice,
  initializeLogger,
} from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import * as silero from '@livekit/agents-plugin-silero';
import { fileURLToPath } from 'url';
import { LiveAvatarAudioOutput, type LiveAvatarConfig } from './liveavatar-audio-output.js';

// Initialize logger
initializeLogger({ pretty: true, level: 'info' });

console.log('🚀 Starting LiveAvatar voice agent');

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    // Preload VAD model for faster startup
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    await ctx.connect();
    console.log(`✅ Agent connected to room: ${ctx.room.name}`);

    const participant = await ctx.waitForParticipant();
    console.log(`👤 Participant ready: ${participant.identity}`);

    // Configure LiveAvatar
    const liveAvatarConfig: LiveAvatarConfig = {
      apiKey: process.env.LIVE_AVATAR_API_KEY!,
      avatarId: process.env.LIVE_AVATAR_ID!, // Optional, will use first active if not set
      livekitUrl: process.env.LIVEKIT_URL!,
      livekitApiKey: process.env.LIVEKIT_API_KEY!,
      livekitApiSecret: process.env.LIVEKIT_API_SECRET!,
    };

    // Create LiveAvatar audio output
    const liveAvatarOutput = new LiveAvatarAudioOutput(
      liveAvatarConfig,
      ctx.room.name!,
      'liveavatar-bot'
    );

    // Start LiveAvatar session (creates session, gets WebSocket URL, connects)
    console.log('🎭 Starting LiveAvatar session...');
    await liveAvatarOutput.start(ctx.room);
    console.log('✅ LiveAvatar connected and ready');

    // Create agent with instructions
    const assistant = new voice.Agent({
      instructions: `You are a helpful assistant with a visual avatar presence in a LiveKit room.
      Keep your responses brief and friendly.
      You can see that users are interacting with your avatar representation.`,
    });

    // Create agent session with custom audio output
    const session = new voice.AgentSession({
      stt: 'deepgram/nova-2:en',
      llm: 'openai/gpt-4o-mini',
      tts: 'elevenlabs/eleven_turbo_v2:21m00Tcm4TlvDq8ikWAM',
      vad: ctx.proc.userData.vad as silero.VAD,
    });

    // Set our custom LiveAvatar audio output
    session.output.audio = liveAvatarOutput;

    // Handle agent state changes and forward to LiveAvatar
    session.on('agent_state_changed', (event: any) => {
      console.log(`🔄 Agent state: ${event.old_state} → ${event.new_state}`);

      if (event.old_state === 'speaking' && event.new_state === 'listening') {
        // Agent finished speaking
        liveAvatarOutput.flush();
      }
    });

    // Handle interruptions
    session.on('conversation_item_added', (event: any) => {
      if (session.currentSpeech && session.currentSpeech.interrupted) {
        console.log('🛑 User interrupted agent');
        liveAvatarOutput.clearBuffer();
      }
    });

    // Log user speech
    session.on('user_speech_committed', (message: any) => {
      console.log(`🎤 User: "${message.content}"`);
    });

    // Log agent speech
    session.on('agent_speech_committed', (message: any) => {
      console.log(`🤖 Agent: "${message.content}"`);
    });

    // Log errors
    session.on('error', (error: any) => {
      console.error('❌ Error:', error);
    });

    // Start the session
    await session.start({
      agent: assistant,
      room: ctx.room,
      outputOptions: {
        audioEnabled: true, // This enables TTS processing
      },
    });

    console.log('✅ Agent session started with LiveAvatar');

    // Say hello
    setTimeout(() => {
      session.say('Hello! I am your avatar assistant. How can I help you today?');
    }, 2000);

    // Handle cleanup on disconnect
    ctx.room.on('disconnected', async () => {
      console.log('🔌 Room disconnected, stopping LiveAvatar session');
      await liveAvatarOutput.stop();
    });
  },
});

// Run the worker
// Auto-dispatch mode - agent joins all new rooms automatically
cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    // agentName: 'liveavatar-agent', // Uncomment for manual dispatch
    numIdleProcesses: 1,
    logLevel: 'info',
  })
);