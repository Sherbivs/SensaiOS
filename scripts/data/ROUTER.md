# ROUTER
Title: Data Pipeline CLI
Purpose: TypeScript CLI for Pokemon data management, dexpack building, cache operations, and validation.
Owned Globs: scripts/data/**
Last Updated (UTC): 2026-02-10T16:40:00Z



## Overview

The data domain provides a unified CLI for managing Pokemon reference data, building optimized dexpack assets, and managing the data cache. It integrates with the existing data pipeline scripts.

## Files

| File | Purpose | Lines | Commands |
|------|---------|-------|----------|
| `cli.ts` | Data CLI entry point | ~450 | dexpack, cache, fetch, validate, stats, build |
| `ROUTER.md` | This documentation | ~140 | — |

## Commands

### `dexpack` — Build Dexpack Assets
Builds optimized Pokemon reference data packs.

```bash
npx tsx scripts/data/cli.ts dexpack
npx tsx scripts/data/cli.ts dexpack v1           # Build v1 only
npx tsx scripts/data/cli.ts dexpack v2           # Build v2 only
npx tsx scripts/data/cli.ts dexpack all          # Build both
npx tsx scripts/data/cli.ts dexpack --force      # Force rebuild
npx tsx scripts/data/cli.ts dexpack --validate   # Validate after build
```

**Output Files:**
- `assets/dexpack.v1.json` — Version 1 format
- `assets/dexpack.v2.json` — Version 2 format

### `cache` — Cache Management
Manages data and runtime caches.

```bash
npx tsx scripts/data/cli.ts cache status
npx tsx scripts/data/cli.ts cache clear
npx tsx scripts/data/cli.ts cache clear pokemon    # Clear specific namespace
npx tsx scripts/data/cli.ts cache warm
```

**Cache Locations:**
- `data/cache/` — Data pipeline cache
- `Store/runtime-cache/` — Runtime cache (per namespace)

### `fetch` — Fetch Pokemon Data
Downloads Pokemon data from external sources.

```bash
npx tsx scripts/data/cli.ts fetch pokemon
npx tsx scripts/data/cli.ts fetch moves
npx tsx scripts/data/cli.ts fetch abilities
npx tsx scripts/data/cli.ts fetch all
npx tsx scripts/data/cli.ts fetch pokemon --limit 151    # First gen only
npx tsx scripts/data/cli.ts fetch pokemon --force        # Force refetch
```

### `validate` — Validate Data Files
Validates all data files for integrity.

```bash
npx tsx scripts/data/cli.ts validate
npx tsx scripts/data/cli.ts validate --strict     # Fail on warnings
npx tsx scripts/data/cli.ts validate --fix        # Auto-fix issues
```

**Checks:**
- Required files exist (pokemon.json, effects.json, dexpack.*.json)
- JSON validity
- Minimum record counts
- Data consistency

### `stats` — Show Statistics
Displays data statistics.

```bash
npx tsx scripts/data/cli.ts stats
```

**Output includes:**
- Pokemon data record count and size
- Dexpack v1/v2 statistics
- Cache namespace sizes

### `build` — Full Pipeline
Runs the complete data pipeline.

```bash
npx tsx scripts/data/cli.ts build
npx tsx scripts/data/cli.ts build --skip-fetch     # Skip external fetch
npx tsx scripts/data/cli.ts build --skip-dexpack   # Skip dexpack build
```

**Pipeline Steps:**
1. Fetch fresh data from sources
2. Build dexpack v1 and v2
3. Validate all outputs

## Data Files

| File | Purpose | Format |
|------|---------|--------|
| `data/pokemon.json` | Raw Pokemon data | JSON array |
| `data/effects.json` | Status effects | JSON object |
| `assets/dexpack.v1.json` | Optimized data v1 | JSON bundle |
| `assets/dexpack.v2.json` | Optimized data v2 | JSON bundle |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Validation failed or operation error |

## Migration Mapping

| Legacy Script | New Command |
|--------------|-------------|
| `build-dexpack.ts` | `npx tsx scripts/data/cli.ts dexpack` |
| `build-data.ts` | `npx tsx scripts/data/cli.ts build` |
| `fetch_pokemon.mjs` | `npx tsx scripts/data/cli.ts fetch all` |
| Manual validation | `npx tsx scripts/data/cli.ts validate` |

## Dexpack Structure

```typescript
interface Dexpack {
  version: string;
  pokemon: Pokemon[];
  moves: Move[];
  abilities: Ability[];
  types: Type[];
  typeChart: TypeChart;
}
```

## Dependencies

- **lib/cli.ts** — CLI framework
- **lib/output.ts** — Formatting utilities
- **lib/exec.ts** — Command execution
- **lib/fs.ts** — File system operations
- **scripts/build-dexpack.ts** — Dexpack builder
- **scripts/fetch_pokemon.mjs** — Data fetcher

## Related Files

- [data/README.md](../../data/README.md) — Data directory documentation
- [assets/dexpack.gen.mjs](../../assets/dexpack.gen.mjs) — Dexpack loader
- [scripts/lib/ROUTER.md](../lib/ROUTER.md) — Foundation library
