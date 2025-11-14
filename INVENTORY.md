# Working Examples Inventory

This document lists all working examples, what they do, and what each file does.

---

## `working-examples/livekit-voice-agent-basic/`
**Directory Purpose:** Basic conversational AI agent with no avatar. Just voice in, voice out. Uses Deepgram STT, OpenAI LLM, ElevenLabs TTS, Silero VAD. The "hello world" of LiveKit agents.

**Status:** ✅ WORKING

**Files:**
- `agent.ts` - The LiveKit agent worker that connects to LiveKit, waits for rooms to join, and handles voice conversations
- `README.md` - Documentation

---

## `working-examples/livekit-voice-agent-tool-calling/`
**Directory Purpose:** Voice agent with function calling capabilities. Demonstrates LLM tool use with mock tools (search flights, book flights, etc.). Includes artificial latency and error simulation.

**Status:** ✅ WORKING

**Files:**
- `agent.ts` - Voice agent with tool calling enabled. Shows how to define tools with schemas and have the LLM call them

---

## `working-examples/liveavatar-custom-room/`
**Directory Purpose:** **THE BREAKTHROUGH DISCOVERY**. Test script that figured out LiveAvatar CUSTOM mode requires `canPublishData: true` in the token or it returns 500 error. This is NOT an agent - just a room creation + LiveAvatar spawn test. Useful reference for understanding token permissions.

**Status:** ✅ WORKING - Important reference

**Files:**
- `demo.ts` - Script that creates room, generates tokens with proper permissions, spawns LiveAvatar in CUSTOM mode
- `README.md` - Documents the `canPublishData` requirement discovery

---

## `working-examples/programatically-create-room/`
**Directory Purpose:** Utility scripts for creating LiveKit rooms and dispatching agents programmatically. Alternative to using agents-playground.livekit.io for testing. Generic - works with any agent.

**Status:** ✅ WORKING - Utility

**Files:**
- `create-room-and-dispatch.ts` - Creates a LiveKit room, generates user token, dispatches any agent, gives you a meet.livekit.io URL to join

---

## `debug/tts-interceptor/`
**Directory Purpose:** Debug/learning tool that demonstrates TTS audio interception. NOT a complete agent. Shows how to override `ttsNode()` to capture TTS audio and route it to external services (like WebSocket). Building block for LiveAvatar integration.

**Status:** 🔧 DEBUG TOOL

**Files:**
- `agent.ts` - Agent that intercepts TTS pipeline and sends audio to WebSocket
- `debug-server.js` - WebSocket server that receives audio, logs it, saves to .pcm files for playback
- `README.md` - Explains the audio extraction pattern

**Usage:**
```bash
npm run debug:tts-server    # Start WebSocket server
npm run debug:tts-interceptor # Run agent
```

---

## `not-working/livekit-agent-datastream-to-liveavatar/`
**Directory Purpose:** Attempted to use the standard LiveKit DataStreamAudioOutput pattern to send audio to LiveAvatar. This is the "standard" approach that works with Anam, Bey, Simli, Tavus, etc.

**Status:** ❌ DOESN'T WORK - LiveAvatar doesn't accept data channel audio in CUSTOM mode

**What Went Wrong:**
- Uses `DataStreamAudioOutput` to route audio to avatar participant via data channel
- LiveAvatar CUSTOM mode requires `canPublishData: true` but doesn't actually use the data channel for audio
- Results in RPC Connection timeout error (code 1501)
- This proves LiveAvatar only accepts audio via WebSocket, not data channel

**Files:**
- `agent.ts` - Standard LiveKit agent using DataStreamAudioOutput pattern
- `README.md` - Documents the approach and why it doesn't work

---

## `not-working/bad-liveavatar-attempt/`
**Directory Purpose:** Original LiveAvatar agent attempt that didn't work. Kept as reference for what NOT to do.

**Status:** ❌ NOT WORKING - Failed approach

**Files:**
- `agent.ts` - Failed implementation attempt
- `liveavatar-audio-output.ts` - Custom audio output that didn't work
- `README.md` - Documentation of the failed approach

---

## `in-progress/custom-livekit-agent-speaking-through-liveavatar/`
**Directory Purpose:** Combines LiveAvatar spawning + pipeline TTS interception using WebSocket. Avatar appears and speaks, BUT it has conversation flow issues - talks over itself / has timing glitches.

**Status:** 🔨 WORK IN PROGRESS - Right approach, needs timing refinement

**What Works:**
- Successfully spawns LiveAvatar in CUSTOM mode
- Intercepts TTS audio using `ttsNode()` override
- Sends audio to LiveAvatar via WebSocket
- Avatar appears and speaks

**What Needs Work:**
- Conversation flow has timing issues
- Avatar may talk over itself
- Stream handling needs optimization

**Files:**
- `complete-agent.ts` - Full agent that spawns LiveAvatar and intercepts TTS to send via WebSocket
- `README.md` - Documents the approach and known issues

---

## Git Submodules (Reference Code)

### `agents/`
**Purpose:** Official LiveKit Agents Python framework repository (git submodule). Reference for Python agent development.

**Status:** 📚 REFERENCE - Git submodule

---

### `agents-js/`
**Purpose:** Official LiveKit Agents TypeScript/JavaScript framework repository (git submodule). Reference for TS/JS agent development.

**Status:** 📚 REFERENCE - Git submodule

---

### `heygen-plugin-reference/`
**Purpose:** HeyGen avatar plugin reference implementation (git submodule). Used to understand how Tina implemented avatar audio capture.

**Status:** 📚 REFERENCE - Git submodule

---

### `liveavatar-web-sdk/`
**Purpose:** LiveAvatar Web SDK repository (git submodule). Reference for understanding the browser SDK.

**Status:** 📚 REFERENCE - Git submodule

---

## Root Level Documentation Files

- `README.md` - Main repository README
- `liveavatar.llms.txt` - LiveAvatar docs summary for LLMs
- `livekit.llms.txt` - LiveKit docs summary for LLMs
- `package.json` - **MAIN PACKAGE.JSON** - The only one used for agent development
- `package-lock.json` - Lock file for main package.json

**Status:** 📚 DOCUMENTATION

---

## Summary

**Working Examples (4):**
1. livekit-voice-agent-basic - Basic voice agent
2. livekit-voice-agent-tool-calling - Voice agent with function calling
3. liveavatar-custom-room - Room creation and LiveAvatar spawning
4. programatically-create-room - Programmatic room creation utility

**Debug Tools (1):**
1. tts-interceptor - TTS audio interception demo for external routing

**Work In Progress (1):**
1. custom-livekit-agent-speaking-through-liveavatar - WebSocket approach (works but needs timing refinement)

**Not Working (2):**
1. livekit-agent-datastream-to-liveavatar - DataStreamAudioOutput approach (fundamentally incompatible with LiveAvatar)
2. bad-liveavatar-attempt - Failed early attempt (archived for reference)

**Git Submodules (4):**
1. agents - LiveKit Python agents framework
2. agents-js - LiveKit TypeScript/JavaScript agents framework
3. heygen-plugin-reference - Tina's HeyGen plugin
4. liveavatar-web-sdk - LiveAvatar browser SDK

**Key Findings:**
- LiveAvatar CUSTOM mode requires `canPublishData: true` token permission
- LiveAvatar does NOT use data channel for audio (despite requiring the permission)
- Only WebSocket approach works for sending audio to LiveAvatar
- DataStreamAudioOutput pattern (used by other avatar services) does not work with LiveAvatar
- ttsNode() override + WebSocket is the correct architectural approach
