// Seeded PRNG (mulberry32): the only source of randomness in fixtures (ADR-011). Integers only.

export interface Rng {
  /** Next unsigned 32-bit integer. */
  next: () => number;
  /** Integer in [min, max], inclusive. */
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  /** True with the given probability in whole percent. */
  chance: (percent: number) => boolean;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  const int = (min: number, max: number): number => min + (next() % (max - min + 1));
  const pick = <T>(items: readonly T[]): T => {
    const item = items[int(0, items.length - 1)];
    if (item === undefined) throw new Error('pick from an empty list');
    return item;
  };
  return { next, int, pick, chance: (percent) => int(1, 100) <= percent };
}

/** Item at `i` modulo the list length (round-robin coverage of variants). */
export function cycle<T>(items: readonly T[], i: number): T {
  const item = items[i % items.length];
  if (item === undefined) throw new Error('cycle over an empty list');
  return item;
}
