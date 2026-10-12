import { RetellWebClient } from 'retell-client-js-sdk';
import type { TranscriptTurn } from '@wayfinder/contracts';

/**
 * The shopper grants microphone access on the initial click; silent reconnect relies on the
 * same-origin permission persisting across page loads.
 */

export interface VoiceEvents {
  onStarted: () => void;
  onEnded: () => void;
  onAgentTalking: (talking: boolean) => void;
  onTranscript: (transcript: TranscriptTurn[]) => void;
}

interface TranscriptEntry {
  role?: string;
  content?: unknown;
  text?: unknown;
}

function transcriptSnapshot(update: unknown): TranscriptTurn[] {
  const transcript = (update as { transcript?: unknown })?.transcript;
  if (!Array.isArray(transcript)) return [];
  return transcript.flatMap((raw) => {
    const entry = raw as TranscriptEntry;
    const text = typeof entry.content === 'string' ? entry.content : entry.text;
    if (typeof text !== 'string' || !text) return [];
    return [{ role: entry.role === 'user' ? 'shopper' : 'agent', text }];
  });
}

export class VoiceClient {
  readonly #client = new RetellWebClient();
  #live = false;

  constructor(events: VoiceEvents) {
    this.#client.on('call_started', () => {
      this.#live = true;
      events.onStarted();
    });
    this.#client.on('call_ended', () => {
      this.#live = false;
      events.onEnded();
    });
    this.#client.on('agent_start_talking', () => events.onAgentTalking(true));
    this.#client.on('agent_stop_talking', () => events.onAgentTalking(false));
    this.#client.on('update', (update: unknown) => events.onTranscript(transcriptSnapshot(update)));
  }

  get live(): boolean {
    return this.#live;
  }

  async start(leg: {
    accessToken: string;
    callId: string;
    transport: string;
    iceServers: RTCIceServer[];
  }): Promise<void> {
    await this.#client.startCall({
      accessToken: leg.accessToken,
      callId: leg.callId,
      transport: leg.transport as 'gateway',
      iceServers: leg.iceServers,
    });
  }

  stop(): void {
    this.#client.stopCall();
  }
}
