# ROUTER
Title: Scripts Shared Library
Purpose: Reusable TypeScript utilities for all scripts including output, errors, exec, env, fs, ssh, CLI, and progress helpers.
Owned Globs: scripts/lib/**
Last Updated (UTC): 2026-02-10T16:40:00Z

## Overview

This directory contains the foundation library for the Scripts Overhaul Project. All modules are TypeScript-first, dependency-free (using only Node.js built-ins), and designed for composition.

## Design Principles

1. **TypeScript-First** — Full type safety with exported types
2. **Zero External Dependencies** — Only Node.js built-ins
3. **ESM + .js Extensions** — Compatible with tsx execution
4. **Composable** — Modules can be used independently or together
5. **Error Safe** — Consistent error handling with typed exceptions
6. **Single Source of Truth** — Output utilities are canonical (not src/utils)

## Module Index

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `output.ts` | ANSI colors, formatted printing | `c`, `printSection`, `printTable`, `formatStatus` |
| `errors.ts` | Error types, boundaries | `ScriptError`, `handleError`, `withErrorBoundary` |
| `exec.ts` | Command execution | `exec`, `execQuiet`, `execStream` |
| `env.ts` | Environment loading | `loadEnv`, `requireEnv`, `getEnv` |
| `fs.ts` | File system utilities | `readJson`, `writeJson`, `ensureDir` |
| `ssh.ts` | SSH + WSL fallback | `runSSH`, `renderSSH`, `detectWSL` |
| `cli.ts` | CLI framework | `createCLI`, `parseArgs` |
| `progress.ts` | Spinners, progress bars | `createSpinner`, `createProgressBar` |
| `generate-script.ts` | Script generator | Creates new scripts from template |
| `index.ts` | Barrel export | All modules re-exported |

## Areas

### Core Utilities
- **output.ts** — ANSI color helpers (`c.red`, `c.green`, etc.), section headers, key-value pairs, tables, lists. **CANONICAL source** for format functions (replaces `src/utils/output-formatter.ts`). Exports both print functions (console) and format functions (string return).
- **errors.ts** — `ScriptError` base class with `EnvError`, `SSHError`, `ExecError`, `FileError`, `ValidationError` subclasses. `handleError()` for graceful exits, `withErrorBoundary()` for async wrappers.
- **exec.ts** — Promise-based `exec()` using `child_process.execFile`. Options for timeout, streaming, environment override. `commandExists()` for dependency checks.

### Environment & Config
- **env.ts** — `.env` file loading with `loadEnv()`, `requireEnv()` for mandatory variables, `getEnv()` for optional. `isProduction()`, `isRender()` environment checks. Respects `IG_ENV_FILE` override.

### File System
- **fs.ts** — Async file operations: `readJson()`, `writeJson()`, `readText()`, `writeText()`. Directory ops: `ensureDir()`, `listFiles()`, `listDirs()`. Path utilities for cross-platform support.

### Remote Operations
- **ssh.ts** — Cross-platform SSH with WSL fallback for Windows. `runSSH()` for command execution, `renderSSH()` for Render service shortcuts. Uses configured host `render-virginia`.

### CLI Framework
- **cli.ts** — Lightweight CLI builder without commander.js. `createCLI()` generates multi-command CLIs with automatic help. Supports positional args, flags, subcommands.

### Progress Indicators
- **progress.ts** — Terminal spinners and progress bars with TTY detection. `createSpinner()` for async operations, `createProgressBar()` for counted operations. Graceful fallback in CI environments.

### Barrel Export
- **index.ts** — Re-exports all modules. Import convenience: `import { c, exec, readJson } from '../lib/index.js'`

## Usage Examples

### Basic Script
```typescript
import { c, printSection, requireEnv, exec, handleError } from '../lib/index.js';

async function main() {
  printSection('Database Status');
  
  const dbUrl = requireEnv('PROD_DATABASE_URL');
  const result = await exec('psql', [dbUrl, '-c', 'SELECT 1']);
  
  console.log(c.green('Connected successfully'));
}

main().catch(handleError);
```

### CLI Script
```typescript
import { createCLI, printSuccess } from '../lib/index.js';

const cli = createCLI({
  name: 'example',
  description: 'Example CLI tool',
  commands: {
    hello: {
      description: 'Say hello',
      args: [{ name: 'name', description: 'Your name' }],
      run: async ({ args }) => {
        printSuccess(`Hello, ${args.name}!`);
      },
    },
  },
});

cli.run();
```

### Progress Indicators
```typescript
import { createSpinner, createProgressBar } from '../lib/index.js';

const spinner = createSpinner({ text: 'Loading...' });
// ... do work
spinner.success('Done!');

const progress = createProgressBar({ total: 100 });
for (let i = 0; i < 100; i++) {
  progress.tick();
}
progress.complete('All items processed');
```

## Integration Points

- **scripts/db/** — Uses `env.ts` for database URLs, `exec.ts` for psql/prisma commands
- **scripts/render/** — Uses `ssh.ts` for Render SSH access, `progress.ts` for deploy status
- **scripts/observe/** — Uses `output.ts` for formatted log display
- **scripts/guard/** — Uses `errors.ts` for validation failures, `fs.ts` for file checks

## Cross-References

- **Parent:** [scripts/ROUTER.md](../ROUTER.md)
- **Project Plan:** [docs/projects/scripts-overhaul-project.md](../../docs/projects/scripts-overhaul-project.md)
- **Instructions:** [.github/instructions/scripts.instructions.md](../../.github/instructions/scripts.instructions.md)

## Notes

1. All imports use `.js` extensions for ESM compatibility with tsx
2. Default export on each module allows `import output from './output.js'`
3. Named exports preferred for tree-shaking
4. Modules are side-effect free (no global state)
5. TTY detection ensures CI-friendly output

---

**Created:** 2025-12-21 | **Phase:** 1 Foundation (Scripts Overhaul)
