/**
 * AI Report Generator
 * 
 * Generates AI-optimized reports for continuity, debugging, and optimization.
 * Designed to provide comprehensive context for AI agents to:
 * - Reconstruct session state
 * - Identify patterns and anomalies
 * - Generate actionable insights
 * - Learn from historical data
 * 
 * @module tools/ai-report-generator
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import type { LogEntry, LogLevel, LogCategory } from '../src/utils/intelligent-logger.js';

const gunzip = promisify(zlib.gunzip);

// ============================================================================
// Types
// ============================================================================

interface SessionContext {
  sessionId: string;
  startTime: string;
  endTime: string;
  duration: number; // seconds
  
  summary: {
    totalLogs: number;
    byLevel: Record<LogLevel, number>;
    byCategory: Record<LogCategory, number>;
    errors: ErrorSummary[];
    performance: PerformanceSummary;
  };
  
  timeline: TimelineEvent[];
  stateChanges: StateChange[];
  insights: Insight[];
}

interface ErrorSummary {
  fingerprint: string;
  name: string;
  message: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  severity: string;
  recoveryAttempts: number;
  recovered: boolean;
}

interface PerformanceSummary {
  avgDuration: number;
  p50: number;
  p95: number;
  p99: number;
  slowOperations: Array<{
    operation: string;
    duration: number;
    timestamp: string;
  }>;
}

interface TimelineEvent {
  timestamp: string;
  event: string;
  category: LogCategory;
  significance: number; // 0-100
  logId: string;
}

interface StateChange {
  timestamp: string;
  entity: string;
  before: any;
  after: any;
  logId: string;
}

interface Insight {
  type: InsightType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  evidence: {
    logIds: string[];
    metrics: Record<string, number>;
    timeline: Array<{ timestamp: string; event: string }>;
  };
  recommendations: Array<{
    action: string;
    rationale: string;
    priority: number;
    estimatedImpact: string;
  }>;
  confidence: number; // 0-100
}

type InsightType =
  | 'performance-degradation'
  | 'error-spike'
  | 'resource-exhaustion'
  | 'security-anomaly'
  | 'usage-pattern-change'
  | 'optimization-opportunity'
  | 'tech-debt';

// ============================================================================
// AI Report Generator Class
// ============================================================================

export class AIReportGenerator {
  private readonly logsDir: string;
  
  constructor(logsDir: string = path.join(process.cwd(), 'Store', 'logs')) {
    this.logsDir = logsDir;
  }
  
  /**
   * Generate comprehensive session context for AI continuity
   */
  async generateSessionContext(options: {
    since?: Date;
    until?: Date;
    userId?: string;
    sessionId?: string;
  }): Promise<SessionContext> {
    const logs = await this.loadLogs({
      since: options.since || new Date(Date.now() - 24 * 60 * 60 * 1000),
      until: options.until || new Date(),
      userId: options.userId,
    });
    
    const sessionId = options.sessionId || this.generateSessionId();
    const startTime = logs[0]?.timestamp || new Date().toISOString();
    const endTime = logs[logs.length - 1]?.timestamp || new Date().toISOString();
    const duration = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000;
    
    return {
      sessionId,
      startTime,
      endTime,
      duration,
      summary: this.generateSummary(logs),
      timeline: this.generateTimeline(logs),
      stateChanges: this.detectStateChanges(logs),
      insights: await this.generateInsights(logs),
    };
  }
  
  /**
   * Generate error analysis report
   */
  async generateErrorReport(options: {
    since?: Date;
    until?: Date;
  }): Promise<{
    uniqueErrors: number;
    totalOccurrences: number;
    errors: ErrorSummary[];
    patterns: string[];
    recommendations: string[];
  }> {
    const logs = await this.loadLogs({
      since: options.since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      until: options.until || new Date(),
      level: ['error', 'fatal'],
    });
    
    const errorMap = new Map<string, ErrorSummary>();
    
    for (const log of logs) {
      if (!log.context.error) continue;
      
      const fp = log.context.error.fingerprint;
      
      if (!errorMap.has(fp)) {
        errorMap.set(fp, {
          fingerprint: fp,
          name: log.context.error.name,
          message: log.context.error.message,
          occurrences: 0,
          firstSeen: log.timestamp,
          lastSeen: log.timestamp,
          severity: log.level === 'fatal' ? 'critical' : 'high',
          recoveryAttempts: 0,
          recovered: false,
        });
      }
      
      const error = errorMap.get(fp)!;
      error.occurrences++;
      error.lastSeen = log.timestamp;
      
      if (log.context.operation?.retryCount) {
        error.recoveryAttempts++;
        if (log.context.operation.success) {
          error.recovered = true;
        }
      }
    }
    
    const errors = Array.from(errorMap.values())
      .sort((a, b) => b.occurrences - a.occurrences);
    
    const patterns = this.detectErrorPatterns(logs);
    const recommendations = this.generateErrorRecommendations(errors, patterns);
    
    return {
      uniqueErrors: errorMap.size,
      totalOccurrences: logs.length,
      errors,
      patterns,
      recommendations,
    };
  }
  
  /**
   * Generate performance report
   */
  async generatePerformanceReport(options: {
    since?: Date;
    until?: Date;
    category?: LogCategory;
  }): Promise<PerformanceSummary> {
    const logs = await this.loadLogs({
      since: options.since || new Date(Date.now() - 24 * 60 * 60 * 1000),
      until: options.until || new Date(),
      category: options.category,
    });
    
    const durations: number[] = [];
    const slowOperations: PerformanceSummary['slowOperations'] = [];
    
    for (const log of logs) {
      if (log.context.operation?.duration) {
        durations.push(log.context.operation.duration);
        
        if (log.context.operation.duration > 500) {
          slowOperations.push({
            operation: log.context.operation.name,
            duration: log.context.operation.duration,
            timestamp: log.timestamp,
          });
        }
      }
    }
    
    if (durations.length === 0) {
      return {
        avgDuration: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        slowOperations: [],
      };
    }
    
    durations.sort((a, b) => a - b);
    
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const p50 = durations[Math.floor(durations.length * 0.50)];
    const p95 = durations[Math.floor(durations.length * 0.95)];
    const p99 = durations[Math.floor(durations.length * 0.99)];
    
    return {
      avgDuration: Math.round(avg),
      p50,
      p95,
      p99,
      slowOperations: slowOperations
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10),
    };
  }
  
  /**
   * Generate optimization opportunities report
   */
  async generateOptimizationReport(options: {
    since?: Date;
    until?: Date;
  }): Promise<{
    opportunities: Array<{
      type: string;
      description: string;
      impact: string;
      effort: string;
      priority: number;
      evidence: string[];
    }>;
  }> {
    const logs = await this.loadLogs({
      since: options.since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      until: options.until || new Date(),
    });
    
    const opportunities: any[] = [];
    
    // Detect slow queries
    const slowQueries = logs.filter(
      l => l.category === 'DATABASE' && 
      l.context.operation?.duration && 
      l.context.operation.duration > 500
    );
    
    if (slowQueries.length > 10) {
      opportunities.push({
        type: 'database-optimization',
        description: `${slowQueries.length} database queries exceed 500ms threshold`,
        impact: 'High - Affects user-facing operations',
        effort: 'Medium - Add indexes, optimize queries',
        priority: 90,
        evidence: slowQueries.map(l => l.id).slice(0, 5),
      });
    }
    
    // Detect frequent cache misses
    const cacheMisses = logs.filter(
      l => l.category === 'CACHE' && l.message.toLowerCase().includes('miss')
    );
    const cacheHits = logs.filter(
      l => l.category === 'CACHE' && l.message.toLowerCase().includes('hit')
    );
    
    if (cacheMisses.length > cacheHits.length * 0.5) {
      opportunities.push({
        type: 'cache-optimization',
        description: `Low cache hit rate (${Math.round(cacheHits.length / (cacheHits.length + cacheMisses.length) * 100)}%)`,
        impact: 'Medium - Increased database load',
        effort: 'Low - Adjust TTL or cache keys',
        priority: 70,
        evidence: cacheMisses.map(l => l.id).slice(0, 5),
      });
    }
    
    // Detect memory growth
    const memoryLogs = logs.filter(l => l.context.process?.memory);
    if (memoryLogs.length > 0) {
      const firstMemory = memoryLogs[0].context.process.memory.heapUsed;
      const lastMemory = memoryLogs[memoryLogs.length - 1].context.process.memory.heapUsed;
      const growth = (lastMemory - firstMemory) / firstMemory;
      
      if (growth > 0.3) { // 30% growth
        opportunities.push({
          type: 'memory-leak',
          description: `Memory usage increased by ${Math.round(growth * 100)}% over period`,
          impact: 'Critical - May cause OOM crashes',
          effort: 'High - Requires profiling and investigation',
          priority: 95,
          evidence: [memoryLogs[0].id, memoryLogs[memoryLogs.length - 1].id],
        });
      }
    }
    
    // Sort by priority
    opportunities.sort((a, b) => b.priority - a.priority);
    
    return { opportunities };
  }
  
  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------
  
  private async loadLogs(options: {
    since?: Date;
    until?: Date;
    level?: LogLevel | LogLevel[];
    category?: LogCategory | LogCategory[];
    userId?: string;
  }): Promise<LogEntry[]> {
    const logs: LogEntry[] = [];
    
    // Load from current log file
    const currentLog = path.join(this.logsDir, 'current.jsonl');
    if (await this.fileExists(currentLog)) {
      const content = await fs.readFile(currentLog, 'utf8');
      for (const line of content.split('\n')) {
        if (line.trim()) {
          try {
            const entry = JSON.parse(line) as LogEntry;
            if (this.matchesFilter(entry, options)) {
              logs.push(entry);
            }
          } catch (error) {
            // Skip invalid JSON lines
          }
        }
      }
    }
    
    // Load from hourly archives
    const hourlyDir = path.join(this.logsDir, 'hourly');
    if (await this.fileExists(hourlyDir)) {
      const files = await fs.readdir(hourlyDir);
      for (const file of files) {
        if (file.endsWith('.jsonl.gz')) {
          const filePath = path.join(hourlyDir, file);
          const compressed = await fs.readFile(filePath);
          const decompressed = await gunzip(compressed);
          const content = decompressed.toString('utf8');
          
          for (const line of content.split('\n')) {
            if (line.trim()) {
              try {
                const entry = JSON.parse(line) as LogEntry;
                if (this.matchesFilter(entry, options)) {
                  logs.push(entry);
                }
              } catch (error) {
                // Skip invalid JSON lines
              }
            }
          }
        }
      }
    }
    
    // Sort by timestamp
    logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    return logs;
  }
  
  private matchesFilter(entry: LogEntry, options: {
    since?: Date;
    until?: Date;
    level?: LogLevel | LogLevel[];
    category?: LogCategory | LogCategory[];
    userId?: string;
  }): boolean {
    const entryTime = new Date(entry.timestamp).getTime();
    
    if (options.since && entryTime < options.since.getTime()) {
      return false;
    }
    
    if (options.until && entryTime > options.until.getTime()) {
      return false;
    }
    
    if (options.level) {
      const levels = Array.isArray(options.level) ? options.level : [options.level];
      if (!levels.includes(entry.level)) {
        return false;
      }
    }
    
    if (options.category) {
      const categories = Array.isArray(options.category) ? options.category : [options.category];
      if (!categories.includes(entry.category)) {
        return false;
      }
    }
    
    if (options.userId && entry.context.user?.id !== options.userId) {
      return false;
    }
    
    return true;
  }
  
  private generateSummary(logs: LogEntry[]) {
    const byLevel: Partial<Record<LogLevel, number>> = {};
    const byCategory: Partial<Record<LogCategory, number>> = {};
    
    for (const log of logs) {
      byLevel[log.level] = (byLevel[log.level] || 0) + 1;
      byCategory[log.category] = (byCategory[log.category] || 0) + 1;
    }
    
    // Collect error summaries
    const errorMap = new Map<string, ErrorSummary>();
    
    for (const log of logs) {
      if (log.level === 'error' || log.level === 'fatal') {
        const fp = log.context.error?.fingerprint || 'unknown';
        
        if (!errorMap.has(fp)) {
          errorMap.set(fp, {
            fingerprint: fp,
            name: log.context.error?.name || 'Unknown',
            message: log.context.error?.message || log.message,
            occurrences: 0,
            firstSeen: log.timestamp,
            lastSeen: log.timestamp,
            severity: log.level,
            recoveryAttempts: 0,
            recovered: false,
          });
        }
        
        const error = errorMap.get(fp)!;
        error.occurrences++;
        error.lastSeen = log.timestamp;
      }
    }
    
    // Performance summary
    const durations: number[] = [];
    for (const log of logs) {
      if (log.context.operation?.duration) {
        durations.push(log.context.operation.duration);
      }
    }
    
    durations.sort((a, b) => a - b);
    const performance: PerformanceSummary = durations.length > 0 ? {
      avgDuration: Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length),
      p50: durations[Math.floor(durations.length * 0.50)] || 0,
      p95: durations[Math.floor(durations.length * 0.95)] || 0,
      p99: durations[Math.floor(durations.length * 0.99)] || 0,
      slowOperations: [],
    } : {
      avgDuration: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      slowOperations: [],
    };
    
    return {
      totalLogs: logs.length,
      byLevel: byLevel as Record<LogLevel, number>,
      byCategory: byCategory as Record<LogCategory, number>,
      errors: Array.from(errorMap.values()),
      performance,
    };
  }
  
  private generateTimeline(logs: LogEntry[]): TimelineEvent[] {
    return logs
      .map(log => ({
        timestamp: log.timestamp,
        event: log.message,
        category: log.category,
        significance: log.ai.importance,
        logId: log.id,
      }))
      .filter(e => e.significance > 50) // Only significant events
      .slice(0, 100); // Limit to 100 events
  }
  
  private detectStateChanges(logs: LogEntry[]): StateChange[] {
    const changes: StateChange[] = [];
    
    // Detect state changes from log data
    // This is a simplified implementation - would need domain knowledge
    for (const log of logs) {
      if (log.data && typeof log.data === 'object') {
        if ('before' in log.data && 'after' in log.data) {
          changes.push({
            timestamp: log.timestamp,
            entity: log.category.toLowerCase(),
            before: log.data.before,
            after: log.data.after,
            logId: log.id,
          });
        }
      }
    }
    
    return changes;
  }
  
  private async generateInsights(logs: LogEntry[]): Promise<Insight[]> {
    const insights: Insight[] = [];
    
    // Detect error spikes
    const errorsByHour = this.groupByHour(logs.filter(l => l.level === 'error' || l.level === 'fatal'));
    const avgErrorsPerHour = Object.values(errorsByHour).reduce((sum, count) => sum + count, 0) / Object.keys(errorsByHour).length;
    
    for (const [hour, count] of Object.entries(errorsByHour)) {
      if (count > avgErrorsPerHour * 2) {
        insights.push({
          type: 'error-spike',
          severity: 'high',
          title: `Error spike detected at ${hour}`,
          description: `${count} errors occurred (${Math.round((count / avgErrorsPerHour) * 100)}% above baseline)`,
          evidence: {
            logIds: [],
            metrics: { count, baseline: Math.round(avgErrorsPerHour) },
            timeline: [],
          },
          recommendations: [
            {
              action: 'Investigate root cause of error spike',
              rationale: 'Sudden increase in errors indicates system instability',
              priority: 9,
              estimatedImpact: 'Prevent cascading failures',
            },
          ],
          confidence: 85,
        });
      }
    }
    
    return insights;
  }
  
  private detectErrorPatterns(logs: LogEntry[]): string[] {
    const patterns: string[] = [];
    
    // Detect recurring error patterns
    const errorMessages = logs
      .filter(l => l.context.error)
      .map(l => l.context.error!.message);
    
    const messageCounts = new Map<string, number>();
    for (const msg of errorMessages) {
      messageCounts.set(msg, (messageCounts.get(msg) || 0) + 1);
    }
    
    for (const [msg, count] of messageCounts) {
      if (count > 5) {
        patterns.push(`Recurring error: "${msg}" (x${count})`);
      }
    }
    
    return patterns;
  }
  
  private generateErrorRecommendations(errors: ErrorSummary[], patterns: string[]): string[] {
    const recommendations: string[] = [];
    
    if (errors.length > 10) {
      recommendations.push('High error diversity detected - implement error categorization');
    }
    
    const criticalErrors = errors.filter(e => e.severity === 'critical');
    if (criticalErrors.length > 0) {
      recommendations.push(`${criticalErrors.length} critical errors require immediate attention`);
    }
    
    const unrecoveredErrors = errors.filter(e => !e.recovered && e.recoveryAttempts > 0);
    if (unrecoveredErrors.length > 0) {
      recommendations.push(`${unrecoveredErrors.length} errors failed to recover - review retry logic`);
    }
    
    return recommendations;
  }
  
  private groupByHour(logs: LogEntry[]): Record<string, number> {
    const groups: Record<string, number> = {};
    
    for (const log of logs) {
      const hour = new Date(log.timestamp).toISOString().slice(0, 13); // YYYY-MM-DDTHH
      groups[hour] = (groups[hour] || 0) + 1;
    }
    
    return groups;
  }
  
  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new AIReportGenerator();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'session': {
      const context = await generator.generateSessionContext({
        since: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      console.log(JSON.stringify(context, null, 2));
      break;
    }
    
    case 'errors': {
      const report = await generator.generateErrorReport({
        since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      });
      console.log(JSON.stringify(report, null, 2));
      break;
    }
    
    case 'performance': {
      const report = await generator.generatePerformanceReport({
        since: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      console.log(JSON.stringify(report, null, 2));
      break;
    }
    
    case 'optimize': {
      const report = await generator.generateOptimizationReport({
        since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      });
      console.log(JSON.stringify(report, null, 2));
      break;
    }
    
    default:
      console.log('Usage: node ai-report-generator.ts <command>');
      console.log('Commands: session, errors, performance, optimize');
      process.exit(1);
  }
}

export default AIReportGenerator;
