import { RetellWebClient } from 'retell-client-js-sdk';

/**
 * The shopper grants microphone access on the initial click; silent reconnect relies on the
 * same-origin permission persisting across page loads.
 */

export interface VoiceEvents {
  onStarted: () => void;
  onEnded: () => void;
  onAgentTalking: (talking: boolean) => void;
}

export class VoiceClient {
  readonly #client = new RetellWebClient();
  #live = false;
  #agentMuted = false;

  constructor(events: VoiceEvents) {
    this.#client.on('call_started', () => {
      this.#live = true;
      this.#applyAgentMute();
      events.onStarted();
    });
    this.#client.on('call_ended', () => {
      this.#live = false;
      events.onEnded();
    });
    this.#client.on('agent_start_talking', () => {
      this.#applyAgentMute();
      events.onAgentTalking(true);
    });
    this.#client.on('agent_stop_talking', () => events.onAgentTalking(false));
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

  /** Autoplay is blocked without a gesture, so an auto-reconnected leg can be live but silent. */
  resumeAudio(): Promise<void> {
    return this.#client.startAudioPlayback();
  }

  /** Silences the agent's audio only; the shopper's mic and the call stay live. */
  setAgentMuted(muted: boolean): void {
    this.#agentMuted = muted;
    this.#applyAgentMute();
  }

  // The SDK has no output mute; its gateway playback element is private, so reach for it.
  #applyAgentMute(): void {
    const transport = (this.#client as unknown as { transport?: { audioEl?: HTMLAudioElement } })
      .transport;
    if (transport?.audioEl) transport.audioEl.muted = this.#agentMuted;
  }

  stop(): void {
    this.#client.stopCall();
  }
}
