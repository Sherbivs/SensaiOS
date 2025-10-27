import { describe, expect, it } from "vitest";
import { createSeededRng, deserializeRngState } from "../../src/core/pbsl/rng.js";

describe("PBSL RNG", () => {
  it("produces deterministic sequences per seed", () => {
    const rngA = createSeededRng("encounter-seed");
    const rngB = createSeededRng("encounter-seed");

    const sequenceA = [rngA.nextFloat(), rngA.nextFloat(), rngA.nextFloat()];
    const sequenceB = [rngB.nextFloat(), rngB.nextFloat(), rngB.nextFloat()];

    expect(sequenceA).toStrictEqual(sequenceB);
  });

  it("diverges when seeds differ", () => {
    const rngA = createSeededRng("seed-a");
    const rngB = createSeededRng("seed-b");
    expect(rngA.nextFloat()).not.toBe(rngB.nextFloat());
  });

  it("restores state via serialization", () => {
    const rng = createSeededRng(1234);
    const history = [rng.nextFloat(), rng.nextFloat()];
    const snapshot = rng.snapshot();

    const restored = deserializeRngState(snapshot);
    expect(restored.seed).toBe(rng.seed);
    expect(restored.counter).toBeGreaterThan(history.length - 1);
    expect(restored.nextFloat()).toBeCloseTo(rng.nextFloat());
  });
});
