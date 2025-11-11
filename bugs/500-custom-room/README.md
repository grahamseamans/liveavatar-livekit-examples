# 500 Error: LiveAvatar Custom Room Integration

## Issue
LiveAvatar returns 500 Internal Server Error when using `livekit_config` in CUSTOM mode to join an external LiveKit room.

## Status
🔴 **Broken** - Awaiting fix from LiveAvatar

## What This Demo Proves
1. ✅ LiveKit room creation works
2. ✅ Credentials are valid (you can join the room)
3. ✅ Token format is correct (LiveKit accepts it)
4. ❌ LiveAvatar's `livekit_config` integration returns 500

## Run the Demo

```bash
# From project root
npm run bug:500

# Or directly
npx tsx bugs/500-custom-room/demo.ts
```

## Expected vs Actual

**Expected:**
- LiveAvatar joins the custom LiveKit room
- Avatar appears as a participant
- Can interact with avatar in your own room

**Actual:**
- `/v1/sessions/token` returns 200 OK
- `/v1/sessions/start` returns 500 Internal Server Error

## API Calls

### Create Session Token
```json
POST https://api.liveavatar.com/v1/sessions/token
Headers: X-API-KEY: <your-key>
Body: {
  "mode": "CUSTOM",
  "avatar_id": "...",
  "livekit_config": {
    "livekit_url": "wss://your-instance.livekit.cloud",
    "livekit_room": "your-room-name",
    "livekit_client_token": "eyJhbGc..."
  }
}
```

### Start Session (Fails)
```json
POST https://api.liveavatar.com/v1/sessions/start
Headers: Authorization: Bearer <session_token>
Body: {}
```

Response: 500 Internal Server Error

## Implementation Note

This demo uses raw `fetch()` calls instead of the LiveAvatar SDK (`@api/liveavatar`) to make the bug more clear. In production, you would typically use:

```javascript
import liveavatar from '@api/liveavatar';

// Create session
liveavatar.create_session_token_v1_sessions_token_post({
  mode: 'CUSTOM',
  avatar_id: '...',
  livekit_config: { ... }
});

// Start session
liveavatar.start_session_v1_sessions_start_post();
```
