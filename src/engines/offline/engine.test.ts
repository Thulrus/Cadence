import { describe, expect, it } from 'vitest';
import type { EngineStatus, RecognitionEvent } from '../../core/types';
import type { CaptureCallbacks, StartCapture } from './capture';
import { OFFLINE_MESSAGES, OfflineEngine } from './engine';
import type { VoskMessage, VoskModel, VoskRecognizer } from './vosk';

class FakeRecognizer implements VoskRecognizer {
  static last: FakeRecognizer | null = null;
  listeners = new Map<string, (m: VoskMessage) => void>();
  chunks: { n: number; rate: number }[] = [];
  removed = false;
  constructor(
    readonly rate: number,
    readonly grammar?: string,
  ) {
    FakeRecognizer.last = this;
  }
  on(event: string, l: (m: VoskMessage) => void) {
    this.listeners.set(event, l);
  }
  acceptWaveformFloat(buffer: Float32Array, rate: number) {
    this.chunks.push({ n: buffer.length, rate });
  }
  remove() {
    this.removed = true;
  }
  partial(text: string) {
    this.listeners.get('partialresult')?.({ event: 'partialresult', result: { partial: text } });
  }
  final(text: string) {
    this.listeners.get('result')?.({ event: 'result', result: { text } });
  }
  error(msg: string) {
    this.listeners.get('error')?.({ event: 'error', error: msg });
  }
}

const fakeModel: VoskModel = {
  KaldiRecognizer: FakeRecognizer,
  on() {},
  terminate() {},
};

interface Rig {
  engine: OfflineEngine;
  statuses: { status: EngineStatus; message?: string }[];
  results: RecognitionEvent[];
  levels: number[];
  cb: () => CaptureCallbacks;
  stopped: () => number;
  loads: string[];
}

function rig(
  o: {
    captureError?: unknown;
    modelError?: unknown;
    rate?: number;
    /** Resolve capture/model manually. */
    hold?: boolean;
  } = {},
) {
  let cb: CaptureCallbacks | null = null;
  let stops = 0;
  const loads: string[] = [];
  let releaseModel: () => void = () => {};
  const startCapture: StartCapture = async (c) => {
    cb = c;
    if (o.captureError) throw o.captureError;
    return { sampleRate: o.rate ?? 48000, stop: () => void stops++ };
  };
  const engine = new OfflineEngine({
    modelUrl: 'https://x/models/m.tar.gz',
    grammar: () => ['hello world', 'hello', 'world', '[unk]'],
    loadModel: (url) => {
      loads.push(url);
      if (o.modelError) return Promise.reject(o.modelError);
      if (o.hold) return new Promise((r) => (releaseModel = () => r(fakeModel)));
      return Promise.resolve(fakeModel);
    },
    startCapture,
    now: () => 42,
  });
  const r: Rig = {
    engine,
    statuses: [],
    results: [],
    levels: [],
    cb: () => cb!,
    stopped: () => stops,
    loads,
  };
  engine.events.on('status', (s) => r.statuses.push(s));
  engine.events.on('result', (e) => r.results.push(e));
  engine.events.on('level', (l) => r.levels.push(l));
  return { ...r, releaseModel: () => releaseModel() };
}

describe('OfflineEngine', () => {
  it('starts: loading → listening, with the script grammar at 16 kHz', async () => {
    const r = rig();
    await r.engine.start();
    expect(r.statuses.map((s) => s.status)).toEqual(['starting', 'listening']);
    expect(r.statuses[0]!.message).toBe(OFFLINE_MESSAGES.loading);
    expect(r.loads).toEqual(['https://x/models/m.tar.gz']);
    const rec = FakeRecognizer.last!;
    expect(rec.rate).toBe(16000);
    expect(JSON.parse(rec.grammar!)).toEqual(['hello world', 'hello', 'world', '[unk]']);
  });

  it('downsamples mic frames into the recognizer and reports a level', async () => {
    const r = rig();
    await r.engine.start();
    r.cb().onFrames(new Float32Array(2400).fill(0.1));
    expect(FakeRecognizer.last!.chunks).toEqual([{ n: 800, rate: 16000 }]);
    expect(r.levels.length).toBe(1);
    expect(r.levels[0]).toBeGreaterThan(0);
  });

  it('maps partials to interims (on change only) and results to finals', async () => {
    const r = rig();
    await r.engine.start();
    const rec = FakeRecognizer.last!;
    rec.partial('');
    rec.partial('hello');
    rec.partial('hello');
    rec.partial('hello world');
    rec.final('hello world');
    rec.partial('');
    rec.final(''); // silence-only utterance
    rec.partial('hello');
    expect(r.results).toEqual([
      { words: ['hello'], isFinal: false, timestamp: 42 },
      { words: ['hello', 'world'], isFinal: false, timestamp: 42 },
      { words: ['hello', 'world'], isFinal: true, timestamp: 42 },
      { words: ['hello'], isFinal: false, timestamp: 42 },
    ]);
  });

  it('stop → paused, mic and recognizer released; restart reuses the model', async () => {
    const r = rig();
    await r.engine.start();
    const first = FakeRecognizer.last!;
    r.engine.stop();
    expect(r.statuses.at(-1)!.status).toBe('paused');
    expect(r.stopped()).toBe(1);
    expect(first.removed).toBe(true);
    first.partial('late'); // after stop: ignored
    expect(r.results).toEqual([]);
    await r.engine.start();
    expect(r.statuses.at(-1)!.status).toBe('listening');
    expect(FakeRecognizer.last).not.toBe(first);
  });

  it('stop during model load: no recognizer, mic released', async () => {
    const r = rig({ hold: true });
    const p = r.engine.start();
    await Promise.resolve();
    await Promise.resolve();
    r.engine.stop();
    FakeRecognizer.last = null;
    r.releaseModel();
    await p;
    expect(FakeRecognizer.last).toBe(null);
    expect(r.statuses.map((s) => s.status)).toEqual(['starting', 'paused']);
    expect(r.stopped()).toBe(1);
  });

  it('mic permission denied → no-permission', async () => {
    const r = rig({ captureError: Object.assign(new Error('x'), { name: 'NotAllowedError' }) });
    await r.engine.start();
    expect(r.statuses.at(-1)).toEqual({ status: 'no-permission' });
  });

  it('no microphone → error with a message', async () => {
    const r = rig({ captureError: Object.assign(new Error('x'), { name: 'NotFoundError' }) });
    await r.engine.start();
    expect(r.statuses.at(-1)).toEqual({ status: 'error', message: OFFLINE_MESSAGES.noMic });
  });

  it('model failure → error, mic released, next start retries', async () => {
    const r = rig({ modelError: new Error('boom') });
    await r.engine.start();
    expect(r.statuses.at(-1)).toEqual({ status: 'error', message: OFFLINE_MESSAGES.modelFailed });
    expect(r.stopped()).toBe(1);
    await r.engine.start();
    expect(r.loads.length).toBe(2);
  });

  it('mic track ending → error; recognizer error → error', async () => {
    const r = rig();
    await r.engine.start();
    r.cb().onEnded();
    expect(r.statuses.at(-1)).toEqual({ status: 'error', message: OFFLINE_MESSAGES.micEnded });
    await r.engine.start();
    FakeRecognizer.last!.error('kaput');
    expect(r.statuses.at(-1)).toEqual({ status: 'error', message: OFFLINE_MESSAGES.modelFailed });
    expect(FakeRecognizer.last!.removed).toBe(true);
  });

  it('start while already listening is a no-op', async () => {
    const r = rig();
    await r.engine.start();
    await r.engine.start();
    expect(r.statuses.map((s) => s.status)).toEqual(['starting', 'listening']);
  });
});
