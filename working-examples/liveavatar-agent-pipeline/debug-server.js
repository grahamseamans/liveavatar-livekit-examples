import express from 'express';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8888;

// Create debug output directory
const debugDir = path.join(__dirname, 'debug-output');
if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
}

// Track active sessions
const sessions = new Map();

// Create WebSocket server
const wss = new WebSocketServer({ port: 8889 });

wss.on('connection', (ws) => {
    const sessionId = Date.now().toString();
    const sessionData = {
        id: sessionId,
        connectedAt: new Date(),
        events: [],
        audioChunks: [],
        totalAudioBytes: 0,
        speaking: false
    };

    sessions.set(sessionId, sessionData);

    console.log(`\n🔌 New WebSocket connection - Session: ${sessionId}`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            const timestamp = new Date().toISOString();

            sessionData.events.push({ timestamp, ...data });

            // Log different event types with helpful formatting
            switch(data.type) {
                case 'agent.speak_started':
                    console.log(`\n🎙️  [${sessionId}] AGENT SPEAKING STARTED`);
                    console.log(`   Event ID: ${data.event_id}`);
                    sessionData.speaking = true;
                    break;

                case 'agent.speak':
                    const audioBytes = Buffer.from(data.audio, 'base64').length;
                    sessionData.audioChunks.push(data.audio);
                    sessionData.totalAudioBytes += audioBytes;

                    // Calculate duration (assuming 24kHz, 16-bit PCM)
                    const durationMs = (audioBytes / 2) / 24; // samples / sample_rate * 1000

                    console.log(`   📊 Audio chunk: ${audioBytes} bytes (~${durationMs.toFixed(1)}ms)`);
                    console.log(`   Total audio: ${sessionData.totalAudioBytes} bytes`);
                    break;

                case 'agent.speak_end':
                    console.log(`\n🔚 [${sessionId}] AGENT SPEAKING ENDED`);
                    console.log(`   Event ID: ${data.event_id}`);
                    console.log(`   Total chunks sent: ${sessionData.audioChunks.length}`);
                    console.log(`   Total audio size: ${(sessionData.totalAudioBytes / 1024).toFixed(2)} KB`);

                    // Save audio to file for debugging
                    if (sessionData.audioChunks.length > 0) {
                        const audioFile = path.join(debugDir, `audio_${sessionId}_${data.event_id}.pcm`);
                        const fullAudio = Buffer.concat(
                            sessionData.audioChunks.map(chunk => Buffer.from(chunk, 'base64'))
                        );
                        fs.writeFileSync(audioFile, fullAudio);
                        console.log(`   💾 Audio saved to: ${audioFile}`);
                        console.log(`   🎵 Play with: ffplay -f s16le -ar 24000 -ac 1 ${audioFile}`);

                        // Reset for next utterance
                        sessionData.audioChunks = [];
                        sessionData.totalAudioBytes = 0;
                    }
                    sessionData.speaking = false;
                    break;

                case 'user.speak_started':
                    console.log(`\n👤 [${sessionId}] USER SPEAKING STARTED`);
                    break;

                case 'user.speak_ended':
                    console.log(`\n🤐 [${sessionId}] USER SPEAKING ENDED`);
                    break;

                case 'user.transcription':
                    console.log(`\n📝 [${sessionId}] USER TRANSCRIPTION: "${data.text}"`);
                    break;

                case 'avatar.speak_started':
                    console.log(`\n🤖 [${sessionId}] AVATAR SPEAKING STARTED (forwarded)`);
                    break;

                case 'avatar.speak_ended':
                    console.log(`\n🤖 [${sessionId}] AVATAR SPEAKING ENDED (forwarded)`);
                    break;

                default:
                    console.log(`\n❓ [${sessionId}] Unknown event: ${data.type}`);
                    console.log(JSON.stringify(data, null, 2));
            }

        } catch (error) {
            console.error('Error parsing message:', error);
            console.log('Raw message:', message.toString().substring(0, 200));
        }
    });

    ws.on('close', () => {
        console.log(`\n🔌 WebSocket closed - Session: ${sessionId}`);
        console.log(`   Total events: ${sessionData.events.length}`);

        // Save session log
        const logFile = path.join(debugDir, `session_${sessionId}.json`);
        fs.writeFileSync(logFile, JSON.stringify(sessionData, null, 2));
        console.log(`   📋 Session log saved to: ${logFile}`);

        sessions.delete(sessionId);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for session ${sessionId}:`, error);
    });

    // Send back a confirmation
    ws.send(JSON.stringify({
        type: 'connection_confirmed',
        sessionId: sessionId,
        message: 'Debug server connected successfully'
    }));
});

// HTTP endpoints for status
app.get('/status', (req, res) => {
    const activeSessions = Array.from(sessions.values()).map(s => ({
        id: s.id,
        connectedAt: s.connectedAt,
        eventCount: s.events.length,
        isSpeaking: s.speaking,
        totalAudioBytes: s.totalAudioBytes
    }));

    res.json({
        status: 'running',
        activeSessions: activeSessions.length,
        sessions: activeSessions
    });
});

app.get('/sessions/:id', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
});

// Serve debug UI
app.get('/', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>LiveAvatar Pipeline Debug Server</title>
            <style>
                body { font-family: monospace; padding: 20px; background: #1a1a1a; color: #00ff00; }
                h1 { color: #00ff00; }
                .status { padding: 10px; background: #000; border: 1px solid #00ff00; margin: 10px 0; }
                .session { margin: 10px 0; padding: 10px; border-left: 3px solid #00ff00; }
                .speaking { border-left-color: #ff0000; animation: pulse 1s infinite; }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                pre { background: #000; padding: 10px; overflow-x: auto; }
            </style>
        </head>
        <body>
            <h1>🎙️ LiveAvatar Pipeline Debug Server</h1>
            <div class="status">
                <strong>WebSocket:</strong> ws://localhost:8889<br>
                <strong>HTTP:</strong> http://localhost:${PORT}<br>
                <strong>Debug Output:</strong> ${debugDir}
            </div>
            <div id="sessions"></div>
            <pre id="log"></pre>
            <script>
                async function updateStatus() {
                    const res = await fetch('/status');
                    const data = await res.json();
                    const sessionsDiv = document.getElementById('sessions');

                    if (data.sessions.length === 0) {
                        sessionsDiv.innerHTML = '<div class="session">No active sessions</div>';
                    } else {
                        sessionsDiv.innerHTML = data.sessions.map(s => \`
                            <div class="session \${s.isSpeaking ? 'speaking' : ''}">
                                Session: \${s.id}<br>
                                Connected: \${new Date(s.connectedAt).toLocaleTimeString()}<br>
                                Events: \${s.eventCount}<br>
                                Audio: \${(s.totalAudioBytes / 1024).toFixed(2)} KB<br>
                                Speaking: \${s.isSpeaking ? '🔴 YES' : '⚫ NO'}
                            </div>
                        \`).join('');
                    }
                }

                setInterval(updateStatus, 1000);
                updateStatus();
            </script>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════╗
║     LiveAvatar Pipeline Debug Server           ║
╠════════════════════════════════════════════════╣
║  HTTP Server:  http://localhost:${PORT}           ║
║  WebSocket:    ws://localhost:8889             ║
║  Debug Output: ${debugDir}    ║
╚════════════════════════════════════════════════╝

Ready to receive audio and events from LiveKit agent...
    `);
});