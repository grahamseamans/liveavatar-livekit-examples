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
import { LiveAvatarForwarder, type LiveAvatarConfig } from './liveavatar-forwarder.js';

// Initialize logger
initializeLogger({ pretty: true, level: 'info' });

console.log('🚀 Starting LiveAvatar voice agent (track capture method)');

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

    // Create LiveAvatar forwarder
    const liveAvatarForwarder = new LiveAvatarForwarder(
      liveAvatarConfig,
      ctx.room.name!,
      'liveavatar-bot'
    );

    // Create agent with instructions
    const assistant = new voice.Agent({
      instructions: `You are a helpful assistant with a visual avatar presence in a LiveKit room.
      Keep your responses brief and friendly.
      You can see that users are interacting with your avatar representation.`,
    });

    // Create agent session - let it publish audio normally
    const session = new voice.AgentSession({
      stt: 'deepgram/nova-2:en',
      llm: 'openai/gpt-4o-mini',
      tts: 'elevenlabs/eleven_turbo_v2:21m00Tcm4TlvDq8ikWAM',
      vad: ctx.proc.userData.vad as silero.VAD,
    });

    // DO NOT set custom audio output - let agent publish normally

    // Handle agent state changes and forward to LiveAvatar
    session.on('agent_state_changed', (event: any) => {
      console.log(`🔄 Agent state: ${event.old_state} → ${event.new_state}`);

      if (event.old_state === 'speaking' && event.new_state === 'listening') {
        // Agent finished speaking
        liveAvatarForwarder.onSpeechEnd();
      }
    });

    // Handle interruptions
    session.on('conversation_item_added', (event: any) => {
      if (session.currentSpeech && session.currentSpeech.interrupted) {
        console.log('🛑 User interrupted agent');
        liveAvatarForwarder.onInterrupt();
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
        audioEnabled: true, // This enables TTS processing and publishing
      },
    });

    console.log('✅ Agent session started');

    // Say hello immediately to force audio track publication
    session.say('Hello! I am your avatar assistant. How can I help you today?');
    console.log('💬 Triggered initial speech to publish audio track');

    // Wait a moment for the track to be published
    await new Promise(resolve => setTimeout(resolve, 500));

    // Start LiveAvatar forwarder after track is published
    // We pass the agent participant which is publishing audio
    await liveAvatarForwarder.start(ctx.room, ctx.room.localParticipant!);
    console.log('✅ LiveAvatar forwarder started');

    // Handle cleanup on disconnect
    ctx.room.on('disconnected', async () => {
      console.log('🔌 Room disconnected, stopping LiveAvatar session');
      await liveAvatarForwarder.stop();
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