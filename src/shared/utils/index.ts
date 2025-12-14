/**
 * Barrel Export — Shared Utilities
 * 
 * Centralized export point for all shared utility functions.
 * Enables clean single-import access: `import { formatBytes, delay, getErrorMessage } from '../shared/utils'`
 * 
 * Purpose: Reduce import verbosity and improve discoverability of shared utilities.
 * 
 * @module shared/utils
 */

// Format Utilities
export {
  formatBytes,
  formatBytesShort,
  formatDuration,
  formatUptime,
  formatDurationCompact,
  truncate,
  formatTimestamp,
  stripQuotes,
} from './format-utils.js';

// Error Utilities
export {
  type ErrorMeta,
  safeError,
  normalizeError,
  formatError,
  getErrorMessage,
} from './error-utils.js';

// Async Utilities
export {
  delay,
  delayWithJitter,
} from './async-utils.js';

// Math Utilities
export {
  clamp,
} from './math-utils.js';

// URL Utilities
export {
  extractDatabaseName,
} from './url-utils.js';

// Date Utilities
export {
  toDate,
  toDateOrNow,
  startOfUtcDay,
  diffInUtcDays,
  cloneDate,
  daysAgo,
  hoursAgo,
  minutesAgo,
  daysFromNow,
  hoursFromNow,
  isOlderThanDays,
  isOlderThanHours,
} from './date-utils.js';

// File Utilities
export {
  fileExists,
  ensureDir,
  readJsonFile,
  writeJsonFile,
  readTextFile,
  writeTextFile,
} from './file-utils.js';

// Object Utilities
export {
  deepClone,
} from './object-utils.js';

// String Utilities
export {
  normalizeString,
  getFilesafeTimestamp,
} from './string-utils.js';
