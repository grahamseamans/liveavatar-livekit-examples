/**
 * LiveAvatarForwarder - Captures agent audio and forwards to LiveAvatar WebSocket
 * Following Tina's pattern from the HeyGen plugin
 */

import type { Room, AudioTrack, LocalParticipant, AudioFrame } from '@livekit/rtc-node';
import { AudioStream } from '@livekit/rtc-node';
import { log } from '@livekit/agents';
import WebSocket from 'ws';
import { AccessToken } from 'livekit-server-sdk';

export interface LiveAvatarConfig {
  apiKey: string;
  avatarId?: string;
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
}

interface LiveAvatarSessionResponse {
  data: {
    session_id: string;
    session_token: string;
  };
}

interface LiveAvatarStartResponse {
  data: {
    session_id: string;
    ws_url?: string;
  };
}

export class LiveAvatarForwarder {
  private ws?: WebSocket;
  private sessionId?: string;
  private wsUrl?: string;
  private eventId: string;
  private isConnected: boolean = false;
  private audioStream?: AudioStream;
  private logger = log();
  private forwardingTask?: Promise<void>;

  constructor(
    private config: LiveAvatarConfig,
    private roomName: string,
    private avatarParticipantIdentity: string = 'liveavatar-bot',
  ) {
    this.eventId = this.generateEventId();
  }

  async start(room: Room, agentParticipant: LocalParticipant): Promise<void> {
    this.logger.info('Starting LiveAvatar forwarder');

    try {
      // Step 1: Start LiveAvatar session
      await this.startLiveAvatarSession(room);

      // Step 2: Connect to WebSocket
      await this.connectWebSocket();

      // Step 3: Wait for agent to start publishing audio
      await this.waitForAudioTrack(agentParticipant);

      // Step 4: Start forwarding audio
      this.forwardingTask = this.forwardAudio();

    } catch (error) {
      this.logger.error('Failed to start LiveAvatar forwarder', error);
      throw error;
    }
  }

  private async startLiveAvatarSession(room: Room): Promise<void> {
    // Fetch avatars
    const avatarsResponse = await fetch('https://api.liveavatar.com/v1/avatars/public', {
      headers: { 'X-API-KEY': this.config.apiKey },
    });

    if (!avatarsResponse.ok) {
      throw new Error(`Failed to fetch avatars: ${avatarsResponse.status}`);
    }

    const avatarsData = await avatarsResponse.json();
    const activeAvatars = avatarsData.data.results.filter((a: any) => a.status === 'ACTIVE');
    const avatarId = this.config.avatarId || activeAvatars[0]?.id;

    if (!avatarId) {
      throw new Error('No avatar ID provided and no active avatars found');
    }

    this.logger.info(`Using avatar: ${avatarId}`);

    // Create avatar token
    const avatarToken = new AccessToken(
      this.config.livekitApiKey,
      this.config.livekitApiSecret,
      {
        identity: this.avatarParticipantIdentity,
        ttl: '10m',
      }
    );

    avatarToken.addGrant({
      room: this.roomName,
      roomJoin: true,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
    });

    const avatarJwt = await avatarToken.toJwt();

    // Create session token
    const tokenPayload = {
      mode: 'CUSTOM',
      avatar_id: avatarId,
      livekit_config: {
        livekit_url: this.config.livekitUrl,
        livekit_room: this.roomName,
        livekit_client_token: avatarJwt,
      },
    };

    const tokenResponse = await fetch('https://api.liveavatar.com/v1/sessions/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.config.apiKey,
      },
      body: JSON.stringify(tokenPayload),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new Error(`Failed to create session token: ${tokenResponse.status} - ${error}`);
    }

    const tokenData: LiveAvatarSessionResponse = await tokenResponse.json();
    const sessionToken = tokenData.data.session_token;
    this.sessionId = tokenData.data.session_id;

    this.logger.info(`Session token created: ${this.sessionId}`);

    // Start session and get WebSocket URL
    const startResponse = await fetch('https://api.liveavatar.com/v1/sessions/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({}),
    });

    if (!startResponse.ok) {
      const error = await startResponse.text();
      throw new Error(`Failed to start session: ${startResponse.status} - ${error}`);
    }

    const startData: LiveAvatarStartResponse = await startResponse.json();
    this.wsUrl = startData.data.ws_url;

    if (!this.wsUrl) {
      throw new Error('No WebSocket URL returned from LiveAvatar');
    }

    this.logger.info(`LiveAvatar session started, WebSocket URL: ${this.wsUrl}`);
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.wsUrl) {
        reject(new Error('No WebSocket URL available'));
        return;
      }

      this.logger.info('Connecting to LiveAvatar WebSocket...');
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        this.logger.info('WebSocket connected to LiveAvatar');
        this.isConnected = true;
        resolve();
      });

      this.ws.on('error', (error) => {
        this.logger.error('WebSocket error:', error);
        this.isConnected = false;
      });

      this.ws.on('close', (code, reason) => {
        this.logger.info(`WebSocket closed: ${code} - ${reason}`);
        this.isConnected = false;
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.logger.debug('WebSocket message:', message);
        } catch (error) {
          // Ignore parse errors
        }
      });
    });
  }

  private async waitForAudioTrack(participant: LocalParticipant): Promise<void> {
    this.logger.info('Waiting for agent to publish audio track...');

    // Retry loop - check for audio track with timeout
    const maxAttempts = 100; // 10 seconds total (100ms * 100)
    const retryDelay = 100; // milliseconds
    let audioPublication = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Check for audio track
      const trackPublications = Array.from(participant.trackPublications.values());
      audioPublication = trackPublications.find(pub => pub.track?.kind === 'audio');

      if (audioPublication?.track) {
        this.logger.info(`Found audio track after ${attempt * retryDelay}ms`);
        break;
      }

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }

    if (!audioPublication?.track) {
      throw new Error(`No audio track found from agent after ${maxAttempts * retryDelay}ms timeout`);
    }

    this.logger.info('Creating audio stream from track...');

    // Create an audio stream from the track (following Tina's pattern)
    this.audioStream = new AudioStream(audioPublication.track as AudioTrack);
  }

  private async forwardAudio(): Promise<void> {
    if (!this.audioStream) {
      this.logger.error('No audio stream available');
      return;
    }

    this.logger.info('Starting audio forwarding to LiveAvatar');

    // Simple resampler (48kHz -> 24kHz)
    const resampleRatio = 2; // 48000 / 24000

    for await (const audioFrame of this.audioStream) {
      if (!this.isConnected || !this.ws) {
        this.logger.warn('WebSocket not connected, dropping frame');
        continue;
      }

      try {
        // Simple downsampling (take every 2nd sample for 48kHz -> 24kHz)
        const inputData = audioFrame.data;
        const outputLength = Math.floor(inputData.length / resampleRatio);
        const outputData = new Int16Array(outputLength);

        for (let i = 0; i < outputLength; i++) {
          outputData[i] = inputData[i * resampleRatio];
        }

        // Convert to base64
        const pcmData = new Uint8Array(outputData.buffer);
        const base64Audio = Buffer.from(pcmData).toString('base64');

        // Send to LiveAvatar
        const message = {
          type: 'agent.speak',
          event_id: this.eventId,
          audio: base64Audio,
        };

        this.ws.send(JSON.stringify(message));
      } catch (error) {
        this.logger.error('Failed to forward audio:', error);
      }
    }
  }

  onSpeechEnd(): void {
    if (this.isConnected && this.ws) {
      const message = {
        type: 'agent.speak_end',
        event_id: this.eventId,
      };
      this.ws.send(JSON.stringify(message));
      this.eventId = this.generateEventId();
    }
  }

  onInterrupt(): void {
    if (this.isConnected && this.ws) {
      const message = {
        type: 'agent.interrupt',
        event_id: this.eventId,
      };
      this.ws.send(JSON.stringify(message));
      this.eventId = this.generateEventId();
    }
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping LiveAvatar forwarder');

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    // Stop LiveAvatar session
    if (this.sessionId) {
      try {
        await fetch('https://api.liveavatar.com/v1/sessions/stop', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': this.config.apiKey,
          },
          body: JSON.stringify({
            session_id: this.sessionId,
            reason: 'USER_CLOSED',
          }),
        });
        this.logger.info('LiveAvatar session stopped');
      } catch (error) {
        this.logger.error('Failed to stop LiveAvatar session:', error);
      }
    }
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}