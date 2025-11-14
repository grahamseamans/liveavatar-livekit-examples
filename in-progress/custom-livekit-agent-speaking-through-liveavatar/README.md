# LiveAvatar Voice Agent with Tool Calling

A LiveKit voice agent that speaks through a LiveAvatar avatar and can call tools/functions. Uses TTS pipeline interception to route audio directly to the avatar via WebSocket.

## Quick Start

```bash
# Run the agent
npm run wip:custom-agent

# Then join the room at: https://agents-playground.livekit.io/
```

The agent will:
1. Spawn a LiveAvatar in the room
2. Respond to voice with tool calling capabilities (flights, calendar, weather, booking)
3. Speak through the avatar (not LiveKit audio)

## Requirements

Your `.env` needs:
```bash
LIVE_AVATAR_API_KEY=your_key_here
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
OPENAI_API_KEY=your_key
DEEPGRAM_API_KEY=your_key
ELEVEN_LABS_API_KEY=your_key
```

## How It Works

### 1. LiveAvatar Integration
- Fetches avatars from LiveAvatar API
- Creates session in CUSTOM mode with `canPublishData: true`
- Connects to LiveAvatar WebSocket for audio streaming

### 2. TTS Audio Interception
- Overrides `ttsNode()` to capture TTS audio before it reaches LiveKit
- Sends audio chunks (base64-encoded PCM) to LiveAvatar WebSocket
- Avatar handles playback and lip sync

### 3. Tool Calling
The agent can call these tools:
- **searchFlights** - Find flights to destinations
- **checkCalendar** - Check availability
- **getWeather** - Get weather forecasts
- **bookFlight** - Book a specific flight
- **sendEmail** - Send confirmation emails

## Architecture

```
User speaks → STT → LLM (with tools) → TTS
                                         ↓
                                   ttsNode() intercepts
                                         ↓
                              LiveAvatar WebSocket
                                         ↓
                              Avatar plays & animates
```

**Key Detail:** LiveKit room never receives TTS audio - it all goes through the avatar!

## Current Status

✅ **Working:**
- Avatar spawns successfully
- WebSocket connects to LiveAvatar
- Audio routing works
- Tool calling works
- Basic conversation flow

⚠️ **Known Issues:**
1. **Audio cutout** - ElevenLabs TTS has known streaming flush issues, audio may cut off mid-sentence
2. **Missing events** - Not sending all LiveAvatar WebSocket events (see improvements below)

## Planned Improvements

### Missing LiveAvatar Events

Currently only sending 3 events:
- `agent.speak_started`
- `agent.speak` (audio chunks)
- `agent.speak_end`

**Should add (from Tina's HeyGen plugin):**

#### 1. Interruption Handling (HIGH PRIORITY)
```typescript
session.on('conversation_item_added', (ev) => {
  if (session.currentSpeech?.interrupted) {
    ws.send(JSON.stringify({
      type: 'agent.interrupt',
      event_id: crypto.randomUUID()
    }));
  }
});
```
**Impact:** Avatar stops when user interrupts (natural conversation flow)

#### 2. Better speak_end Timing (MEDIUM PRIORITY)
```typescript
session.on('agent_state_changed', (ev) => {
  if (ev.oldState === 'speaking' && ev.newState === 'listening') {
    ws.send(JSON.stringify({
      type: 'agent.speak_end',
      event_id: currentEventId
    }));
  }
});
```
**Impact:** More accurate state tracking

#### 3. Listening State Signals (OPTIONAL)
```typescript
session.on('agent_state_changed', (ev) => {
  if (ev.newState === 'listening') {
    ws.send(JSON.stringify({ type: 'agent.start_listening', event_id: crypto.randomUUID() }));
  }
  if (ev.oldState === 'listening' && ev.newState === 'idle') {
    ws.send(JSON.stringify({ type: 'agent.stop_listening', event_id: crypto.randomUUID() }));
  }
});
```
**Impact:** Better avatar animations (looks attentive)

## Technical Details

### WebSocket Events (Current)
**Sending to LiveAvatar:**
- `agent.speak_started` - TTS begins
- `agent.speak` - Audio chunk (base64 PCM, 2400 samples)
- `agent.speak_end` - TTS complete

**Receiving from LiveAvatar (logged):**
- `error` - WebSocket errors
- `agent.speak_started` - Avatar started speaking
- `agent.speak_ended` - Avatar finished speaking
- `agent.idle_started` / `agent.idle_ended` - State changes
- `agent.audio_buffer_*` - Buffer events (filtered from logs)

### Audio Format
- Sample rate: 24000 Hz
- Channels: 1 (mono)
- Format: PCM 16-bit
- Chunk size: 2400 samples
- Encoding: Base64

## References

- **Tina's HeyGen Plugin:** `heygen-plugin-reference/` (git submodule)
- **LiveKit Agents Docs:** https://docs.livekit.io/agents/
- **LiveAvatar Docs:** https://docs.liveavatar.com/
