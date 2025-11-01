import { createHash } from "node:crypto";

import { describe, it, expect } from "vitest";

import { buildData } from "../src/data_pipeline/index.js";

function hashAll(contents: string[]): string {
  const h = createHash("sha256");
  for (const c of contents) h.update(c);
  return h.digest("hex");
}

describe("data pipeline build", () => {
  it("produces deterministic outputs (dry-run)", async () => {
    const a = await buildData({ dryRun: true, rootDir: process.cwd() });
    const b = await buildData({ dryRun: true, rootDir: process.cwd() });
    expect(a.counts.species).toBeGreaterThan(0);
    expect(a.counts.moves).toBeGreaterThan(0);
    expect(a.counts.abilities).toBeGreaterThan(0);
    expect(a.counts).toEqual(b.counts);

    // deterministic hashes in aggregate
    const aggA = hashAll(a.outputs.map((o) => o.hash));
    const aggB = hashAll(b.outputs.map((o) => o.hash));
    expect(aggA).toEqual(aggB);

    // manifest present and consistent
    const manA = a.outputs.find((o) => o.path.endsWith("manifest.json"));
    const manB = b.outputs.find((o) => o.path.endsWith("manifest.json"));
    expect(manA?.hash).toEqual(manB?.hash);
  });
});
