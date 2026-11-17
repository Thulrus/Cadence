import { describe, expect, it } from 'vitest';
import { buildScriptIndex } from '../text/index';
import { parseScript } from '../text/parse';
import { formatClock, pace, PACE_CONFIG, RunClock } from './pace';
import { TimedScroller } from './timed';
import { SpokenWords } from './words';

const idx = (text: string) => buildScriptIndex(parseScript(text));
const MIN = 60_000;

describe('SpokenWords', () => {
  // "1,500" → one thousand five hundred (4 tokens); heading and [direction] have none.
  const index = idx('# Title\n\nWe have 1,500 [pause] people.');
  const w = new SpokenWords(index);

  it('counts display words, not tokens', () => {
    expect(w.count).toBe(4); // We have 1,500 people
    expect(index.tokens.length).toBeGreaterThan(w.count);
  });

  it('maps positions ↔ word ordinals', () => {
    expect(w.positionAt(0)).toBe(0);
    expect(w.positionAt(2)).toBe(2); // "1,500" starts at token 2
    expect(w.positionAt(3)).toBe(index.tokens.length - 1); // "people"
    expect(w.positionAt(99)).toBe(index.tokens.length);
    expect(w.spokenBefore(0)).toBe(0);
    expect(w.spokenBefore(3)).toBe(2); // inside "1,500": not yet spoken
    expect(w.spokenBefore(index.tokens.length)).toBe(4);
    expect(w.fraction(index.tokens.length)).toBe(1);
  });

  it('handles a script with nothing to speak', () => {
    const empty = new SpokenWords(idx('# Only a heading'));
    expect(empty.count).toBe(0);
    expect(empty.fraction(0)).toBe(0);
    expect(empty.positionAt(0)).toBe(0);
  });
});

describe('TimedScroller', () => {
  const index = idx(Array.from({ length: 100 }, (_, i) => `w${i}`).join(' '));
  const words = new SpokenWords(index);

  it('advances at the set WPM from the current position', () => {
    const t = new TimedScroller(words, 120); // 2 words/s = one per 500 ms
    t.start(0);
    expect(t.tick(400)).toBeNull();
    expect(t.tick(500)).toBe(1);
    for (let now = 600; now <= 5000; now += 100) t.tick(now);
    expect(t.position).toBe(10);
  });

  it('does nothing while paused and resumes without leaping', () => {
    const t = new TimedScroller(words, 120);
    t.start(0);
    for (let now = 100; now <= 1000; now += 100) t.tick(now);
    expect(t.position).toBe(2);
    t.pause();
    expect(t.tick(60_000)).toBeNull();
    t.start(60_000);
    for (let now = 60_100; now <= 61_000; now += 100) t.tick(now);
    expect(t.position).toBe(4);
  });

  it('caps long tick gaps', () => {
    const t = new TimedScroller(words, 120);
    t.start(0);
    t.tick(10 * MIN); // counts as maxTickMs (500 ms) → 1 word
    expect(t.position).toBe(1);
  });

  it('keeps position when WPM changes mid-run', () => {
    const t = new TimedScroller(words, 60);
    t.start(0);
    for (let now = 100; now <= 3000; now += 100) t.tick(now);
    expect(t.position).toBe(3);
    t.setWpm(600); // 10 words/s
    expect(t.position).toBe(3);
    for (let now = 3100; now <= 4000; now += 100) t.tick(now);
    expect(t.position).toBe(13);
  });

  it('respects setPosition and never moves backward on tick', () => {
    const t = new TimedScroller(words, 60);
    t.start(0);
    t.setPosition(50);
    expect(t.tick(500)).toBeNull();
    expect(t.tick(1000)).toBe(51);
    t.setPosition(10);
    expect(t.position).toBe(10);
    for (let now = 1100; now <= 2000; now += 100) t.tick(now);
    expect(t.position).toBe(11);
  });

  it('counts a multi-token word as one word, and stops at the end', () => {
    const w2 = new SpokenWords(idx('one 1,500 two'));
    const t = new TimedScroller(w2, 60);
    t.start(0);
    for (let now = 100; now <= 2000; now += 100) t.tick(now);
    expect(t.position).toBe(w2.positionAt(2)); // past "1,500" after 2 words' time
    for (let now = 2100; now <= 10_000; now += 100) t.tick(now);
    expect(t.finished).toBe(true);
  });

  it('starting mid-word does not move backward', () => {
    const w2 = new SpokenWords(idx('one 1,500 two'));
    const t = new TimedScroller(w2, 60);
    t.setPosition(2); // inside "1,500"
    t.start(0);
    for (let now = 100; now <= 900; now += 100) expect(t.tick(now)).toBeNull();
    expect(t.tick(1000)).toBe(w2.positionAt(2));
  });
});

describe('pace', () => {
  const target = 10 * MIN;

  it('stays quiet early in the run', () => {
    expect(pace(5000, 0.5, target).state).toBe('early');
    expect(pace(MIN, 0.01, target).state).toBe('early');
    expect(pace(MIN, 0.5, 0).state).toBe('early');
  });

  it('is on pace within the tolerance band', () => {
    const p = pace(5 * MIN + 10_000, 0.5, target);
    expect(p.state).toBe('on-pace');
    expect(p.label).toBe('on pace');
  });

  it('reports behind / ahead with a clock delta', () => {
    const behind = pace(6 * MIN + 20_000, 0.5, target); // should be at 5:00
    expect(behind.state).toBe('behind');
    expect(behind.label).toBe('1:20 behind');
    expect(behind.projectedMs).toBeCloseTo(12 * MIN + 40_000);
    const ahead = pace(4 * MIN + 15_000, 0.5, target);
    expect(ahead.label).toBe('0:45 ahead');
  });

  it('tolerance scales with long targets', () => {
    const long = 60 * MIN; // 3% = 108 s
    expect(pace(30 * MIN + 100_000, 0.5, long).state).toBe('on-pace');
    expect(pace(30 * MIN + 120_000, 0.5, long, PACE_CONFIG).state).toBe('behind');
  });
});

describe('formatClock', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(59_999)).toBe('0:59');
    expect(formatClock(80_000)).toBe('1:20');
    expect(formatClock(3_725_000)).toBe('1:02:05');
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('RunClock', () => {
  it('excludes paused time', () => {
    const c = new RunClock();
    c.start(1000);
    c.pause(4000);
    expect(c.elapsed(10_000)).toBe(3000);
    c.start(10_000);
    expect(c.elapsed(12_000)).toBe(5000);
    c.start(11_000); // already running: no-op
    expect(c.elapsed(12_000)).toBe(5000);
    c.reset(12_000);
    expect(c.elapsed(13_000)).toBe(1000);
    expect(c.running).toBe(true);
  });
});
