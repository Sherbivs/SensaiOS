# ROUTER
Title: CI Guard Tools
Purpose: TypeScript guards for CI validation, meta checks, and code quality enforcement.
Owned Globs: scripts/guard/**
Last Updated (UTC): 2026-02-10T16:40:00Z



## Overview

The guard domain provides CI-compatible validation tools that check project integrity, meta files, routing documents, and code quality. All guards return proper exit codes for CI integration.

## Files

| File | Purpose | Lines | Commands |
|------|---------|-------|----------|
| `cli.ts` | Guard CLI entry point | ~430 | all, meta, routing, secrets, schema, size |
| `ROUTER.md` | This documentation | ~120 | — |

## Commands

### `all` — Run All Guards
Executes all guard categories in sequence.

```bash
npx tsx scripts/guard/cli.ts all
npx tsx scripts/guard/cli.ts all --strict  # Exit on first failure
```

**Guard Categories:**
- Meta (NEXT.yaml, Prompt.md, Patch.md, Tasklist.md)
- Routing (ROUTER.md files)
- Package (package.json validation)
- Prisma (schema.prisma validation)
- Secrets (credential leak detection)
- Large Files (>500KB detection)

### `meta` — Meta File Guards
Validates critical project management files.

```bash
npx tsx scripts/guard/cli.ts meta
```

**Checks:**
- `ops/NEXT.yaml` — Task pointer present
- `Prompt.md` — Timestamp present
- `Patch.md` — Absolutes section present
- `Tasklist.md` — Task entries present

### `routing` — Router Validation
Ensures all required ROUTER.md files exist.

```bash
npx tsx scripts/guard/cli.ts routing
```

**Required Routers:**
- `src/ROUTER.md`
- `scripts/ROUTER.md`
- `docs/ROUTER.md`
- `ops/ROUTER.md`
- `tests/ROUTER.md`

### `secrets` — Secret Leak Detection
Scans source files for potential credential leaks.

```bash
npx tsx scripts/guard/cli.ts secrets
```

**Detected Patterns:**
- API keys (api_key, api-key)
- Passwords in strings
- Private keys (RSA, EC)
- GitHub PATs (ghp_*)
- OpenAI keys (sk-*)
- Render keys (rnd_*)

### `schema` — Schema Validation
Validates Prisma schema and package.json.

```bash
npx tsx scripts/guard/cli.ts schema
```

**Checks:**
- `prisma/schema.prisma` exists
- Generator and datasource configured
- Models defined
- `package.json` valid with name and version

### `size` — Large File Detection
Finds files exceeding size threshold.

```bash
npx tsx scripts/guard/cli.ts size
```

**Configuration:**
- Threshold: 500KB
- Scans: src/, scripts/, docs/
- Excludes: node_modules, .git, dist, assets

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All guards passed |
| 1 | One or more guards failed |

## CI Integration

```yaml
# GitHub Actions example
- name: Run Guards
  run: npx tsx scripts/guard/cli.ts all

# Strict mode (fail fast)
- name: Run Guards (Strict)
  run: npx tsx scripts/guard/cli.ts all --strict
```

## Migration Mapping

| Legacy Script | New Command |
|--------------|-------------|
| `guard_meta.sh` | `npx tsx scripts/guard/cli.ts meta` |
| `guard_routing.sh` | `npx tsx scripts/guard/cli.ts routing` |
| `guard_router_docs.sh` | `npx tsx scripts/guard/cli.ts routing` |
| `guard_doc_names.sh` | `npx tsx scripts/guard/cli.ts all` |

## Output Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 CI Guards
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[=========] 6/6

✓ NEXT.yaml: Task pointer configured
✓ Prompt.md: Contains timestamp
✓ Patch.md: Contains Absolutes section
✓ Tasklist.md: Contains task entries
✓ ROUTER.md files: All required routers present
✓ package.json: Valid (infinity-gauntlet@1.0.0)
✓ Prisma Schema: Valid schema with models
✓ Secret Scanning: No secrets detected
✓ Large Files: No files > 500KB

Passed:       9
Failed:       0

✔ All guards passed
```

## Dependencies

- **lib/cli.ts** — CLI framework
- **lib/output.ts** — Formatting utilities
- **lib/fs.ts** — File system operations
- **lib/progress.ts** — Progress bars

## Related Documentation

- [Patch.md](../../Patch.md) — Absolutes and contract rules
- [ops/NEXT.yaml](../../ops/NEXT.yaml) — Task pointer
- [scripts/lib/ROUTER.md](../lib/ROUTER.md) — Foundation library
