/**
 * AI Log Writer Stub - Compatibility Layer
 * 
 * Functionality migrated to src/shared/logger.ts + TimescaleDB.
 * This stub maintains API compatibility for index.ts imports.
 * 
 * @module services/ai/ai-log-writer
 */

export const CONFIG = {
  categories: {
    SYSTEM: 'system',
    DATABASE: 'database',
    DISCORD: 'discord',
    GAME_ENGINE: 'game-engine',
    SECURITY: 'security',
    PERFORMANCE: 'performance',
    ERROR: 'error',
    RESOURCE: 'resource',
    USER_ACTION: 'user-action',
    INTEGRATION: 'integration',
  },
};

export async function initialize(_options) {}
export async function shutdown() {}
export function log(_category, _message, _options) {}
export function trace(_category, _message, _options) {}
export function debug(_category, _message, _options) {}
export function info(_category, _message, _options) {}
export function notice(_category, _message, _options) {}
export function warn(_category, _message, _options) {}
export function error(_category, _message, _options) {}
export function critical(_category, _message, _options) {}
export function fatal(_category, _message, _options) {}
export async function flush() {}
export function getStats() { return { logsWritten: 0, currentFile: null }; }
export function generateCorrelationId() { return `stub_${Date.now()}`; }

export default {
  initialize, shutdown, log, trace, debug, info, notice, warn, error,
  critical, fatal, flush, getStats, generateCorrelationId, CONFIG,
};
