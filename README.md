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

## Examples & Bugs

### 🔴 Bugs

#### [500 Error: Custom Room Integration](./bugs/500-custom-room/)
LiveAvatar returns 500 when using `livekit_config` in CUSTOM mode.

```bash
npm run bug:500
```

### ✅ Working Examples

#### [Voice Agent](./working-examples/voice-agent/)
A working LiveKit voice agent with STT, LLM, and TTS.

```bash
# Terminal 1: Start worker
npm run worker

# Terminal 2: Run demo
npm run example:voice-agent
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
├── bugs/                     # Bug reproductions
│   └── 500-custom-room/      # LiveAvatar 500 error
├── working-examples/         # Working code examples
│   └── voice-agent/          # LiveKit voice agent
├── package.json              # Dependencies and scripts
├── .env.example              # Environment template
└── README.md                 # This file
```

## Purpose

This repository serves as:
1. **Bug Reports** - Minimal reproductions for issues
2. **Reference Code** - Working examples for integration
3. **Testing Ground** - Verify fixes and test new features

## Contributing

Feel free to add more examples or bug reproductions following the existing structure:
- Bugs go in `bugs/` with clear reproduction steps
- Working examples go in `working-examples/` with usage instructions
- Each should have its own README explaining the issue/feature

## Resources

- [LiveKit Documentation](https://docs.livekit.io/)
- [LiveAvatar Documentation](https://docs.liveavatar.com/)
- [LiveKit Agents](https://docs.livekit.io/agents/)