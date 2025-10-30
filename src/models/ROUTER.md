# ROUTER
Title: Prisma Data Models
Purpose: TypeScript wrappers around Prisma client entities.
Owned Globs: src/models/**
Last Updated (UTC): 2025-10-30T00:47:00Z

Notes:
- Centralizes Prisma imports and exposes typed helpers for the rest of the TypeScript runtime.
- Update alongside schema/migration changes so downstream code compiles.

Key Files:
- index.ts - Re-exports Prisma client, typed accessors, and shared model helpers.
