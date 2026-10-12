import { ActionSocket } from './action-socket.js';
import { loadConfig } from './config.js';
import { observePageContext, readPageContext } from './page-context.js';
import { SessionClient, takeAgentNavigationMarker } from './session-client.js';
import { setAgentTalking } from './speech.js';
import { mountUi } from './ui.js';
import { TIMING, type TranscriptTurn } from '@wayfinder/contracts';
import type { VoiceClient } from './voice.js';

const REFUSALS: Record<string, string> = {
  rate_limited: 'ONE MOMENT',
  voice_not_configured: 'UNAVAILABLE',
  unknown_session: 'RECONNECTING',
  failed: 'UNAVAILABLE',
};

function boot(): void {
  const root = document.querySelector<HTMLElement>('.nav-voice-container');
  if (!root) return;

  const config = loadConfig();
  const ui = mountUi(root);
  const sessions = new SessionClient(config);
  const socket = new ActionSocket(config);

  let voice: VoiceClient | undefined;
  let starting = false;
  const legTranscript: TranscriptTurn[] = [];

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
        ui.setLive(false);
        socket.close();
      },
      onAgentTalking: (talking) => {
        setAgentTalking(talking);
        ui.setListening(!talking);
        ui.setStatus(talking ? 'SPEAKING' : 'LISTENING');
      },
      onTranscript: (transcript) => {
        if (transcript.length === 0) return;
        legTranscript.splice(0, legTranscript.length, ...transcript);
        const lastTurn = transcript.at(-1);
        if (lastTurn) {
          ui.setTranscript(lastTurn.role === 'agent' ? 'Assistant' : 'You', lastTurn.text);
        }
      },
    });
    return voice;
  }

  async function start(reconnecting = false): Promise<'rate_limited' | undefined> {
    if (starting || voice?.live) return undefined;
    starting = true;
    const pageContext = readPageContext();
    if (!pageContext) {
      ui.setStatus('UNAVAILABLE');
      starting = false;
      return undefined;
    }

    legTranscript.length = 0;
    ui.setStatus(reconnecting ? 'RECONNECTING' : 'CONNECTING');
    try {
      const [client, leg] = await Promise.all([loadVoice(), sessions.startCallLeg(pageContext)]);
      if (typeof leg === 'string') {
        if (!(reconnecting && leg === 'rate_limited')) {
          ui.setStatus(REFUSALS[leg] ?? 'UNAVAILABLE');
        }
        return leg === 'rate_limited' ? leg : undefined;
      }

      const handle = sessions.handle;
      if (handle) socket.open(handle);
      // Reconnects rely on the same-origin microphone grant from the initial click.
      await client.start(leg);
    } catch {
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
    } catch {
      ui.setStatus('UNAVAILABLE');
    }
  }

  ui.onStart(() => void start());
  ui.onEnd(() => voice?.stop());

  // Standby costs nothing: a facet change updates the copy the next Seed will carry.
  observePageContext((pageContext) => {
    if (voice?.live) socket.sendPageContext(pageContext, true);
  });

  window.addEventListener('pagehide', () => {
    if (voice?.live) sessions.handoff(legTranscript);
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
