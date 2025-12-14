/**
 * Log Buffer Initialization
 *
 * Sets up the global log buffer with appropriate configuration
 * based on environment and user preferences.
 */
import { initLogBuffer } from "./logBuffer.js";
import { flushBufferedLogs } from "./log.js";
/**
 * Initialize log buffering for the application
 *
 * Call this early in the application lifecycle (before most logging occurs).
 *
 * @param customConfig Optional configuration overrides
 */
export function setupLogBuffer(customConfig) {
    // Parse configuration from environment variables
    const envConfig = {};
    // LOG_BUFFER_ENABLED (default: true, disabled in test/ci)
    const enabled = process.env.LOG_BUFFER_ENABLED?.toLowerCase();
    if (enabled === "false" || enabled === "0") {
        envConfig.enabled = false;
    }
    else if (process.env.NODE_ENV === "test" || process.env.CI === "true") {
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
    const finalConfig = {
        ...envConfig,
        ...customConfig,
    };
    // Initialize the global buffer
    initLogBuffer(flushBufferedLogs, finalConfig);
}
