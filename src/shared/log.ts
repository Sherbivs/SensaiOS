/**
 * Structured Logger Shim - Thin Re-export from Consolidated Hub
 * 
 * All logic lives in src/shared/legacy-stubs.ts
 * This file exists only for import path compatibility.
 * 
 * @module shared/log
 */

export {
  type LegacyLogLevel as LogLevel,
  type BufferedLogEntry,
  structuredLog as log,
  flushBufferedLogs,
} from './legacy-stubs.js';
