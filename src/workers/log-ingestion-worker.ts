/**
 * Log Ingestion Worker - Thin Re-export from Consolidated Hub
 * 
 * All logic lives in src/shared/legacy-stubs.ts
 * This file exists only for import path compatibility.
 * 
 * @module workers/log-ingestion-worker
 */

export {
  logIngestionStubs
} from '../shared/legacy-stubs.js';

import { logIngestionStubs } from '../shared/legacy-stubs.js';

export const startLogIngestionWorker = logIngestionStubs.startLogIngestionWorker;
export const stopLogIngestionWorker = logIngestionStubs.stopLogIngestionWorker;
