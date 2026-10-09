import { ActionSocket } from './action-socket.js';
import { loadConfig } from './config.js';
import { observePageContext, readPageContext } from './page-context.js';
import { SessionClient } from './session-client.js';
import { mountUi } from './ui.js';
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
        ui.setListening(!talking);
        ui.setStatus(talking ? 'SPEAKING' : 'LISTENING');
      },
      onTranscript: (role, text) =>
        ui.setTranscript(role === 'agent' ? 'Assistant' : 'You', text),
    });
    return voice;
  }

  async function start(): Promise<void> {
    const pageContext = readPageContext();
    if (!pageContext) {
      ui.setStatus('UNAVAILABLE');
      return;
    }

    ui.setStatus('CONNECTING');
    const [client, leg] = await Promise.all([loadVoice(), sessions.startCallLeg(pageContext)]);
    if (typeof leg === 'string') {
      ui.setStatus(REFUSALS[leg] ?? 'UNAVAILABLE');
      return;
    }

    const handle = sessions.handle;
    if (handle) socket.open(handle);
    // Inside the click: the SDK asks for the microphone, and only a gesture may.
    await client.start(leg.accessToken);
  }

  ui.onStart(() => void start());
  ui.onEnd(() => voice?.stop());

  // Standby costs nothing: a facet change updates the copy the next Seed will carry.
  observePageContext((pageContext) => {
    if (voice?.live) socket.sendPageContext(pageContext, true);
  });

  window.addEventListener('pagehide', () => {
    voice?.stop();
    socket.close();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
