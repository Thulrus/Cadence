/**
 * Simulated recognizer (SPEC §5.3) for development and tests without a mic.
 *  - `typeWords(text)`: a developer types "heard" words; they arrive one by one as cumulative
 *    interim results, then as a final.
 *  - `replay(events, speed)`: play back a recorded or generated transcript (`RecognitionEvent`s
 *    with timestamps) at `speed`× real time. `simulated/` generates noisy ones from a script.
 * Events are re-stamped with the engine's clock, so the aligner sees live time.
 */
import { Emitter } from '../core/emitter';
import type { RecognitionEvent, RecognizerEngine, RecognizerEngineEvents } from '../core/types';

export const SIMULATED_CONFIG = {
  /** Gap between typed words (≈ 150 wpm). */
  typedWordMs: 400,
  /** Extra delay before a typed phrase's final. */
  typedFinalMs: 300,
} as const;

export interface SimulatedEngineDeps {
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export class SimulatedEngine implements RecognizerEngine {
  readonly id = 'simulated' as const;
  readonly events = new Emitter<RecognizerEngineEvents>();
  private running = false;
  private timers = new Set<unknown>();
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(deps: SimulatedEngineDeps = {}) {
    this.now = deps.now ?? (() => performance.now());
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** True while a replay or typed phrase is still being played out. */
  get busy(): boolean {
    return this.timers.size > 0;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.events.emit('status', { status: 'listening' });
  }

  stop(): void {
    this.cancel();
    if (!this.running) return;
    this.running = false;
    this.events.emit('status', { status: 'paused' });
  }

  /** Stop any replay / typed phrase in progress (stays listening). */
  cancel(): void {
    for (const t of this.timers) this.clearTimer(t);
    this.timers.clear();
  }

  /** Emit typed words as one utterance: cumulative interims, then a final. */
  typeWords(text: string): void {
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const { typedWordMs, typedFinalMs } = SIMULATED_CONFIG;
    const events: RecognitionEvent[] = words.map((_, i) => ({
      words: words.slice(0, i + 1),
      isFinal: false,
      timestamp: i * typedWordMs,
    }));
    events.push({
      words,
      isFinal: true,
      timestamp: (words.length - 1) * typedWordMs + typedFinalMs,
    });
    this.replay(events, 1);
  }

  /** Play `events` at `speed`× their recorded pace, starting now. Ignored while stopped. */
  replay(events: readonly RecognitionEvent[], speed = 1): void {
    if (!this.running || !events.length) return;
    const t0 = events[0]!.timestamp;
    const rate = speed > 0 ? speed : 1;
    for (const ev of events) {
      const handle = this.setTimer(
        () => {
          this.timers.delete(handle);
          this.emit(ev);
        },
        Math.max(0, (ev.timestamp - t0) / rate),
      );
      this.timers.add(handle);
    }
  }

  /** Emit one event right away (tests and tools). Ignored while stopped. */
  emit(ev: RecognitionEvent): void {
    if (!this.running) return;
    this.events.emit('result', {
      words: [...ev.words],
      isFinal: ev.isFinal,
      timestamp: this.now(),
    });
  }
}

/**
 * Parse a JSON transcript: an array of `{ words: string[], isFinal: boolean, timestamp: number }`
 * (or `{ events: [...] }`). Throws on anything else.
 */
export function parseTranscript(json: string): RecognitionEvent[] {
  const data: unknown = JSON.parse(json);
  const list = Array.isArray(data) ? data : (data as { events?: unknown })?.events;
  if (!Array.isArray(list)) throw new Error('Transcript must be an array of events.');
  return list.map((e, i) => {
    const ev = e as Partial<RecognitionEvent>;
    if (
      !Array.isArray(ev.words) ||
      !ev.words.every((w) => typeof w === 'string') ||
      typeof ev.isFinal !== 'boolean' ||
      typeof ev.timestamp !== 'number' ||
      !Number.isFinite(ev.timestamp)
    ) {
      throw new Error(`Transcript event ${i} is malformed.`);
    }
    return { words: ev.words, isFinal: ev.isFinal, timestamp: ev.timestamp };
  });
}
