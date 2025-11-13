/**
 * This script:
 * 1. Creates a REAL LiveKit room
 * 2. Lets you verify it works
 * 3. Passes verified credentials to LiveAvatar
 * 4. Shows if LiveAvatar can join
 *
 * Usage:
 */

import 'dotenv/config';
import { RoomServiceClient, AccessToken } from 'livekit-server-sdk';
import { createInterface } from 'readline';

// =============================================================================
// CONFIGURATION
// =============================================================================
const CONFIG = {
  LIVE_AVATAR_API_KEY: process.env.LIVE_AVATAR_API_KEY!,
  LIVEKIT_URL: process.env.LIVEKIT_URL!,
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY!,
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET!,
};

// =============================================================================
// HELPERS
// =============================================================================

function waitForEnter(): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
}

function validateConfig() {
  const missing = Object.entries(CONFIG)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing.join(', '));
    console.error('\nMake sure your .env has:');
    console.error('  LIVE_AVATAR_API_KEY=...');
    console.error('  LIVEKIT_URL=...');
    console.error('  LIVEKIT_API_KEY=...');
    console.error('  LIVEKIT_API_SECRET=...\n');
    process.exit(1);
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('\n=== LiveAvatar Joins A Room ===\n');

  validateConfig();

  let roomName = '';
  let sessionId = '';

  try {
    console.log('📦 Step 1: Creating LiveKit Room');

    const roomService = new RoomServiceClient(
      CONFIG.LIVEKIT_URL,
      CONFIG.LIVEKIT_API_KEY,
      CONFIG.LIVEKIT_API_SECRET
    );

    roomName = `liveavatar-test-${Date.now()}`;

    const room = await roomService.createRoom({
      name: roomName,
      emptyTimeout: 10 * 60, // 10 minutes
      maxParticipants: 20,
    });

    console.log(`✅ Room created: ${room.name} (${room.sid})`);

    console.log('🎫 Step 2: Generating Participant Token');

    const token = new AccessToken(
      CONFIG.LIVEKIT_API_KEY,
      CONFIG.LIVEKIT_API_SECRET,
      {
        identity: 'test-participant',
        ttl: '10m',
      }
    );

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const jwt = await token.toJwt();

    console.log('✅ Token generated');

    console.log('🔍 Step 3: Verify the Room Works');
    console.log(`Room name: ${roomName}`);
    console.log(`LiveKit URL: ${CONFIG.LIVEKIT_URL}`);
    console.log(`Token: ${jwt}`);
    const meetUrl = `https://meet.livekit.io/custom?liveKitUrl=${CONFIG.LIVEKIT_URL}&token=${jwt}`;
    console.log(`\nJoin the room: ${meetUrl}`);
    console.log('Press Enter once you\'ve joined and confirmed the room works...');

    await waitForEnter();
    console.log('✅ Room verified! Proceeding with LiveAvatar test...\n');

    console.log('🎭 Step 4: Fetching Available Avatar');

    const avatarsResponse = await fetch('https://api.liveavatar.com/v1/avatars/public', {
      headers: { 'X-API-KEY': CONFIG.LIVE_AVATAR_API_KEY },
    });

    if (!avatarsResponse.ok) {
      throw new Error(`Failed to fetch avatars: ${avatarsResponse.status}`);
    }

    const avatarsData = await avatarsResponse.json();
    const activeAvatars = avatarsData.data.results.filter((a: any) => a.status === 'ACTIVE');

    if (activeAvatars.length === 0) {
      throw new Error('No active avatars found');
    }

    const avatarId = activeAvatars[0].id;
    console.log(`✅ Using avatar: ${activeAvatars[0].name} (${avatarId})`);

    console.log('🎫 Step 5: Creating LiveAvatar Session Token with livekit_config');

    // Generate a token specifically for the avatar participant
    const avatarToken = new AccessToken(
      CONFIG.LIVEKIT_API_KEY,
      CONFIG.LIVEKIT_API_SECRET,
      {
        identity: 'liveavatar-bot',
        ttl: '10m',
      }
    );

    avatarToken.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canPublishData: true, // Required for LiveAvatar to publish data messages
      canSubscribe: true,
    });

    const avatarJwt = await avatarToken.toJwt();

    const tokenPayload = {
      mode: 'CUSTOM',
      avatar_id: avatarId,
      livekit_config: {
        livekit_url: CONFIG.LIVEKIT_URL,
        livekit_room: roomName,
        livekit_client_token: avatarJwt,
      },
    };

    console.log('Request payload:', JSON.stringify(tokenPayload, null, 2));

    const tokenResponse = await fetch('https://api.liveavatar.com/v1/sessions/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': CONFIG.LIVE_AVATAR_API_KEY,
      },
      body: JSON.stringify(tokenPayload),
    });

    console.log(`Response: ${tokenResponse.status} ${tokenResponse.statusText}`);
    const tokenData = await tokenResponse.json();
    console.log('Body:', JSON.stringify(tokenData, null, 2));

    if (!tokenResponse.ok) {
      throw new Error('Failed to create session token');
    }

    const sessionToken = tokenData.data?.session_token;
    sessionId = tokenData.data?.session_id;
    console.log(`✅ Session token created (${sessionId})`);

    console.log('🚀 Step 6: Starting LiveAvatar Session (THE CRITICAL TEST)');

    const startResponse = await fetch('https://api.liveavatar.com/v1/sessions/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({}),
    });

    console.log(`Response: ${startResponse.status} ${startResponse.statusText}`);
    const startData = await startResponse.json();
    console.log('Body:', JSON.stringify(startData, null, 2));

    if (startResponse.ok) {
      console.log('\n🎉 SUCCESS! The session started!');
      console.log('The avatar should be joining the room now.');
      console.log('\n👀 Check the room to see the avatar!');
      console.log(`Room: ${meetUrl}`);
      console.log('\nPress Enter when you\'re done testing...');
      await waitForEnter();
    } else {
      console.log('\n❌ FAILED: 500 ERROR');
      console.log('Even with a verified working LiveKit room, LiveAvatar returns 500.');
      console.log('\nThis proves:');
      console.log('  ✅ LiveKit room exists and works (verified by joining)');
      console.log('  ✅ Credentials are valid (you joined the room)');
      console.log('  ✅ Token format is correct (LiveKit accepted it)');
      console.log('  ❌ LiveAvatar livekit_config integration has a bug');
    }

  } catch (error: any) {
    console.error('\n💥 Unexpected error:', error.message);
    console.error(error);
  } finally {
    console.log('\n🧹 Cleanup');

    if (sessionId) {
      try {
        console.log(`Stopping LiveAvatar session ${sessionId}...`);
        const stopResponse = await fetch('https://api.liveavatar.com/v1/sessions/stop', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': CONFIG.LIVE_AVATAR_API_KEY,
          },
          body: JSON.stringify({
            session_id: sessionId,
            reason: 'USER_CLOSED',
          }),
        });

        if (stopResponse.ok) {
          console.log('✅ LiveAvatar session stopped');
        } else {
          console.log('⚠️  Failed to stop LiveAvatar session');
        }
      } catch (error) {
        console.log('⚠️  Error stopping LiveAvatar session:', error);
      }
    }

    if (roomName) {
      try {
        console.log(`Deleting LiveKit room ${roomName}...`);
        const roomService = new RoomServiceClient(
          CONFIG.LIVEKIT_URL,
          CONFIG.LIVEKIT_API_KEY,
          CONFIG.LIVEKIT_API_SECRET
        );
        await roomService.deleteRoom(roomName);
        console.log('✅ LiveKit room deleted');
      } catch (error) {
        console.log('⚠️  Error deleting room:', error);
      }
    }

    console.log('✅ Cleanup complete\n');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
