# LiveAvatar & LiveKit Examples

A collection of working examples, integration tests, and bug reproductions for LiveAvatar and LiveKit.

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys
```

## Working Examples

### [Voice Agent](./working-examples/voice-agent/)
A working LiveKit voice agent with STT, LLM, and TTS.

```bash
# Terminal 1: Start worker
npm run worker

# Terminal 2: Run demo
npm run example:voice-agent
```

### [LiveAvatar Custom Room](./working-examples/liveavatar-custom-room/)
Connect a LiveAvatar to a custom LiveKit room using CUSTOM mode. Demonstrates the critical `canPublishData` permission fix.

```bash
npm run example:liveavatar
```

### [Tool Calling Agent](./working-examples/tool-calling-test/)
Voice agent with complex tool calling (flights, calendar, weather) demonstrating proper tool orchestration at the agent level.

```bash
npm run worker:toolcalling
# Then connect via playground
```

## Environment Setup

Required API keys in `.env`:

```bash
# LiveKit (Required)
LIVEKIT_URL=wss://your-instance.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

# LiveAvatar (For bug reproduction)
LIVE_AVATAR_API_KEY=your-liveavatar-key

# AI Services (For voice agent)
DEEPGRAM_API_KEY=your-deepgram-key      # Optional - can use inference gateway
OPENAI_API_KEY=your-openai-key          # Optional - can use inference gateway
ELEVEN_LABS_API_KEY=your-elevenlabs-key # Optional - can use inference gateway
```

## Repository Structure

```
liveavatar-livekit-examples/
├── working-examples/              # Working code examples
│   ├── voice-agent/               # Basic LiveKit voice agent
│   ├── liveavatar-custom-room/    # LiveAvatar CUSTOM mode integration
│   └── tool-calling-test/         # Agent with complex tool calling
├── package.json                   # Dependencies and scripts
├── .env.example                   # Environment template
└── README.md                      # This file
```

## Purpose

This repository serves as:
1. **Reference Code** - Working examples for LiveKit and LiveAvatar integration
2. **Testing Ground** - Verify features and test configurations
3. **Learning Resource** - Demonstrates best practices and common patterns

## Contributing

Feel free to add more examples following the existing structure:
- Working examples go in `working-examples/` with clear usage instructions
- Each should have its own README explaining what it demonstrates
- Include any critical fixes or learnings discovered

## Resources

- [LiveKit Documentation](https://docs.livekit.io/)
- [LiveAvatar Documentation](https://docs.liveavatar.com/)
- [LiveKit Agents](https://docs.livekit.io/agents/)