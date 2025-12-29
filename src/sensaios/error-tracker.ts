/**
 * SensaiOS Error Tracker — Deduplication & Trending
 * 
 * Tracks errors over time to:
 * - Deduplicate repeated errors (using fingerprint)
 * - Detect trending patterns (error bursts)
 * - Provide statistics for dashboards
 * - Support error analysis
 * 
 * @module sensaios/error-tracker
 * @since 2025-12-28
 */

import type { CanonicalError } from './canonical-error.js';
import type { ErrorCategory, ErrorSeverity } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Tracked error pattern
 */
export interface ErrorPattern {
  /** Error fingerprint */
  fingerprint: string;

  /** Error name */
  name: string;

  /** First line of error message */
  message: string;

  /** Error code */
  code: string;

  /** Error category */
  category: ErrorCategory;

  /** Highest severity seen */
  maxSeverity: ErrorSeverity;

  /** Number of occurrences */
  occurrences: number;

  /** First seen timestamp */
  firstSeen: string;

  /** Last seen timestamp */
  lastSeen: string;

  /** Average interval between occurrences (ms) */
  avgIntervalMs: number;

  /** Is this a recurring error (3+ occurrences)? */
  isRecurring: boolean;

  /** Is this a burst pattern (5+ in short window)? */
  isBurst: boolean;

  /** Tenants affected */
  affectedTenants: Set<string>;

  /** Components affected */
  affectedComponents: Set<string>;
}

/**
 * Error tracker configuration
 */
export interface ErrorTrackerConfig {
  /** Maximum patterns to track */
  maxPatterns: number;

  /** Window for burst detection (ms) */
  burstWindowMs: number;

  /** Threshold for burst detection */
  burstThreshold: number;

  /** Threshold for recurring detection */
  recurringThreshold: number;

  /** TTL for old patterns (ms) */
  patternTtlMs: number;
}

/**
 * Error tracker statistics
 */
export interface ErrorTrackerStats {
  /** Total errors tracked */
  totalErrors: number;

  /** Unique patterns */
  uniquePatterns: number;

  /** Recurring patterns */
  recurringPatterns: number;

  /** Burst patterns */
  burstPatterns: number;

  /** Errors by category */
  byCategory: Record<ErrorCategory, number>;

  /** Errors by severity */
  bySeverity: Record<ErrorSeverity, number>;

  /** Top patterns by occurrence */
  topPatterns: Array<{
    fingerprint: string;
    code: string;
    occurrences: number;
    lastSeen: string;
  }>;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: ErrorTrackerConfig = {
  maxPatterns: 500,
  burstWindowMs: 60_000, // 1 minute
  burstThreshold: 5,
  recurringThreshold: 3,
  patternTtlMs: 24 * 60 * 60 * 1000, // 24 hours
};

// ============================================================================
// SEVERITY COMPARISON
// ============================================================================

const SEVERITY_ORDER: Record<ErrorSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function maxSeverity(a: ErrorSeverity, b: ErrorSeverity): ErrorSeverity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

// ============================================================================
// ERROR TRACKER CLASS
// ============================================================================

/**
 * Error Tracker — Tracks and analyzes error patterns
 */
export class ErrorTracker {
  private config: ErrorTrackerConfig;
  private patterns: Map<string, ErrorPattern> = new Map();
  private recentErrors: Array<{ timestamp: number; fingerprint: string }> = [];
  private totalErrors = 0;

  constructor(config?: Partial<ErrorTrackerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Track an error
   */
  track(error: CanonicalError): ErrorPattern {
    this.totalErrors++;
    const now = Date.now();
    const timestamp = new Date(error.timestamp).getTime();

    // Update recent errors for burst detection
    this.recentErrors.push({ timestamp: now, fingerprint: error.fingerprint });
    this.pruneRecentErrors(now);

    // Check for existing pattern
    let pattern = this.patterns.get(error.fingerprint);

    if (pattern) {
      // Update existing pattern
      const intervalMs = timestamp - new Date(pattern.lastSeen).getTime();
      pattern.occurrences++;
      pattern.lastSeen = error.timestamp;
      pattern.avgIntervalMs =
        (pattern.avgIntervalMs * (pattern.occurrences - 1) + intervalMs) /
        pattern.occurrences;
      pattern.maxSeverity = maxSeverity(pattern.maxSeverity, error.severity);
      pattern.isRecurring = pattern.occurrences >= this.config.recurringThreshold;
      pattern.affectedTenants.add(error.scope.tenant);
      pattern.affectedComponents.add(error.scope.component);
    } else {
      // Create new pattern
      pattern = {
        fingerprint: error.fingerprint,
        name: error.name,
        message: error.message.split('\n')[0].substring(0, 100),
        code: error.code,
        category: error.category,
        maxSeverity: error.severity,
        occurrences: 1,
        firstSeen: error.timestamp,
        lastSeen: error.timestamp,
        avgIntervalMs: 0,
        isRecurring: false,
        isBurst: false,
        affectedTenants: new Set([error.scope.tenant]),
        affectedComponents: new Set([error.scope.component]),
      };

      // Evict oldest if at capacity
      if (this.patterns.size >= this.config.maxPatterns) {
        this.evictOldestPattern();
      }

      this.patterns.set(error.fingerprint, pattern);
    }

    // Check for burst
    pattern.isBurst = this.checkBurst(error.fingerprint, now);

    return pattern;
  }

  /**
   * Check if an error fingerprint is bursting
   */
  private checkBurst(fingerprint: string, now: number): boolean {
    const windowStart = now - this.config.burstWindowMs;
    const recentCount = this.recentErrors.filter(
      (e) => e.fingerprint === fingerprint && e.timestamp >= windowStart
    ).length;
    return recentCount >= this.config.burstThreshold;
  }

  /**
   * Prune old entries from recent errors
   */
  private pruneRecentErrors(now: number): void {
    const windowStart = now - this.config.burstWindowMs;
    while (
      this.recentErrors.length > 0 &&
      this.recentErrors[0].timestamp < windowStart
    ) {
      this.recentErrors.shift();
    }
  }

  /**
   * Evict the oldest pattern
   */
  private evictOldestPattern(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, pattern] of this.patterns) {
      const time = new Date(pattern.lastSeen).getTime();
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.patterns.delete(oldestKey);
    }
  }

  /**
   * Get pattern by fingerprint
   */
  getPattern(fingerprint: string): ErrorPattern | undefined {
    return this.patterns.get(fingerprint);
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): ErrorPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get recurring patterns
   */
  getRecurringPatterns(): ErrorPattern[] {
    return this.getAllPatterns().filter((p) => p.isRecurring);
  }

  /**
   * Get burst patterns
   */
  getBurstPatterns(): ErrorPattern[] {
    return this.getAllPatterns().filter((p) => p.isBurst);
  }

  /**
   * Get top patterns by occurrence
   */
  getTopPatterns(limit: number = 10): ErrorPattern[] {
    return this.getAllPatterns()
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, limit);
  }

  /**
   * Get patterns by category
   */
  getPatternsByCategory(category: ErrorCategory): ErrorPattern[] {
    return this.getAllPatterns().filter((p) => p.category === category);
  }

  /**
   * Get patterns affecting a tenant
   */
  getPatternsByTenant(tenant: string): ErrorPattern[] {
    return this.getAllPatterns().filter((p) => p.affectedTenants.has(tenant));
  }

  /**
   * Get tracker statistics
   */
  getStats(): ErrorTrackerStats {
    const patterns = this.getAllPatterns();

    const byCategory: Record<ErrorCategory, number> = {
      validation: 0,
      database: 0,
      network: 0,
      auth: 0,
      game: 0,
      discord: 0,
      worker: 0,
      system: 0,
      unknown: 0,
    };

    const bySeverity: Record<ErrorSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const pattern of patterns) {
      byCategory[pattern.category] += pattern.occurrences;
      bySeverity[pattern.maxSeverity] += pattern.occurrences;
    }

    return {
      totalErrors: this.totalErrors,
      uniquePatterns: patterns.length,
      recurringPatterns: patterns.filter((p) => p.isRecurring).length,
      burstPatterns: patterns.filter((p) => p.isBurst).length,
      byCategory,
      bySeverity,
      topPatterns: this.getTopPatterns(10).map((p) => ({
        fingerprint: p.fingerprint,
        code: p.code,
        occurrences: p.occurrences,
        lastSeen: p.lastSeen,
      })),
    };
  }

  /**
   * Clear expired patterns
   */
  cleanup(): number {
    const now = Date.now();
    const expireTime = now - this.config.patternTtlMs;
    let removed = 0;

    for (const [key, pattern] of this.patterns) {
      if (new Date(pattern.lastSeen).getTime() < expireTime) {
        this.patterns.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Reset the tracker
   */
  reset(): void {
    this.patterns.clear();
    this.recentErrors = [];
    this.totalErrors = 0;
  }

  /**
   * Get serializable state for persistence
   */
  getState(): {
    patterns: Array<Omit<ErrorPattern, 'affectedTenants' | 'affectedComponents'> & {
      affectedTenants: string[];
      affectedComponents: string[];
    }>;
    totalErrors: number;
  } {
    return {
      patterns: this.getAllPatterns().map((p) => ({
        ...p,
        affectedTenants: Array.from(p.affectedTenants),
        affectedComponents: Array.from(p.affectedComponents),
      })),
      totalErrors: this.totalErrors,
    };
  }

  /**
   * Restore state from persistence
   */
  restoreState(state: ReturnType<ErrorTracker['getState']>): void {
    this.patterns.clear();
    this.totalErrors = state.totalErrors;

    for (const p of state.patterns) {
      this.patterns.set(p.fingerprint, {
        ...p,
        affectedTenants: new Set(p.affectedTenants),
        affectedComponents: new Set(p.affectedComponents),
      });
    }
  }
}

// ============================================================================
// SINGLETON TRACKER
// ============================================================================

/** Global error tracker instance */
let globalTracker: ErrorTracker | null = null;

/**
 * Get the global error tracker
 */
export function getErrorTracker(): ErrorTracker {
  if (!globalTracker) {
    globalTracker = new ErrorTracker();
  }
  return globalTracker;
}

/**
 * Initialize the global error tracker with custom config
 */
export function initializeErrorTracker(
  config?: Partial<ErrorTrackerConfig>
): ErrorTracker {
  globalTracker = new ErrorTracker(config);
  return globalTracker;
}

/**
 * Track an error using the global tracker
 */
export function trackError(error: CanonicalError): ErrorPattern {
  return getErrorTracker().track(error);
}
