/**
 * Log Buffer Initialization
 * 
 * Sets up the global log buffer with appropriate configuration
 * based on environment and user preferences.
 */

import { initLogBuffer, type LogBufferConfig, type BufferedLogEntry } from "./logBuffer.js";
import { scopedLogger } from "../observability/envelope/console.js";

const log = scopedLogger('log-buffer');

/**
 * Flush buffered log entries using the envelope logger
 * Replacement for the removed flushBufferedLogs from log.js
 */
function flushBufferedLogs(entries: BufferedLogEntry[]): void {
  if (entries.length === 0) return;
  
  // Emit summary if multiple unique messages
  if (entries.length > 1) {
    const totalMessages = entries.reduce((sum, e) => sum + e.count, 0);
    log.info('flush', `Log buffer flush: ${entries.length} unique messages, ${totalMessages} total`);
  }
  
  // Emit each buffered entry at its original level
  for (const entry of entries) {
    const data = {
      ...(entry.context ?? {}),
      ...(entry.count > 1 ? { repeatCount: entry.count, lastSeen: new Date(entry.lastSeen).toISOString() } : {}),
    };
    
    switch (entry.level) {
      case 'error':
        log.error('buffered', entry.message, data);
        break;
      case 'warn':
        log.warn('buffered', entry.message, data);
        break;
      case 'debug':
        log.debug('buffered', entry.message, data);
        break;
      default:
        log.info('buffered', entry.message, data);
    }
  }
}

/**
 * Initialize log buffering for the application
 * 
 * Call this early in the application lifecycle (before most logging occurs).
 * 
 * @param customConfig Optional configuration overrides
 */
export function setupLogBuffer(customConfig?: Partial<LogBufferConfig>): void {
  // Parse configuration from environment variables
  const envConfig: Partial<LogBufferConfig> = {};

  // LOG_BUFFER_ENABLED (default: true, disabled in test/ci)
  const enabled = process.env.LOG_BUFFER_ENABLED?.toLowerCase();
  if (enabled === "false" || enabled === "0") {
    envConfig.enabled = false;
  } else if (process.env.NODE_ENV === "test" || process.env.CI === "true") {
    // Disable buffering in tests for immediate feedback
    envConfig.enabled = false;
  }

  // LOG_BUFFER_INTERVAL (default: 10000ms = 10 seconds)
  const intervalStr = process.env.LOG_BUFFER_INTERVAL;
  if (intervalStr && /^\d+$/.test(intervalStr)) {
    const interval = parseInt(intervalStr, 10);
    if (interval >= 1000 && interval <= 300000) {
      envConfig.flushIntervalMs = interval;
    }
  }

  // LOG_BUFFER_MAX_SIZE (default: 1000)
  const maxSizeStr = process.env.LOG_BUFFER_MAX_SIZE;
  if (maxSizeStr && /^\d+$/.test(maxSizeStr)) {
    const maxSize = parseInt(maxSizeStr, 10);
    if (maxSize >= 100 && maxSize <= 10000) {
      envConfig.maxBufferSize = maxSize;
    }
  }

  // LOG_BUFFER_BYPASS_CRITICAL (default: true)
  const bypassCritical = process.env.LOG_BUFFER_BYPASS_CRITICAL?.toLowerCase();
  if (bypassCritical === "false" || bypassCritical === "0") {
    envConfig.bypassCritical = false;
  }

  // Merge configurations: defaults < env < custom
  const finalConfig: Partial<LogBufferConfig> = {
    ...envConfig,
    ...customConfig,
  };

  // Initialize the global buffer
  initLogBuffer(flushBufferedLogs, finalConfig);
}
