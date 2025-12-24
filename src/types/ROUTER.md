# ROUTER
Title: Ambient Type Declarations
Purpose: Type definitions that augment external modules used by the runtime.
Owned Globs: src/types/**
Last Updated (UTC): 2025-12-24T09:30:00Z

Notes:
- Houses `.d.ts` files needed until upstream packages ship proper typings.
- Previously contained Prisma Accelerate typings (removed 2025-11-07 with Accelerate removal).

Key Files:
- None currently (all legacy JS declaration files removed)

## ⚠️ ARCHIVED (2025-12-24 — Dead Code Cleanup Meeting #6)

- ~~**js-module-declarations.d.ts** (80 lines)~~ — Legacy declaration file for JavaScript modules that are now TypeScript (`cache.ts`, `main.ts`, `command-loader.ts`). Zero code imports, only referenced in historical documentation.
