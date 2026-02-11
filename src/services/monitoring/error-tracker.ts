/**
 * Error Tracking Service
 * Purpose: Centralized error capture, fingerprinting, deduplication, and persistence
 * Motto: "No Silent Errors" - Every error is captured, logged, and made visible
 * 
 * CRITICAL GUARANTEES:
 * 1. LIVE DETECTION: No caching - every error immediately visible in console + database
 * 2. ZERO FALSE NEGATIVES: Even if database fails, error is logged to console + emergency file
 * 3. IMMEDIATE VISIBILITY: Console output before any async operations
 * 4. LIVE STREAM: Real-time event emission for logger integration
 * 5. KERNEL INTEGRATION: All errors report UP to kernel observation layer (2025-12-26)
 * 6. CRASH RESILIENCE: Database writes buffered with recovery on power loss (2025-01-04)
 * 
 * @module services/error-tracker
 */

// APP LAYER FIRST — Isolated access to kernel through application layer
import { createErrorTrackerHook, type ErrorTrackerHook, getCurrentCorrelationId } from '../../app/index.js';

// LOGGER SECOND — Must be early import to capture initialization errors
import { getLogger } from "../../shared/logging/index.js";
const logger = getLogger();

import crypto from 'node:crypto';
import { toEasternLogFormat } from '../../shared/datetime.js';
import { EventBus } from '../../shared/event-bus.js';
import { prisma } from '../../shared/prisma.js';
import { daysAgo } from '../../shared/utils/date-utils.js';
import type { ErrorLog } from '@prisma/client';
import {
  parseStackTrace,
  enrichStackFramesWithSource,
  captureErrorContextSnapshot,
  formatErrorReportForAI,
  type ParsedStackTrace,
  type StackFrame,
} from '../../utils/stack-trace-parser.js';
// Error Brain — Local intelligence system for error pattern detection
import * as ErrorBrain from '../error-brain/index.js';
// Resilient Write Buffer — Crash-safe database operations
import {
  queueWrite,
  registerWriteExecutor,
  initializeWriteBuffer,
  shutdownWriteBuffer,
  getBufferStats,
  type BufferStats,
} from './resilient-write-buffer.js';

// ═══════════════════════════════════════════════════════════════════════════
// Kernel Integration — Reports UP to observation layer
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Kernel hook for reporting errors to the observation layer
 * Initialized lazily to avoid circular dependency issues during boot
 */
let kernelHook: ErrorTrackerHook | null = null;

/**
 * Get or create the kernel hook (lazy initialization)
 * Safe to call during boot - returns null if kernel not ready
 */
function getKernelHook(): ErrorTrackerHook | null {
  if (kernelHook) return kernelHook;
  
  try {
    kernelHook = createErrorTrackerHook('error-tracker');
    return kernelHook;
  } catch {
    // Kernel not ready yet (during early boot), will retry on next error
    return null;
  }
}

/// ---- Live Error Stream ----

export interface LiveErrorEvent {
  errorId: string;
  fingerprint: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  errorName: string;
  errorMessage: string;
  timestamp: string;
  context: Record<string, any>;
  // Enhanced with stack trace parsing
  parsedStack?: ParsedStackTrace;
  topFrame?: StackFrame | null;
  sourceLocation?: {
    file: string;
    line: number;
    column: number | null;
  };
  callChain?: string[];
}

/// ---- Error Types ----

export type ErrorCategory = 
  | 'VALIDATION'
  | 'NETWORK'
  | 'DATABASE'
  | 'DISCORD'
  | 'ENGINE'
  | 'WORKER'
  | 'CONFIG'
  | 'CACHE'
  | 'UNKNOWN';

export type ErrorSeverity = 
  | 'CRITICAL' // System-wide failure, data loss risk, service down
  | 'HIGH'     // Feature broken, user-facing errors, data inconsistency
  | 'MEDIUM'   // Degraded performance, recoverable errors, warnings
  | 'LOW';     // Non-critical issues, informational, expected errors

export interface ErrorContext {
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  userId?: string;
  guildId?: string;
  commandName?: string;
  service?: string;
  operation?: string;
  input?: Record<string, any>;
  customData?: Record<string, any>;
}

export interface ErrorStats {
  totalUnique: number;
  totalOccurrences: number;
  bySeverity: Record<ErrorSeverity, number>;
  byCategory: Record<ErrorCategory, number>;
  criticalErrors: number;
  errorRate: number; // errors per hour
}

export interface ErrorFilters {
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  since?: Date;
  fingerprint?: string;
}

export interface LearningMetadata {
  hourlyPattern?: number[]; // 24-hour occurrence pattern
  correlatedErrors?: string[]; // fingerprints of related errors
  cascadeParent?: string; // fingerprint of error that triggered this one
  mitigationSuccess?: Record<string, number>; // strategy → success count
  lastAnalyzedAt?: Date;
}

/// ---- Resolution Types ----

/**
 * Source of error resolution
 */
export type ResolutionSource = 
  | 'AUTO'        // Automatic remediation by system
  | 'MANUAL'      // Manual intervention by operator
  | 'EXTERNAL'    // External system/service fix
  | 'SELF_HEAL';  // Error resolved itself (timeout, retry success)

/**
 * Parameters for recording an error resolution
 */
export interface ResolutionParams {
  errorId: string;           // ID of the error being resolved
  strategy: string;          // Strategy used (e.g., 'database-reconnect')
  outcome: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'ESCALATED';  // Resolution outcome
  triggeredBy?: string;      // 'AUTO' | 'MANUAL' | userId
  durationMs?: number;       // How long the resolution took
  notes?: string;            // Optional notes about the resolution
  contextData?: Record<string, unknown>;  // Additional context at resolution time
}

/**
 * Effective strategy learned from ErrorResolution history
 */
export interface EffectiveStrategy {
  strategy: string;          // Strategy name
  successRate: number;       // Success rate (0-1)
  avgExecutionMs: number;    // Average execution time
  sampleSize: number;        // Number of attempts
  lastUsed: Date;            // Most recent usage
  confidence: number;        // Statistical confidence (0-1)
  recommendation: 'RECOMMENDED' | 'CONSIDER' | 'AVOID';
}

/// ---- Error Fingerprinting ----

/**
 * Generate a unique fingerprint for an error
 * Same error (name + message + stack pattern + category) = same fingerprint
 * Line numbers are normalized to ensure code changes don't create new fingerprints
 */
export function generateFingerprint(error: Error, category: ErrorCategory): string {
  // Normalize stack trace: keep top 5 frames, remove line numbers
  const normalizedStack = error.stack
    ?.split('\n')
    .slice(0, 5)
    .map(frame => frame.replace(/:\d+:\d+/g, ':*:*'))
    .join('|') ?? '';
  
  const key = `${error.name}|${error.message}|${normalizedStack}|${category}`;
  return crypto.createHash('sha256').update(key).digest('hex');
}

/// ---- Severity Classification ----

/**
 * Auto-classify error severity based on error type and context
 */
export function classifySeverity(error: Error, context: ErrorContext): ErrorSeverity {
  // Explicit severity provided
  if (context.severity) {
    return context.severity;
  }
  
  const errorName = error.name.toLowerCase();
  const errorMessage = error.message.toLowerCase();
  
  // CRITICAL: Database connection errors, Prisma errors, process-level errors
  if (
    errorName.includes('prisma') ||
    errorName.includes('connection') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('database') && errorMessage.includes('unavailable') ||
    context.operation === 'uncaughtException'
  ) {
    return 'CRITICAL';
  }
  
  // HIGH: Discord API errors, command failures, worker crashes
  if (
    errorName.includes('discordapi') ||
    context.category === 'DISCORD' ||
    context.category === 'WORKER' ||
    context.operation === 'command' ||
    context.operation === 'interaction'
  ) {
    return 'HIGH';
  }
  
  // MEDIUM: Timeouts, cache errors, retry exhausted
  if (
    errorName.includes('timeout') ||
    errorMessage.includes('timeout') ||
    context.category === 'CACHE' ||
    errorMessage.includes('retry')
  ) {
    return 'MEDIUM';
  }
  
  // LOW: Validation errors, user input errors
  if (
    context.category === 'VALIDATION' ||
    errorName.includes('validation') ||
    errorMessage.includes('invalid')
  ) {
    return 'LOW';
  }
  
  // Default to MEDIUM for unknown errors
  return 'MEDIUM';
}

/// ---- Error Category Detection ----

/**
 * Auto-detect error category from error type and context
 */
export function detectCategory(error: Error, context: ErrorContext): ErrorCategory {
  // Explicit category provided
  if (context.category) {
    return context.category;
  }
  
  const errorName = error.name.toLowerCase();
  const errorMessage = error.message.toLowerCase();
  
  if (errorName.includes('prisma') || errorMessage.includes('database')) {
    return 'DATABASE';
  }
  
  if (errorName.includes('discordapi') || errorMessage.includes('discord')) {
    return 'DISCORD';
  }
  
  if (errorMessage.includes('timeout')) {
    return 'NETWORK';
  }
  
  if (context.service === 'worker' || errorMessage.includes('worker')) {
    return 'WORKER';
  }
  
  if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
    return 'VALIDATION';
  }
  
  if (context.service === 'cache' || errorMessage.includes('cache')) {
    return 'CACHE';
  }
  
  if (errorMessage.includes('config') || errorMessage.includes('environment')) {
    return 'CONFIG';
  }
  
  return 'UNKNOWN';
}

/// ---- Error Tracker Service ----

export class ErrorTracker {
  /**
   * In-memory stats for synchronous health checks.
   * Updated on each captureError call.
   */
  private _stats = {
    totalErrors: 0,
    queueSize: 0,
    lastCaptureTime: 0,
  };

  /** Whether resilient write buffer has been initialized */
  private _bufferInitialized = false;

  /**
   * Initialize crash-resilient write buffer.
   * MUST be called on application startup to:
   * 1. Register write executors for error tracking operations
   * 2. Recover any uncommitted writes from previous crash
   * 3. Start periodic flush timer
   */
  async initialize(): Promise<void> {
    if (this._bufferInitialized) return;
    
    try {
      // Register write executors for each operation type
      this.registerWriteExecutors();
      
      // Initialize buffer and recover any pending writes
      const { recovered } = await initializeWriteBuffer();
      
      if (recovered > 0) {
        logger.info('error-tracker', 'init', 
          `[ErrorTracker] Recovered ${recovered} uncommitted writes from previous session`);
      }
      
      this._bufferInitialized = true;
      logger.info('error-tracker', 'init', '[ErrorTracker] Resilient write buffer initialized');
    } catch (error) {
      logger.error('error-tracker', 'init', 
        `[ErrorTracker] Buffer initialization failed: ${error}`);
      // Continue without buffer - errors still captured via console + emergency fallback
    }
  }

  /**
   * Register write executors for crash-resilient operations.
   * Called during initialization.
   */
  private registerWriteExecutors(): void {
    // Executor for error resolution records
    registerWriteExecutor('error-resolution', async (payload) => {
      const p = payload as {
        errorId: string;
        strategy: string;
        outcome: string;
        triggeredBy?: string;
        durationMs?: number;
        notes?: string;
        contextData?: Record<string, unknown>;
      };
      
      await prisma.errorResolution.create({
        data: {
          errorId: p.errorId,
          strategy: p.strategy,
          outcome: p.outcome,
          triggeredBy: p.triggeredBy,
          durationMs: p.durationMs,
          notes: p.notes,
          contextData: p.contextData ? JSON.parse(JSON.stringify(p.contextData)) : undefined,
        },
      });
    });

    // Executor for code context persistence
    registerWriteExecutor('code-context', async (payload) => {
      const p = payload as {
        records: Array<{
          errorId: string;
          frameIndex: number;
          filePath: string;
          lineNumber: number;
          columnNumber: number | null;
          functionName: string | undefined;
          codeSnippet: string | null;
        }>;
      };
      
      await prisma.errorCodeContext.createMany({
        data: p.records,
        skipDuplicates: true,
      });
    });

    // Executor for AI report storage
    registerWriteExecutor('ai-report', async (payload) => {
      const p = payload as {
        key: string;
        report: string;
        fingerprint: string;
        context: Record<string, unknown>;
      };
      
      await prisma.cacheEntry.upsert({
        where: { key: p.key },
        update: {
          value: { report: p.report, fingerprint: p.fingerprint, context: p.context } as object,
          updatedAt: new Date(),
        },
        create: {
          key: p.key,
          namespace: 'error-reports',
          value: { report: p.report, fingerprint: p.fingerprint, context: p.context } as object,
          sizeBytes: p.report.length,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });
    });

    // Executor for emergency error logs
    registerWriteExecutor('emergency-log', async (payload) => {
      const p = payload as {
        key: string;
        entry: object;
      };
      
      await prisma.cacheEntry.create({
        data: {
          key: p.key,
          namespace: 'emergency-error-logs',
          value: p.entry,
          sizeBytes: JSON.stringify(p.entry).length,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });
    });
  }

  /**
   * Shutdown the error tracker gracefully.
   * Flushes all pending writes before returning.
   */
  async shutdown(): Promise<void> {
    if (!this._bufferInitialized) return;
    
    logger.info('error-tracker', 'shutdown', '[ErrorTracker] Shutting down...');
    await shutdownWriteBuffer();
    this._bufferInitialized = false;
    logger.info('error-tracker', 'shutdown', '[ErrorTracker] Shutdown complete');
  }

  /**
   * Get resilient write buffer statistics.
   */
  getBufferStats(): BufferStats | null {
    if (!this._bufferInitialized) return null;
    return getBufferStats();
  }

  /**
   * Get synchronous stats for health checks.
   * Returns in-memory counters (non-blocking).
   * 
   * Used by: errorTrackerHealthCheck in service-factories.ts
   */
  getStats(): { totalErrors: number; queueSize: number; lastCaptureTime: number } {
    return { ...this._stats };
  }

  /**
   * Stop error stream (graceful shutdown).
   * Clears any pending timers/listeners.
   */
  stopErrorStream(): void {
    // Currently a no-op - ErrorTracker doesn't use background timers
    // Reserved for future background processing features
  }

  /**
   * Capture an error and persist to database
   * Automatically deduplicates by fingerprint
   * 
   * CRITICAL: This is a LIVE operation - NO CACHING, NO DELAYS
   * Every error must be captured immediately to ensure zero false negatives
   * 
   * ENHANCED: Now includes advanced stack trace parsing with:
   * - File paths, line numbers, column numbers
   * - Source code snippets around error location
   * - Call chain reconstruction
   * - AI-optimized troubleshooting hints
   * 
   * @returns errorId of created or updated ErrorLog entry
   */
  async captureError(error: Error, context: ErrorContext = {}): Promise<string> {
    // Update in-memory stats for health checks (synchronous, immediate)
    this._stats.totalErrors++;
    this._stats.lastCaptureTime = Date.now();

    // IMMEDIATE console output for live visibility (before any async operations)
    const timestamp = toEasternLogFormat();
    
    // Parse stack trace IMMEDIATELY (synchronous operation)
    const parsedStack = parseStackTrace(error);
    const topFrame = parsedStack.topFrame;
    
    // Enhanced logging output with source location
    logger.error('error-tracker', 'capture', `🚨 [ERROR CAPTURED] ${timestamp}`);
    logger.error('error-tracker', 'capture', `   Type: ${error.name}`);
    logger.error('error-tracker', 'capture', `   Message: ${error.message}`);
    if (topFrame?.relativeFilePath) {
      logger.error('error-tracker', 'capture', `   Location: ${topFrame.relativeFilePath}:${topFrame.lineNumber}:${topFrame.columnNumber}`);
      logger.error('error-tracker', 'capture', `   Function: ${topFrame.functionName || '<anonymous>'}`);
    }
    logger.error('error-tracker', 'capture', `   Call Chain: ${parsedStack.callChain.slice(0, 3).join(' → ')}`);
    logger.error('error-tracker', 'capture', `   Context: ${JSON.stringify({
      service: context.service,
      operation: context.operation,
      userId: context.userId,
      guildId: context.guildId,
      commandName: context.commandName,
    })}`);
    
    try {
      const category = detectCategory(error, context);
      const severity = classifySeverity(error, context);
      const fingerprint = generateFingerprint(error, category);
      
      // Enrich stack frames with source code snippets (async, but non-blocking)
      // Run in background to avoid blocking error capture
      enrichStackFramesWithSource(parsedStack.frames).then(enriched => {
        parsedStack.frames = enriched;
      }).catch(err => {
        // Source enrichment failed - not critical, continue
        logger.warn('error-tracker', 'enrich', '[ErrorTracker] Source enrichment failed: ' + err.message);
      });
      
      // Enrich context with automatic detection + stack trace metadata
      const enrichedContext = {
        ...context,
        category,
        severity,
        timestamp,
        nodeVersion: process.version,
        platform: process.platform,
        // Stack trace metadata for AI analysis
        stackMetadata: {
          depth: parsedStack.depth,
          topFrame: topFrame ? {
            file: topFrame.relativeFilePath || topFrame.filePath,
            line: topFrame.lineNumber,
            column: topFrame.columnNumber,
            function: topFrame.functionName,
          } : null,
          callChain: parsedStack.callChain,
          userCodeFrames: parsedStack.userCodeFrames.length,
        },
      };
      
      // LIVE DATABASE WRITE - No caching layer, direct to PostgreSQL
      // Use upsert to avoid race conditions in high-frequency error scenarios
      const result = await prisma.errorLog.upsert({
        where: { fingerprint },
        update: {
          lastSeen: new Date(),
          occurrenceCount: { increment: 1 },
          contextData: enrichedContext as any, // Store latest context with stack metadata
        },
        create: {
          fingerprint,
          category,
          severity,
          errorName: error.name,
          errorMessage: error.message,
          stackTrace: error.stack ?? null,
          contextData: enrichedContext as any,
          impactedFeatures: this.detectImpactedFeatures(error, context),
          estimatedUserImpact: this.estimateUserImpact(error, context),
        },
      });
      
      // Emit to Event Bus for immediate logger visibility (with parsed stack)
      this.emitToEventBus({
        errorId: result.errorId,
        fingerprint,
        category,
        severity,
        errorName: error.name,
        errorMessage: error.message,
        timestamp,
        context: enrichedContext,
        // Enhanced fields for logger integration
        parsedStack,
        topFrame,
        sourceLocation: topFrame?.relativeFilePath ? {
          file: topFrame.relativeFilePath,
          line: topFrame.lineNumber!,
          column: topFrame.columnNumber,
        } : undefined,
        callChain: parsedStack.callChain,
      });
      
      // ═══════════════════════════════════════════════════════════════
      // KERNEL INTEGRATION — Report UP to observation layer
      // ═══════════════════════════════════════════════════════════════
      // Kernel observes all errors for unified metrics, patterns, anomalies
      // This doesn't replace our DB/EventBus flow - it ADDS visibility
      const hook = getKernelHook();
      if (hook) {
        hook.error({
          errorId: result.errorId,
          fingerprint,
          category,
          severity,
          name: error.name,
          message: error.message,
          stack: error.stack,
          timestamp: new Date(),
          context: {
            correlationId: getCurrentCorrelationId(),
            service: context.service,
            operation: context.operation,
            userId: context.userId,
            guildId: context.guildId,
            commandName: context.commandName,
            sourceLocation: topFrame?.relativeFilePath ? `${topFrame.relativeFilePath}:${topFrame.lineNumber}` : undefined,
            callChain: parsedStack.callChain.slice(0, 5),
          },
        });
      }
      
      logger.error('error-tracker', 'persist', `   ✅ Persisted: ${result.errorId} (fingerprint: ${fingerprint.substring(0, 8)}...)`);
      
      // ============================================================
      // ERROR BRAIN INTEGRATION — Local Intelligence System
      // ============================================================
      // Feed error to Error Brain for pattern learning (async, non-blocking)
      // This enables: anomaly detection, cascade prediction, correlation analysis
      try {
        const severityLevel = severity === 'CRITICAL' ? 5 : severity === 'HIGH' ? 4 : severity === 'MEDIUM' ? 3 : 2;
        
        // Record error event for pattern learning
        ErrorBrain.recordError({
          fingerprint,
          timestamp: Date.now(),
          severity: severityLevel,
          correlationId: context.customData?.correlationId as string | undefined,
          userId: context.userId,
          component: context.service,
        });
        
        // Update impact weights for this error type
        ErrorBrain.updateImpactWeight(
          fingerprint,
          category,
          severity,
          this.estimateUserImpact(error, context) ?? 1,
          this.detectImpactedFeatures(error, context).length
        );
        
        // Check for anomalies (synchronous, <1μs)
        const anomaly = ErrorBrain.detectTimeAnomaly(fingerprint, result.occurrenceCount);
        if (anomaly.isAnomalous) {
          logger.warn('error-tracker', 'anomaly', `   🧠 [ErrorBrain] ANOMALY DETECTED: ${fingerprint.substring(0, 8)}... (Z-score: ${anomaly.zScore.toFixed(2)})`);
        }
        
        // Check for cascade prediction (synchronous, <10μs)
        const cascade = ErrorBrain.predictCascade(fingerprint);
        if (cascade && cascade.probability > 0.5) {
          logger.warn('error-tracker', 'cascade', `   🧠 [ErrorBrain] CASCADE RISK: ${(cascade.probability * 100).toFixed(0)}% chance of ${cascade.predictedChildren.length} downstream errors`);
        }
        
        // Log burst detection for high-frequency errors
        const burst = ErrorBrain.detectBurst({
          fingerprint,
          timestamp: Date.now(),
          severity: severityLevel,
        });
        if (burst.isBurst) {
          logger.warn('error-tracker', 'burst', `   🧠 [ErrorBrain] BURST DETECTED: ${burst.eventsPerSecond.toFixed(1)} errors/sec (${burst.burstMultiplier.toFixed(1)}x baseline)`);
        }
      } catch (brainError) {
        // Error Brain failures are non-critical — log and continue
        logger.warn('error-tracker', 'brain-error', '[ErrorTracker] Error Brain integration failed: ' + String(brainError));
      }
      
      // Generate AI-optimized error report (async, fire-and-forget)
      // Write to Store/error-reports/ for SSH analysis
      this.generateAndStoreAIReport(error, parsedStack, enrichedContext, fingerprint).catch((err: Error) => {
        logger.warn('error-tracker', 'report', '[ErrorTracker] AI report generation failed: ' + err.message);
      });
      
      // PHASE 2D: Persist stack frames for debugging/hotspot detection (async, fire-and-forget)
      this.persistCodeContext(result.errorId, parsedStack.frames).catch((err: Error) => {
        logger.warn('error-tracker', 'persist-context', '[ErrorTracker] Code context persistence failed: ' + err.message);
      });
      
      return result.errorId;
    } catch (captureError) {
      // CRITICAL: Even if database write fails, MUST log to console
      // This ensures ZERO false negatives - every error is visible somewhere
      logger.error('error-tracker', 'failure', '\n❌ [ERROR TRACKER FAILURE] Database write failed!');
      logger.error('error-tracker', 'failure', '   Capture Error: ' + String(captureError));
      logger.error('error-tracker', 'failure', '   Original Error: ' + String(error));
      logger.error('error-tracker', 'failure', '   Stack: ' + (error.stack || 'No stack trace'));
      logger.error('error-tracker', 'failure', '   Context: ' + JSON.stringify(context, null, 2));
      
      // Fallback: Write to emergency error log file (backup persistence)
      this.writeToEmergencyLog(error, context, captureError, parsedStack);
      
      return 'capture-failed';
    }
  }
  
  /**
   * Get error statistics for a time period
   */
  async getErrorStats(since?: Date): Promise<ErrorStats> {
    const sinceDate = since ?? daysAgo(1); // Default: last 24h
    
    const errors = await prisma.errorLog.findMany({
      where: {
        lastSeen: { gte: sinceDate },
      },
      select: {
        errorId: true,
        category: true,
        severity: true,
        occurrenceCount: true,
      },
    });
    
    const stats: ErrorStats = {
      totalUnique: errors.length,
      totalOccurrences: errors.reduce((sum, e) => sum + e.occurrenceCount, 0),
      bySeverity: {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
      },
      byCategory: {
        VALIDATION: 0,
        NETWORK: 0,
        DATABASE: 0,
        DISCORD: 0,
        ENGINE: 0,
        WORKER: 0,
        CONFIG: 0,
        CACHE: 0,
        UNKNOWN: 0,
      },
      criticalErrors: 0,
      errorRate: 0,
    };
    
    for (const error of errors) {
      stats.bySeverity[error.severity as ErrorSeverity] += error.occurrenceCount;
      stats.byCategory[error.category as ErrorCategory] += error.occurrenceCount;
      
      if (error.severity === 'CRITICAL') {
        stats.criticalErrors += error.occurrenceCount;
      }
    }
    
    // Calculate error rate (errors per hour)
    const hoursSince = (Date.now() - sinceDate.getTime()) / (1000 * 60 * 60);
    stats.errorRate = stats.totalOccurrences / hoursSince;
    
    return stats;
  }
  
  /**
   * Get recent errors with optional filters
   */
  async getRecentErrors(limit = 10, filters: ErrorFilters = {}): Promise<ErrorLog[]> {
    const where: any = {};
    
    if (filters.category) {
      where.category = filters.category;
    }
    
    if (filters.severity) {
      where.severity = filters.severity;
    }
    
    if (filters.since) {
      where.lastSeen = { gte: filters.since };
    }
    
    if (filters.fingerprint) {
      where.fingerprint = filters.fingerprint;
    }
    
    return prisma.errorLog.findMany({
      where,
      orderBy: { lastSeen: 'desc' },
      take: limit,
    });
  }
  
  /**
   * Get top errors by occurrence count
   */
  async getTopErrors(limit = 10, orderBy: 'count' | 'recent' = 'count'): Promise<ErrorLog[]> {
    return prisma.errorLog.findMany({
      orderBy: orderBy === 'count' 
        ? { occurrenceCount: 'desc' }
        : { lastSeen: 'desc' },
      take: limit,
    });
  }
  
  /**
   * Get error by fingerprint
   */
  async getErrorByFingerprint(fingerprint: string): Promise<ErrorLog | null> {
    return prisma.errorLog.findUnique({
      where: { fingerprint },
      include: { alerts: true },
    });
  }
  
  /**
   * Record recovery attempt and outcome.
   * @deprecated Use recordResolution() for full tracking with ErrorResolution table.
   * This method only updates ErrorLog counters without creating a learning record.
   */
  async recordRecoveryAttempt(
    errorId: string,
    strategy: string,
    success: boolean
  ): Promise<void> {
    await prisma.errorLog.update({
      where: { errorId },
      data: {
        recoveryAttempted: { increment: 1 },
        recoverySuccess: success ? { increment: 1 } : undefined,
        lastRecoveryStrategy: strategy,
        lastRecoveryOutcome: success ? 'success' : 'failed',
      },
    });
  }
  
  /**
   * Record a resolution attempt with full tracking to ErrorResolution table.
   * This creates a permanent learning record that enables strategy effectiveness analysis.
   * 
   * LEARNING INTEGRATION: Creates ErrorResolution record that feeds into:
   * - getEffectiveStrategies() for ranking strategies by success rate
   * - suggestMitigation() in ErrorLearning for intelligent recommendations
   * - Auto-remediation engine for eligible errors
   * 
   * @param params - Resolution parameters including strategy, outcome, timing
   * @returns The created ErrorResolution record ID
   */
  async recordResolution(params: ResolutionParams): Promise<string> {
    const {
      errorId,
      strategy,
      outcome,
      triggeredBy,
      durationMs,
      notes,
      contextData,
    } = params;
    
    try {
      // First verify the error exists
      const error = await prisma.errorLog.findUnique({
        where: { errorId },
        select: { errorId: true, fingerprint: true, category: true },
      });
      
      if (!error) {
        throw new Error(`Error not found: ${errorId}`);
      }
      
      const success = outcome === 'SUCCESS' || outcome === 'PARTIAL';
      
      // Create the resolution record
      const resolution = await prisma.errorResolution.create({
        data: {
          errorId,
          strategy,
          outcome,
          triggeredBy,
          durationMs,
          notes,
          contextData: contextData ? JSON.parse(JSON.stringify(contextData)) : undefined,
        },
      });
      
      // Also update the ErrorLog counters for backwards compatibility
      await prisma.errorLog.update({
        where: { errorId },
        data: {
          recoveryAttempted: { increment: 1 },
          recoverySuccess: success ? { increment: 1 } : undefined,
          lastRecoveryStrategy: strategy,
          lastRecoveryOutcome: success ? 'success' : 'failed',
        },
      });
      
      // ============================================================
      // ERROR BRAIN INTEGRATION — Learn from resolution outcome
      // ============================================================
      try {
        ErrorBrain.recordRecoveryOutcome(
          error.fingerprint,
          strategy,
          success,
          durationMs
        );
        logger.info('error-tracker', 'recovery', `   🧠 [ErrorBrain] Recovery outcome recorded: ${strategy} (${outcome})`);
      } catch (brainError) {
        // Error Brain failures are non-critical
        logger.warn('error-tracker', 'recovery', '[ErrorTracker] Error Brain recovery learning failed: ' + String(brainError));
      }
      
      logger.info('error-tracker', 'resolution', `[ErrorTracker] Resolution recorded: ${strategy} (${outcome}) for ${errorId.substring(0, 8)}...`);
      
      return resolution.resolutionId;
      
    } catch (error) {
      logger.error('error-tracker', 'resolution', `[ErrorTracker] Failed to record resolution: ${error}`);
      throw error;
    }
  }
  
  /**
   * Get effective strategies for a fingerprint based on ErrorResolution history.
   * Queries all resolution attempts and calculates success rates, confidence scores.
   * 
   * LEARNING OUTPUT: Returns strategies ranked by effectiveness:
   * - successRate: Historical success percentage
   * - confidence: Based on sample size (more data = higher confidence)
   * - recommendation: RECOMMENDED (>80% & >5 samples), CONSIDER (>50%), AVOID (<50%)
   * 
   * @param fingerprint - Error fingerprint to analyze
   * @returns Strategies sorted by effectiveness (best first)
   */
  async getEffectiveStrategies(fingerprint: string): Promise<EffectiveStrategy[]> {
    try {
      // Get the error by fingerprint
      const error = await prisma.errorLog.findUnique({
        where: { fingerprint },
        select: { errorId: true, category: true },
      });
      
      if (!error) {
        return [];
      }
      
      // Get all resolutions for this error
      const resolutions = await prisma.errorResolution.findMany({
        where: { errorId: error.errorId },
        select: {
          strategy: true,
          outcome: true,
          durationMs: true,
          attempted: true,
        },
      });
      
      if (resolutions.length === 0) {
        // Also check for resolutions from errors with same category
        const categoryErrors = await prisma.errorLog.findMany({
          where: { category: error.category },
          select: { errorId: true },
          take: 100,
        });
        
        const categoryResolutions = await prisma.errorResolution.findMany({
          where: { errorId: { in: categoryErrors.map(e => e.errorId) } },
          select: {
            strategy: true,
            outcome: true,
            durationMs: true,
            attempted: true,
          },
        });
        
        if (categoryResolutions.length === 0) {
          return [];
        }
        
        resolutions.push(...categoryResolutions);
      }
      
      // Aggregate by strategy
      const strategyMap = new Map<string, {
        successCount: number;
        totalCount: number;
        totalDurationMs: number;
        lastUsed: Date;
      }>();
      
      for (const r of resolutions) {
        const isSuccess = r.outcome === 'SUCCESS' || r.outcome === 'PARTIAL';
        const existing = strategyMap.get(r.strategy);
        if (existing) {
          existing.totalCount++;
          if (isSuccess) existing.successCount++;
          existing.totalDurationMs += r.durationMs ?? 0;
          if (r.attempted > existing.lastUsed) {
            existing.lastUsed = r.attempted;
          }
        } else {
          strategyMap.set(r.strategy, {
            successCount: isSuccess ? 1 : 0,
            totalCount: 1,
            totalDurationMs: r.durationMs ?? 0,
            lastUsed: r.attempted,
          });
        }
      }
      
      // Calculate effectiveness metrics
      const strategies: EffectiveStrategy[] = [];
      
      for (const [strategy, data] of strategyMap.entries()) {
        const successRate = data.successCount / data.totalCount;
        const avgExecutionMs = data.totalCount > 0 ? data.totalDurationMs / data.totalCount : 0;
        
        // Confidence based on sample size: 1 sample = 0.2, 5 samples = 1.0
        const confidence = Math.min(data.totalCount / 5, 1);
        
        // Recommendation based on success rate and confidence
        let recommendation: 'RECOMMENDED' | 'CONSIDER' | 'AVOID';
        if (successRate >= 0.8 && data.totalCount >= 5) {
          recommendation = 'RECOMMENDED';
        } else if (successRate >= 0.5) {
          recommendation = 'CONSIDER';
        } else {
          recommendation = 'AVOID';
        }
        
        strategies.push({
          strategy,
          successRate,
          avgExecutionMs,
          sampleSize: data.totalCount,
          lastUsed: data.lastUsed,
          confidence,
          recommendation,
        });
      }
      
      // Sort by effectiveness score (success rate * confidence)
      return strategies.sort((a, b) => {
        const aScore = a.successRate * a.confidence;
        const bScore = b.successRate * b.confidence;
        return bScore - aScore;
      });
      
    } catch (error) {
      logger.error('error-tracker', 'strategies', `[ErrorTracker] Failed to get effective strategies: ${error}`);
      throw error;
    }
  }
  
  /**
   * Update learning metadata for an error
   */
  async updateLearningMetadata(
    errorId: string,
    metadata: Partial<LearningMetadata>
  ): Promise<void> {
    const existing = await prisma.errorLog.findUnique({
      where: { errorId },
      select: { learningMetadata: true },
    });
    
    const merged = {
      ...(existing?.learningMetadata as any ?? {}),
      ...metadata,
      lastAnalyzedAt: new Date().toISOString(),
    };
    
    await prisma.errorLog.update({
      where: { errorId },
      data: { learningMetadata: merged as any },
    });
  }
  
  /// ---- Impact Estimation (Private Helpers) ----
  
  private detectImpactedFeatures(error: Error, context: ErrorContext): string[] {
    const features: Set<string> = new Set();
    
    // Detect from context
    if (context.commandName) {
      features.add(`commands.${context.commandName}`);
    }
    
    if (context.service) {
      features.add(context.service);
    }
    
    if (context.operation) {
      features.add(context.operation);
    }
    
    // Detect from error message
    const message = error.message.toLowerCase();
    if (message.includes('battle')) features.add('battles');
    if (message.includes('encounter')) features.add('encounters');
    if (message.includes('trainer')) features.add('trainer-ops');
    if (message.includes('database')) features.add('ALL-DATABASE-OPERATIONS');
    if (message.includes('discord')) features.add('discord-interactions');
    if (message.includes('cache')) features.add('cache-operations');
    
    return Array.from(features);
  }
  
  private estimateUserImpact(_error: Error, _context: ErrorContext): number | null {
    // FUTURE: Implement user impact estimation when guild analytics are available.
    // Would require: active user counts per guild, feature usage tracking.
    // Currently returns null (unknown impact).
    return null;
  }
  
  /**
   * Emit error to Event Bus for immediate logger visibility
   * CRITICAL: This must be non-blocking and fault-tolerant
   * 
   * Event routing: error.<severity> topics
   * - error.critical (CRITICAL errors)
   * - error.high (HIGH errors)
   * - error.medium (MEDIUM errors)
   * - error.low (LOW errors)
   * 
   * Features:
   * - Correlation ID tracking (UUID v4)
   * - Parent correlation chaining (from context.correlationId)
   * - Event replay buffer (last 100 errors)
   * - Pattern-based subscriptions (error.** for all errors)
   */
  private emitToEventBus(event: LiveErrorEvent): void {
    try {
      const bus = EventBus.getInstance();
      
      // Emit to error.<severity> topic
      const topic = `error.${event.severity.toLowerCase()}`;
      const correlationId = bus.emit(topic, {
        errorId: event.errorId,
        fingerprint: event.fingerprint,
        category: event.category,
        severity: event.severity,
        errorName: event.errorName,
        errorMessage: event.errorMessage,
        timestamp: event.timestamp,
        context: event.context,
        parsedStack: event.parsedStack,
        topFrame: event.topFrame,
        sourceLocation: event.sourceLocation,
        callChain: event.callChain,
      }, {
        emitter: 'error-tracker',
        parentCorrelationId: event.context?.correlationId, // Chain if exists
      });
      
      // Log correlation ID for debugging (minimal output to avoid noise)
      if (process.env.NODE_ENV === 'development') {
        logger.error('error-tracker', 'event-bus', `   🔗 Correlation: ${correlationId.substring(0, 8)}... → ${topic}`);
      }
    } catch (emitError) {
      // MUST NOT throw - Event Bus emission is optional enhancement
      logger.error('error-tracker', 'event-bus', '[ErrorTracker] Failed to emit to Event Bus: ' + String(emitError));
    }
  }
  
  /**
   * Generate AI-optimized error report and store to database
   * Runs in background (fire-and-forget) to avoid blocking error capture
   */
  private async generateAndStoreAIReport(
    error: Error,
    parsedStack: ParsedStackTrace,
    context: Record<string, any>,
    fingerprint: string
  ): Promise<void> {
    try {
      // Capture full error context snapshot
      const snapshot = await captureErrorContextSnapshot(error, {
        ...context,
        fingerprint,
      });
      
      // Generate AI-optimized report
      const report = formatErrorReportForAI(snapshot);
      
      // Store to database via resilient write buffer
      const shortFingerprint = fingerprint.substring(0, 12);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const cacheKey = `error-report:${shortFingerprint}:${timestamp}`;
      
      // Queue write for crash resilience
      await queueWrite({
        operationType: 'ai-report',
        payload: { key: cacheKey, report, fingerprint, context },
        idempotencyKey: cacheKey,
        execute: async (p) => {
          const data = p as { key: string; report: string; fingerprint: string; context: Record<string, unknown> };
          await prisma.cacheEntry.upsert({
            where: { key: data.key },
            update: {
              value: { report: data.report, fingerprint: data.fingerprint, context: data.context } as object,
              updatedAt: new Date(),
            },
            create: {
              key: data.key,
              namespace: 'error-reports',
              value: { report: data.report, fingerprint: data.fingerprint, context: data.context } as object,
              sizeBytes: data.report.length,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            },
          });
        },
      });
      
      logger.error('error-tracker', 'ai-report', `   📊 AI Report queued: db:error-reports/${cacheKey}`);
    } catch (reportError) {
      // Report generation failed - not critical
      logger.warn('error-tracker', 'ai-report', '[ErrorTracker] AI report generation failed: ' + String(reportError));
    }
  }
  
  // ============================================================================
  // PHASE 2D: ErrorCodeContext Integration — Stack Frame Persistence
  // ============================================================================
  
  /**
   * PHASE 2D: Persist stack frames to ErrorCodeContext table.
   * Enables "show me where this error occurred" queries and hotspot detection.
   * 
   * @param errorId - The error ID to associate frames with
   * @param frames - Parsed stack frames from stack-trace-parser
   * @param maxFrames - Maximum frames to persist (default: 10)
   * @returns Number of frames persisted
   */
  async persistCodeContext(
    errorId: string,
    frames: StackFrame[],
    maxFrames: number = 10
  ): Promise<number> {
    try {
      // Filter to user code frames only (skip node_modules and native)
      const userFrames = frames
        .filter(f => !f.isNodeModule && !f.isNative && f.filePath)
        .slice(0, maxFrames);
      
      if (userFrames.length === 0) {
        return 0;
      }
      
      // Batch insert all frames
      const contextRecords = userFrames.map((frame, index) => ({
        errorId,
        frameIndex: index,
        filePath: frame.relativeFilePath || frame.filePath || '',
        lineNumber: frame.lineNumber || 0,
        columnNumber: frame.columnNumber ?? null,
        functionName: frame.functionName,
        codeSnippet: frame.sourceSnippet 
          ? `${frame.sourceSnippet.before || ''}\n>>> ${frame.sourceSnippet.errorLine || ''}\n${frame.sourceSnippet.after || ''}`
          : null,
      }));
      
      // Queue write via resilient buffer for crash safety
      const idempotencyKey = `code-context:${errorId}`;
      await queueWrite({
        operationType: 'code-context',
        payload: { records: contextRecords },
        idempotencyKey,
        execute: async (p) => {
          const data = p as { records: typeof contextRecords };
          await prisma.errorCodeContext.createMany({
            data: data.records,
            skipDuplicates: true,
          });
        },
      });
      
      logger.info('error-tracker', 'persist-context', `[ErrorTracker] Queued ${contextRecords.length} stack frames for error ${errorId.substring(0, 8)}...`);
      return contextRecords.length;
      
    } catch (error) {
      logger.warn('error-tracker', 'persist-context', '[ErrorTracker] Failed to queue code context: ' + (error instanceof Error ? error.message : String(error)));
      return 0;
    }
  }
  
  /**
   * PHASE 2D: Get hotspots — files and lines with most errors.
   * Identifies error-prone code locations for refactoring priority.
   * 
   * @param limit - Maximum hotspots to return (default: 20)
   * @param minOccurrences - Minimum occurrences to qualify (default: 2)
   * @returns Hotspot locations sorted by error count
   */
  async getHotspots(
    limit: number = 20,
    minOccurrences: number = 2
  ): Promise<Array<{
    filePath: string;
    lineNumber: number;
    functionName: string | null;
    errorCount: number;
    errorIds: string[];
  }>> {
    try {
      // Group by file + line number
      const contexts = await prisma.errorCodeContext.findMany({
        where: {
          frameIndex: 0, // Top of stack only (actual error location)
        },
        select: {
          filePath: true,
          lineNumber: true,
          functionName: true,
          errorId: true,
        },
      });
      
      // Aggregate by location
      const locationMap = new Map<string, {
        filePath: string;
        lineNumber: number;
        functionName: string | null;
        errorIds: Set<string>;
      }>();
      
      for (const ctx of contexts) {
        const key = `${ctx.filePath}:${ctx.lineNumber}`;
        const existing = locationMap.get(key);
        if (existing) {
          existing.errorIds.add(ctx.errorId);
          // Keep first function name seen
        } else {
          locationMap.set(key, {
            filePath: ctx.filePath,
            lineNumber: ctx.lineNumber,
            functionName: ctx.functionName,
            errorIds: new Set([ctx.errorId]),
          });
        }
      }
      
      // Convert to array and filter by minOccurrences
      const hotspots = Array.from(locationMap.values())
        .filter(h => h.errorIds.size >= minOccurrences)
        .map(h => ({
          filePath: h.filePath,
          lineNumber: h.lineNumber,
          functionName: h.functionName,
          errorCount: h.errorIds.size,
          errorIds: Array.from(h.errorIds),
        }))
        .sort((a, b) => b.errorCount - a.errorCount)
        .slice(0, limit);
      
      return hotspots;
      
    } catch (error) {
      logger.error('error-tracker', 'hotspots', '[ErrorTracker] Failed to get hotspots: ' + (error instanceof Error ? error.message : String(error)));
      throw error;
    }
  }
  
  /**
   * PHASE 2D: Get full call chain for an error.
   * Reconstructs the execution path that led to the error.
   * 
   * @param errorId - The error ID to get call chain for
   * @returns Stack frames in order (0 = top of stack)
   */
  async getErrorCallChain(errorId: string): Promise<Array<{
    frameIndex: number;
    filePath: string;
    lineNumber: number;
    columnNumber: number | null;
    functionName: string | null;
    codeSnippet: string | null;
  }>> {
    try {
      const frames = await prisma.errorCodeContext.findMany({
        where: { errorId },
        orderBy: { frameIndex: 'asc' },
        select: {
          frameIndex: true,
          filePath: true,
          lineNumber: true,
          columnNumber: true,
          functionName: true,
          codeSnippet: true,
        },
      });
      
      return frames;
      
    } catch (error) {
      logger.error('error-tracker', 'call-chain', '[ErrorTracker] Failed to get call chain: ' + (error instanceof Error ? error.message : String(error)));
      throw error;
    }
  }
  
  /**
   * PHASE 2D: Get errors by file path.
   * Find all errors that occurred in a specific file.
   * 
   * @param filePath - File path to search (partial match supported)
   * @returns Error IDs and their locations in the file
   */
  async getErrorsByFile(filePath: string): Promise<Array<{
    errorId: string;
    lineNumber: number;
    functionName: string | null;
    frameIndex: number;
  }>> {
    try {
      const contexts = await prisma.errorCodeContext.findMany({
        where: {
          filePath: { contains: filePath },
        },
        select: {
          errorId: true,
          lineNumber: true,
          functionName: true,
          frameIndex: true,
        },
        orderBy: [
          { lineNumber: 'asc' },
          { frameIndex: 'asc' },
        ],
      });
      
      return contexts;
      
    } catch (error) {
      logger.error('error-tracker', 'errors-by-file', '[ErrorTracker] Failed to get errors by file: ' + (error instanceof Error ? error.message : String(error)));
      throw error;
    }
  }
  
  /**
   * PHASE 2D: Get function error statistics.
   * Find functions that have the most errors.
   * 
   * @param limit - Maximum functions to return (default: 20)
   * @returns Functions sorted by error count
   */
  async getFunctionErrorStats(limit: number = 20): Promise<Array<{
    functionName: string;
    errorCount: number;
    filePaths: string[];
  }>> {
    try {
      const contexts = await prisma.errorCodeContext.findMany({
        where: {
          functionName: { not: null },
          frameIndex: 0, // Top of stack only
        },
        select: {
          functionName: true,
          filePath: true,
          errorId: true,
        },
      });
      
      // Aggregate by function name
      const functionMap = new Map<string, {
        errorIds: Set<string>;
        filePaths: Set<string>;
      }>();
      
      for (const ctx of contexts) {
        if (!ctx.functionName) continue;
        const existing = functionMap.get(ctx.functionName);
        if (existing) {
          existing.errorIds.add(ctx.errorId);
          existing.filePaths.add(ctx.filePath);
        } else {
          functionMap.set(ctx.functionName, {
            errorIds: new Set([ctx.errorId]),
            filePaths: new Set([ctx.filePath]),
          });
        }
      }
      
      return Array.from(functionMap.entries())
        .map(([functionName, data]) => ({
          functionName,
          errorCount: data.errorIds.size,
          filePaths: Array.from(data.filePaths),
        }))
        .sort((a, b) => b.errorCount - a.errorCount)
        .slice(0, limit);
        
    } catch (error) {
      logger.error('error-tracker', 'function-stats', '[ErrorTracker] Failed to get function error stats: ' + (error instanceof Error ? error.message : String(error)));
      throw error;
    }
  }

  /**
   * Write error to emergency log as last-resort fallback
   * Uses resilient write buffer for crash safety
   * Stores to database - ensures ZERO false negatives even if main DB path fails
   */
  private async writeToEmergencyLog(
    error: Error,
    context: ErrorContext,
    captureError: unknown,
    parsedStack?: ParsedStackTrace
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const cacheKey = `emergency-error:${timestamp}`;
      
      const emergencyEntry = {
        timestamp: new Date().toISOString(),
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        context,
        captureError: captureError instanceof Error ? {
          name: captureError.name,
          message: captureError.message,
          stack: captureError.stack,
        } : String(captureError),
        nodeVersion: process.version,
        platform: process.platform,
        // Include parsed stack trace if available
        stackMetadata: parsedStack ? {
          depth: parsedStack.depth,
          topFrame: parsedStack.topFrame ? {
            file: parsedStack.topFrame.relativeFilePath || parsedStack.topFrame.filePath,
            line: parsedStack.topFrame.lineNumber,
            column: parsedStack.topFrame.columnNumber,
            function: parsedStack.topFrame.functionName,
          } : null,
          callChain: parsedStack.callChain,
        } : null,
      };
      
      // Use resilient buffer for crash safety
      await queueWrite({
        operationType: 'emergency-log',
        payload: { key: cacheKey, entry: emergencyEntry },
        idempotencyKey: cacheKey,
        execute: async (p) => {
          const data = p as { key: string; entry: object };
          await prisma.cacheEntry.create({
            data: {
              key: data.key,
              namespace: 'emergency-error-logs',
              value: data.entry,
              sizeBytes: JSON.stringify(data.entry).length,
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            },
          });
        },
      });
      
      logger.error('error-tracker', 'emergency', `   📝 Emergency log queued: db:emergency-error-logs/${cacheKey}`);
    } catch (fileError) {
      // Absolute last resort: just log to console
      logger.error('error-tracker', 'emergency', '[ErrorTracker] Emergency file write also failed: ' + String(fileError));
      logger.error('error-tracker', 'emergency', '[ErrorTracker] Error data: ' + JSON.stringify({
        error: { name: error.name, message: error.message },
        context,
      }, null, 2));
    }
  }
}

// Singleton instance
export const errorTracker = new ErrorTracker();

