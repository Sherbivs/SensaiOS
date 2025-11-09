# ROUTER
Title: Secret Template Store
Purpose: Example environment files and guidance for managing credentials outside the repo.
Owned Globs: secrets/**
Last Updated (UTC): 2025-10-30T16:49:00Z

Notes:
- Files here are examples only; copy them to a secure location (`secrets/Infinity-Gauntlet.env`) and point `IG_ENV_FILE` at the secret store.
- Database credentials must never be committed—use these samples to understand required keys for the unified PostgreSQL architecture.

Key Files:
- README.md - Instructions for setting up local secret mirrors and environment overrides.
- env.template - Template for unified architecture database URLs (PROD_DATABASE_URL, RENDER_DB_EXTERNAL_URL, DATABASE_ONPREMISE_DEV_PRIMARY).
- prisma-dev.env.example - Template for direct PostgreSQL URLs.
