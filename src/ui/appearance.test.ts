import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS as D, SETTINGS_LIMITS } from '../storage/settings';
import {
  APPEARANCE_UI_CONFIG,
  FONT_FAMILIES,
  appearanceVars,
  fontFamilyId,
  stepFontSize,
} from './appearance';

describe('appearanceVars', () => {
  it('maps settings to CSS values', () => {
    const v = appearanceVars({ ...D.appearance, mirrorX: true, fontSizePx: 60 });
    expect(v['--prompt-font-size']).toBe('60px');
    expect(v['--prompt-column']).toBe(`${D.appearance.columnChars}ch`);
    expect(v['--prompt-scale-x']).toBe('-1');
    expect(v['--prompt-scale-y']).toBe('1');
  });
});

describe('font families', () => {
  it('the first stack is the default font', () => {
    expect(FONT_FAMILIES[0]!.stack).toBe(D.appearance.fontFamily);
    expect(fontFamilyId(D.appearance.fontFamily)).toBe('sans');
  });
  it('unknown stacks are custom; ids are unique', () => {
    expect(fontFamilyId('Comic Sans MS')).toBe('custom');
    expect(new Set(FONT_FAMILIES.map((f) => f.id)).size).toBe(FONT_FAMILIES.length);
  });
});

describe('stepFontSize', () => {
  const L = SETTINGS_LIMITS.fontSizePx;
  const step = APPEARANCE_UI_CONFIG.fontStepPx;
  it('steps up and down', () => {
    expect(stepFontSize(56, 1, L)).toBe(56 + step);
    expect(stepFontSize(56, -2, L)).toBe(56 - 2 * step);
  });
  it('clamps to limits', () => {
    expect(stepFontSize(L.max - 1, 1, L)).toBe(L.max);
    expect(stepFontSize(L.min + 1, -1, L)).toBe(L.min);
  });
});
