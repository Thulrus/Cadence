import { describe, expect, it } from 'vitest';
import { buildScriptIndex } from '../text/index';
import { normalizeText } from '../text/normalize';
import { parseScript } from '../text/parse';
import { ALIGN_DEFAULTS } from './config';
import { bestCandidate, isAcceptable, scoreWindow } from './score';

const TEXT = `Brothers and sisters, I am grateful to be with you today. I want to speak about
faith, the kind of faith that moves us to act. Nephi was asked to return to Jerusalem for the
brass plates. His brothers murmured, but Nephi said he would go and do the things the Lord
commanded. And the Lord prepared a way. When we act in faith, the Lord prepares a way for us too.`;

const index = buildScriptIndex(parseScript(TEXT));
const norms = index.tokens.map((t) => t.norm);
const cfg = ALIGN_DEFAULTS;

/** Position just after the first occurrence of `phrase` (searching from `from`). */
function after(phrase: string, from = 0): number {
  const ph = normalizeText(phrase);
  for (let i = from; i + ph.length <= norms.length; i++) {
    if (ph.every((t, k) => norms[i + k] === t)) return i + ph.length;
  }
  throw new Error(`phrase not found: ${phrase}`);
}

function best(heard: string, p: number, opts = {}) {
  return bestCandidate(scoreWindow(normalizeText(heard), index, p, cfg, opts), p);
}

describe('scoreWindow', () => {
  it('exact tail → exact end position', () => {
    const p = after('I want to');
    const c = best('speak about faith the kind', p)!;
    expect(c.q + 1).toBe(after('speak about faith the kind'));
    expect(c.score).toBeGreaterThan(0.9);
    expect(isAcceptable(c, cfg)).toBe(true);
  });

  it('survives one substitution', () => {
    const p = after('Nephi was asked');
    const c = best('to return to jerusalem four the brass', p)!;
    expect(c.q + 1).toBe(after('jerusalem for the brass'));
    expect(isAcceptable(c, cfg)).toBe(true);
  });

  it('survives a dropped word', () => {
    const p = after('Nephi was asked');
    const c = best('to return jerusalem for the brass plates', p)!;
    expect(c.q + 1).toBe(after('the brass plates'));
    expect(isAcceptable(c, cfg)).toBe(true);
  });

  it('survives an inserted word', () => {
    const p = after('Nephi was asked');
    const c = best('to return um to jerusalem for the brass', p)!;
    expect(c.q + 1).toBe(after('jerusalem for the brass'));
    expect(isAcceptable(c, cfg)).toBe(true);
  });

  it('an inserted last word still ends at the last script match', () => {
    const p = after('Nephi was asked');
    const c = best('return to jerusalem for the brass um', p)!;
    expect(c.q + 1).toBe(after('jerusalem for the brass'));
  });

  it('repeated phrase: prefers the occurrence nearest p', () => {
    const first = after('the Lord prepared a way');
    const p2 = after('When we act in faith,');
    const near1 = best('the lord prepare a way', after('commanded. And'))!;
    expect(near1.q + 1).toBe(first);
    const near2 = best('the lord prepares a way', p2)!;
    expect(near2.q + 1).toBe(after('the Lord prepares a way'));
  });

  it('a misheard word the script lacks does not sink the nearby match', () => {
    // "motion" (not in the script) replaces "was": the DP drops the bad prefix.
    const p = after('Nephi');
    const c = best('nephi motion asked to return to jerusalem', p)!;
    expect(c.q + 1).toBe(after('Nephi was asked to return to Jerusalem'));
    expect(c.score).toBeGreaterThan(0.9);
    // A fuzzy match of a word the script lacks is normalized by the weight it can earn.
    const m = best('his brothers murmered but nephi said', after('brass plates'))!;
    expect(m.q + 1).toBe(after('but Nephi said'));
    expect(m.score).toBeGreaterThan(0.9);
  });

  it('nearMargin: a slightly worse nearby match beats an exact copy further on', () => {
    const repeat = buildScriptIndex(
      parseScript(
        'when ye are in the service of your fellow beings ye are only in the service of your God',
      ),
    );
    const tail = normalizeText('when motion are in the service of your');
    const cands = scoreWindow(tail, repeat, 1, cfg);
    const near = bestCandidate(cands, 1, cfg.nearMargin, cfg.nearSlack)!;
    expect(repeat.tokens[near.q + 1]!.norm).toBe('fellow');
  });

  it('ad-lib tail → nothing acceptable', () => {
    const p = after('I want to');
    const c = best('so yesterday my car broke down on the highway', p);
    expect(c === null || !isAcceptable(c, cfg)).toBe(true);
  });

  it('stopword-only tails are rejected', () => {
    const p = after('brass plates. His');
    const c = best('and the and the', p);
    expect(c === null || !isAcceptable(c, cfg)).toBe(true);
  });

  it('distance penalty: lower score further from p', () => {
    const p = after('Brothers and');
    const near = scoreWindow(normalizeText('sisters i am grateful'), index, p, cfg);
    const c = bestCandidate(near, p)!;
    const far = scoreWindow(normalizeText('sisters i am grateful'), index, p - 3, cfg);
    expect(bestCandidate(far, p - 3)!.score).toBeLessThan(c.score);
  });

  it('clamps the window at the script start and end', () => {
    const start = best('brothers and sisters', 0)!;
    expect(start.q + 1).toBe(after('brothers and sisters'));
    const end = norms.length;
    const last = best('prepares a way for us too', end)!;
    expect(last.q).toBe(end - 1);
    expect(scoreWindow([], index, 0, cfg)).toEqual([]);
    expect(scoreWindow(['faith'], index, end + 100, cfg)).toEqual([]);
  });

  it('lost mode needs a long, confident, anchored tail', () => {
    const whole = {
      back: norms.length,
      ahead: norms.length,
      distancePenalty: cfg.lostDistancePenaltyPerToken,
    };
    const long = best('nephi said he would go and do the things', 0, whole)!;
    expect(long.q + 1).toBe(after('do the things'));
    expect(isAcceptable(long, cfg, 'lost')).toBe(true);
    const short = best('go and do', 0, whole)!;
    expect(isAcceptable(short, cfg, 'lost')).toBe(false);
  });

  it('is fast: window 45 well under 1 ms, whole script ~5000 tokens under ~10 ms', () => {
    const big = buildScriptIndex(parseScript(Array.from({ length: 70 }, () => TEXT).join('\n\n')));
    expect(big.tokens.length).toBeGreaterThan(4000);
    const tail = normalizeText('nephi said he would go and do the');
    scoreWindow(tail, big, 500, cfg); // warm caches
    let t0 = 0;
    let perCall = Infinity;
    for (let r = 0; r < 5; r++) {
      t0 = performance.now();
      for (let i = 0; i < 20; i++) scoreWindow(tail, big, 500 + i, cfg);
      perCall = Math.min(perCall, (performance.now() - t0) / 20);
    }
    expect(perCall).toBeLessThan(1);
    const all = big.tokens.length;
    // Minimum of several runs: the first pays for JIT, and parallel test files add noise.
    let wholeMs = Infinity;
    for (let r = 0; r < 5; r++) {
      t0 = performance.now();
      scoreWindow(tail, big, 0, cfg, { back: all, ahead: all });
      wholeMs = Math.min(wholeMs, performance.now() - t0);
    }
    expect(wholeMs).toBeLessThan(25); // typically ~5 ms
  });
});
