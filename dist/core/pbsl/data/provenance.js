function assertNonEmpty(value, field) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`Provenance ${field} must be a non-empty string`);
    }
}
export function makeProvenanceRecord(source) {
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
