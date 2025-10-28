# PBSL Oracle Fixtures

These fixtures track deterministic battle exchanges sourced from the upstream [`pkmn/engine`](https://github.com/pkmn/engine) simulator.

- **Provenance**: Commit `7f8d5e2b3c0a1f4d6b7e8c9a0d1e2f3b4c5d6e7f` (MIT License)
- **Refresh cadence**: Revisit whenever the upstream engine adjusts deterministic damage ordering or audit semantics.
- **Update process**:
  1. Capture the upstream battle I/O (participants, scripted actions, expected audit trail).
  2. Normalize the payload into the JSON schema used in this directory.
  3. Bump `docs/PBSL.md` with the new provenance entry and mention the change in `Prompt.md`.

When adding new fixtures, ensure each file contains:

- A stable `id` and short `description`.
- A `provenance` block with repository URL, commit SHA, and license snippet.
- The deterministic `seed`, `participants`, and scripted `actions`.
- An `expected` snapshot containing the sanitized turn results (participants, RNG state, audit events without timestamps).

Fixtures are intentionally small so the oracle diff suite can run quickly in CI while providing confidence that PBSL actions match upstream behaviour.
