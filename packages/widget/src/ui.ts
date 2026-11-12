/**
 * The visual state machine. Class names are the prior stylesheet's, unchanged — the design
 * work ported, the behaviour did not.
 */

import type { Channel } from '@wayfinder/contracts';
import { AVATAR_HIDDEN_KEY } from './session-client.js';

export interface WidgetUi {
  setMode(mode: Channel): void;
  onModeToggle(handler: () => void): void;
  setLive(live: boolean): void;
  setStatus(text: string): void;
  setTranscript(speaker: string, text: string): void;
  /** Chat: one leg's messages. Text only, never HTML. */
  clearThread(): void;
  appendMessage(role: 'agent' | 'shopper' | 'notice', text: string): void;
  setPending(pending: boolean): void;
  onSend(handler: (text: string) => void): void;
  minimise(): void;
  onStart(handler: () => void): void;
  onEnd(handler: () => void): void;
  /** Called now with the remembered state, then on every toggle. */
  onMuteChange(handler: (muted: boolean) => void): void;
  /** Called now with the remembered state, then on every toggle. */
  onAvatarHiddenChange(handler: (hidden: boolean) => void): void;
}

/** Per tab, so a preference survives the reconnect on every page load. */
const MUTED_KEY = 'wayfinder:muted';
const SUBTITLES_OFF_KEY = 'wayfinder:subtitles-off';

function bindToggle(
  button: HTMLElement | null,
  key: string,
  labels: [on: string, off: string],
  apply: (off: boolean) => void,
): void {
  let off = sessionStorage.getItem(key) === '1';
  const render = () => {
    button?.classList.toggle('is-off', off);
    button?.setAttribute('aria-pressed', String(off));
    button?.setAttribute('aria-label', off ? labels[1] : labels[0]);
    apply(off);
  };
  button?.addEventListener('click', () => {
    off = !off;
    sessionStorage.setItem(key, off ? '1' : '0');
    render();
  });
  render();
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

  let startHandler: (() => void) | undefined;

  // Hover slides the island over the pill, so idle clicks land here, not on the trigger.
  query('.minified-preview')?.addEventListener('click', (event) => {
    if ((event.target as Element).closest('.mini-call-btn')) return;
    if (root.classList.contains('is-connected')) expand();
    else startHandler?.();
  });
  query('.close-panel-btn')?.addEventListener('click', minimise);
  const chatForm = query<HTMLFormElement>('.chat-form');
  const chatInput = query<HTMLInputElement>('.chat-input');
  const sendButton = query<HTMLButtonElement>('.send-msg-btn');
  let sendHandler: ((text: string) => void) | undefined;
  let typing: HTMLElement | undefined;
  let refocus = false;
  // A native submit would reload the storefront.
  chatForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = chatInput?.value.trim();
    if (!text || chatInput?.disabled) return;
    chatInput!.value = '';
    sendHandler?.(text);
  });

  const transcript = query('.transcript-preview');
  bindToggle(query('.subtitles-btn'), SUBTITLES_OFF_KEY, ['Hide subtitles', 'Show subtitles'], (off) =>
    transcript?.classList.toggle('is-subtitles-enabled', !off),
  );

  let muteHandler: ((muted: boolean) => void) | undefined;
  let muted = false;
  bindToggle(query('.mute-btn'), MUTED_KEY, ['Mute assistant', 'Unmute assistant'], (off) => {
    muted = off;
    muteHandler?.(muted);
  });

  let avatarHandler: ((hidden: boolean) => void) | undefined;
  let avatarHidden = false;
  bindToggle(query('.avatar-btn'), AVATAR_HIDDEN_KEY, ['Hide avatar', 'Show avatar'], (off) => {
    avatarHidden = off;
    avatarHandler?.(avatarHidden);
  });

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
    setMode(mode) {
      root.classList.toggle('is-chat-mode', mode === 'chat');
      const modeButton = query('.mode-btn');
      modeButton?.setAttribute('aria-label', mode === 'chat' ? 'Switch to voice' : 'Switch to chat');
      modeButton?.setAttribute('data-mode', mode);
      const endButton = query('.toggle-call-btn');
      if (endButton) endButton.textContent = mode === 'chat' ? 'END CHAT' : 'END CALL';
    },
    onModeToggle(handler) {
      query('.mode-btn')?.addEventListener('click', (event) => {
        event.stopPropagation();
        handler();
      });
    },
    setLive(live) {
      root.classList.toggle('is-connected', live);
      for (const waveform of waveforms) waveform.classList.toggle('is-listening', live);
      if (live) expand();
      else root.classList.remove('is-active');
    },
    setStatus(text) {
      if (statusText) statusText.textContent = text;
    },
    setTranscript(speaker, text) {
      if (speakerLabel) speakerLabel.textContent = speaker;
      if (transcriptText) {
        transcriptText.textContent = text;
        transcriptText.scrollTop = transcriptText.scrollHeight;
      }
    },
    clearThread() {
      typing = undefined;
      transcriptText?.replaceChildren();
    },
    appendMessage(role, text) {
      if (!transcriptText) return;
      const line = document.createElement('p');
      line.className = `chat-line chat-line--${role}`;
      line.textContent = text;
      transcriptText.insertBefore(line, typing ?? null);
      transcriptText.scrollTop = transcriptText.scrollHeight;
    },
    setPending(pending) {
      if (pending) refocus = document.activeElement === chatInput;
      if (chatInput) chatInput.disabled = pending;
      if (sendButton) sendButton.disabled = pending;
      if (pending && !typing && transcriptText) {
        typing = document.createElement('p');
        typing.className = 'chat-line chat-line--typing';
        typing.textContent = '…';
        transcriptText.append(typing);
        transcriptText.scrollTop = transcriptText.scrollHeight;
      } else if (!pending) {
        typing?.remove();
        typing = undefined;
        // Disabling dropped focus; only give it back to a shopper who was typing.
        if (refocus) chatInput?.focus({ preventScroll: true });
        refocus = false;
      }
    },
    onSend(handler) {
      sendHandler = handler;
    },
    minimise,
    onStart(handler) {
      startHandler = handler;
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
    onMuteChange(handler) {
      muteHandler = handler;
      handler(muted);
    },
    onAvatarHiddenChange(handler) {
      avatarHandler = handler;
      handler(avatarHidden);
    },
  };
}
