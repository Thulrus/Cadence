/**
 * Dev simulator panel (chunk 12): drive the SimulatedEngine from the prompter without a mic.
 * Shown whenever the simulated engine is in use: `?sim` in the page URL (before the #hash),
 * or a dev build without Web Speech.
 */
import type { ScriptIndex } from '../core/text/types';
import type { SimulatedEngine } from '../engines/simulated';
import { NOISE_PROFILES, simulateSpeech } from '../engines/synth';
import { button, h } from './components/dom';

export const DEVSIM_CONFIG = {
  speeds: [1, 2, 4] as const,
  /** Rolling window for the dev perf log. */
  timingWindow: 50,
} as const;

/**
 * `?sim`, `?sim=1`, `?x&sim` → force the simulated engine (`?sim=0` → off). Dev builds also
 * fall back to the simulator when Web Speech is unavailable (see `resolveEngine`).
 */
export function simEnabled(search: string): boolean {
  const v = new URLSearchParams(search).get('sim');
  return v !== null && v !== '0' && v !== 'false';
}

export interface SimPanel {
  el: HTMLElement;
  setStatus(text: string): void;
  destroy(): void;
}

type NoiseName = keyof typeof NOISE_PROFILES;

export function createSimPanel(
  engine: SimulatedEngine,
  index: ScriptIndex,
  position: () => number,
): SimPanel {
  const status = h('span', { className: 'sim-status' }, 'idle');
  const input = h('input', {
    type: 'text',
    placeholder: 'Type heard words, Enter',
    className: 'sim-input',
  });
  input.setAttribute('aria-label', 'Heard words');
  const say = () => {
    engine.typeWords(input.value);
    input.value = '';
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      say();
    }
  });

  const noise = h('select', { className: 'sim-noise' });
  noise.setAttribute('aria-label', 'Noise');
  for (const n of Object.keys(NOISE_PROFILES)) noise.append(h('option', { value: n }, n));
  noise.value = 'light';
  const speed = h('select', { className: 'sim-speed' });
  speed.setAttribute('aria-label', 'Speed');
  for (const s of DEVSIM_CONFIG.speeds) speed.append(h('option', { value: String(s) }, `${s}×`));

  let seed = 1;
  const replay = () => {
    engine.cancel();
    const sim = simulateSpeech(index, {
      noise: NOISE_PROFILES[noise.value as NoiseName],
      seed: seed++,
      from: position(),
    });
    engine.replay(
      sim.events.map((e) => e.event),
      Number(speed.value),
    );
  };

  const el = h(
    'details',
    { className: 'sim-panel' },
    h('summary', {}, 'Simulator ', status),
    h('div', { className: 'sim-row' }, input, button('Say', say)),
    h(
      'div',
      { className: 'sim-row' },
      noise,
      speed,
      button('Replay from here', replay, 'primary'),
      button('Stop', () => engine.cancel()),
    ),
  );
  // Keep taps and keys inside the panel from reaching the prompter.
  el.addEventListener('pointerdown', (e) => e.stopPropagation());

  return {
    el,
    setStatus(text) {
      status.textContent = text;
    },
    destroy() {
      engine.cancel();
      el.remove();
    },
  };
}
