export type ProvenanceSource = {
  project: string;
  repository: string;
  commit: string;
  license?: string;
  notes?: string;
};

export type ProvenanceRecord = {
  readonly project: string;
  readonly repository: string;
  readonly commit: string;
  readonly license?: string;
  readonly notes?: string;
};

function assertNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Provenance ${field} must be a non-empty string`);
  }
}

export function makeProvenanceRecord(source: ProvenanceSource): ProvenanceRecord {
  assertNonEmpty(source.project, "project");
  assertNonEmpty(source.repository, "repository");
  assertNonEmpty(source.commit, "commit");

  return Object.freeze({
    project: source.project.trim(),
    repository: source.repository.trim(),
    commit: source.commit.trim(),
    license: source.license?.trim(),
    notes: source.notes?.trim(),
  });
}
