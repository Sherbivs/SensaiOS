'use strict';

/** Xorshift32-based RNG with seed; returns [0,1) floats. */
function makeRNG(seed = 0xDEADBEEF) {
  let x = (seed >>> 0) || 0xDEADBEEF;
  function next() {
    // xorshift32
    x ^= (x << 13) >>> 0;
    x ^= (x >>> 17);
    x ^= (x << 5) >>> 0;
    return ((x >>> 0) / 0x100000000);
  }
  return { next };
}

module.exports = { makeRNG };
