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
 * 
 * @module services/error-tracker
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { toEasternLogFormat } from '../shared/datetime.js';
import { EventBus } from '../shared/event-bus.js';
import { prisma } from '../shared/prisma.js';
import { log } from '../utils/logger.js';
import type { ErrorLog, ErrorAlert } from '@prisma/client';
import {
  parseStackTrace,
  enrichStackFramesWithSource,
  captureErrorContextSnapshot,
  formatErrorReportForAI,
  type ParsedStackTrace,
  type ErrorContextSnapshot,
  type StackFrame,
} from '../utils/stack-trace-parser.js';

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
    // IMMEDIATE console output for live visibility (before any async operations)
    const timestamp = toEasternLogFormat();
    
    // Parse stack trace IMMEDIATELY (synchronous operation)
    const parsedStack = parseStackTrace(error);
    const topFrame = parsedStack.topFrame;
    
    // Enhanced logging output with source location
    log('error', `🚨 [ERROR CAPTURED] ${timestamp}`);
    log('error', `   Type: ${error.name}`);
    log('error', `   Message: ${error.message}`);
    if (topFrame?.relativeFilePath) {
      log('error', `   Location: ${topFrame.relativeFilePath}:${topFrame.lineNumber}:${topFrame.columnNumber}`);
      log('error', `   Function: ${topFrame.functionName || '<anonymous>'}`);
    }
    log('error', `   Call Chain: ${parsedStack.callChain.slice(0, 3).join(' → ')}`);
    log('error', `   Context: ${JSON.stringify({
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
        log('warn', '[ErrorTracker] Source enrichment failed: ' + err.message);
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
      
      log('error', `   ✅ Persisted: ${result.errorId} (fingerprint: ${fingerprint.substring(0, 8)}...)`);
      
      // Generate AI-optimized error report (async, fire-and-forget)
      // Write to Store/error-reports/ for SSH analysis
      this.generateAndStoreAIReport(error, parsedStack, enrichedContext, fingerprint).catch((err: Error) => {
        log('warn', '[ErrorTracker] AI report generation failed: ' + err.message);
      });
      
      return result.errorId;
    } catch (captureError) {
      // CRITICAL: Even if database write fails, MUST log to console
      // This ensures ZERO false negatives - every error is visible somewhere
      log('error', '\n❌ [ERROR TRACKER FAILURE] Database write failed!');
      log('error', '   Capture Error: ' + String(captureError));
      log('error', '   Original Error: ' + String(error));
      log('error', '   Stack: ' + (error.stack || 'No stack trace'));
      log('error', '   Context: ' + JSON.stringify(context, null, 2));
      
      // Fallback: Write to emergency error log file (backup persistence)
      this.writeToEmergencyLog(error, context, captureError, parsedStack);
      
      return 'capture-failed';
    }
  }
  
  /**
   * Get error statistics for a time period
   */
  async getErrorStats(since?: Date): Promise<ErrorStats> {
    const sinceDate = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24h
    
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
   * Record recovery attempt and outcome
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
  
  private estimateUserImpact(error: Error, context: ErrorContext): number | null {
    // TODO: Implement user impact estimation based on:
    // - Number of active users in affected guild
    // - Severity of error
    // - Scope of impacted features
    // For now, return null (unknown)
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
        log('error', `   🔗 Correlation: ${correlationId.substring(0, 8)}... → ${topic}`);
      }
    } catch (emitError) {
      // MUST NOT throw - Event Bus emission is optional enhancement
      log('error', '[ErrorTracker] Failed to emit to Event Bus: ' + String(emitError));
    }
  }
  
  /**
   * Generate AI-optimized error report and store to disk
   * Runs in background (fire-and-forget) to avoid blocking error capture
   */
  private async generateAndStoreAIReport(
    error: Error,
    parsedStack: ParsedStackTrace,
    context: Record<string, any>,
    fingerprint: string
  ): Promise<void> {
    try {
      const reportsDir = path.join(process.cwd(), 'Store', 'error-reports');
      await fs.mkdir(reportsDir, { recursive: true });
      
      // Capture full error context snapshot
      const snapshot = await captureErrorContextSnapshot(error, {
        ...context,
        fingerprint,
      });
      
      // Generate AI-optimized report
      const report = formatErrorReportForAI(snapshot);
      
      // Write to disk with fingerprint-based filename (for deduplication)
      const shortFingerprint = fingerprint.substring(0, 12);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `error-${shortFingerprint}-${timestamp}.md`;
      const filepath = path.join(reportsDir, filename);
      
      await fs.writeFile(filepath, report, 'utf-8');
      log('error', `   📊 AI Report: ${filepath}`);
    } catch (reportError) {
      // Report generation failed - not critical
      log('warn', '[ErrorTracker] AI report generation failed: ' + String(reportError));
    }
  }
  
  /**
   * Write error to emergency log file as last-resort fallback
   * Ensures ZERO false negatives even if database and live stream fail
   */
  private async writeToEmergencyLog(
    error: Error,
    context: ErrorContext,
    captureError: unknown,
    parsedStack?: ParsedStackTrace
  ): Promise<void> {
    try {
      const emergencyDir = path.join(process.cwd(), 'Store', 'emergency-error-logs');
      await fs.mkdir(emergencyDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `error-${timestamp}.json`;
      const filepath = path.join(emergencyDir, filename);
      
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
      
      await fs.writeFile(filepath, JSON.stringify(emergencyEntry, null, 2));
      log('error', `   📝 Emergency log written: ${filepath}`);
    } catch (fileError) {
      // Absolute last resort: just log to console
      log('error', '[ErrorTracker] Emergency file write also failed: ' + String(fileError));
      log('error', '[ErrorTracker] Error data: ' + JSON.stringify({
        error: { name: error.name, message: error.message },
        context,
      }, null, 2));
    }
  }
}

// Singleton instance
export const errorTracker = new ErrorTracker();
