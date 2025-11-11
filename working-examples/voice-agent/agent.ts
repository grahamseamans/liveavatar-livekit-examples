/**
 * Simple Voice Agent
 *
 * This agent uses Deepgram for STT, OpenAI for LLM, and ElevenLabs for TTS.
 * Run with: npm run worker (or tsx simple-agent.ts dev)
 */

// Polyfill ErrorEvent for Node.js (browser API not available in Node)
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

// Initialize logger before creating worker
initializeLogger({ pretty: true, level: 'info' });

console.log('🚀 Starting agent worker (simple-agent)');

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    await ctx.connect();
    console.log(`✅ Agent connected to room: ${ctx.room.name}`);

    const participant = await ctx.waitForParticipant();
    console.log(`👤 Participant ready: ${participant.identity}`);

    // Create agent
    const assistant = new voice.Agent({
      instructions: 'You are a helpful assistant in a LiveKit room. Keep your responses brief and friendly.',
    });

    // Create session with STT/LLM/TTS pipeline using inference gateway
    const session = new voice.AgentSession({
      stt: 'deepgram/nova-2:en',
      llm: 'openai/gpt-4o-mini',
      tts: 'elevenlabs/eleven_turbo_v2:21m00Tcm4TlvDq8ikWAM',
      vad: ctx.proc.userData.vad as silero.VAD,
    });

    // Log user speech
    session.on('user_speech_committed', (message) => {
      console.log(`🎤 User: "${message.content}"`);
    });

    // Log agent speech
    session.on('agent_speech_committed', (message) => {
      console.log(`🤖 Agent: "${message.content}"`);
    });

    // Log errors
    session.on('error', (error) => {
      console.error('❌ Error:', error);
    });
    await session.start({
      agent: assistant,
      room: ctx.room,
      outputOptions: {
        audioEnabled: true,
      },
    });

    console.log('✅ Agent session started');

    // Say hello
    setTimeout(() => {
      session.say('Hello! I can hear you now. How can I help?');
    }, 1000);
  },
});

// Run the worker (this is the correct pattern per LiveKit docs)
cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: 'simple-agent',
    numIdleProcesses: 1, // Keep 1 agent process ready
    logLevel: 'info',
  })
);
