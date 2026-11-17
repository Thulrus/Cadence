import { describe, expect, it } from 'vitest';
import { batchFrames, Downsampler, recognizerRate } from './audio';

describe('Downsampler', () => {
  it('48 → 16 kHz averages each group of three', () => {
    const d = new Downsampler(48000, 16000);
    expect([...d.push([3, 3, 3, 6, 6, 6, 0, 0, 3])]).toEqual([3, 6, 1]);
  });

  it('keeps its phase across chunks of any size', () => {
    const input = Array.from({ length: 4800 }, (_, i) => Math.sin(i / 7));
    const whole = new Downsampler(48000, 16000).push(input);
    const d = new Downsampler(48000, 16000);
    const parts: number[] = [];
    for (let i = 0; i < input.length; i += 128) parts.push(...d.push(input.slice(i, i + 128)));
    expect(parts.length).toBe(whole.length);
    parts.forEach((v, i) => expect(v).toBeCloseTo(whole[i]!, 12));
  });

  it('fractional ratios (44.1 kHz) produce the exact rate over time', () => {
    const d = new Downsampler(44100, 16000);
    let n = 0;
    for (let s = 0; s < 10; s++) n += d.push(new Float32Array(44100)).length; // 10 s
    expect(Math.abs(n - 160000)).toBeLessThanOrEqual(1);
  });

  it('removes energy above the new Nyquist (crude low-pass)', () => {
    // 24 kHz tone at 48 kHz (alternating ±1) averages to near zero.
    const tone = Array.from({ length: 4800 }, (_, i) => (i % 2 ? 1 : -1));
    const out = new Downsampler(48000, 16000).push(tone);
    const rms = Math.sqrt(out.reduce((a, v) => a + v * v, 0) / out.length);
    expect(rms).toBeLessThan(0.4);
  });

  it('same rate passes through; upsampling is refused', () => {
    expect([...new Downsampler(16000, 16000).push([0.5, -0.5])]).toEqual([0.5, -0.5]);
    expect(() => new Downsampler(8000, 16000)).toThrow();
  });

  it('reset drops a partial window', () => {
    const d = new Downsampler(48000, 16000);
    d.push([9, 9]);
    d.reset();
    expect([...d.push([1, 1, 1])]).toEqual([1]);
  });
});

describe('rates and batches', () => {
  it('recognizer runs at 16 kHz, or the mic rate if lower', () => {
    expect(recognizerRate(48000)).toBe(16000);
    expect(recognizerRate(8000)).toBe(8000);
  });

  it('batch is the configured duration, at least one render quantum', () => {
    expect(batchFrames(48000, 50)).toBe(2400);
    expect(batchFrames(8000, 1)).toBe(128);
  });
});
