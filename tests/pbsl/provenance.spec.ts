import { describe, expect, it } from "vitest";

import { makeProvenanceRecord } from "../../src/core/pbsl/data/provenance.js";

describe("PBSL Provenance", () => {
  it("normalizes source data", () => {
    const record = makeProvenanceRecord({
      project: " Pokemon Showdown ",
      repository: " https://github.com/smogon/pokemon-showdown ",
      commit: " abc123 ",
      license: "MIT",
    });

    expect(record.project).toBe("Pokemon Showdown");
    expect(record.repository).toBe("https://github.com/smogon/pokemon-showdown");
    expect(record.commit).toBe("abc123");
    expect(record.license).toBe("MIT");
  });

  it("throws when required fields are missing", () => {
    expect(() => makeProvenanceRecord({ project: "", repository: "repo", commit: "sha" })).toThrow();
    expect(() => makeProvenanceRecord({ project: "proj", repository: "", commit: "sha" })).toThrow();
    expect(() => makeProvenanceRecord({ project: "proj", repository: "repo", commit: "" })).toThrow();
  });
});
