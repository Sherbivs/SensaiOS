# ROUTER
Title: SensaiOS Module Loader
Purpose: ESM loader hooks for ring security enforcement at Node.js module loading level
Owned Globs: src/sensaios/loader/**
Last Updated (UTC): 2026-01-04T00:00:00Z

## Overview

The module loader provides the deepest enforcement layer for SensaiOS ring security.
By intercepting imports at the Node.js ESM loader level, it catches ring violations
BEFORE any code can execute.

## Architecture

```
Import Request → resolve() hook → checkVisibility() → Block/Allow → load() hook → Module
                      ↓                   ↓
              getRingLevel()      Ring Cache (fast path)
```

## Files

### Core Components

- **module-hook.ts** — ESM loader hooks (resolve, load)
  - Node.js `--loader` compatible hooks
  - Intercepts ALL imports at load time
  - Enforces ring visibility rules
  - Performance tracking and statistics

- **ring-resolver.ts** — Path analysis and ring detection
  - Path normalization (Windows/Unix, file:// URLs)
  - Ring level classification with caching
  - External module detection

- **index.ts** — Barrel exports

## Usage

### Basic Usage

```bash
# Enable loader security (production)
node --loader ./dist/sensaios/loader/module-hook.js src/index.js

# With verbose logging
SENSAIOS_LOADER_VERBOSE=1 node --loader ./dist/sensaios/loader/module-hook.js src/index.js

# Disable for debugging/emergencies
SENSAIOS_LOADER_DISABLED=1 node --loader ./dist/sensaios/loader/module-hook.js src/index.js
```

### Package.json Integration

```json
{
  "scripts": {
    "start": "node --loader ./dist/sensaios/loader/module-hook.js dist/index.js",
    "dev": "tsx --loader ./dist/sensaios/loader/module-hook.js src/index.ts"
  }
}
```

### Runtime Statistics

```typescript
// Access loader stats at runtime
const stats = (globalThis as any).sensaiOSLoaderStats?.();
console.log(`Imports: ${stats.totalImports}, Blocked: ${stats.blockedImports}`);
```

## Ring Visibility Rules

| From Ring | Can Import | Notes |
|-----------|------------|-------|
| 0 (Kernel) | Any ring | Unrestricted access |
| 1 (SensaiOS) | Ring 0, 1 | Cannot import Ring 3 (Apps) |
| 3 (Apps) | Ring 3 only | Must use ComponentContext for kernel access |

**External Modules (node:, npm packages):** Trusted, allowed from any ring.

## Performance

- **Target:** <5ms overhead per import
- **Caching:** Ring level cache (10,000 entries max)
- **Statistics:** Available via `getLoaderStats()`

## Error Messages

When a violation is detected, the loader throws `ImportSecurityError` with:
- Clear description of the violation
- Source and target module paths
- Guidance on proper patterns (ComponentContext)
- Link to documentation

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SENSAIOS_LOADER_DISABLED` | Set to "1" to bypass security | Enabled |
| `SENSAIOS_LOADER_VERBOSE` | Set to "1" for detailed logging | Disabled |

## Testing

```bash
npm run test:sensaios-loader
```

## Integration Points

- **secure-import.ts** — Runtime validation (complementary)
- **visibility-dashboard.ts** — UI for monitoring
- **sensaios/types.ts** — RingLevel type definitions

## Cross-References

- **Ring Security Model:** `docs/projects/SensaiOS/architecture/06-os-security-model.md`
- **SensaiOS Instructions:** `.github/instructions/sensai.instructions.md`
- **Parent Router:** `src/sensaios/ROUTER.md`
