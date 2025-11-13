# LiveAvatar Voice Agent

A LiveKit voice agent that integrates with LiveAvatar to provide a visual avatar presence.

## Quick Start with Agent Playground

1. **Terminal 1 - Start the agent worker** (from repo root):
```bash
npm install
npm run worker:liveavatar
```

2. **Browser - Open Agent Playground**:
```
https://agents-playground.livekit.io
```

3. **Connect and test**:
- The agent will auto-join any room (no agent name configured)
- LiveAvatar will appear as a separate participant with video
- Speak to interact with your avatar assistant

## How it Works

This agent demonstrates a custom TTS output integration where:

1. **Voice Pipeline**: The agent handles STT → LLM → TTS as normal
2. **Custom Audio Output**: Instead of publishing audio directly to the room, TTS audio is sent to LiveAvatar's WebSocket
3. **Avatar Generation**: LiveAvatar receives the audio and generates synchronized avatar video
4. **Room Publishing**: The avatar joins the room and publishes both audio and video

## Architecture

```
User speaks → STT → LLM → TTS
                            ↓
                   LiveAvatarAudioOutput
                            ↓
                   LiveAvatar WebSocket
                            ↓
                   Avatar generates video
                            ↓
                   Avatar publishes to room
```

## Key Components

### LiveAvatarAudioOutput

A custom `AudioOutput` class that:
- Creates and manages LiveAvatar session
- Connects to LiveAvatar's WebSocket
- Forwards TTS audio frames (resampled to 24kHz PCM)
- Handles agent state events (speaking/listening/interrupted)

### Agent Integration

The agent uses the custom output:
```typescript
const liveAvatarOutput = new LiveAvatarAudioOutput(config, roomName);
await liveAvatarOutput.start(room);
session.output.audio = liveAvatarOutput;
```

## Setup

1. **Install dependencies**:
```bash
npm install
```

2. **Configure environment** (.env file):
```env
# LiveKit credentials
LIVEKIT_URL=wss://your-livekit-server.com
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

# LiveAvatar credentials
LIVE_AVATAR_API_KEY=your-liveavatar-api-key
LIVE_AVATAR_ID=avatar-id  # Optional, will use first active avatar if not set

# Model API keys
OPENAI_API_KEY=your-openai-key
DEEPGRAM_API_KEY=your-deepgram-key
ELEVEN_LABS_API_KEY=your-elevenlabs-key
```

3. **Run the agent**:
```bash
npm run worker
```

## Testing

1. Start the agent worker
2. Join a LiveKit room using the playground or your app
3. The agent will:
   - Join the room automatically
   - Start LiveAvatar session
   - Create avatar participant
4. Speak to interact with the agent
5. You'll see the avatar video responding with synchronized speech

## WebSocket Protocol

The agent sends these messages to LiveAvatar:

- `agent.speak`: Audio data chunks (base64-encoded PCM)
- `agent.speak_end`: Marks end of speech segment
- `agent.interrupt`: Sent when user interrupts

## Audio Processing

- **Input**: TTS generates audio at 48kHz typically
- **Resampling**: Audio is resampled to 24kHz (LiveAvatar requirement)
- **Format**: PCM 16-bit little-endian
- **Encoding**: Base64 for WebSocket transmission

## Advantages of This Approach

1. **Clean Integration**: TTS output is intercepted before room publishing
2. **No Audio Duplication**: Avatar handles all audio publishing
3. **Synchronized**: Audio and video are perfectly synchronized
4. **Flexible**: Can chain outputs if needed (e.g., also publish to room)

## Troubleshooting

- **Avatar not appearing**: Check LiveAvatar API key and avatar ID
- **No audio**: Verify WebSocket connection in logs
- **Audio quality**: Check resampling is working correctly
- **Latency**: LiveAvatar processing adds some delay

## Notes

- LiveAvatar session is created in CUSTOM mode
- The avatar joins as a separate participant ('liveavatar-bot')
- Audio is sent via WebSocket, not LiveKit data channels
- Session cleanup happens on room disconnect