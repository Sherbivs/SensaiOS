import { bench, beforeAll, afterAll, vi } from "vitest";

const RUN_BENCH = process.env.DEX_V2_BENCH === "1";

let v1Runtime: Awaited<ReturnType<typeof loadDexRuntime>> | null = null;
let v2Runtime: Awaited<ReturnType<typeof loadDexRuntime>> | null = null;

async function loadDexRuntime(flag: boolean) {
  process.env.DEX_V2_ENABLED = flag ? "true" : "false";
  vi.resetModules();
  const mod = await import("../src/data/dexpack.js");
  mod.resetDexpack();
  return {
    mod,
    pack: mod.getDexpack(),
  };
}

if (RUN_BENCH) {
  beforeAll(async () => {
    v1Runtime = await loadDexRuntime(false);
    v2Runtime = await loadDexRuntime(true);
  });

  afterAll(() => {
    process.env.DEX_V2_ENABLED = undefined;
    vi.resetModules();
  });

  bench("dex v1 canonical lookup", () => {
    v1Runtime?.mod.getSpecies("garchomp");
  });

  bench("dex v2 canonical lookup", () => {
    v2Runtime?.mod.getSpecies("garchomp");
  });

  bench("dex v1 alias lookup", () => {
    v1Runtime?.mod.getSpecies("mr. mime");
  });

  bench("dex v2 alias lookup", () => {
    v2Runtime?.mod.getSpecies("mr. mime");
  });

  bench("dex v2 base stats", () => {
    const doc = v2Runtime?.mod.getSpecies("charizard");
    if (doc) {
      v2Runtime?.mod.getSpeciesBaseStats(doc.id);
    }
  });
} else {
  bench.skip("dexpack microbench (set DEX_V2_BENCH=1 to enable)", () => {
    // no-op
  });
}
