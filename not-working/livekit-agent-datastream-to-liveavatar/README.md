# LiveAvatar Agent (Standard Pattern)

This implementation follows the standard avatar plugin pattern used by Anam, Bey, Simli, Tavus, and all other working avatar integrations.

## Key Difference from Custom Approach

**Standard Pattern (This):**
- Uses `voice.DataStreamAudioOutput` from the SDK
- LiveAvatar joins room as participant
- Audio streams through LiveKit's data channels
- No custom WebSocket handling needed

**Custom Pattern (Branch: liveavatar-custom-websocket):**
- Extends AudioOutput class directly
- Manages WebSocket connection
- Handles audio resampling/encoding
- More complex but may not be necessary

## How It Works

1. **Avatar Token Creation:**
   - Creates token with `ATTRIBUTE_PUBLISH_ON_BEHALF`
   - Allows avatar to publish on behalf of agent
   - Standard pattern across all avatar plugins

2. **LiveAvatar Session:**
   - Starts session with LiveKit credentials
   - Avatar joins room as participant 'liveavatar-bot'
   - Publishes video track

3. **Audio Streaming:**
   ```typescript
   session.output.audio = new voice.DataStreamAudioOutput({
     room: ctx.room,
     destinationIdentity: 'liveavatar-bot',
     waitRemoteTrack: TrackKind.KIND_VIDEO,
   });
   ```
   - SDK handles all audio streaming
   - No manual WebSocket or resampling needed

## Testing

```bash
# Install dependencies
npm install

# Run the agent
npm run worker:liveavatar

# Open Agent Playground
# https://agents-playground.livekit.io
```

## Expected Behavior

If LiveAvatar supports this standard pattern:
- Avatar joins as separate participant
- Audio streams automatically via DataStreamAudioOutput
- Avatar generates synchronized video

If it doesn't work:
- We have the custom WebSocket approach on branch: `liveavatar-custom-websocket`
- Can switch back with: `git checkout liveavatar-custom-websocket`

## Why This Pattern?

Every working avatar plugin uses DataStreamAudioOutput:
- Anam (TypeScript & Python)
- Bey (TypeScript & Python)
- Simli (Python)
- Tavus (Python)
- Hedra (Python)
- BitHuman (Python)

This is the proven, standard approach for avatar integrations.