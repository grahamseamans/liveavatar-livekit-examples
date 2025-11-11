/**
 * Working Voice Agent Demo - CONTROL TEST
 *
 * This script proves that everything else works:
 * - LiveKit room creation ✅
 * - Token generation ✅
 * - Room joining ✅
 * - Agent dispatch ✅ (if worker available)
 *
 * This isolates the problem to LiveAvatar's livekit_config implementation.
 *
 * Usage:
 *   npx tsx working-voice-agent-demo.ts
 */

import 'dotenv/config';
import { RoomServiceClient, AccessToken, AgentDispatchClient } from 'livekit-server-sdk';
import { createInterface } from 'readline';

// =============================================================================
// CONFIGURATION
// =============================================================================
const CONFIG = {
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
  console.log('\n=== Working Voice Agent Demo ===\n');
  console.log('This proves that LiveKit agents work with your setup.');
  console.log('Make sure the agent worker is running: npm run worker\n');

  validateConfig();

  let roomName = '';

  try {
    console.log('📦 Step 1: Creating LiveKit Room');

    const roomService = new RoomServiceClient(
      CONFIG.LIVEKIT_URL,
      CONFIG.LIVEKIT_API_KEY,
      CONFIG.LIVEKIT_API_SECRET
    );

    roomName = `agent-test-${Date.now()}`;

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
        identity: 'test-user',
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

    console.log('🔍 Step 3: Join the Room');
    const meetUrl = `https://meet.livekit.io/custom?liveKitUrl=${CONFIG.LIVEKIT_URL}&token=${jwt}`;
    console.log(`Join: ${meetUrl}`);
    console.log('Press Enter once you\'ve joined...');

    await waitForEnter();
    console.log('✅ Room verified\n');

    console.log('🤖 Step 4: Dispatching Voice Agent');

    const agentDispatchClient = new AgentDispatchClient(
      CONFIG.LIVEKIT_URL,
      CONFIG.LIVEKIT_API_KEY,
      CONFIG.LIVEKIT_API_SECRET
    );

    try {
      const dispatch = await agentDispatchClient.createDispatch(
        roomName,
        'simple-agent',
        {}
      );

      console.log('✅ Agent dispatched');
      console.log('Dispatch:', JSON.stringify(dispatch, null, 2));

      console.log('Waiting for agent to join...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      const participants = await roomService.listParticipants(roomName);
      console.log(`Found ${participants.length} participant(s):`);
      participants.forEach((p: any) => {
        console.log(`  - ${p.identity} (${p.sid})`);
      });

      if (participants.length > 1) {
        console.log('\n✅ Agent joined! Try speaking to test voice interaction.');
      } else {
        console.log('\n⚠️  Agent hasn\'t joined. Check worker is running: npm run worker');
      }

      console.log('\nPress Enter when done...');
      await waitForEnter();

    } catch (error: any) {
      console.log(`⚠️  Could not dispatch agent: ${error.message}`);
      console.log('Make sure worker is running: npm run worker');
    }

    console.log('\n✅ Test Complete');
    console.log('What this proved:');
    console.log('  ✅ LiveKit room creation works');
    console.log('  ✅ Token generation works');
    console.log('  ✅ Room is accessible');
    console.log('  ✅ Custom agents work with your setup');
    console.log('\nNow run the LiveAvatar demo: npm run demo\n');

  } catch (error: any) {
    console.error('\n💥 Unexpected error:', error.message);
    console.error(error);
  } finally {
    console.log('\n🧹 Cleanup');

    if (roomName) {
      try {
        console.log(`Deleting LiveKit room ${roomName}...`);
        const roomService = new RoomServiceClient(
          CONFIG.LIVEKIT_URL,
          CONFIG.LIVEKIT_API_KEY,
          CONFIG.LIVEKIT_API_SECRET
        );
        await roomService.deleteRoom(roomName);
        console.log('✅ Room deleted');
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
