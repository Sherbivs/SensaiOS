/**
 * AI Log Writer - Thin Re-export from Consolidated Hub
 * 
 * All logic lives in src/shared/legacy-stubs.ts
 * This file exists only for import path compatibility.
 * 
 * @module services/ai/ai-log-writer
 */

import { aiLoggerStubs } from '../../shared/legacy-stubs.js';

export const CONFIG = aiLoggerStubs.CONFIG;
export const initialize = aiLoggerStubs.initialize;
export const shutdown = aiLoggerStubs.shutdown;
export const log = aiLoggerStubs.log;
export const trace = aiLoggerStubs.trace;
export const debug = aiLoggerStubs.debug;
export const info = aiLoggerStubs.info;
export const notice = aiLoggerStubs.notice;
export const warn = aiLoggerStubs.warn;
export const error = aiLoggerStubs.error;
export const critical = aiLoggerStubs.critical;
export const fatal = aiLoggerStubs.fatal;
export const flush = aiLoggerStubs.flush;
export const getStats = aiLoggerStubs.getStats;
export const generateCorrelationId = aiLoggerStubs.generateCorrelationId;

export default aiLoggerStubs;
