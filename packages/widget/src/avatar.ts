/** Section 13. Simli renders the face; Retell keeps the voice, so nothing here touches audio out. */

export type AvatarState = 'off' | 'starting' | 'live' | 'failed';

export interface SimliLike {
  on(event: 'error' | 'startup_error' | 'stop', callback: (detail: unknown) => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  listenToMediastreamTrack(track: MediaStreamTrack): void;
}

export interface AvatarDeps {
  elements(): { video: HTMLVideoElement; audio: HTMLAudioElement };
  createSimli(token: string, video: HTMLVideoElement, audio: HTMLAudioElement): Promise<SimliLike>;
  agentTrack(): MediaStreamTrack | undefined;
  onState(state: AvatarState): void;
  /** A fresh grant for the live leg, from the mid-leg token route. */
  fetchToken(): Promise<string | undefined>;
  retryDelayMs?: number;
}

// The previous Simli session can hold the face's slot for a moment after it ends.
const RETRY_DELAY_MS = 2_000;

export class AvatarController {
  #simli: SimliLike | undefined;
  #generation = 0;
  #state: AvatarState = 'off';

  constructor(private readonly deps: AvatarDeps) {}

  async start(token: string): Promise<void> {
    this.#release();
    const generation = this.#generation;
    this.#setState('starting');
    await this.#attempt(token, generation, false);
  }

  async #attempt(token: string, generation: number, retried: boolean): Promise<void> {
    let settled = false;
    let retry: Promise<void> | undefined;
    const startupFailed = (detail: unknown): void => {
      if (settled || generation !== this.#generation) return;
      settled = true;
      if (retried) return this.#fail(generation, detail);
      console.warn('[wayfinder] avatar start refused, retrying', detail ?? '');
      this.#drop();
      retry = this.#retry(generation);
    };
    try {
      const { video, audio } = this.deps.elements();
      audio.muted = true;
      // LiveKit's attach() resets `muted` to false; it never touches volume.
      audio.volume = 0;
      const simli = await this.deps.createSimli(token, video, audio);
      if (generation !== this.#generation) return void simli.stop().catch(() => {});
      this.#simli = simli;
      simli.on('startup_error', startupFailed);
      simli.on('error', (detail) => (settled ? this.#fail(generation, detail) : startupFailed(detail)));
      // Simli ends the session itself at maxSessionLength; voice carries on.
      simli.on('stop', () => {
        if (generation !== this.#generation || this.#simli !== simli) return;
        this.stop();
      });
      await simli.start();
      if (settled || generation !== this.#generation) return void (await retry);
      const track = this.deps.agentTrack();
      if (!track) throw new Error('no agent audio track');
      simli.listenToMediastreamTrack(track);
      settled = true;
      this.#setState('live');
    } catch (error) {
      startupFailed(error);
      await retry;
    }
  }

  async #retry(generation: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.deps.retryDelayMs ?? RETRY_DELAY_MS));
    if (generation !== this.#generation) return;
    try {
      const token = await this.deps.fetchToken();
      if (generation !== this.#generation) return;
      if (!token) throw new Error('no avatar token for this leg');
      await this.#attempt(token, generation, true);
    } catch (error) {
      this.#fail(generation, error);
    }
  }

  stop(): void {
    this.#release();
    // Also clears a failed portrait: failure lasts only for its leg.
    this.#setState('off');
  }

  #release(): void {
    this.#generation += 1;
    this.#drop();
  }

  #drop(): void {
    const simli = this.#simli;
    this.#simli = undefined;
    // Fire-and-forget: pagehide won't wait, and maxIdleTime is the backstop.
    simli?.stop().catch(() => {});
  }

  #fail(generation: number, detail: unknown): void {
    if (generation !== this.#generation) return;
    console.warn('[wayfinder] avatar failed', detail ?? '');
    this.#drop();
    this.#setState('failed');
  }

  #setState(state: AvatarState): void {
    if (state === this.#state) return;
    this.#state = state;
    this.deps.onState(state);
  }
}
