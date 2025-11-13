/**
 * LiveAvatarAudioOutput - Custom AudioOutput that forwards TTS audio to LiveAvatar's WebSocket
 */

import { voice, log } from '@livekit/agents';
import type { AudioFrame, Room } from '@livekit/rtc-node';
import WebSocket from 'ws';

const SAMPLE_RATE = 24000; // LiveAvatar requires 24kHz PCM

export interface LiveAvatarConfig {
  apiKey: string;
  avatarId: string;
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
    livekit_url?: string;
    livekit_client_token?: string;
  };
}

export class LiveAvatarAudioOutput extends voice.AudioOutput {
  private ws?: WebSocket;
  private sessionId?: string;
  private sessionToken?: string;
  private wsUrl?: string;
  private eventId: string;
  private audioResampler?: AudioResampler;
  private isConnected: boolean = false;
  private logger = log();

  constructor(
    private config: LiveAvatarConfig,
    private roomName: string,
    private avatarParticipantIdentity: string = 'liveavatar-bot',
  ) {
    super(SAMPLE_RATE, undefined); // LiveAvatar needs 24kHz, no chain
    this.eventId = this.generateEventId();
  }

  async start(room: Room): Promise<void> {
    this.logger.info('Starting LiveAvatar session');

    try {
      // Step 1: Fetch available avatars
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

      // Step 2: Create avatar token for room access
      const { AccessToken } = await import('livekit-server-sdk');
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

      // Step 3: Create LiveAvatar session token
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
      this.sessionToken = tokenData.data.session_token;
      this.sessionId = tokenData.data.session_id;

      this.logger.info(`Session token created: ${this.sessionId}`);

      // Step 4: Start LiveAvatar session and get WebSocket URL
      const startResponse = await fetch('https://api.liveavatar.com/v1/sessions/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.sessionToken}`,
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

      // Step 5: Connect to WebSocket
      await this.connectWebSocket();

      // Step 6: Initialize audio resampler (48kHz -> 24kHz typical)
      // We'll implement a simple resampler later
      this.audioResampler = new AudioResampler(48000, SAMPLE_RATE);

    } catch (error) {
      this.logger.error('Failed to start LiveAvatar session', error);
      throw error;
    }
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
        reject(error);
      });

      this.ws.on('close', (code, reason) => {
        this.logger.info(`WebSocket closed: ${code} - ${reason}`);
        this.isConnected = false;
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.logger.debug('WebSocket message received:', message);
        } catch (error) {
          this.logger.error('Failed to parse WebSocket message:', error);
        }
      });
    });
  }

  async captureFrame(frame: AudioFrame): Promise<void> {
    await super.captureFrame(frame);

    if (!this.isConnected || !this.ws) {
      this.logger.warn('WebSocket not connected, dropping audio frame');
      return;
    }

    try {
      // Resample audio if needed (input is usually 48kHz, LiveAvatar needs 24kHz)
      const resampledFrames = this.audioResampler?.push(frame) || [frame];

      for (const resampledFrame of resampledFrames) {
        // Convert to PCM 16-bit bytes
        const pcmData = this.convertToPCM16(resampledFrame);

        // Convert to base64
        const base64Audio = Buffer.from(pcmData).toString('base64');

        // Send to LiveAvatar WebSocket
        const message = {
          type: 'agent.speak',
          event_id: this.eventId,
          audio: base64Audio,
        };

        this.ws.send(JSON.stringify(message));
      }
    } catch (error) {
      this.logger.error('Failed to send audio to LiveAvatar:', error);
    }
  }

  flush(): void {
    super.flush();

    // Send end of speech event to LiveAvatar
    if (this.isConnected && this.ws) {
      const message = {
        type: 'agent.speak_end',
        event_id: this.eventId,
      };
      this.ws.send(JSON.stringify(message));

      // Generate new event ID for next speech segment
      this.eventId = this.generateEventId();
    }
  }

  clearBuffer(): void {
    // Send interrupt event to LiveAvatar
    if (this.isConnected && this.ws) {
      const message = {
        type: 'agent.interrupt',
        event_id: this.eventId,
      };
      this.ws.send(JSON.stringify(message));

      // Generate new event ID after interrupt
      this.eventId = this.generateEventId();
    }
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping LiveAvatar session');

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

  private convertToPCM16(frame: AudioFrame): Uint8Array {
    // frame.data is Int16Array, we need to convert to Uint8Array for base64
    // LiveAvatar expects PCM 16-bit little-endian
    return new Uint8Array(frame.data.buffer);
  }
}

/**
 * Simple audio resampler using linear interpolation
 */
class AudioResampler {
  private ratio: number;
  private buffer: number[] = [];

  constructor(private inputRate: number, private outputRate: number) {
    this.ratio = inputRate / outputRate;
  }

  push(frame: AudioFrame): AudioFrame[] {
    if (frame.sampleRate === this.outputRate) {
      return [frame]; // No resampling needed
    }

    const inputSamples = frame.data;
    const outputSampleCount = Math.floor(inputSamples.length / this.ratio);
    const outputData = new Int16Array(outputSampleCount);

    // Simple linear interpolation resampling
    for (let i = 0; i < outputSampleCount; i++) {
      const inputIndex = i * this.ratio;
      const index0 = Math.floor(inputIndex);
      const index1 = Math.min(index0 + 1, inputSamples.length - 1);
      const fraction = inputIndex - index0;

      // Linear interpolation between two samples
      outputData[i] = Math.round(
        inputSamples[index0] * (1 - fraction) + inputSamples[index1] * fraction
      );
    }

    return [{
      data: outputData,
      sampleRate: this.outputRate,
      channels: frame.channels,
      samplesPerChannel: outputSampleCount / frame.channels,
    } as AudioFrame];
  }
}