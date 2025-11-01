# ROUTER
Title: Prisma Data Models
Purpose: TypeScript wrappers around Prisma client entities.
Owned Globs: src/models/**
Last Updated (UTC): 2025-11-02T00:10:00Z

Notes:
- Centralizes Prisma imports and exposes typed helpers for the rest of the TypeScript runtime.
- Update alongside schema/migration changes so downstream code compiles.
- `DMHomeRepo` assembles trainer party, storage, and cooldown snapshots for DM Home views via Prisma joins.

Key Files:
- index.ts - Re-exports Prisma client, typed accessors, and shared model helpers.
