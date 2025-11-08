# ROUTER
Title: Secret Template Store
Purpose: Example environment files and guidance for managing credentials outside the repo.
Owned Globs: secrets/**
Last Updated (UTC): 2025-10-30T16:49:00Z

Notes:
- Files here are examples only; copy them to a secure location (`secrets/Infinity-Gauntlet.env`) and point `IG_ENV_FILE` at the secret store.
- Database credentials must never be committed—use these samples to understand required keys for the 2-node PostgreSQL cluster.

Key Files:
- README.md - Instructions for setting up local secret mirrors and environment overrides.
- env.template - Template for 2-node cluster database URLs (DEV_DATABASE_URL, PROD_DATABASE_URL, RENDER_DB_EXTERNAL_URL, DATABASE_LOCAL_URL).
- prisma-dev.env.example - Template for direct PostgreSQL URLs.
