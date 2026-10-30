/** Section 13. Simli renders the face; Retell keeps the voice, so nothing here touches audio out. */

export type AvatarState = 'off' | 'starting' | 'live' | 'failed';

export interface SimliLike {
  on(event: 'error' | 'startup_error', callback: (detail: unknown) => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  listenToMediastreamTrack(track: MediaStreamTrack): void;
}

export interface AvatarDeps {
  elements(): { video: HTMLVideoElement; audio: HTMLAudioElement };
  createSimli(token: string, video: HTMLVideoElement, audio: HTMLAudioElement): Promise<SimliLike>;
  agentTrack(): MediaStreamTrack | undefined;
  onState(state: AvatarState): void;
}

export class AvatarController {
  #simli: SimliLike | undefined;
  #generation = 0;

  constructor(private readonly deps: AvatarDeps) {}

  async start(token: string): Promise<void> {
    this.stop();
    const generation = ++this.#generation;
    this.deps.onState('starting');
    try {
      const { video, audio } = this.deps.elements();
      audio.muted = true;
      const simli = await this.deps.createSimli(token, video, audio);
      if (generation !== this.#generation) return void simli.stop().catch(() => {});
      this.#simli = simli;
      simli.on('error', (detail) => this.#fail(generation, detail));
      simli.on('startup_error', (detail) => this.#fail(generation, detail));
      await simli.start();
      if (generation !== this.#generation) return;
      const track = this.deps.agentTrack();
      if (!track) throw new Error('no agent audio track');
      simli.listenToMediastreamTrack(track);
      this.deps.onState('live');
    } catch (error) {
      this.#fail(generation, error);
    }
  }

  stop(): void {
    this.#generation += 1;
    const simli = this.#simli;
    this.#simli = undefined;
    if (!simli) return;
    // Fire-and-forget: pagehide won't wait, and maxIdleTime is the backstop.
    simli.stop().catch(() => {});
    this.deps.onState('off');
  }

  #fail(generation: number, detail: unknown): void {
    if (generation !== this.#generation) return;
    console.warn('[wayfinder] avatar failed', detail ?? '');
    const simli = this.#simli;
    this.#simli = undefined;
    simli?.stop().catch(() => {});
    this.deps.onState('failed');
  }
}
