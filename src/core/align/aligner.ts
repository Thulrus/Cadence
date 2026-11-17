/**
 * The stateful aligner (SPEC §7 steps 5–10, §5.1 quirks). Pure and deterministic: time comes
 * only from `RecognitionEvent.timestamp`.
 *
 * Usage:
 *   const aligner = new Aligner(index, resolveConfig(settings.align));
 *   engine.events.on('result', (ev) => {
 *     const r = aligner.feed(ev);
 *     if (r?.moved) controller.set(r.position, 'align');   // r.jumped → offer undo
 *     if (r) showLost(r.lost);
 *   });
 *   // manual resync (tap, keys, timed mode): aligner.setPosition(p)
 *
 * `feed` returns null when nothing observable changed; otherwise an `AlignResult` whose
 * `moved` says whether the position changed and `lost` is the current lost flag.
 *
 * Behaviour:
 *  - Each event carries the recognizer's whole hypothesis for the current utterance. The tail
 *    is rebuilt from it every time (previous utterances + current hypothesis, last `tailMax`
 *    tokens), so rewrites replace words and repeated interim fragments can't double-advance.
 *    After `isFinal` the next event starts a new utterance; a new hypothesis that repeats the
 *    previous final as a prefix (an Android Chrome quirk) has that prefix dropped.
 *  - An unchanged tail at an unchanged position is not rescored (step 9).
 *  - Forward moves: best acceptable candidate ⇒ position = q + 1. A move whose match starts
 *    past the position (skipping script text) needs `jumpMinMatched` matched tokens.
 *  - Backward moves only with `allowBacktrack`, score ≥ `backtrackThreshold`, an aligned tail
 *    ≥ `backtrackMinTail` and a distance ≥ `backtrackMinTokens`; otherwise hold (step 5).
 *    Rereads further back than `windowBack` are found by a backward-only search over
 *    `backtrackWindow` tokens, tried only when the normal window has nothing acceptable.
 *  - No acceptable match ⇒ hold (ad-libs, step 7). Speech activity without a match accumulates;
 *    after `lostAfterMs` the aligner is lost and widens the search in `lostWidenSteps` steps up
 *    to the whole script, with the stricter lost acceptance rule (step 6).
 *  - `setPosition` (manual resync) re-centres the window and forgets what was heard before it.
 */
import type { RecognitionEvent } from '../types';
import { normalizeWords } from '../text/normalize';
import type { ScriptIndex } from '../text/types';
import { ALIGN_DEFAULTS, type AlignConfig } from './config';
import { bestCandidate, isAcceptable, scoreWindow, type AcceptMode, type Candidate } from './score';

export interface AlignResult {
  position: number;
  previous: number;
  /** position !== previous */
  moved: boolean;
  /** |position − previous| > largeJumpTokens: the UI may offer undo (step 8). */
  jumped: boolean;
  /** Lost flag after this event. */
  lost: boolean;
  /** Score of the accepted candidate, or 0 when nothing was accepted. */
  score: number;
  /** Which search accepted the match. */
  mode: AcceptMode | null;
  final: boolean;
}

export interface AlignerState {
  position: number;
  lost: boolean;
  /** ms of speech activity since the last accepted match. */
  msSinceMatch: number;
  /** Current tail of normalized recognized tokens. */
  tail: readonly string[];
}

function commonPrefix(a: readonly string[], b: readonly string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

export class Aligner {
  private p = 0;
  /** Tokens of finished utterances (last tailMax). */
  private history: string[] = [];
  /** Current utterance's hypothesis, after quirk stripping. */
  private hyp: string[] = [];
  /** Leading hyp tokens heard before a manual resync; excluded from the tail. */
  private ignore = 0;
  /** Previous final hypothesis (raw normalized), for the repeated-prefix quirk. */
  private lastFinal: string[] = [];
  private tail: string[] = [];
  private lastScoredKey = '';
  private lostMs = 0;
  private lastActivity: number | null = null;
  private lost = false;

  constructor(
    private readonly index: ScriptIndex,
    private config: AlignConfig = ALIGN_DEFAULTS,
  ) {}

  get state(): AlignerState {
    return { position: this.p, lost: this.lost, msSinceMatch: this.lostMs, tail: this.tail };
  }

  setConfig(config: AlignConfig): void {
    this.config = config;
    this.lastScoredKey = '';
  }

  /** External resync (tap, keys, timed mode): move the window, forget earlier speech. */
  setPosition(p: number): void {
    this.p = Math.min(Math.max(0, Math.floor(p)), this.index.tokens.length);
    this.history = [];
    this.ignore = this.hyp.length;
    this.tail = [];
    this.lostMs = 0;
    this.lost = false;
    this.lastScoredKey = '';
  }

  /** Back to the start with no history. */
  reset(): void {
    this.setPosition(0);
    this.hyp = [];
    this.ignore = 0;
    this.lastFinal = [];
    this.lastActivity = null;
  }

  /** Consume one recognizer event. See the module doc for what the result means. */
  feed(ev: RecognitionEvent): AlignResult | null {
    const raw = normalizeWords(ev.words).map((s) => s.text);
    let tokens = raw;
    const lf = this.lastFinal;
    if (lf.length >= 2 && commonPrefix(raw, lf) === lf.length) tokens = raw.slice(lf.length);

    const changed =
      commonPrefix(this.hyp, tokens) !== tokens.length || tokens.length !== this.hyp.length;
    if (changed && tokens.length > 0) this.noteActivity(ev.timestamp);
    this.hyp = tokens;
    this.ignore = Math.min(this.ignore, tokens.length);
    const current = tokens.slice(this.ignore);
    this.tail = [...this.history, ...current].slice(-this.config.tailMax);
    if (ev.isFinal) {
      this.history = this.tail.slice();
      this.lastFinal = raw;
      this.hyp = [];
      this.ignore = 0;
    }

    const wasLost = this.lost;
    const result = this.score(ev.isFinal);
    if (result) return result;
    if (this.lost !== wasLost) return this.result(this.p, 0, null, ev.isFinal);
    return null;
  }

  private noteActivity(t: number) {
    if (this.lastActivity !== null && t > this.lastActivity) {
      this.lostMs += Math.min(t - this.lastActivity, this.config.activityGapMs);
    }
    this.lastActivity = t;
  }

  private score(final: boolean): AlignResult | null {
    const cfg = this.config;
    const tail = this.tail;
    if (tail.length < cfg.tailMin) return null;
    const key = `${this.p}|${tail.join(' ')}`;
    if (key === this.lastScoredKey) return null;
    this.lastScoredKey = key;

    const near = bestCandidate(scoreWindow(tail, this.index, this.p, cfg), this.p);
    if (near && isAcceptable(near, cfg, 'normal')) return this.accept(near, 'normal', final);

    if (cfg.allowBacktrack && tail.length >= cfg.backtrackMinTail) {
      const behind = bestCandidate(
        scoreWindow(tail, this.index, this.p, cfg, { back: cfg.backtrackWindow, ahead: 0 }),
        this.p,
      );
      if (
        behind &&
        behind.q + 1 < this.p &&
        behind.matchedCount >= cfg.jumpMinMatched &&
        isAcceptable(behind, cfg, 'normal')
      ) {
        const r = this.accept(behind, 'normal', final);
        if (r?.moved) return r;
      }
    }

    if (this.lostMs >= cfg.lostAfterMs) {
      this.lost = true;
      const n = this.index.tokens.length;
      const step = Math.min(
        cfg.lostWidenSteps,
        1 + Math.floor((this.lostMs - cfg.lostAfterMs) / cfg.lostStepMs),
      );
      const span =
        step >= cfg.lostWidenSteps
          ? n
          : Math.round(cfg.windowAhead + ((n - cfg.windowAhead) * step) / cfg.lostWidenSteps);
      const wide = bestCandidate(
        scoreWindow(tail, this.index, this.p, cfg, {
          back: span,
          ahead: span,
          distancePenalty: cfg.lostDistancePenaltyPerToken,
        }),
        this.p,
      );
      if (wide && isAcceptable(wide, cfg, 'lost')) return this.accept(wide, 'lost', final);
    }
    return null;
  }

  private accept(c: Candidate, mode: AcceptMode, final: boolean): AlignResult | null {
    const cfg = this.config;
    const target = c.q + 1;
    const delta = target - this.p;
    const wasLost = this.lost;
    if (
      delta > 0 &&
      c.matchedSpan[0] > this.p + cfg.maxGaps &&
      c.matchedCount < cfg.jumpMinMatched
    ) {
      return null; // a skip ahead on too little evidence: hold
    }
    if (delta < 0) {
      const backtrack =
        cfg.allowBacktrack &&
        c.score >= cfg.backtrackThreshold &&
        c.tailSpan >= cfg.backtrackMinTail &&
        -delta >= cfg.backtrackMinTokens;
      if (!backtrack) {
        // The speaker is just behind p (or it's noise): hold, but they're on script.
        if (-delta <= cfg.windowBack) this.matched();
        return this.lost !== wasLost ? this.result(this.p, c.score, mode, final) : null;
      }
    }
    const previous = this.p;
    this.p = target;
    this.matched();
    if (delta === 0 && !wasLost) return null;
    return this.result(previous, c.score, mode, final);
  }

  private matched() {
    this.lostMs = 0;
    this.lost = false;
  }

  private result(
    previous: number,
    score: number,
    mode: AcceptMode | null,
    final: boolean,
  ): AlignResult {
    const d = this.p - previous;
    return {
      position: this.p,
      previous,
      moved: d !== 0,
      jumped: Math.abs(d) > this.config.largeJumpTokens,
      lost: this.lost,
      score,
      mode,
      final,
    };
  }
}
