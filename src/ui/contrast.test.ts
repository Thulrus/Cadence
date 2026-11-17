/**
 * Contrast check for the four themes in style.css (chunk 16 accessibility pass). Reads the
 * theme tokens straight from the stylesheet so a palette edit can't silently drop below the
 * thresholds. Script text in high-contrast must reach 7:1 (WCAG AAA); everything else 4.5:1.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(join(import.meta.dirname, '..', 'style.css'), 'utf8');
const THEMES = ['dark', 'light', 'high-contrast', 'green-on-black'] as const;
const AA = 4.5;
const AAA = 7;

function tokens(theme: string): Record<string, string> {
  const m = new RegExp(`:root\\[data-theme='${theme}'\\]\\s*\\{([^}]*)\\}`).exec(CSS);
  if (!m) throw new Error(`theme ${theme} not found`);
  const out: Record<string, string> = {};
  for (const [, k, v] of m[1]!.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)) out[k!] = v!;
  return out;
}

function luminance(hex: string): number {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** [foreground, background] token pairs that must be readable. */
const PAIRS: [string, string][] = [
  ['fg', 'bg'],
  ['highlight-fg', 'highlight-bg'],
  ['direction', 'bg'],
  ['heading', 'bg'],
  ['chrome-fg', 'chrome-bg'],
  ['accent', 'bg'],
  ['good', 'bg'],
  ['warn', 'bg'],
  ['bad', 'bg'],
];

describe('theme contrast', () => {
  it('computes known ratios', () => {
    expect(contrast('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrast('#777', '#777')).toBeCloseTo(1, 5);
  });

  for (const theme of THEMES) {
    it(`${theme}: all text pairs reach ${AA}:1`, () => {
      const t = tokens(theme);
      for (const [fg, bg] of PAIRS) {
        expect(t[fg], `${theme} --${fg}`).toBeDefined();
        const r = contrast(t[fg]!, t[bg]!);
        expect(r, `${theme} --${fg} on --${bg}: ${r.toFixed(2)}`).toBeGreaterThanOrEqual(AA);
      }
    });
  }

  it(`high-contrast script text reaches ${AAA}:1`, () => {
    const t = tokens('high-contrast');
    for (const [fg, bg] of PAIRS) {
      const r = contrast(t[fg]!, t[bg]!);
      expect(r, `--${fg} on --${bg}: ${r.toFixed(2)}`).toBeGreaterThanOrEqual(AAA);
    }
  });
});
