import { parseScript } from './parse';

/** Seconds per minute, for WPM ↔ duration conversion. */
const SECONDS_PER_MINUTE = 60;

/** Number of spoken words (headings and `[directions]` excluded) in raw script text. */
export function spokenWordCount(text: string): number {
  let n = 0;
  for (const w of parseScript(text).words) if (w.kind === 'speech') n++;
  return n;
}

/** Estimated reading time in whole seconds at `wpm` words per minute. 0 for non-positive wpm. */
export function estimateDurationSec(words: number, wpm: number): number {
  if (!(wpm > 0) || words <= 0) return 0;
  return Math.round((words / wpm) * SECONDS_PER_MINUTE);
}

/** Compact human duration: "45 s", "3 min 20 s", "1 h 5 min". */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return sec > 0 ? `${m} min ${sec} s` : `${m} min`;
  return `${sec} s`;
}
