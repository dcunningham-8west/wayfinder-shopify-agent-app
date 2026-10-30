import { ActionSocket } from './action-socket.js';
import { readCartSnapshot } from './cart-snapshot.js';
import { loadConfig } from './config.js';
import {
  clearFormResults,
  observePageContext,
  readActionTargets,
  readFormResults,
  readPageContext,
} from './page-context.js';
import { mountPreviewPanel } from './preview-panel.js';
import { SessionClient, takeAgentNavigationMarker } from './session-client.js';
import { setAgentTalking } from './speech.js';
import { mountUi } from './ui.js';
import { TIMING, type PreviewTile } from '@wayfinder/contracts';
import type { VoiceClient } from './voice.js';
import type { AvatarController } from './avatar.js';

const REFUSALS: Record<string, string> = {
  rate_limited: 'ONE MOMENT',
  voice_not_configured: 'UNAVAILABLE',
  unknown_session: 'RECONNECTING',
  failed: 'UNAVAILABLE',
};

const START_TIMEOUT_MS = 15_000;

function warn(message: string, detail?: unknown): void {
  console.warn(`[wayfinder] ${message}`, detail ?? '');
}

// simli-client 3.2.0's stop() leaves the tap's audio graph posting into a closed socket.
function releaseSimliAudioTap(simli: object): void {
  const internals = simli as {
    sourceNode?: AudioNode | null;
    audioWorklet?: AudioWorkletNode | null;
    audioContext?: AudioContext;
  };
  internals.sourceNode?.disconnect();
  if (internals.audioWorklet) {
    internals.audioWorklet.port.onmessage = null;
    internals.audioWorklet.disconnect();
  }
  internals.audioContext?.close().catch(() => {});
}

// The portrait is theme markup, rendered only when the merchant enabled the avatar.
function avatarElements(root: HTMLElement): { video: HTMLVideoElement; audio: HTMLAudioElement } {
  const video = root.querySelector<HTMLVideoElement>('.avatar-portrait video');
  const audio = root.querySelector<HTMLAudioElement>('.avatar-portrait audio');
  if (!video || !audio) throw new Error('no avatar portrait in the theme');
  return { video, audio };
}

function boot(): void {
  const root = document.querySelector<HTMLElement>('.nav-voice-container');
  if (!root) return;

  const config = loadConfig();
  const ui = mountUi(root);
  const preview = mountPreviewPanel(root);
  const sessions = new SessionClient(config);
  const socket = new ActionSocket(config);

  let voice: VoiceClient | undefined;
  let avatar: AvatarController | undefined;
  let starting = false;

  // The backend relays Retell's live transcript; the SDK no longer delivers it to the page.
  socket.onTranscript((turn) => {
    ui.setTranscript(turn.role === 'agent' ? 'Assistant' : 'You', turn.text);
    if (turn.role === 'agent') preview?.follow(turn.text);
  });

  // 600 kb of WebRTC that a shopper who never speaks should never pay for.
  async function loadVoice(): Promise<VoiceClient> {
    if (voice) return voice;
    const { VoiceClient } = await import('./voice.js');
    voice = new VoiceClient({
      onStarted: () => {
        ui.setLive(true);
        ui.setStatus('LISTENING');
      },
      onEnded: () => {
        avatar?.stop();
        ui.setLive(false);
        preview?.hide();
        socket.close();
      },
      onAgentTalking: (talking) => {
        setAgentTalking(talking);
        ui.setStatus(talking ? 'SPEAKING' : 'LISTENING');
      },
    });
    ui.onMuteChange((muted) => voice?.setAgentMuted(muted));
    return voice;
  }

  // Simli and its WebRTC stack load only for a leg that was actually granted a face.
  async function loadAvatar(): Promise<AvatarController> {
    if (avatar) return avatar;
    const { AvatarController } = await import('./avatar.js');
    avatar = new AvatarController({
      elements: () => avatarElements(root!),
      createSimli: async (token, video, audio) => {
        // simli-client is CommonJS; esbuild's split chunk exposes it only as `default`.
        const mod = (await import('simli-client')) as typeof import('simli-client') & {
          default?: typeof import('simli-client');
        };
        const { SimliClient, LogLevel } = mod.default ?? mod;
        const simli = new SimliClient(token, video, audio, null, LogLevel.ERROR, 'livekit', 'websockets', undefined, 800);
        return {
          on: (event, callback) => simli.on(event, callback),
          start: () => simli.start(),
          listenToMediastreamTrack: (track) => simli.listenToMediastreamTrack(track),
          stop: () => {
            releaseSimliAudioTap(simli);
            return simli.stop();
          },
        };
      },
      agentTrack: () => voice?.agentAudioTrack(),
      onState: (state) => {
        root!.setAttribute('data-avatar', state);
        // Dropping the dead stream brings back the poster still, so "failed" greys the face.
        if (state === 'failed' || state === 'off') {
          const video = root!.querySelector<HTMLVideoElement>('.avatar-portrait video');
          if (video) video.srcObject = null;
        }
      },
    });
    return avatar;
  }

  ui.onAvatarHiddenChange((hidden) => {
    if (hidden) avatar?.stop();
  });

  function startAvatar(token: string | undefined): void {
    if (!token) return;
    void loadAvatar()
      .then((controller) => controller.start(token))
      .catch((error: unknown) => warn('avatar load failed', error));
  }

  async function start(reconnecting = false): Promise<'rate_limited' | undefined> {
    if (voice?.live) {
      if (!reconnecting) unlockAudio();
      return undefined;
    }
    if (starting) {
      warn('start ignored: a leg is already starting');
      return undefined;
    }
    starting = true;
    const pageContext = readPageContext();
    if (!pageContext) {
      warn('start aborted: no valid page context');
      ui.setStatus('UNAVAILABLE');
      starting = false;
      return undefined;
    }

    ui.setStatus(reconnecting ? 'RECONNECTING' : 'CONNECTING');
    try {
      const formResults = readFormResults();
      const cartPromise = readCartSnapshot();
      const clientPromise = loadVoice();
      const cart = await cartPromise;
      const [client, leg] = await Promise.all([
        clientPromise,
        sessions.startCallLeg(pageContext, cart, readActionTargets(), formResults),
      ]);
      if (typeof leg === 'string') {
        warn('call leg refused', leg);
        if (!(reconnecting && leg === 'rate_limited')) {
          ui.setStatus(REFUSALS[leg] ?? 'UNAVAILABLE');
        }
        return leg === 'rate_limited' ? leg : undefined;
      }
      clearFormResults(formResults);

      const handle = sessions.handle;
      if (handle) socket.open(handle);
      // Reconnects rely on the same-origin microphone grant from the initial click.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('voice start timed out')), START_TIMEOUT_MS);
      });
      try {
        await Promise.race([client.start(leg), timedOut]);
      } finally {
        clearTimeout(timer);
      }
      startAvatar(leg.avatarToken);
    } catch (error) {
      warn(reconnecting ? 'reconnect failed' : 'start failed', error);
      voice?.stop();
      socket.close();
      ui.setStatus('UNAVAILABLE');
    } finally {
      starting = false;
    }
  }

  async function reconnectAfterAgentNavigation(): Promise<void> {
    if (!takeAgentNavigationMarker()) return;
    ui.setStatus('RECONNECTING');
    await new Promise<void>((resolve) => setTimeout(resolve, TIMING.settleBeforeLegMs));

    try {
      if (starting || voice?.live) return;
      if (!(await sessions.shouldReconnect())) {
        warn('reconnect skipped: backend has no pending agent navigation');
        ui.setStatus('UNAVAILABLE');
        return;
      }
      if (starting || voice?.live) return;

      let refusal = await start(true);
      if (refusal === 'rate_limited') {
        await new Promise<void>((resolve) => setTimeout(resolve, TIMING.minBetweenLegsMs));
        refusal = await start(true);
        if (refusal) ui.setStatus(REFUSALS[refusal] ?? 'UNAVAILABLE');
      }
    } catch (error) {
      warn('reconnect check failed', error);
      ui.setStatus('UNAVAILABLE');
    }
  }

  function unlockAudio(): void {
    if (!voice?.live) return;
    voice.resumeAudio().catch((error: unknown) => warn('audio resume failed', error));
  }

  // The first interaction after a silent reconnect is the gesture autoplay was waiting for.
  document.addEventListener('pointerdown', unlockAudio, true);
  document.addEventListener('keydown', unlockAudio, true);

  document.addEventListener('wayfinder:show-products', (event) => {
    const tiles = (event as CustomEvent<PreviewTile[]>).detail;
    if (preview?.show(tiles)) event.preventDefault();
  });

  ui.onStart(() => void start());
  ui.onEnd(() => {
    avatar?.stop();
    voice?.stop();
    socket.close();
    preview?.hide();
    void sessions.end().catch((error: unknown) => warn('session end failed', error));
  });

  // Standby costs nothing: a facet change updates the copy the next Seed will carry.
  observePageContext((pageContext) => {
    if (voice?.live) socket.sendPageContext(pageContext, true);
  });

  window.addEventListener('pagehide', () => {
    avatar?.stop();
    voice?.stop();
    socket.close();
  });

  void reconnectAfterAgentNavigation();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
