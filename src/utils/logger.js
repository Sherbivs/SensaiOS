/**
 * Legacy Logger Shim — Compatibility Layer for Old Logger API
 * 
 * PURPOSE: Provide backwards-compatible API for 40+ files still using old
 * logger syntax while delegating to the new standardized logger system.
 * 
 * This is a THIN WRAPPER, not deprecated code. All actual logging logic
 * lives in src/shared/logger.ts which implements DB-First architecture.
 * 
 * @module utils/logger
 */

import { getLogger } from '../shared/logger.js';

export const LOG_LABEL = Object.freeze({
  success: 'SUCCESS',
  info: 'INFO',
  warn: 'WARN',
  detail: 'DETAIL',
  error: 'ERROR',
});

function mapLevel(oldLevel) {
  const levelMap = { success: 'info', info: 'info', warn: 'warn', detail: 'debug', error: 'error' };
  return levelMap[oldLevel] || 'info';
}

function inferComponent(context) {
  if (context?.component) return context.component;
  if (context?.service) return context.service;
  if (context?.worker) return `worker.${context.worker}`;
  if (context?.guild || context?.guildId) return 'bot';
  if (context?.database || context?.db) return 'database';
  if (context?.cache) return 'cache';
  if (context?.battle) return 'battle';
  return 'app';
}

function inferOperation(message, context) {
  if (context?.operation) return context.operation;
  if (context?.action) return context.action;
  const lowerMsg = (message || '').toLowerCase();
  if (lowerMsg.includes('initializ')) return 'initialize';
  if (lowerMsg.includes('start')) return 'start';
  if (lowerMsg.includes('stop')) return 'stop';
  if (lowerMsg.includes('shutdown')) return 'shutdown';
  if (lowerMsg.includes('connect')) return 'connect';
  if (lowerMsg.includes('query')) return 'query';
  if (lowerMsg.includes('error') || lowerMsg.includes('fail')) return 'error';
  if (lowerMsg.includes('register')) return 'register';
  return 'operation';
}

function log(level, message, context) {
  const logger = getLogger();
  const newLevel = mapLevel(level);
  const component = inferComponent(context);
  const operation = inferOperation(message, context);
  const newContext = context ? { metadata: { ...context } } : undefined;
  logger[newLevel](component, operation, message, newContext);
}

log.info = (message, context) => log('info', message, context);
log.warn = (message, context) => log('warn', message, context);
log.error = (message, context) => log('error', message, context);
log.success = (message, context) => log('info', message, context);
log.detail = (message, context) => log('debug', message, context);

function report(title, meta = {}, level = 'info') {
  const logger = getLogger();
  const newLevel = mapLevel(level);
  const component = inferComponent(meta);
  logger[newLevel](component, 'report', title, { metadata: meta });
}

function startAutoRefresh() { /* No-op: New logger handles this */ }
function stopAutoRefresh() { /* No-op: New logger handles this */ }
function getFormattedStats() { return { message: 'Use observability system' }; }

export { LOG_LABEL, log, report, startAutoRefresh, stopAutoRefresh, getFormattedStats };
export default { LOG_LABEL, log, report, startAutoRefresh, stopAutoRefresh, getFormattedStats };
