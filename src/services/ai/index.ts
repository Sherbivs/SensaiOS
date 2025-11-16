/**
 * AI Logging Services Barrel Export
 * 
 * Centralized exports for AI logging system services:
 * - ai-log-writer: Hard logs to /Store/ai-logs/ (append-only files)
 * - ai-log-analyzer: Log analysis and pattern detection
 * - ai-log-integrations: Integration with external AI systems
 * 
 * Usage:
 * ```typescript
 * import * as aiLogger from '../services/ai';
 * 
 * await aiLogger.initialize();
 * await aiLogger.logEvent({ type: 'battle', data: {...} });
 * ```
 */

// AI Log Writer
export * as aiLogger from './ai-log-writer.js';

// AI Log Analyzer
export * as aiLogAnalyzer from './ai-log-analyzer.js';

// AI Log Integrations
export * as aiLogIntegrations from './ai-log-integrations.js';
