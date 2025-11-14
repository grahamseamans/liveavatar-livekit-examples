# LiveAvatar TTS Pipeline Interceptor

Simple LiveKit agent that intercepts TTS audio using pipeline nodes and sends it to a WebSocket endpoint.

## How It Works

The agent extends `voice.Agent` and overrides the `ttsNode` method to:
1. Get audio from the normal TTS pipeline
2. Send it to a WebSocket endpoint (debug server or LiveAvatar)
3. Optionally pass it through to LiveKit

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
- Intercept all TTS audio
- Send audio chunks as base64-encoded PCM to the WebSocket
- Still output audio to LiveKit (so you can hear it)

## What You'll See

The debug server shows:
- When audio starts/ends
- Audio chunk sizes
- Saves audio to `debug-output/*.pcm` files

Play saved audio with:
```bash
ffplay -f s16le -ar 24000 -ac 1 debug-output/audio_*.pcm
```

## Next Steps

To use with LiveAvatar instead of debug server:
1. Change the WebSocket URL in `simple-pipeline.ts` to LiveAvatar's endpoint
2. Adjust the message format to match LiveAvatar's protocol
3. Set `controller.enqueue(frame)` to conditionally output (or not) to LiveKit