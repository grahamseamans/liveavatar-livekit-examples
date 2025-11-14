// Simple LiveAvatar Pipeline - Just intercept TTS audio and send it somewhere
import 'dotenv/config';
import {
  type JobContext,
  type JobProcess,
  WorkerOptions,
  cli,
  defineAgent,
  voice,
} from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import * as openai from '@livekit/agents-plugin-openai';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import { AudioFrame } from '@livekit/rtc-node';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import crypto from 'crypto';

// Extend the Agent class to override ttsNode
class CustomAgent extends voice.Agent {
  ws: WebSocket | null = null;

  // Override ttsNode to intercept audio
  async ttsNode(
    text: ReadableStream<string>,
    modelSettings: voice.ModelSettings,
  ): Promise<ReadableStream<AudioFrame> | null> {
    console.log('🎯 Intercepting TTS audio');

    // Get audio from default TTS pipeline
    const audioStream = await voice.Agent.default.ttsNode(this, text, modelSettings);
    if (!audioStream) return null;

    const ws = this.ws;
    const eventId = crypto.randomUUID();

    // Send start event if connected (using LiveAvatar format)
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

              // Send chunks of audio to WebSocket
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

            // DON'T pass frame through to LiveKit - only send to WebSocket
            // controller.enqueue(frame);  // COMMENTED OUT - audio only goes to WebSocket
          }

          // Send end event (using LiveAvatar format)
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

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    await ctx.connect();
    console.log(`✅ Connected to room: ${ctx.room.name}`);

    const participant = await ctx.waitForParticipant();
    console.log(`👤 Participant connected: ${participant.identity}`);

    const agent = new CustomAgent({
      instructions: 'You are a helpful assistant. Keep responses brief.',
    });

    // Connect WebSocket to debug server
    agent.ws = new WebSocket('ws://localhost:8889');
    await new Promise((resolve) => {
      agent.ws!.on('open', () => {
        console.log('✅ WebSocket connected to debug server');
        resolve(undefined);
      });
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

    // Start with correct API
    await session.start({
      agent,
      room: ctx.room,
      participant,
      outputOptions: {
        audioEnabled: true,  // Keep audio enabled so we can hear it
      },
    });
    console.log('🚀 Agent running - TTS audio will be intercepted');
  },
});

// Run with CLI
cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));