# LiveAvatar Custom Room Integration

A working example of connecting a LiveAvatar to a custom LiveKit room using CUSTOM mode.

## What This Demonstrates

- Creating a LiveKit room with `RoomServiceClient`
- Generating access tokens for both user and avatar participants
- Using LiveAvatar's CUSTOM mode with `livekit_config`
- **The critical `canPublishData` permission required for avatars**

## The Fix

The key to making this work is including `canPublishData: true` in the avatar's access token:

```typescript
avatarToken.addGrant({
  room: roomName,
  roomJoin: true,
  canPublish: true,
  canPublishData: true, // ← REQUIRED for LiveAvatar
  canSubscribe: true,
});
```

Without `canPublishData`, LiveAvatar returns a 500 error when starting the session.

## Usage

```bash
npm run example:liveavatar
```

The script will:
1. Create a LiveKit room
2. Generate a test participant token
3. Ask you to join and verify the room works
4. Create a LiveAvatar session with CUSTOM mode
5. Start the avatar session
6. Let you interact with the avatar
7. Clean up when you press Enter

## Environment Variables

Required in `.env`:

```bash
# LiveKit Configuration
LIVEKIT_URL=wss://your-instance.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

# LiveAvatar Configuration
LIVE_AVATAR_API_KEY=your-liveavatar-key
```

## Key Learnings

1. **Avatar tokens need data permissions**: LiveAvatar uses data channels for avatar state/control
2. **Token structure**: The avatar token is passed to LiveAvatar via `livekit_config.livekit_client_token`
3. **Room verification**: The script includes room verification to confirm LiveKit setup before testing LiveAvatar
4. **CUSTOM mode**: Gives you full control over the LiveKit room configuration

## Related Issues

This example was created while debugging a 500 error with LiveAvatar's CUSTOM mode. The issue was identified through community collaboration and testing different token configurations.
