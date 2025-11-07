# ROUTER
Title: Secret Template Store
Purpose: Example environment files and guidance for managing credentials outside the repo.
Owned Globs: secrets/**
Last Updated (UTC): 2025-10-30T16:49:00Z

Notes:
- Files here are examples only; copy them to a secure location (`Key/Dev/.env` or `Key/Prod/.env`) and point `IG_ENV_FILE` at the secret store.
- Accelerate and local Prisma credentials must never be committed—use these samples to understand required keys and regenerate Prisma when swapping back from Prod.

Key Files:
- README.md - Instructions for setting up local secret mirrors and environment overrides.
- prisma-accelerate.env.example - Template for Accelerate DATABASE_URL and retry envs.
- prisma-dev.env.example - Template for local/staging Prisma direct URLs.
