/**
 * LiveAvatar Voice Agent (Standard Pattern)
 *
 * Uses DataStreamAudioOutput like all other avatar plugins
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
import { TrackKind } from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { fileURLToPath } from 'url';

// Initialize logger
initializeLogger({ pretty: true, level: 'info' });

console.log('🚀 Starting LiveAvatar agent (standard pattern)');

// Following the Anam pattern exactly
const ATTRIBUTE_PUBLISH_ON_BEHALF = 'lk.publish_on_behalf';
const AVATAR_IDENTITY = 'liveavatar-bot';
const AVATAR_NAME = 'LiveAvatar';

/**
 * Start LiveAvatar session (following standard avatar pattern)
 */
async function startLiveAvatarSession(
  room: any,
  localIdentity: string
): Promise<string> {
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

  // Step 2: Create LiveKit token for avatar participant
  // This follows the exact pattern from Anam/Bey plugins
  const avatarToken = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!
  );
  avatarToken.identity = AVATAR_IDENTITY;
  avatarToken.name = AVATAR_NAME;
  avatarToken.kind = 'agent';
  avatarToken.ttl = '60s';
  // Critical: Allow avatar to publish on behalf of our agent
  avatarToken.attributes = { [ATTRIBUTE_PUBLISH_ON_BEHALF]: localIdentity };
  avatarToken.addGrant({
    roomJoin: true,
    room: room.name,
    canPublish: true,
    canPublishData: true,  // Required for LiveAvatar!
    canSubscribe: true
  });

  const jwt = await avatarToken.toJwt();

  // Step 3: Create LiveAvatar session with LiveKit config
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

  // Step 4: Start LiveAvatar session
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

  console.log('✅ LiveAvatar session started');
  return sessionId;
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    // Preload VAD for faster startup
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    await ctx.connect();
    console.log(`✅ Agent connected to room: ${ctx.room.name}`);

    const participant = await ctx.waitForParticipant();
    console.log(`👤 Participant ready: ${participant.identity}`);

    // Get local agent identity
    const localIdentity = ctx.room.localParticipant?.identity || 'agent';

    // Start LiveAvatar session
    const sessionId = await startLiveAvatarSession(ctx.room, localIdentity);

    // Create agent
    const assistant = new voice.Agent({
      instructions: 'You are a helpful assistant with a visual avatar presence. Keep your responses brief and friendly.',
    });

    // Create session
    const session = new voice.AgentSession({
      stt: 'deepgram/nova-2:en',
      llm: 'openai/gpt-4o-mini',
      tts: 'elevenlabs/eleven_turbo_v2:21m00Tcm4TlvDq8ikWAM',
      vad: ctx.proc.userData.vad as silero.VAD,
    });

    // Use DataStreamAudioOutput (standard pattern from all avatar plugins)
    session.output.audio = new voice.DataStreamAudioOutput({
      room: ctx.room,
      destinationIdentity: AVATAR_IDENTITY,
      waitRemoteTrack: TrackKind.KIND_VIDEO, // Wait for avatar video before starting
    });

    console.log('✅ DataStreamAudioOutput configured');

    // Log events
    session.on('user_speech_committed', (message: any) => {
      console.log(`🎤 User: "${message.content}"`);
    });

    session.on('agent_speech_committed', (message: any) => {
      console.log(`🤖 Agent: "${message.content}"`);
    });

    session.on('error', (error: any) => {
      console.error('❌ Error:', error);
    });

    // Start the session
    await session.start({
      agent: assistant,
      room: ctx.room,
      outputOptions: {
        audioEnabled: false,  // Disable RoomIO audio - use DataStreamAudioOutput only
      },
    });

    console.log('✅ Agent session started');

    // Say hello
    setTimeout(() => {
      session.say('Hello! I am your avatar assistant. How can I help you today?');
    }, 2000);

    // Cleanup on disconnect
    ctx.room.on('disconnected', async () => {
      console.log('🔌 Room disconnected');
      if (sessionId) {
        try {
          await fetch('https://api.liveavatar.com/v1/sessions/stop', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-KEY': process.env.LIVE_AVATAR_API_KEY!,
            },
            body: JSON.stringify({
              session_id: sessionId,
              reason: 'USER_CLOSED',
            }),
          });
          console.log('LiveAvatar session stopped');
        } catch (error) {
          console.error('Failed to stop LiveAvatar session:', error);
        }
      }
    });
  },
});

// Run the worker
cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    numIdleProcesses: 1,
    logLevel: 'info',
  })
);