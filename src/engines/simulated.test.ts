import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecognitionEvent } from '../core/types';
import { parseTranscript, SimulatedEngine, SIMULATED_CONFIG } from './simulated';

describe('SimulatedEngine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    let t = 0;
    const engine = new SimulatedEngine({ now: () => t });
    const results: RecognitionEvent[] = [];
    const statuses: string[] = [];
    engine.events.on('result', (e) => results.push(e));
    engine.events.on('status', (s) => statuses.push(s.status));
    const advance = (ms: number) => {
      t += ms;
      vi.advanceTimersByTime(ms);
    };
    return { engine, results, statuses, advance };
  };

  it('types words as cumulative interims then a final', async () => {
    const { engine, results, advance } = setup();
    await engine.start();
    engine.typeWords('the lord is');
    advance(SIMULATED_CONFIG.typedWordMs * 3 + SIMULATED_CONFIG.typedFinalMs);
    expect(results.map((r) => [r.words.join(' '), r.isFinal])).toEqual([
      ['the', false],
      ['the lord', false],
      ['the lord is', false],
      ['the lord is', true],
    ]);
    expect(engine.busy).toBe(false);
  });

  it('replays at speed and re-stamps with its own clock', async () => {
    const { engine, results, advance } = setup();
    await engine.start();
    engine.replay(
      [
        { words: ['a'], isFinal: false, timestamp: 5000 },
        { words: ['a', 'b'], isFinal: true, timestamp: 6000 },
      ],
      2,
    );
    advance(0);
    expect(results).toHaveLength(1);
    advance(499);
    expect(results).toHaveLength(1);
    advance(1);
    expect(results[1]).toEqual({ words: ['a', 'b'], isFinal: true, timestamp: 500 });
  });

  it('ignores input while stopped and cancels pending events on stop', async () => {
    const { engine, results, statuses, advance } = setup();
    engine.typeWords('ignored');
    advance(5000);
    expect(results).toHaveLength(0);
    await engine.start();
    engine.typeWords('one two three');
    advance(SIMULATED_CONFIG.typedWordMs);
    engine.stop();
    advance(5000);
    expect(results.length).toBeLessThan(3);
    expect(statuses).toEqual(['listening', 'paused']);
  });
});

describe('parseTranscript', () => {
  it('accepts an array or { events }', () => {
    const ev = { words: ['hi'], isFinal: true, timestamp: 1 };
    expect(parseTranscript(JSON.stringify([ev]))).toEqual([ev]);
    expect(parseTranscript(JSON.stringify({ events: [ev] }))).toEqual([ev]);
  });

  it('rejects malformed events', () => {
    expect(() => parseTranscript('{}')).toThrow();
    expect(() => parseTranscript('[{"words":"hi","isFinal":true,"timestamp":1}]')).toThrow(/0/);
  });
});
