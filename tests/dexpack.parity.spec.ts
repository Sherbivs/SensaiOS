import { describe, it, expect, vi, afterEach } from "vitest";

const SPECIES_SAMPLES: Array<{ query: string; slug?: string }> = [
  { query: "Bulbasaur" },
  { query: "charizard" },
  { query: "Garchomp" },
  { query: "Snorlax" },
  { query: "Rotom" },
  { query: "pika", slug: "pikachu" },
];

const MOVE_SAMPLES = ["thunderbolt", "Flamethrower", "Earthquake", "Giga Drain"];

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

describe("dexpack parity", () => {
  const originalFlag = process.env.DEX_V2_ENABLED;

  afterEach(() => {
    process.env.DEX_V2_ENABLED = originalFlag;
    vi.resetModules();
  });

  it("returns identical species and stats for v1 and v2", async () => {
    const v1 = await loadDexRuntime(false);
    const v2 = await loadDexRuntime(true);

    expect(v1.pack?.meta?.counts).toEqual(v2.pack?.meta?.counts);

    for (const sample of SPECIES_SAMPLES) {
      const docV1 = v1.mod.getSpecies(sample.query);
      const docV2 = v2.mod.getSpecies(sample.query);

      expect(docV1, `v1 lookup failed for ${sample.query}`).not.toBeNull();
      expect(docV2, `v2 lookup failed for ${sample.query}`).not.toBeNull();

      const slugExpectation = sample.slug ?? docV1?.slug;
      expect(docV1?.slug).toBe(slugExpectation);
      expect(docV2?.slug).toBe(slugExpectation);
      expect(docV1?.id).toBe(docV2?.id);

      const statsV1 = docV1 ? v1.mod.getSpeciesBaseStats(docV1.id) : null;
      const statsV2 = docV2 ? v2.mod.getSpeciesBaseStats(docV2.id) : null;
      expect(statsV2).toEqual(statsV1);

      const matchupsV1 = docV1 ? v1.mod.getSpeciesMatchups(docV1.id) : null;
      const matchupsV2 = docV2 ? v2.mod.getSpeciesMatchups(docV2.id) : null;
      expect(matchupsV2).toEqual(matchupsV1);
    }
  });

  it("returns identical move metadata for v1 and v2 runtime switches", async () => {
    const v1 = await loadDexRuntime(false);
    const v2 = await loadDexRuntime(true);

    for (const move of MOVE_SAMPLES) {
      const docV1 = v1.mod.getMove(move);
      const docV2 = v2.mod.getMove(move);
      expect(docV1, `v1 move lookup failed for ${move}`).not.toBeNull();
      expect(docV2, `v2 move lookup failed for ${move}`).not.toBeNull();
      expect(docV2).toEqual(docV1);
    }
  });

  it("resolves every v1 alias when the v2 runtime is enabled", async () => {
    const v1 = await loadDexRuntime(false);
    const v2 = await loadDexRuntime(true);

    const aliases = Object.entries(v1.pack?.byAlias ?? {});
    expect(aliases.length).toBeGreaterThan(0);

    for (const [alias, expectedId] of aliases) {
      const docV1 = v1.mod.getSpecies(alias);
      expect(docV1, `v1 alias lookup failed for ${alias}`).not.toBeNull();
      expect(docV1?.id).toBe(expectedId);

      const docV2 = v2.mod.getSpecies(alias);
      expect(docV2, `v2 alias lookup failed for ${alias}`).not.toBeNull();
      expect(docV2?.id).toBe(expectedId);
    }
  });
});
