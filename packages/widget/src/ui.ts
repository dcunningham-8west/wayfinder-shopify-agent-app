/**
 * The visual state machine. Class names are the prior stylesheet's, unchanged — the design
 * work ported, the behaviour did not.
 */

export interface WidgetUi {
  setLive(live: boolean): void;
  setListening(listening: boolean): void;
  setStatus(text: string): void;
  setTranscript(speaker: string, text: string): void;
  minimise(): void;
  onStart(handler: () => void): void;
  onEnd(handler: () => void): void;
}

export function mountUi(root: HTMLElement): WidgetUi {
  const query = <T extends HTMLElement>(selector: string): T | null =>
    root.querySelector<T>(selector);

  const waveforms = [...root.querySelectorAll('.waveform-container, .mini-waveform')];
  const statusText = query('.status-text');
  const transcriptText = query('.transcript-text');
  const speakerLabel = query('.speaker-label');

  const minimise = () => root.classList.remove('is-active');
  const expand = () => {
    if (root.classList.contains('is-connected')) root.classList.add('is-active');
  };

  query('.minified-preview')?.addEventListener('click', (event) => {
    if ((event.target as Element).closest('.mini-call-btn')) return;
    expand();
  });
  query('.close-panel-btn')?.addEventListener('click', minimise);

  // Any scroll minifies: the shopper is reading the page, not us.
  window.addEventListener('scroll', () => root.classList.contains('is-active') && minimise(), {
    passive: true,
  });
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!root.classList.contains('is-active')) return;
      if (root.contains(event.target as Node)) return;
      minimise();
    },
    true,
  );

  return {
    setLive(live) {
      root.classList.toggle('is-connected', live);
      if (live) expand();
      else root.classList.remove('is-active');
    },
    setListening(listening) {
      for (const waveform of waveforms) waveform.classList.toggle('is-listening', listening);
    },
    setStatus(text) {
      if (statusText) statusText.textContent = text;
    },
    setTranscript(speaker, text) {
      if (speakerLabel) speakerLabel.textContent = speaker;
      if (transcriptText) transcriptText.textContent = text;
    },
    minimise,
    onStart(handler) {
      query('.voice-pill-trigger')?.addEventListener('click', handler);
    },
    onEnd(handler) {
      for (const button of root.querySelectorAll('.mini-call-btn, .toggle-call-btn')) {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          handler();
        });
      }
    },
  };
}
