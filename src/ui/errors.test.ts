import { describe, expect, it } from 'vitest';
import { ERROR_CONFIG, createErrorReporter, installGlobalErrorHandler } from './errors';

function setup() {
  const shown: string[] = [];
  let t = 0;
  const report = createErrorReporter({
    show: (m) => shown.push(m),
    now: () => t,
    log: () => {},
  });
  return { shown, report, advance: (ms: number) => (t += ms) };
}

describe('createErrorReporter', () => {
  it('shows a friendly message including the error text', () => {
    const { shown, report } = setup();
    report(new Error('boom'));
    expect(shown).toHaveLength(1);
    expect(shown[0]).toContain('boom');
    expect(shown[0]).toContain('scripts are safe');
  });

  it('suppresses repeats within the window, then shows again', () => {
    const { shown, report, advance } = setup();
    report(new Error('x'));
    report(new Error('x'));
    expect(shown).toHaveLength(1);
    advance(ERROR_CONFIG.repeatMs);
    report(new Error('x'));
    expect(shown).toHaveLength(2);
  });

  it('ignores ResizeObserver noise and caps the total', () => {
    const { shown, report } = setup();
    report('ResizeObserver loop completed with undelivered notifications.');
    report('Script error.');
    expect(shown).toHaveLength(0);
    for (let i = 0; i < ERROR_CONFIG.maxNotices + 3; i++) report(new Error(`e${i}`));
    expect(shown).toHaveLength(ERROR_CONFIG.maxNotices);
  });
});

describe('installGlobalErrorHandler', () => {
  it('reports error and unhandledrejection events, and uninstalls', () => {
    const target = new EventTarget();
    const got: unknown[] = [];
    const off = installGlobalErrorHandler(target, (e) => got.push(e));
    const err = Object.assign(new Event('error'), { error: new Error('a'), message: 'a' });
    target.dispatchEvent(err);
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'b' }));
    target.dispatchEvent(new Event('error')); // resource error: no message
    expect(got).toHaveLength(2);
    expect((got[0] as Error).message).toBe('a');
    expect(got[1]).toBe('b');
    off();
    target.dispatchEvent(err);
    expect(got).toHaveLength(2);
  });
});
