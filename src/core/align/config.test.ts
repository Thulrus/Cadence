import { describe, expect, it } from 'vitest';
import { ALIGN_DEFAULTS, ALIGN_TUNING, resolveConfig } from './config';

describe('ALIGN_TUNING', () => {
  it('describes every key, with bounds that contain the default', () => {
    expect(Object.keys(ALIGN_TUNING).sort()).toEqual(Object.keys(ALIGN_DEFAULTS).sort());
    for (const [k, def] of Object.entries(ALIGN_DEFAULTS)) {
      const p = ALIGN_TUNING[k as keyof typeof ALIGN_TUNING];
      expect(p.help.length, k).toBeGreaterThan(0);
      if (typeof def !== 'number') continue;
      expect(p.min, k).toBeLessThanOrEqual(def);
      expect(p.max, k).toBeGreaterThanOrEqual(def);
      expect(p.step, k).toBeGreaterThan(0);
    }
  });
});

describe('resolveConfig', () => {
  it('merges valid overrides and ignores the rest', () => {
    const c = resolveConfig({ windowAhead: 50.7, acceptThreshold: -1, nope: 3, allowBacktrack: 1 });
    expect(c.windowAhead).toBe(50);
    expect(c.acceptThreshold).toBe(ALIGN_DEFAULTS.acceptThreshold);
    expect(c.allowBacktrack).toBe(true);
  });
});
