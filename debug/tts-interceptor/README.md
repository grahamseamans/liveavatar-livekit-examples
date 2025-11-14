# LiveKit TTS Pipeline Interceptor (Audio Extraction Shim)

**This is NOT a LiveAvatar agent** - it's a LiveKit agent that extracts TTS audio to a WebSocket.

## What This Does

This agent demonstrates how to intercept TTS audio from a LiveKit voice pipeline and send it elsewhere (WebSocket) instead of/in addition to the LiveKit room. This is useful as a building block for integrating with systems like LiveAvatar that need the raw audio stream.

## How It Works

1. Extends the `voice.Agent` class to override `ttsNode()`
2. Intercepts all TTS audio frames before they reach LiveKit
3. Sends audio chunks to a WebSocket (debug server or LiveAvatar)
4. Can optionally suppress audio from LiveKit room (currently suppressed)

This is essentially an "audio shim" - extracting audio out of the LiveKit pipeline to send it somewhere else.

## Setup

```bash
npm install
```

## Running

### 1. Start the debug server (in one terminal):
```bash
npm run debug-server
```
This starts a WebSocket server on `ws://localhost:8889` that receives and logs audio.

### 2. Start the agent (in another terminal):
```bash
npm run agent
```

The agent will:
- Connect to the debug server WebSocket
- Intercept all TTS audio from the voice pipeline
- Send audio chunks as base64-encoded PCM to the WebSocket
- **NOT output audio to LiveKit** (audio only goes to WebSocket)

## What You'll See

The debug server shows:
- When audio starts/ends
- Audio chunk sizes
- Saves audio to `debug-output/*.pcm` files

Play saved audio with:
```bash
ffplay -f s16le -ar 24000 -channels 1 debug-output/audio_*.pcm
# Or if channels flag doesn't work:
ffplay -f s16le -ar 24000 debug-output/audio_*.pcm
```

## Architecture

```
User speaks → STT → LLM → TTS
                           ↓
                    ttsNode() intercepts
                           ↓
                    Send to WebSocket
                           ↓
                    Debug server saves to file
```

## Use Cases

This pipeline interceptor pattern is useful for:

1. Integrating LiveKit agents with external avatar systems
2. Recording or processing TTS audio separately
3. Sending audio to multiple destinations
4. Custom audio routing requirements

## Next Steps

To use with actual LiveAvatar:
1. See `liveavatar-agent-complete` for a full implementation
2. Change the WebSocket URL to LiveAvatar's endpoint
3. Implement LiveAvatar's message protocol for audio chunks