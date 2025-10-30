# Meta-router
- Routes by capability and learned priors. Keeps a no-progress counter and hashes changes.
- Recovery playbook: shrink step -> swap strategy -> reset context -> escalate.
- Budgets: default 15 min / 80k tokens; override per task.

## Coverage Map
- `ops/ROUTER.yaml` and `masterroutetable.md` remain the canonical indices—run `npm run docs:update-routers` after adding or moving any `ROUTER.md`.
- Every tracked directory now carries a `ROUTER.md` with key assets and ownership notes (e.g., `.github/`, `.db-state/`, `data/`, `docs/`, `playbooks/`, `prisma/`, `router/`, `secrets/`, `sync-layer/`, `tools/`, and the full `src/**` subdomains).
- Guard scripts (`scripts/guard_router_docs.sh`, `scripts/verify_router_links.sh`) should pass cleanly once new routers land; re-run them whenever the map changes.
- When adding new surfaces, create the `ROUTER.md`, update `ops/ROUTER.yaml` categories, and append a summary entry to `masterroutetable.md`.
