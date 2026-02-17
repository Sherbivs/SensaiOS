# ROUTER
Title: Kernel Output Plugins
Purpose: Concrete output plugin implementations for kernel logging destinations
Owned Globs: src/kernel/outputs/**
Last Updated (UTC): 2026-02-17T10:00:00Z

Notes:
- Created as part of KERNEL.LOGGING.OUTPUT_PLUGINS task
- Provides concrete KernelOutputPlugin implementations
- ConsoleOutput is the primary active plugin
- FileOutput is a no-op stub (Database-First Architecture, 2025-12-27)
- Future plugins: LokiOutput, DiscordOutput, PostgresOutput (Sprint 3)

Areas:
- index.ts — Barrel exports for all output plugins
- console-output.ts — Formatted stdout/stderr plugin with color, JSON modes
- file-output.ts — No-op file plugin (Database-First Architecture placeholder)
