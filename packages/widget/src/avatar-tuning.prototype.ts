// PROTOTYPE, throwaway: live-tunable audio chain for Simli's copy of the agent audio.
// On with localStorage 'wayfinder:avatar-tuning' = '1'. Settings persist in localStorage so they survive page loads.

const FLAG_KEY = 'wayfinder:avatar-tuning';
const SETTINGS_KEY = 'wayfinder:avatar-tuning-settings';

interface Settings {
  bypass: boolean;
  highpassHz: number;
  presenceHz: number;
  presenceDb: number;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  gain: number;
  bufferSize: number;
}

const DEFAULTS: Settings = {
  bypass: false,
  highpassHz: 80,
  presenceHz: 2500,
  presenceDb: 0,
  threshold: -30,
  ratio: 6,
  attack: 0.003,
  release: 0.25,
  gain: 2,
  bufferSize: 800,
};

type NumericKey = Exclude<keyof Settings, 'bypass'>;
const SLIDERS: Array<[NumericKey, string, number, number, number]> = [
  ['highpassHz', 'High-pass Hz', 20, 500, 10],
  ['presenceHz', 'Presence Hz', 1000, 6000, 100],
  ['presenceDb', 'Presence dB', -12, 12, 0.5],
  ['threshold', 'Comp threshold dB', -60, 0, 1],
  ['ratio', 'Comp ratio', 1, 20, 0.5],
  ['attack', 'Comp attack s', 0, 0.1, 0.001],
  ['release', 'Comp release s', 0.01, 1, 0.01],
  ['gain', 'Output gain', 0, 8, 0.1],
  ['bufferSize', 'Simli audioBufferSize (next start)', 64, 2000, 16],
];

let settings: Settings = load();
let applyLive: ((s: Settings) => void) | undefined;
let panel: HTMLElement | undefined;

export function tuningEnabled(): boolean {
  return globalThis.localStorage?.getItem(FLAG_KEY) === '1';
}

export function tunedBufferSize(): number {
  return settings.bufferSize;
}

export function createTunedTrack(track: MediaStreamTrack): { track: MediaStreamTrack; close: () => void } {
  const ctx = new AudioContext({ sampleRate: 16_000 });
  const source = ctx.createMediaStreamSource(new MediaStream([track]));
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.Q.value = 1;
  const comp = ctx.createDynamicsCompressor();
  const boost = ctx.createGain();
  const wet = ctx.createGain();
  const dry = ctx.createGain();
  const out = ctx.createMediaStreamDestination();
  source.connect(highpass).connect(presence).connect(comp).connect(boost).connect(wet).connect(out);
  source.connect(dry).connect(out);

  applyLive = (s) => {
    highpass.frequency.value = s.highpassHz;
    presence.frequency.value = s.presenceHz;
    presence.gain.value = s.presenceDb;
    comp.threshold.value = s.threshold;
    comp.ratio.value = s.ratio;
    comp.attack.value = s.attack;
    comp.release.value = s.release;
    boost.gain.value = s.gain;
    wet.gain.value = s.bypass ? 0 : 1;
    dry.gain.value = s.bypass ? 1 : 0;
  };
  applyLive(settings);
  mountPanel();

  return {
    track: out.stream.getAudioTracks()[0]!,
    close: () => {
      applyLive = undefined;
      void ctx.close();
    },
  };
}

function update(next: Settings): void {
  settings = next;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  applyLive?.(settings);
  render();
}

function mountPanel(): void {
  if (panel) return;
  panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;left:12px;bottom:12px;z-index:2147483647;width:300px;padding:10px;background:#111;color:#eee;' +
    'font:12px/1.4 monospace;border-radius:6px;box-shadow:0 2px 12px #0008;max-height:90vh;overflow:auto';
  document.body.append(panel);
  // Window capture runs before the widget's document-level "click outside minimises" listener.
  window.addEventListener(
    'pointerdown',
    (event) => {
      if (panel?.contains(event.target as Node)) event.stopPropagation();
    },
    true,
  );
  render();
}

function render(): void {
  if (!panel) return;
  panel.replaceChildren();
  const title = document.createElement('div');
  title.textContent = 'PROTOTYPE avatar audio tuning';
  title.style.fontWeight = 'bold';
  panel.append(title);

  const bypass = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = settings.bypass;
  box.onchange = () => update({ ...settings, bypass: box.checked });
  bypass.append(box, ' Bypass (raw audio to Simli)');
  panel.append(bypass);

  for (const [key, label, min, max, step] of SLIDERS) {
    const row = document.createElement('label');
    row.style.display = 'block';
    row.style.marginTop = '6px';
    const text = document.createElement('div');
    text.textContent = `${label}: ${settings[key]}`;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(settings[key]);
    input.style.width = '100%';
    input.oninput = () => {
      settings = { ...settings, [key]: Number(input.value) };
      text.textContent = `${label}: ${settings[key]}`;
      applyLive?.(settings);
    };
    input.onchange = () => update(settings);
    row.append(text, input);
    panel.append(row);
  }

  const buttons = document.createElement('div');
  buttons.style.marginTop = '8px';
  const reset = document.createElement('button');
  reset.textContent = 'Reset';
  reset.onclick = () => update({ ...DEFAULTS });
  const copy = document.createElement('button');
  copy.textContent = 'Copy settings';
  copy.onclick = () => void navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
  buttons.append(reset, ' ', copy);
  panel.append(buttons);
}

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(globalThis.localStorage?.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}
