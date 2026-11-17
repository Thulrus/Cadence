/**
 * Thin, lazily loaded wrapper over `vosk-browser` (Kaldi/Vosk compiled to WASM, running in its
 * own Web Worker). The ~6 MB runtime is a separate chunk fetched on first use, never part of
 * the main bundle.
 *
 * One model per page: it takes seconds and ~100 MB of worker memory to load, so it's kept
 * after the first start and shared by every recognizer. `vosk-browser` persists the unpacked
 * model in IndexedDB (IDBFS at `/vosk`), seeded by ModelStore; see model.ts.
 *
 * `createModel` from the package never rejects on worker errors, so the Model is built here
 * with our own load/error/timeout handling.
 */

export const VOSK_CONFIG = {
  /** vosk-browser log level: -1 = warnings and errors only. */
  logLevel: -1,
  /** Give up on a model load after this long (slow phones take ~5–10 s; first load unpacks). */
  loadTimeoutMs: 120_000,
} as const;

export interface VoskWord {
  word: string;
  start: number;
  end: number;
  conf: number;
}

export interface VoskMessage {
  event: string;
  error?: string;
  result?: { text?: string; partial?: string; result?: VoskWord[] };
}

export interface VoskRecognizer {
  on(event: 'result' | 'partialresult' | 'error', listener: (m: VoskMessage) => void): void;
  acceptWaveformFloat(buffer: Float32Array, sampleRate: number): void;
  remove(): void;
}

export interface VoskModel {
  readonly KaldiRecognizer: new (sampleRate: number, grammar?: string) => VoskRecognizer;
  on(event: 'load' | 'error', listener: (m: VoskMessage & { result?: unknown }) => void): void;
  terminate(): void;
  /** vosk-browser's worker (not in its typings); terminated to actually free its memory. */
  readonly worker?: Worker;
}

export type LoadModel = (url: string) => Promise<VoskModel>;

let cached: { url: string; model: Promise<VoskModel> } | null = null;
let runtime: Promise<unknown> | null = null;

/** Import the runtime chunk (once per page). */
function importRuntime(): Promise<unknown> {
  runtime ??= import('vosk-browser');
  runtime.catch(() => (runtime = null));
  return runtime;
}

/**
 * Fetch the runtime now, e.g. right after the model download, so a page that goes offline
 * before the service worker controls it (first visit) can still start the engine.
 */
export function warmVoskRuntime(): Promise<void> {
  return importRuntime().then(
    () => {},
    () => {},
  );
}

/** Load (or reuse) the model at `url`. A failed load is forgotten so the next start retries. */
export const loadVoskModel: LoadModel = (url) => {
  if (cached?.url === url) return cached.model;
  disposeVoskModel();
  const model = (async () => {
    const { Model } = (await importRuntime()) as {
      Model: new (url: string, logLevel?: number) => VoskModel;
    };
    const m = new Model(url, VOSK_CONFIG.logLevel);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out loading the speech model')),
        VOSK_CONFIG.loadTimeoutMs,
      );
      m.on('load', (msg) => {
        clearTimeout(timer);
        if (msg.result) resolve();
        else reject(new Error('The speech model failed to load'));
      });
      m.on('error', (msg) => {
        clearTimeout(timer);
        reject(new Error(msg.error ?? 'The speech model failed to load'));
      });
    }).catch((e: unknown) => {
      shutdown(m);
      throw e;
    });
    return m;
  })();
  cached = { url, model };
  model.catch(() => {
    if (cached?.model === model) cached = null;
  });
  return model;
};

/** Free the loaded model (e.g. before deleting it from storage). */
export function disposeVoskModel(): void {
  const c = cached;
  cached = null;
  c?.model.then(shutdown).catch(() => {});
}

function shutdown(m: VoskModel): void {
  m.terminate();
  m.worker?.terminate();
}
