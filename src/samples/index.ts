/**
 * Sample scripts bundled into the app (raw imports, so no runtime fetch). The same files are
 * the ASR-noise harness fixtures (test/harness/scenarios.ts reads this directory).
 */
import churchTalk from './church-talk.md?raw';
import conversational from './conversational.md?raw';
import numbers from './numbers.md?raw';

export interface SampleScript {
  title: string;
  text: string;
}

export const SAMPLE_SCRIPTS: readonly SampleScript[] = [
  { title: 'Sample: The Small and Simple Things (talk)', text: churchTalk },
  { title: 'Sample: Why I Stopped Buying Cheap Tools (video)', text: conversational },
  { title: 'Sample: Community Garden Report (numbers)', text: numbers },
];

/** Samples not already in the library (same title and text), so adding twice is a no-op. */
export function missingSamples(
  existing: readonly { title: string; text: string }[],
  samples: readonly SampleScript[] = SAMPLE_SCRIPTS,
): SampleScript[] {
  return samples.filter((s) => !existing.some((r) => r.title === s.title && r.text === s.text));
}
