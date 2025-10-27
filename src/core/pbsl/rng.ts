// Deterministic RNG helpers for PBSL; uses Mulberry32 for fast, reproducible numbers.
export type RngState = {
  seed: number;
  counter: number;
};

export type Rng = {
  readonly seed: number;
  readonly counter: number;
  next(): number;
  nextFloat(): number;
  pick<T>(items: readonly T[]): T;
  snapshot(): RngState;
};

const UINT32_MAX = 0xffffffff;

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function normalizeSeed(seed: number | string): number {
  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) {
      throw new Error("Seed must be a finite number");
    }
    return (seed >>> 0) || 1;
  }
  const hash = xmur3(seed)();
  return hash || 1;
}

function mulberry32(base: number, counter: number): () => number {
  let a = (base + counter) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / (UINT32_MAX + 1);
  };
}

function assertItems<T>(items: readonly T[]): asserts items is readonly T[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Cannot pick from an empty list");
  }
}

export function createSeededRng(seed: number | string, counter = 0): Rng {
  const normalizedSeed = normalizeSeed(seed);
  let currentCounter = counter >>> 0;

  const generator = () => {
    const nextFloat = mulberry32(normalizedSeed, currentCounter)();
    currentCounter = (currentCounter + 1) >>> 0;
    return nextFloat;
  };

  const rng: Rng = {
    get seed() {
      return normalizedSeed;
    },
    get counter() {
      return currentCounter;
    },
    next() {
      return Math.floor(generator() * (UINT32_MAX + 1));
    },
    nextFloat() {
      return generator();
    },
    pick<T>(items: readonly T[]): T {
      assertItems(items);
      const index = Math.floor(generator() * items.length) % items.length;
      return items[index];
    },
    snapshot(): RngState {
      return { seed: normalizedSeed, counter: currentCounter };
    },
  };

  return rng;
}

export function deserializeRngState(state: RngState): Rng {
  if (!state || typeof state.seed !== "number" || typeof state.counter !== "number") {
    throw new Error("Invalid RNG state payload");
  }
  return createSeededRng(state.seed, state.counter);
}
