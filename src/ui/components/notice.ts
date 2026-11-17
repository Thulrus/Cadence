import { button, h } from './dom';

export type NoticeKind = 'info' | 'warning' | 'error';

export const NOTICE_CONFIG = {
  /** Auto-dismiss after this long; 0 = stays until dismissed. */
  infoTimeoutMs: 4000,
  errorTimeoutMs: 8000,
} as const;

export interface Notices {
  el: HTMLElement;
  /** Show a non-blocking message. `timeoutMs` 0 keeps it until dismissed. */
  show(message: string, kind?: NoticeKind, timeoutMs?: number): void;
}

/** App-level, non-blocking message area (aria-live). Lives outside the router's container. */
export function createNotices(): Notices {
  const el = h('div', { className: 'notices' });
  el.setAttribute('aria-live', 'polite');
  return {
    el,
    show(message, kind = 'info', timeoutMs) {
      const ms =
        timeoutMs ?? (kind === 'info' ? NOTICE_CONFIG.infoTimeoutMs : NOTICE_CONFIG.errorTimeoutMs);
      const item = h('div', { className: `notice notice-${kind}` }, h('span', {}, message));
      item.setAttribute('role', kind === 'error' ? 'alert' : 'status');
      item.append(button('Dismiss', () => item.remove(), 'plain', { ariaLabel: 'Dismiss' }));
      el.append(item);
      if (ms > 0) setTimeout(() => item.remove(), ms);
    },
  };
}
