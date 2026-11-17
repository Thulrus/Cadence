import { describe, expect, it } from 'vitest';
import type { EngineStatus, RecognitionEvent } from '../core/types';
import { Emitter } from '../core/emitter';
import type { LevelMeter } from './micmeter';
import {
  classifyError,
  getSpeechRecognition,
  restartDelay,
  utteranceEvents,
  WEBSPEECH_CONFIG,
  WebSpeechEngine,
  type SpeechRecognitionLike,
  type SpeechResultListLike,
} from './webspeech';

type R = [string, boolean];
const list = (...rs: R[]): SpeechResultListLike =>
  rs.map(([t, isFinal]) => Object.assign([{ transcript: t }], { isFinal }));

class FakeRecognition implements SpeechRecognitionLike {
  static instances: FakeRecognition[] = [];
  static throwOnStart = false;
  continuous = false;
  interimResults = false;
  lang = '';
  maxAlternatives = 0;
  onstart: SpeechRecognitionLike['onstart'] = null;
  onend: SpeechRecognitionLike['onend'] = null;
  onresult: SpeechRecognitionLike['onresult'] = null;
  onerror: SpeechRecognitionLike['onerror'] = null;
  started = false;
  aborted = false;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    if (FakeRecognition.throwOnStart) throw new Error('InvalidStateError');
    this.started = true;
  }
  stop() {}
  abort() {
    this.aborted = true;
  }
  // test drivers
  fireStart() {
    this.onstart?.({});
  }
  result(resultIndex: number, ...rs: R[]) {
    this.onresult?.({ resultIndex, results: list(...rs) });
  }
  error(code: string) {
    this.onerror?.({ error: code });
  }
  end() {
    this.onend?.({});
  }
}

function setup(meter?: LevelMeter) {
  FakeRecognition.instances = [];
  FakeRecognition.throwOnStart = false;
  const timers: { fn: () => void; ms: number }[] = [];
  const engine = new WebSpeechEngine({
    Recognition: FakeRecognition,
    lang: () => 'en-GB',
    meter,
    now: () => 42,
    setTimer: (fn, ms) => {
      const t = { fn, ms };
      timers.push(t);
      return t;
    },
    clearTimer: (h) => timers.splice(timers.indexOf(h as (typeof timers)[number]), 1),
  });
  const statuses: EngineStatus[] = [];
  const results: RecognitionEvent[] = [];
  engine.events.on('status', (s) => statuses.push(s.status));
  engine.events.on('result', (r) => results.push(r));
  const rec = () => FakeRecognition.instances.at(-1)!;
  const fire = () => timers.shift()!.fn();
  return { engine, timers, statuses, results, rec, fire };
}

describe('utteranceEvents', () => {
  it('joins interim results into one hypothesis', () => {
    const r = utteranceEvents(list(['hello there', false], [' my friend', false]), 0);
    expect(r).toEqual({
      events: [{ words: ['hello', 'there', 'my', 'friend'], isFinal: false }],
      start: 0,
    });
  });

  it('emits each new final as its own utterance, then the remaining interims', () => {
    const r = utteranceEvents(list(['old', true], ['hello there', true], ['and', false]), 1);
    expect(r.events).toEqual([
      { words: ['hello', 'there'], isFinal: true },
      { words: ['and'], isFinal: false },
    ]);
    expect(r.start).toBe(2);
  });

  it('skips already-emitted finals and empty transcripts', () => {
    expect(utteranceEvents(list(['a b', true], ['  ', false]), 1)).toEqual({
      events: [],
      start: 1,
    });
  });

  it('starts over when the list shrinks below start', () => {
    expect(utteranceEvents(list(['new', false]), 5)).toEqual({
      events: [{ words: ['new'], isFinal: false }],
      start: 0,
    });
  });
});

describe('restart policy', () => {
  it('backs off 250 → 2000 ms', () => {
    expect([0, 1, 2, 3, 4, 10].map((n) => restartDelay(n))).toEqual([
      250, 500, 1000, 2000, 2000, 2000,
    ]);
  });

  it('classifies errors', () => {
    expect(classifyError('not-allowed')).toBe('no-permission');
    expect(classifyError('service-not-allowed')).toBe('no-permission');
    expect(classifyError('language-not-supported')).toBe('fatal');
    for (const c of ['no-speech', 'aborted', 'network', 'audio-capture', 'weird'])
      expect(classifyError(c)).toBe('restart');
  });

  it('finds the constructor, prefixed or not', () => {
    expect(getSpeechRecognition({})).toBeNull();
    expect(getSpeechRecognition({ webkitSpeechRecognition: FakeRecognition })).toBe(
      FakeRecognition,
    );
  });
});

describe('WebSpeechEngine', () => {
  it('configures and starts recognition, then reports listening', async () => {
    const t = setup();
    await t.engine.start();
    const r = t.rec();
    expect(r).toMatchObject({
      continuous: true,
      interimResults: true,
      lang: 'en-GB',
      maxAlternatives: 1,
      started: true,
    });
    r.fireStart();
    expect(t.statuses).toEqual(['starting', 'listening']);
  });

  it('maps results to events with the engine clock and tracks finals across events', async () => {
    const t = setup();
    await t.engine.start();
    t.rec().result(0, ['for god', false]);
    t.rec().result(0, ['for god so loved', true]);
    t.rec().result(1, ['for god so loved', true], ['the', false]);
    expect(t.results).toEqual([
      { words: ['for', 'god'], isFinal: false, timestamp: 42 },
      { words: ['for', 'god', 'so', 'loved'], isFinal: true, timestamp: 42 },
      { words: ['the'], isFinal: false, timestamp: 42 },
    ]);
  });

  it('auto-restarts on end with backoff, reset by a result; new session restarts result indexing', async () => {
    const t = setup();
    await t.engine.start();
    t.rec().end();
    expect(t.statuses.at(-1)).toBe('restarting');
    expect(t.timers.map((x) => x.ms)).toEqual([250]);
    t.fire();
    t.rec().end();
    expect(t.timers[0]!.ms).toBe(500);
    t.fire();
    t.rec().fireStart();
    t.rec().result(0, ['hello', true]);
    t.rec().end();
    expect(t.timers[0]!.ms).toBe(WEBSPEECH_CONFIG.restartInitialMs);
    t.fire();
    t.rec().result(0, ['again', false]);
    expect(t.results.at(-1)!.words).toEqual(['again']);
    expect(FakeRecognition.instances).toHaveLength(4);
  });

  it('restarts after recoverable errors (no-speech, network)', async () => {
    const t = setup();
    await t.engine.start();
    t.rec().error('no-speech');
    t.rec().end();
    expect(t.timers).toHaveLength(1);
    t.fire();
    t.rec().error('network');
    t.rec().end();
    expect(t.timers).toHaveLength(1);
  });

  it('stops with no-permission on not-allowed and does not loop', async () => {
    const t = setup();
    await t.engine.start();
    const r = t.rec();
    r.error('not-allowed');
    r.end();
    expect(t.statuses.at(-1)).toBe('no-permission');
    expect(t.timers).toHaveLength(0);
    expect(r.aborted).toBe(true);
    expect(t.engine.isRunning).toBe(false);
    // The user can try again.
    await t.engine.start();
    expect(FakeRecognition.instances).toHaveLength(2);
  });

  it('gives up after repeated audio-capture errors', async () => {
    const t = setup();
    await t.engine.start();
    for (let i = 0; i <= WEBSPEECH_CONFIG.audioCaptureMaxRetries; i++) {
      t.rec().error('audio-capture');
      t.rec().end();
      if (t.timers.length) t.fire();
    }
    expect(t.statuses.at(-1)).toBe('error');
    expect(t.timers).toHaveLength(0);
  });

  it('does not restart after the user stops; late events are ignored', async () => {
    const t = setup();
    await t.engine.start();
    const r = t.rec();
    t.engine.stop();
    expect(r.aborted).toBe(true);
    r.end();
    r.result(0, ['ghost', false]);
    expect(t.timers).toHaveLength(0);
    expect(t.results).toHaveLength(0);
    expect(t.statuses.at(-1)).toBe('paused');
  });

  it('stop cancels a pending restart', async () => {
    const t = setup();
    await t.engine.start();
    t.rec().end();
    t.engine.stop();
    expect(t.timers).toHaveLength(0);
  });

  it('treats a throwing start() like an immediate end', async () => {
    const t = setup();
    FakeRecognition.throwOnStart = true;
    await t.engine.start();
    expect(t.timers).toHaveLength(1);
    FakeRecognition.throwOnStart = false;
    t.fire();
    expect(t.rec().started).toBe(true);
  });

  it('starts/stops the meter and forwards levels', async () => {
    const calls: string[] = [];
    const meter: LevelMeter = {
      events: new Emitter<{ level: number }>(),
      start: async () => void calls.push('start'),
      stop: () => void calls.push('stop'),
    };
    const t = setup(meter);
    const levels: number[] = [];
    t.engine.events.on('level', (l) => levels.push(l));
    await t.engine.start();
    meter.events.emit('level', 0.5);
    t.engine.stop();
    expect(calls).toEqual(['start', 'stop']);
    expect(levels).toEqual([0.5, 0]);
  });
});
