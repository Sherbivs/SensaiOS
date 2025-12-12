/**
 * Intelligent Logger - Thin Re-export from Consolidated Hub
 * 
 * All logic lives in src/shared/legacy-stubs.ts
 * This file exists only for import path compatibility.
 * 
 * @module utils/intelligent-logger
 */

export {
  // Types
  type LegacyLogLevel as LogLevel,
  type LegacyCategory as LogCategory,
  type LegacyLogOptions as LogOptions,
  type LegacyLogEntry as LogEntry,
  // Class
  IntelligentLogger,
} from '../shared/legacy-stubs.js';

import { IntelligentLogger } from '../shared/legacy-stubs.js';

export const logger = new IntelligentLogger();
export default logger;
