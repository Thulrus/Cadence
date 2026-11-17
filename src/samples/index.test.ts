import { describe, expect, it } from 'vitest';
import { parseScript } from '../core/text/parse';
import { SAMPLE_SCRIPTS, missingSamples } from './index';

describe('sample scripts', () => {
  it('bundles three non-empty scripts that parse', () => {
    expect(SAMPLE_SCRIPTS).toHaveLength(3);
    for (const s of SAMPLE_SCRIPTS) {
      expect(s.text.length).toBeGreaterThan(500);
      expect(parseScript(s.text).words.length).toBeGreaterThan(100);
    }
  });

  it('skips samples already in the library', () => {
    const [a, b] = SAMPLE_SCRIPTS;
    expect(missingSamples([])).toHaveLength(3);
    expect(missingSamples([a!, { title: b!.title, text: 'edited' }])).toEqual(
      SAMPLE_SCRIPTS.slice(1),
    );
  });
});
