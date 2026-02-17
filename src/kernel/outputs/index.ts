/**
 * Kernel Output Plugins — Concrete Implementations
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * EXTENSIBLE OUTPUT DESTINATIONS FOR KERNEL LOGGING
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This directory contains concrete output plugin implementations that
 * route kernel log entries to specific destinations:
 * 
 * - ConsoleOutput  — Formatted console output (stdout/stderr)
 * - FileOutput     — No-op (Database-First Architecture, 2025-12-27)
 * 
 * Future plugins (Sprint 3):
 * - LokiOutput     — Grafana Loki structured log ingestion
 * - DiscordOutput   — Alert-level logs to Discord channels
 * - PostgresOutput  — Database-persisted log archive
 * 
 * @module kernel/outputs
 */

export { ConsoleOutputPlugin, createConsoleOutputPlugin } from './console-output.js';
export { FileOutputPlugin, createFileOutputPlugin } from './file-output.js';
