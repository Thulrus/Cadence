/**
 * Voice-follow session: one engine + one Aligner for the open script, feeding the prompter's
 * PositionController (ARCHITECTURE data flow). No DOM, so it is unit-tested with a fake engine.
 *
 *  - engine `result` → `aligner.feed` → accepted moves → `controller.set(p, 'align')`;
 *  - any other position change (tap, keys, undo, reset, timed) → `aligner.setPosition`, so the
 *    search window follows the reader's manual resync;
 *  - events for the view: `jump` (a large move: offer undo), `lost` (flag changed), `adlib`
 *    (holding at an `[ad-lib]` marker or not),
 *    `status` (engine status passthrough), `timing` (ms spent handling one result, for the
 *    dev-only perf log), `failed` (the engine or aligner threw: voice following stopped, the
 *    view falls back to manual so the prompter keeps working).
 *
 * Detached following needs nothing here: the controller keeps the position (and the renderer
 * keeps the highlight) updating while `following` is false; only scrolling stops.
 */
import { Aligner, type AlignResult } from '../core/align/aligner';
import type { AlignConfig } from '../core/align/config';
import { Emitter } from '../core/emitter';
import type { PositionController } from '../core/position/controller';
import type { ScriptIndex } from '../core/text/types';
import type { EngineStatus, RecognitionEvent, RecognizerEngine } from '../core/types';

export interface VoiceFollowEvents extends Record<string, unknown> {
  jump: { previous: number; position: number };
  lost: { lost: boolean };
  /** Holding at an ad-lib marker (`at` = its script position) or not. */
  adlib: { adlib: boolean; at: number | null };
  status: { status: EngineStatus; message?: string };
  level: number;
  timing: { ms: number; result: AlignResult | null };
  failed: { message: string };
}

export class VoiceFollowSession {
  readonly events = new Emitter<VoiceFollowEvents>();
  readonly aligner: Aligner;
  private lost = false;
  private adlibAt: number | null = null;
  private applying = false;
  /** Set by `fail()`; results are ignored until the next `start()`. */
  private failed = false;
  private readonly offs: (() => void)[] = [];

  constructor(
    readonly engine: RecognizerEngine,
    index: ScriptIndex,
    private readonly controller: PositionController,
    config: AlignConfig,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.aligner = new Aligner(index, config);
    this.aligner.setPosition(controller.position);
    this.offs.push(
      engine.events.on('result', (ev) => this.onResult(ev)),
      engine.events.on('status', (s) => this.events.emit('status', s)),
      engine.events.on('level', (l) => this.events.emit('level', l)),
      controller.events.on('change', (c) => {
        if (!this.applying) this.resync(c.position);
      }),
    );
  }

  get isLost(): boolean {
    return this.lost;
  }

  /** Holding at an ad-lib marker (SPEC §7 step 7). */
  get isAdlib(): boolean {
    return this.adlibAt !== null;
  }

  /** Start the engine. Never rejects: a throw or rejection becomes a `failed` event. */
  async start(): Promise<void> {
    this.failed = false;
    try {
      await this.engine.start();
    } catch (e) {
      this.fail(e);
    }
  }

  stop(): void {
    try {
      this.engine.stop();
    } catch (e) {
      console.error('[cadence] engine stop failed:', e);
    }
  }

  setConfig(config: AlignConfig): void {
    this.aligner.setConfig(config);
  }

  /** Re-centre the aligner on `p` (default: the controller's position) and clear "lost". */
  resync(p: number = this.controller.position): void {
    this.aligner.setPosition(p);
    this.setLost(false);
    this.syncAdlib();
  }

  /** Undo the last large jump (controller.undo → change → aligner resync). */
  undoJump(): void {
    this.controller.undo();
  }

  destroy(): void {
    for (const off of this.offs.splice(0)) off();
    this.stop();
    this.events.clear();
  }

  private onResult(ev: RecognitionEvent): void {
    if (this.failed) return;
    try {
      this.handleResult(ev);
    } catch (e) {
      this.fail(e);
    }
  }

  private fail(e: unknown): void {
    if (this.failed) return;
    this.failed = true;
    console.error('[cadence] voice following failed:', e);
    this.stop();
    this.events.emit('status', { status: 'error', message: 'Voice stopped' });
    this.events.emit('failed', { message: e instanceof Error ? e.message : String(e) });
  }

  private handleResult(ev: RecognitionEvent): void {
    const t0 = this.now();
    const r = this.aligner.feed(ev);
    if (r?.moved) {
      this.applying = true;
      try {
        this.controller.set(r.position, 'align');
      } finally {
        this.applying = false;
      }
      if (r.jumped) this.events.emit('jump', { previous: r.previous, position: r.position });
    }
    if (r) this.setLost(r.lost);
    this.syncAdlib();
    this.events.emit('timing', { ms: this.now() - t0, result: r });
  }

  private syncAdlib(): void {
    const at = this.aligner.state.adlibAt;
    if (at === this.adlibAt) return;
    this.adlibAt = at;
    this.events.emit('adlib', { adlib: at !== null, at });
  }

  private setLost(lost: boolean): void {
    if (lost === this.lost) return;
    this.lost = lost;
    this.events.emit('lost', { lost });
  }
}

/** Number of visual lines between two positions, given sorted line-start positions. */
export function linesBetween(lineStarts: readonly number[], a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  let n = 0;
  for (const s of lineStarts) if (s > lo && s <= hi) n++;
  return n;
}

/** Toast text for a large jump: "Jumped ahead 12 lines". */
export function jumpMessage(lines: number, forward: boolean): string {
  const n = Math.max(1, lines);
  return `Jumped ${forward ? 'ahead' : 'back'} ${n} line${n === 1 ? '' : 's'}`;
}

/** Rolling per-event timing stats for the dev perf log. */
export class TimingStats {
  private samples: number[] = [];
  constructor(private readonly size: number) {}

  /** Add a sample; returns a summary every `size` samples, else null. */
  add(ms: number): { n: number; mean: number; max: number } | null {
    this.samples.push(ms);
    if (this.samples.length < this.size) return null;
    const xs = this.samples.splice(0);
    return { n: xs.length, mean: xs.reduce((a, b) => a + b, 0) / xs.length, max: Math.max(...xs) };
  }
}

/** Status badge for the prompter (SPEC §9): engine status + aligner lost / ad-lib flags. */
export interface StatusBadge {
  label: string;
  /** CSS state hook: `data-state` on the badge. */
  state: 'listening' | 'paused' | 'lost' | 'adlib' | 'restarting' | 'no-permission' | 'error';
  /** Listening is on (the button offers "Pause"). */
  active: boolean;
}

export function statusBadge(
  status: EngineStatus,
  lost: boolean,
  message?: string,
  adlib = false,
): StatusBadge {
  switch (status) {
    case 'starting':
      return { label: 'Starting…', state: 'restarting', active: true };
    case 'listening':
      if (adlib) return { label: 'Ad-lib', state: 'adlib', active: true };
      return lost
        ? { label: 'Lost', state: 'lost', active: true }
        : { label: 'Listening', state: 'listening', active: true };
    case 'restarting':
      return { label: 'Recognizer restarting', state: 'restarting', active: true };
    case 'no-permission':
      return { label: 'No mic permission', state: 'no-permission', active: false };
    case 'unsupported':
      return { label: 'Voice unavailable', state: 'error', active: false };
    case 'error':
      return { label: message ?? 'Recognizer error', state: 'error', active: false };
    case 'idle':
    case 'paused':
      return { label: 'Paused', state: 'paused', active: false };
  }
}

/**
 * What the screen-reader status region should say for a badge change, or null to stay quiet.
 * Polite, not chatty: Web Speech restarts every few seconds, so `restarting` (and returning to
 * the state already announced) is never spoken. Lost adds the resync hint.
 */
export function statusAnnouncement(lastSpoken: string | null, b: StatusBadge): string | null {
  if (b.state === 'restarting') return null;
  const text =
    b.state === 'lost'
      ? 'Lost. Tap a word to resync.'
      : b.state === 'adlib'
        ? 'Ad-lib. Waiting for the next line.'
        : b.label;
  return text === lastSpoken ? null : text;
}
