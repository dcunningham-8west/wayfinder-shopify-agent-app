import { RetellWebClient } from 'retell-client-js-sdk';

/**
 * Section 07. The SDK owns the microphone prompt, which is why starting a call must happen
 * inside a user gesture — a leg resumed without one is refused by the browser.
 */

export interface VoiceEvents {
  onStarted: () => void;
  onEnded: () => void;
  onAgentTalking: (talking: boolean) => void;
  onTranscript: (role: 'agent' | 'shopper', text: string) => void;
}

interface TranscriptEntry {
  role?: string;
  content?: unknown;
  text?: unknown;
}

function lastUtterance(update: unknown): TranscriptEntry | undefined {
  const transcript = (update as { transcript?: unknown })?.transcript;
  if (!Array.isArray(transcript)) return undefined;
  return transcript.at(-1) as TranscriptEntry | undefined;
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
    this.#client.on('update', (update: unknown) => {
      const entry = lastUtterance(update);
      const text = typeof entry?.content === 'string' ? entry.content : entry?.text;
      if (typeof text !== 'string' || !text) return;
      events.onTranscript(entry?.role === 'user' ? 'shopper' : 'agent', text);
    });
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
