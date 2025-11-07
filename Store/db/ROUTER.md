# ROUTER
Title: Local Postgres Fallback Artifacts
Purpose: Hosts the local Postgres cluster, snapshots, metadata, and connection string produced by the offline fallback bootstrapper.
Owned Globs: Store/db/**
Last Updated (UTC): 2025-11-06T04:45:00Z

Notes:
- Managed primarily by `npm run ops:auto-bootstrap-local-db`; the wrapper installs Postgres tooling when missing, initializes the cluster, refreshes it from the DEV datasource, and writes `local-url.txt` for Prisma's local fallback candidate. Use `npm run ops:bootstrap-local-db` when tooling is already present.
- Everything under this directory remains git-ignored other than doc stubs so secrets and binary data never land in the repository.
- When regenerating the mirror, verify disk usage before retaining more than the default snapshot retention to avoid exhausting the Store mount.
