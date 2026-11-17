/**
 * Mic level meter: a separate `getUserMedia` stream → `AnalyserNode` → `level` events (0..1)
 * at ~20 Hz. Optional and fail-soft: some Android devices refuse a second capture stream (or
 * degrade recognition) while Web Speech holds the mic, so any failure just means no meter.
 *
 * `levelFromSamples` (pure) maps RMS of a time-domain frame to 0..1 on a dB scale.
 */
import { Emitter } from '../core/emitter';

export const MIC_METER_CONFIG = {
  intervalMs: 50,
  fftSize: 1024,
  /** dB (re full scale) shown as 0 / 1. */
  floorDb: -60,
  ceilDb: -10,
  /** Exponential smoothing for falling levels (rises are immediate). 0 = none. */
  decay: 0.7,
} as const;

/** RMS of samples in -1..1 → 0..1 on a dB scale between `floorDb` and `ceilDb`. */
export function levelFromSamples(samples: ArrayLike<number>, cfg = MIC_METER_CONFIG): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  const rms = Math.sqrt(sum / samples.length);
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  return Math.min(1, Math.max(0, (db - cfg.floorDb) / (cfg.ceilDb - cfg.floorDb)));
}

/** Smooth a new level against the previous one: rise instantly, fall with `decay`. */
export function smoothLevel(
  prev: number,
  next: number,
  decay: number = MIC_METER_CONFIG.decay,
): number {
  return next >= prev ? next : prev * decay + next * (1 - decay);
}

export interface LevelMeter {
  readonly events: Emitter<{ level: number }>;
  start(): Promise<void>;
  stop(): void;
}

export interface MicMeterDeps {
  getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
  createContext?: () => AudioContext;
  onFail?: (err: unknown) => void;
}

export class MicMeter implements LevelMeter {
  readonly events = new Emitter<{ level: number }>();
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private interval: ReturnType<typeof setInterval> | undefined;
  private level = 0;
  private gen = 0;

  constructor(private readonly deps: MicMeterDeps = {}) {}

  async start(): Promise<void> {
    this.stop();
    const gen = ++this.gen;
    try {
      // Create the context synchronously, inside the user gesture, so it may start running.
      const ctx = (this.deps.createContext ?? (() => new AudioContext()))();
      this.ctx = ctx;
      const gum = this.deps.getUserMedia ?? ((c) => navigator.mediaDevices.getUserMedia(c));
      const stream = await gum({ audio: true });
      if (gen !== this.gen) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      this.stream = stream;
      if (ctx.state === 'suspended') await ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = MIC_METER_CONFIG.fftSize;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      this.interval = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        this.level = smoothLevel(this.level, levelFromSamples(buf));
        this.events.emit('level', this.level);
      }, MIC_METER_CONFIG.intervalMs);
    } catch (err) {
      this.stop();
      this.deps.onFail?.(err);
    }
  }

  stop(): void {
    this.gen++;
    clearInterval(this.interval);
    this.interval = undefined;
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.level = 0;
  }
}
