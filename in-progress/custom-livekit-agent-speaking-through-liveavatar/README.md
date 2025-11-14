# Complete LiveAvatar Agent with Pipeline Interception

This is the complete solution that combines:
1. **LiveAvatar session spawning** - Creates avatar in the room
2. **TTS pipeline interception** - Routes audio directly to avatar via WebSocket
3. **Full integration** - Avatar appears and speaks with agent's voice

## How It Works

1. **Spawns LiveAvatar**:
   - Fetches available avatars from API
   - Creates session with CUSTOM mode
   - Joins avatar to LiveKit room as participant

2. **Intercepts TTS Audio**:
   - Overrides `ttsNode()` to capture all TTS audio
   - Sends audio chunks to avatar's WebSocket
   - Suppresses audio from LiveKit (avatar handles playback)

3. **Complete Integration**:
   - Avatar appears in room with video
   - Avatar's mouth moves when agent speaks
   - All audio goes through avatar, not LiveKit

## Setup

```bash
npm install
```

Make sure your `.env` has:
- `LIVE_AVATAR_API_KEY` - Your LiveAvatar API key
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` - LiveKit credentials
- Standard agent keys (OpenAI, Deepgram, ElevenLabs)

## Running

### Complete Agent (with LiveAvatar):
```bash
npm run complete
```

This will:
1. Start a LiveAvatar session
2. Avatar joins the room as "liveavatar-bot"
3. Agent intercepts all TTS and sends to avatar
4. Avatar appears and speaks with the agent's responses

### Debug Mode (without LiveAvatar):
```bash
# Terminal 1: Start debug server
npm run debug-server

# Terminal 2: Start simple pipeline agent
npm run agent
```

## Key Features

- **No audio in LiveKit room** - All audio goes through avatar
- **Visual avatar presence** - Avatar video appears in room
- **Synchronized speech** - Avatar mouth moves with audio
- **Clean architecture** - Uses LiveKit's intended extension points

## Architecture

```
User speaks � STT � LLM � TTS
                           �
                    ttsNode() intercepts
                           �
                    Send to LiveAvatar WebSocket
                           �
                    Avatar plays audio & animates
```

The LiveKit room never receives TTS audio directly - it all goes through the avatar!

## Known Issues

The conversation flow may not be fully natural yet. Potential areas for improvement:
1. Audio synchronization between WebSocket and LiveKit room
2. Stream handling in the ttsNode() override could be optimized
3. Event timing between multiple audio channels

The avatar successfully appears and speaks, but the conversation flow could be refined further.