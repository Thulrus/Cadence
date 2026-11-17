/**
 * Global error reporting (chunk 16): uncaught errors and unhandled rejections become one small,
 * non-blocking notice instead of a silent failure or a blank screen. Repeats of the same message
 * are suppressed for a while so a failing animation frame can't flood the screen.
 */
export const ERROR_CONFIG = {
  /** Don't repeat the same message within this window. */
  repeatMs: 30_000,
  /** At most this many notices per page load (a broken build shouldn't spam). */
  maxNotices: 5,
  /** Benign browser noise, never shown. */
  /** "Script error." is an opaque cross-origin error (extensions); nothing useful to show. */
  ignore: [/ResizeObserver loop/i, /^Script error\.?$/i],
} as const;

export interface ErrorReporterDeps {
  show(message: string): void;
  now?: () => number;
  log?: (...args: unknown[]) => void;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === 'string') return e;
  return 'Unknown error';
}

/** User-facing text for an unexpected error. */
export function friendlyError(e: unknown): string {
  return `Something went wrong (${errorMessage(e)}). Your scripts are safe; if the app misbehaves, reload the page.`;
}

/** Returns `report(e)`: shows a notice unless ignored, repeated recently, or over the cap. */
export function createErrorReporter(deps: ErrorReporterDeps): (e: unknown) => void {
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? ((...a: unknown[]) => console.error(...a));
  const last = new Map<string, number>();
  let shown = 0;
  return (e) => {
    const msg = errorMessage(e);
    if (ERROR_CONFIG.ignore.some((re) => re.test(msg))) return;
    log('[cadence] unexpected error:', e);
    const t = now();
    const prev = last.get(msg);
    if (prev !== undefined && t - prev < ERROR_CONFIG.repeatMs) return;
    if (shown >= ERROR_CONFIG.maxNotices) return;
    last.set(msg, t);
    shown++;
    deps.show(friendlyError(e));
  };
}

/** Listen for `error` / `unhandledrejection` on `target` (window). Returns an uninstaller. */
export function installGlobalErrorHandler(
  target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
  report: (e: unknown) => void,
): () => void {
  const onError = (ev: Event) => {
    const e = ev as ErrorEvent;
    // Resource load errors (img/script) have no `error`/`message`; ignore them.
    if (e.error === undefined && !e.message) return;
    report(e.error ?? e.message);
  };
  const onRejection = (ev: Event) => report((ev as PromiseRejectionEvent).reason);
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
