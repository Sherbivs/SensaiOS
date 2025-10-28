# Pokémon Buddy System Logics (PBSL)

## Official Statement

Pokémon Buddy System Logics (PBSL) is an open, testable, and source-attributed framework for deterministic buddy, encounter, and battle mechanics tailored to Discord-first experiences. PBSL aligns with the public manifesto shared in the project briefing and binds this repository to the following pillars:

- **Determinism & Auditability** — Every calculation is reproducible given an explicit seed, and each decision emits structured audit events with provenance metadata.
- **Truth Hierarchy** — Upstream sources are cited in priority order: executable engines (Pokémon Showdown, `pkmn/engine`), game decomp/data projects (`pret`, `veekun`), then encyclopedic summaries (Bulbapedia, Smogon, Serebii).
- **Adaptable Interfaces** — Core mechanics ship as thin TypeScript adapters that integrate with Discord bots, workers, or web front-ends without bundling proprietary assets.
- **Continuous Validation** — CI runs reproducibility tests and (future) oracle comparisons against upstream simulators/decompilations.
- **Provenance First** — Formulas and datasets store their upstream repository, commit SHA, and license in metadata that downstream consumers can inspect.

PBSL is community-driven and unaffiliated with Nintendo, Game Freak, Creatures Inc., or The Pokémon Company. “Pokémon” and related marks belong to their respective owners. We respect upstream licenses, paraphrase reference logic, and attach citations for every imported behavior.

## Module Layout

The initial scaffolding added in this patch establishes the following modules under `src/core/pbsl/`:

| Module | Purpose |
| --- | --- |
| `rng.ts` | Seeded Mulberry32 RNG factory with state snapshots and divergence detection |
| `audit.ts` | Audit trail contracts and in-memory implementation with provenance awareness |
| `phases.ts` | Canonical battle phase ordering with validation helpers |
| `battle/engine.ts` | Deterministic turn runner that consumes scripted actions and emits audit events |
| `encounter/generator.ts` | Encounter helper that yields deterministic buddy encounters from seeded RNG |
| `data/provenance.ts` | Shared provenance descriptors for upstream source metadata |

A barrel file `index.ts` re-exports the primitives so downstream adapters can import from `src/core/pbsl` without deep relative paths.

## Oracle Fixtures & Reports

The oracle diff suite lives under `tests/pbsl/oracle.spec.ts` and consumes curated fixtures in `tests/pbsl/fixtures/`. Each fixture stores the upstream provenance (repository, commit, license), scripted battle inputs, and a sanitized snapshot of the expected turn results. When Vitest runs the oracle suite it emits `pbsl-oracle-report.json` at the repository root so CI can publish the comparison data when a scenario fails.

## Compliance Checklist

The table below tracks PBSL requirements and their current status within this repository.

| Requirement | Status | Notes |
| --- | --- | --- |
| Deterministic RNG with seeds | ✅ Implemented via `createSeededRng` and covered by unit tests |
| Battle phase ordering & orchestration | ✅ Skeleton `BattleEngine` enforces turn ordering and audits every step |
| Encounter generator | ✅ `generateEncounter` returns deterministic outcomes with provenance |
| Audit trail storage | ✅ `MemoryAuditTrail` collects structured events and exposes immutable snapshots |
| Provenance metadata | ✅ `makeProvenanceRecord` validates repository/project metadata |
| Oracle comparison CI | ✅ Oracle fixtures validate battle snapshots via `tests/pbsl/oracle.spec.ts` and the `pbsl-oracle` workflow |
| Upstream citations ledger | 🔄 Planned — will extend provenance records with auto-generated NOTICE entries |
| Adapter integration | 🔄 Planned — future work will wire PBSL modules into Discord flows |

## Governance & Contributions

- Proposed gameplay changes must document **why** a new source is required, **how** automated tests consume it, and **which** checklist items move.
- New mechanics require corresponding Vitest fixtures and, where feasible, oracle comparisons against upstream simulators.
- Provenance metadata must include repository URL, commit SHA, and short license notice. Use `makeProvenanceRecord` to enforce the schema.
- Update this file and `Prompt.md`’s Last Repo Changes whenever PBSL scope expands or checklist status changes.

## Next Steps

1. Wire PBSL RNG and audit helpers into the legacy battle/daily flows to ensure consistent telemetry across bots.
2. Extend provenance metadata to feed into the existing ops dashboards so humans can audit upstream sources in production.
3. Document adapter patterns for Discord slash commands, cron workers, and web dashboards referencing PBSL.
4. Grow the oracle fixture catalog beyond single-turn cases (status conditions, multi-target moves) while keeping runtimes lean.
