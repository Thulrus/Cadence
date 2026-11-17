/** Small seeded PRNG (mulberry32) so simulated speech and noise are reproducible. */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0 || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    chance: (p) => p > 0 && next() < p,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (n) => Math.floor(next() * n),
    pick: (items) => items[Math.floor(next() * items.length)]!,
  };
  return rng;
}
