# Voice Agent Example

## Description
A working LiveKit voice agent using:
- **STT**: Deepgram Nova-2
- **LLM**: OpenAI GPT-4o Mini
- **TTS**: ElevenLabs Turbo v2
- **VAD**: Silero

## Status
✅ **Working**

## Features
- Real-time speech recognition
- Natural conversation flow
- Voice interruption handling
- Automatic greeting on join

## Run the Example

### Step 1: Start the Agent Worker
```bash
# Terminal 1
npm run worker

# Or directly
npx tsx working-examples/voice-agent/agent.ts dev
```

### Step 2: Create Room and Test
```bash
# Terminal 2
npm run example:voice-agent

# Or directly
npx tsx working-examples/voice-agent/demo.ts
```

### Step 3: Interact
1. Click the meet.livekit.io link that's printed
2. Allow microphone access
3. Speak to the agent - it will respond!

## How It Works

1. **agent.ts** - The voice agent worker that:
   - Connects to LiveKit cloud
   - Waits for dispatch requests
   - Processes speech and generates responses

2. **demo.ts** - Test script that:
   - Creates a LiveKit room
   - Generates a token for you to join
   - Dispatches the agent to the room
   - Verifies the agent joined

## Architecture
```
User (Browser) <--WebRTC--> LiveKit Cloud <--WebRTC--> Agent Worker
                                   |
                              Agent Dispatch
```

## Required Environment Variables
- `LIVEKIT_URL` - Your LiveKit server URL
- `LIVEKIT_API_KEY` - LiveKit API key
- `LIVEKIT_API_SECRET` - LiveKit API secret