/**
 * Audio helpers for the on-device engine. Pure (no Web Audio here), so they are unit-tested.
 *
 * The mic runs at the device rate (usually 48 kHz). The recognizer works at 16 kHz, so frames
 * are downsampled before they're posted to the recognizer worker: a third of the data to copy,
 * and less resampling work inside Kaldi. We don't ask the AudioContext for 16 kHz because
 * Firefox refuses to connect a mic stream to a context at a different rate.
 */

export const OFFLINE_AUDIO = {
  /** Recognizer input rate (the Vosk small English model is trained at 16 kHz). */
  targetRate: 16000,
  /** Capture batch length: frames are posted from the audio thread this often. */
  batchMs: 50,
} as const;

/**
 * Streaming box-filter decimator from `inRate` to `outRate` (`inRate >= outRate`). Each
 * output sample is the mean of the input samples in its window, which is also a crude
 * anti-aliasing low-pass, adequate for speech recognition. Fractional ratios (44.1 → 16 kHz)
 * keep their phase across calls, so the output rate is exact over time.
 */
export class Downsampler {
  readonly ratio: number;
  private acc = 0;
  private n = 0;
  private phase = 0;

  constructor(
    readonly inRate: number,
    readonly outRate: number,
  ) {
    if (!(inRate > 0 && outRate > 0)) throw new Error('Sample rates must be positive');
    if (inRate < outRate) throw new Error('Downsampler cannot upsample');
    this.ratio = inRate / outRate;
  }

  /** Downsample one chunk. Returns a new array (possibly empty). */
  push(input: ArrayLike<number>): Float32Array {
    if (this.ratio === 1) return Float32Array.from(input);
    const out = new Float32Array(Math.ceil((input.length + this.phase + 1) / this.ratio));
    let k = 0;
    for (let i = 0; i < input.length; i++) {
      this.acc += input[i]!;
      this.n++;
      this.phase += 1;
      if (this.phase >= this.ratio) {
        out[k++] = this.acc / this.n;
        this.acc = 0;
        this.n = 0;
        this.phase -= this.ratio;
      }
    }
    return out.subarray(0, k);
  }

  /** Forget any partial window (e.g. after a pause). */
  reset(): void {
    this.acc = 0;
    this.n = 0;
    this.phase = 0;
  }
}

/** Recognizer input rate for a given mic rate: downsample to the target, never upsample. */
export function recognizerRate(micRate: number, target: number = OFFLINE_AUDIO.targetRate): number {
  return Math.min(micRate, target);
}

/** Frames per capture batch at a given rate (at least one 128-frame render quantum). */
export function batchFrames(rate: number, batchMs: number = OFFLINE_AUDIO.batchMs): number {
  const RENDER_QUANTUM = 128;
  return Math.max(RENDER_QUANTUM, Math.round((rate * batchMs) / 1000));
}
