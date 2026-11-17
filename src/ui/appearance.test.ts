import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../storage/settings';
import { appearanceVars } from './appearance';

describe('appearanceVars', () => {
  it('maps settings to CSS values', () => {
    const v = appearanceVars({ ...DEFAULT_SETTINGS.appearance, mirrorX: true, fontSizePx: 60 });
    expect(v['--prompt-font-size']).toBe('60px');
    expect(v['--prompt-column']).toBe(`${DEFAULT_SETTINGS.appearance.columnChars}ch`);
    expect(v['--prompt-scale-x']).toBe('-1');
    expect(v['--prompt-scale-y']).toBe('1');
  });
});
