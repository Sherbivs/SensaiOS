/**
 * AI Log Analyzer - Thin Re-export from Consolidated Hub
 * 
 * All logic lives in src/shared/legacy-stubs.ts
 * This file exists only for import path compatibility.
 * 
 * @module services/ai/ai-log-analyzer
 */

import { aiAnalyzerStubs } from '../../shared/legacy-stubs.js';

export const initialize = aiAnalyzerStubs.initialize;
export const shutdown = aiAnalyzerStubs.shutdown;
export const analyze = aiAnalyzerStubs.analyze;
export const getRecentErrors = aiAnalyzerStubs.getRecentErrors;
export const getPerformanceMetrics = aiAnalyzerStubs.getPerformanceMetrics;

export default aiAnalyzerStubs;
