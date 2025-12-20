/**
 * Unified Logger Facade — Canonical Import Path
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * MIGRATION STATUS: PHASE 1 COMPLETE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module provides the canonical import path for all logging operations.
 * 
 * BEFORE (fragmented):
 *   import { log } from '../utils/logger.js';      // 18 files
 *   import { log } from '../shared/logger.js';     // 23 files
 *   import logger from '../utils/intelligent-logger.js'; // 4 files
 * 
 * AFTER (unified):
 *   import { log, report } from '../shared/logging/index.js';
 * 
 * Architecture:
 *   - Canonical logger: src/shared/logger.ts (DB-first logging)
 *   - Stats display: src/utils/logger.ts (console stats, auto-refresh)
 *   - AI analysis: src/utils/intelligent-logger.ts (specialized, kept separate)
 * 
 * This facade unifies the API while preserving existing implementations.
 * 
 * @module shared/logging
 * @see src/shared/logger.ts — DB-first logging implementation
 * @see src/utils/logger.ts — Stats display implementation
 * @see docs/projects/cleanup/2025-12-20-consolidation-meeting-9-high-level-execution.md
 */

// ═══════════════════════════════════════════════════════════════════════════
// Primary Logger API (from shared/logger.ts — DB-first architecture)
// ═══════════════════════════════════════════════════════════════════════════

export {
  // Core logging function (legacy-compatible)
  log,
  
  // Modern logger factory
  getLogger,
  resetLogger,
  
  // Context utilities
  generateCorrelationId,
  errorContext,
  measureOperation,
  
  // Type exports
  type LogLevel,
  type LogComponent,
  type LogOperation,
  type Logger,
  type LogEntry,
  type LogContext,
} from '../logger.js';

// ═══════════════════════════════════════════════════════════════════════════
// Stats Display API (from utils/logger.ts — console stats)
// ═══════════════════════════════════════════════════════════════════════════

export {
  // Stats display and refresh
  report,
  startAutoRefresh,
  stopAutoRefresh,
  getFormattedStats,
  
  // Log labels
  LOG_LABEL,
} from '../../utils/logger.js';

// ═══════════════════════════════════════════════════════════════════════════
// Infinity Console — Visual Output System (NEW in Meeting #10)
// ═══════════════════════════════════════════════════════════════════════════

export {
  // Dashboard rendering
  ConsoleRenderer,
  renderDashboard,
  renderStatusLine,
  
  // Section renderers
  renderDatabaseSection,
  renderDiscordSection,
  renderResourceSection,
  
  // Log stream formatting
  formatLogEntry,
  logStreamSeparator,
  progressBar,
  
  // Visual components
  headerBox,
  sectionBox,
  
  // Quick log formatters
  success,
  info,
  warn,
  error,
  
  // Types
  type SystemStatus,
  type ResourceMetrics,
  type LogStreamEntry,
  type DashboardConfig,
} from './console-renderer.js';

// ═══════════════════════════════════════════════════════════════════════════
// Usage Examples
// ═══════════════════════════════════════════════════════════════════════════
//
// Basic logging (legacy-compatible):
//   import { log } from '../shared/logging/index.js';
//   log('info', 'Message here', { context: 'data' });
//   log.warn('Warning message');
//   log.error('Error message', { error: err });
//
// Modern logger (recommended for new code):
//   import { getLogger } from '../shared/logging/index.js';
//   const logger = getLogger('bot.battle');
//   logger.info('start', 'Battle started', { battleId });
//
// Stats display:
//   import { report, startAutoRefresh } from '../shared/logging/index.js';
//   report();  // Display stats once
//   startAutoRefresh();  // Start periodic stats updates
//
// Infinity Console (visual dashboard):
//   import { renderDashboard, ConsoleRenderer } from '../shared/logging/index.js';
//   console.log(renderDashboard({ version: '2.5.0', databases, resources }));
//   console.log(ConsoleRenderer.success('Operation complete', 'context'));
//
// Note: For AI-enhanced analysis, continue using intelligent-logger directly:
//   import logger from '../utils/intelligent-logger.js';
//
// ═══════════════════════════════════════════════════════════════════════════
