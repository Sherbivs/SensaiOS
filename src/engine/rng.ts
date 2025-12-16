/**
 * Xorshift32-based RNG with seed; returns [0,1) floats.
 * Deterministic for reproducible battles.
 */

export interface RNG {
  next: () => number;
}

function makeRNG(seed: number = 0xDEADBEEF): RNG {
  let x = (seed >>> 0) || 0xDEADBEEF;
  function next(): number {
    // xorshift32
    x ^= (x << 13) >>> 0;
    x ^= (x >>> 17);
    x ^= (x << 5) >>> 0;
    return ((x >>> 0) / 0x100000000);
  }
  return { next };
}

export { makeRNG };
export default { makeRNG };
