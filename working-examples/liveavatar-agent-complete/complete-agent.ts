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

// Initialize logger
initializeLogger({ pretty: true, level: 'info' });

console.log('🚀 Starting Complete LiveAvatar Agent');

const AVATAR_IDENTITY = 'liveavatar-bot';
const AVATAR_NAME = 'LiveAvatar';

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

    // Create custom agent
    const agent = new LiveAvatarPipelineAgent({
      instructions: 'You are a helpful assistant with a visual avatar. Keep responses brief.',
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
        console.log('📨 LiveAvatar:', message.type || message);
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