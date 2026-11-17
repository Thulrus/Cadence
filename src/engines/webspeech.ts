/**
 * Web Speech recognizer (SPEC §5.1): `SpeechRecognition ?? webkitSpeechRecognition`, continuous
 * with interim results.
 *
 *  - Result mapping (`utteranceEvents`): Chrome keeps every result of a recognition session in
 *    `event.results`; earlier finals stay in the list. We track the first result not yet emitted
 *    as final. Each newly final result is emitted as its own final utterance; the remaining
 *    interim results (Chrome may split one utterance into several) are joined into one interim
 *    hypothesis. No deltas: the aligner dedups cumulative/repeated hypotheses (chunk 10).
 *  - Auto-restart: Chrome ends recognition after silence, after a few minutes, or on errors.
 *    Unless the user stopped, `end` schedules a restart with exponential backoff
 *    (`WEBSPEECH_CONFIG`), reset by any result. `not-allowed`/`service-not-allowed` mean no
 *    permission: status `no-permission`, no restart loop. Repeated `audio-capture` errors (no
 *    microphone) give up after `audioCaptureMaxRetries`.
 *  - Optional mic level meter (`MicMeter`, separate getUserMedia stream); it fails soft.
 *
 * Browser objects are injected (`WebSpeechDeps`) so tests use a fake recognition class.
 */
import { Emitter } from '../core/emitter';
import type {
  EngineStatus,
  RecognitionEvent,
  RecognizerEngine,
  RecognizerEngineEvents,
} from '../core/types';
import type { LevelMeter } from './micmeter';

export const WEBSPEECH_CONFIG = {
  /** First restart delay after `end`. */
  restartInitialMs: 250,
  /** Each consecutive restart without a result multiplies the delay by this. */
  restartFactor: 2,
  /** Restart delay cap. */
  restartMaxMs: 2000,
  /** Consecutive `audio-capture` errors (no mic / mic busy) before giving up. */
  audioCaptureMaxRetries: 3,
  maxAlternatives: 1,
} as const;

// ---- minimal local typings (TS's DOM lib has no SpeechRecognition) ----

export interface SpeechAlternativeLike {
  readonly transcript: string;
}
export interface SpeechResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechAlternativeLike;
}
export interface SpeechResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechResultLike;
}
export interface SpeechResultEventLike {
  readonly resultIndex: number;
  readonly results: SpeechResultListLike;
}
export interface SpeechErrorEventLike {
  readonly error: string;
  readonly message?: string;
}
export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: ((ev: unknown) => void) | null;
  onend: ((ev: unknown) => void) | null;
  onresult: ((ev: SpeechResultEventLike) => void) | null;
  onerror: ((ev: SpeechErrorEventLike) => void) | null;
  /** Progress events, used only for the `debug` log. */
  onaudiostart?: ((ev: unknown) => void) | null;
  onsoundstart?: ((ev: unknown) => void) | null;
  onspeechstart?: ((ev: unknown) => void) | null;
  onspeechend?: ((ev: unknown) => void) | null;
  onaudioend?: ((ev: unknown) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** The browser's recognition constructor, or null if Web Speech is unavailable. */
export function getSpeechRecognition(g: unknown = globalThis): SpeechRecognitionCtor | null {
  const w = g as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ---- pure policy ----

/** Split a transcript into words. */
export function transcriptWords(t: string): string[] {
  return t.split(/\s+/).filter(Boolean);
}

/**
 * Map one result event to engine events. `start` = index of the first result not yet emitted
 * as final. Returns the events (finals first, then at most one interim) and the new `start`.
 */
export function utteranceEvents(
  results: SpeechResultListLike,
  start: number,
): { events: { words: string[]; isFinal: boolean }[]; start: number } {
  // A list shorter than `start` was cleared by the browser: treat it as a fresh one.
  let s = start > results.length ? 0 : start;
  const events: { words: string[]; isFinal: boolean }[] = [];
  while (s < results.length && results[s]!.isFinal) {
    const words = transcriptWords(results[s]![0]?.transcript ?? '');
    if (words.length) events.push({ words, isFinal: true });
    s++;
  }
  const interim: string[] = [];
  for (let i = s; i < results.length; i++) {
    interim.push(...transcriptWords(results[i]![0]?.transcript ?? ''));
  }
  if (interim.length) events.push({ words: interim, isFinal: false });
  return { events, start: s };
}

/** Restart delay for the `n`th consecutive restart without a result (n ≥ 0). */
export function restartDelay(n: number, cfg = WEBSPEECH_CONFIG): number {
  return Math.min(cfg.restartMaxMs, cfg.restartInitialMs * cfg.restartFactor ** Math.max(0, n));
}

export type ErrorAction = 'restart' | 'no-permission' | 'fatal';

/** What to do about a recognition error code. */
export function classifyError(code: string): ErrorAction {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'no-permission';
    case 'language-not-supported':
    case 'bad-grammar':
      return 'fatal';
    default:
      // no-speech, aborted, network, audio-capture, unknown: recoverable.
      return 'restart';
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  network: 'Speech service unreachable (needs an internet connection)',
  'audio-capture': 'No microphone available',
  'language-not-supported': 'This language is not supported by the speech service',
  'service-not-allowed': 'Speech service not allowed',
  'not-allowed': 'Microphone permission denied',
};

// ---- engine ----

export interface WebSpeechDeps {
  Recognition: SpeechRecognitionCtor;
  /** Read at every (re)start so a settings change applies on the next restart. */
  lang: () => string;
  /** Optional level meter, started/stopped with listening. */
  meter?: LevelMeter | null;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Diagnostic log (the `?debug` panel): recognizer lifecycle, errors, raw transcripts. */
  debug?: (msg: string) => void;
}

const PROGRESS_EVENTS = [
  'audiostart',
  'soundstart',
  'speechstart',
  'speechend',
  'audioend',
] as const;

export class WebSpeechEngine implements RecognizerEngine {
  readonly id = 'webspeech' as const;
  readonly events = new Emitter<RecognizerEngineEvents>();
  private rec: SpeechRecognitionLike | null = null;
  /** User wants listening on. */
  private wanted = false;
  /** A non-recoverable condition: don't restart. */
  private halted = false;
  private restarts = 0;
  private audioCaptureErrors = 0;
  private resultStart = 0;
  private timer: unknown = null;
  private status: EngineStatus = 'idle';
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly deps: WebSpeechDeps) {
    this.now = deps.now ?? (() => performance.now());
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    deps.meter?.events.on('level', (l) => this.events.emit('level', l));
  }

  get currentStatus(): EngineStatus {
    return this.status;
  }

  get isRunning(): boolean {
    return this.wanted;
  }

  /** Call from a user gesture (the first `start()` triggers the permission prompt). */
  async start(): Promise<void> {
    if (this.wanted) return;
    this.wanted = true;
    this.halted = false;
    this.restarts = 0;
    this.audioCaptureErrors = 0;
    this.setStatus('starting');
    this.launch();
    // After launch(): recognition.start() must run synchronously inside the gesture.
    await this.deps.meter?.start();
  }

  stop(): void {
    if (!this.wanted) return;
    this.wanted = false;
    this.cancelTimer();
    this.deps.meter?.stop();
    const rec = this.rec;
    this.rec = null;
    if (rec) {
      this.detach(rec);
      try {
        rec.abort();
      } catch {
        // already stopped
      }
    }
    if (!this.halted) this.setStatus('paused');
    this.events.emit('level', 0);
  }

  private launch(): void {
    this.timer = null;
    if (!this.wanted || this.halted) return;
    const rec = new this.deps.Recognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = WEBSPEECH_CONFIG.maxAlternatives;
    rec.lang = this.deps.lang();
    const log = this.deps.debug;
    rec.onstart = () => {
      log?.('start');
      if (this.rec === rec) this.setStatus('listening');
    };
    rec.onresult = (ev) => {
      if (log) {
        const parts: string[] = [];
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i]!;
          parts.push(`${r.isFinal ? 'F' : 'i'}"${r[0]?.transcript ?? ''}"`);
        }
        log(`result @${ev.resultIndex}/${ev.results.length}: ${parts.join(' ')}`);
      }
      if (this.rec === rec) this.onResult(ev);
    };
    rec.onerror = (ev) => {
      log?.(`error: ${ev.error}${ev.message ? ` (${ev.message})` : ''}`);
      if (this.rec === rec) this.onError(ev);
    };
    rec.onend = () => {
      log?.('end');
      if (this.rec === rec) this.onEnd();
    };
    if (log) for (const name of PROGRESS_EVENTS) rec[`on${name}`] = () => log(name);
    log?.(`launch (lang ${rec.lang})`);
    this.rec = rec;
    this.resultStart = 0;
    try {
      rec.start();
    } catch {
      // InvalidStateError etc.: treat like an immediate end.
      this.onEnd();
    }
  }

  private onResult(ev: SpeechResultEventLike): void {
    this.restarts = 0;
    this.audioCaptureErrors = 0;
    if (this.status !== 'listening') this.setStatus('listening');
    const { events, start } = utteranceEvents(ev.results, this.resultStart);
    this.resultStart = start;
    const timestamp = this.now();
    for (const e of events) this.emitResult({ ...e, timestamp });
  }

  private emitResult(ev: RecognitionEvent): void {
    this.events.emit('result', ev);
  }

  private onError(ev: SpeechErrorEventLike): void {
    const action = classifyError(ev.error);
    if (action === 'no-permission') {
      this.halt('no-permission', ERROR_MESSAGES[ev.error]);
    } else if (action === 'fatal') {
      this.halt('error', ERROR_MESSAGES[ev.error] ?? ev.message ?? ev.error);
    } else if (ev.error === 'audio-capture') {
      if (++this.audioCaptureErrors > WEBSPEECH_CONFIG.audioCaptureMaxRetries) {
        this.halt('error', ERROR_MESSAGES['audio-capture']);
      }
    } else if (ev.error === 'network') {
      this.setStatus('restarting', ERROR_MESSAGES.network);
    }
    // Recoverable errors are always followed by `end`, which restarts.
  }

  private onEnd(): void {
    if (this.rec) this.detach(this.rec);
    this.rec = null;
    if (!this.wanted || this.halted || this.timer !== null) return;
    if (this.status !== 'restarting') this.setStatus('restarting');
    this.timer = this.setTimer(() => this.launch(), restartDelay(this.restarts++));
  }

  /** Stop for good (until the user starts again) with a status. */
  private halt(status: EngineStatus, message?: string): void {
    this.halted = true;
    this.cancelTimer();
    this.deps.meter?.stop();
    this.wanted = false;
    const rec = this.rec;
    this.rec = null;
    if (rec) {
      this.detach(rec);
      try {
        rec.abort();
      } catch {
        // ignore
      }
    }
    this.setStatus(status, message);
    this.events.emit('level', 0);
  }

  private detach(rec: SpeechRecognitionLike): void {
    rec.onstart = rec.onend = rec.onresult = rec.onerror = null;
    for (const name of PROGRESS_EVENTS) if (rec[`on${name}`]) rec[`on${name}`] = null;
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  private setStatus(status: EngineStatus, message?: string): void {
    this.status = status;
    this.events.emit('status', message ? { status, message } : { status });
  }
}
