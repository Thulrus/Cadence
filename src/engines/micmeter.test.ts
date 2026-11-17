import { describe, expect, it } from 'vitest';
import { levelFromSamples, MIC_METER_CONFIG, MicMeter, smoothLevel } from './micmeter';

describe('mic level', () => {
  it('maps RMS on a dB scale, clamped to 0..1', () => {
    expect(levelFromSamples([])).toBe(0);
    expect(levelFromSamples([0, 0, 0])).toBe(0);
    expect(levelFromSamples([1, -1, 1, -1])).toBe(1);
    const floor = 10 ** (MIC_METER_CONFIG.floorDb / 20);
    const ceil = 10 ** (MIC_METER_CONFIG.ceilDb / 20);
    expect(levelFromSamples([floor, -floor])).toBeCloseTo(0);
    expect(levelFromSamples([ceil, -ceil])).toBeCloseTo(1);
    const mid = 10 ** ((MIC_METER_CONFIG.floorDb + MIC_METER_CONFIG.ceilDb) / 40);
    expect(levelFromSamples([mid, -mid])).toBeCloseTo(0.5);
  });

  it('rises instantly and decays smoothly', () => {
    expect(smoothLevel(0.2, 0.8)).toBe(0.8);
    expect(smoothLevel(1, 0, 0.5)).toBe(0.5);
  });

  it('fails soft when getUserMedia rejects', async () => {
    const errors: unknown[] = [];
    let closed = false;
    const meter = new MicMeter({
      createContext: () =>
        ({ close: async () => void (closed = true), state: 'running' }) as unknown as AudioContext,
      getUserMedia: () => Promise.reject(new Error('busy')),
      onFail: (e) => errors.push(e),
    });
    await meter.start();
    expect(errors).toHaveLength(1);
    expect(closed).toBe(true);
  });
});
