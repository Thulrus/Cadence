/**
 * On-screen diagnostic log for testing on devices without remote devtools. Enabled with
 * `?debug` in the page URL (before the #hash). Shows the newest lines first.
 */
import { h } from './components/dom';

export const DEBUG_LOG_CONFIG = {
  maxLines: 40,
} as const;

/** `?debug`, `?debug=1` → on (`?debug=0` → off). */
export function debugEnabled(search: string): boolean {
  const v = new URLSearchParams(search).get('debug');
  return v !== null && v !== '0' && v !== 'false';
}

export interface DebugPanel {
  el: HTMLElement;
  log: (msg: string) => void;
}

export function createDebugPanel(now: () => number = () => performance.now()): DebugPanel {
  const list = h('ol', { className: 'debug-lines' });
  const el = h(
    'details',
    { className: 'debug-panel', open: true },
    h('summary', {}, 'Debug'),
    list,
  );
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  const t0 = now();
  return {
    el,
    log(msg) {
      const line = h('li', {}, `${((now() - t0) / 1000).toFixed(1)}s ${msg}`);
      list.prepend(line);
      while (list.childElementCount > DEBUG_LOG_CONFIG.maxLines) list.lastElementChild?.remove();
    },
  };
}
