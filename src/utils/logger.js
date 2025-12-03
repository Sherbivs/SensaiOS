/**
 * Legacy Logger Shim - Thin Re-export from Consolidated Hub
 * 
 * All logic lives in src/shared/legacy-stubs.ts
 * This file exists only for import path compatibility.
 * 
 * @module utils/logger
 */

import {
  LOG_LABEL,
  legacyLogFunction as log,
  legacyReport as report,
  startAutoRefresh,
  stopAutoRefresh,
  getFormattedStats,
} from '../shared/legacy-stubs.js';

export { LOG_LABEL, log, report, startAutoRefresh, stopAutoRefresh, getFormattedStats };
export default { LOG_LABEL, log, report, startAutoRefresh, stopAutoRefresh, getFormattedStats };
