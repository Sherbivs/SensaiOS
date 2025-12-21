/**
 * Log Sampler - Reduce high-volume log events
 * @module shared/logging/log-sampler
 * 
 * Implements sampling for high-frequency events to reduce log volume
 * while preserving 100% of important events (WARN, ERROR, FATAL).
 * 
 * Features:
 * - Configurable sample rate (default 1:100 for INFO)
 * - Always keeps WARN, ERROR, FATAL
 * - Tracks sampling statistics
 * - Deterministic sampling based on message hash
 */

/* eslint-disable no-console */

/**
 * Log levels that should NEVER be sampled (always kept)
 */
const NEVER_SAMPLE_LEVELS = new Set(['warn', 'error', 'fatal', 'critical']);

/**
 * High-volume event patterns that should be sampled aggressively
 * These are regular operations that generate lots of logs
 */
const HIGH_VOLUME_PATTERNS: RegExp[] = [
  /walk.*encounter/i,
  /encounter.*check/i,
  /heartbeat/i,
  /cache.*hit/i,
  /cache.*refresh/i,
  /stats.*update/i,
  /health.*check/i,
  /ping/i,
  /keepalive/i,
  /scheduled.*task/i,
  /batch.*flush/i,
  /queue.*size/i,
];

/**
 * Events that should always be logged (100% sampling)
 */
const ALWAYS_LOG_PATTERNS: RegExp[] = [
  /battle.*start/i,
  /battle.*end/i,
  /catch.*success/i,
  /user.*register/i,
  /error/i,
  /fail/i,
  /exception/i,
  /startup/i,
  /shutdown/i,
  /deploy/i,
  /migration/i,
];

interface SamplerConfig {
  /** Default sample rate (1 = 100%, 0.01 = 1%) */
  defaultRate: number;
  /** Sample rate for high-volume events */
  highVolumeRate: number;
  /** Enable/disable sampling */
  enabled: boolean;
}

interface SamplerStats {
  totalEvents: number;
  sampledIn: number;
  sampledOut: number;
  byLevel: Record<string, { total: number; kept: number }>;
}

class LogSampler {
  private config: SamplerConfig;
  private stats: SamplerStats;
  private lastStatsLog: number = 0;
  private statsLogInterval: number = 60000; // Log stats every minute

  constructor() {
    this.config = {
      defaultRate: parseFloat(process.env.LOG_SAMPLE_RATE || '1'),
      highVolumeRate: parseFloat(process.env.LOG_SAMPLE_HIGH_VOLUME_RATE || '0.01'),
      enabled: process.env.LOG_SAMPLING_ENABLED !== 'false',
    };

    this.stats = {
      totalEvents: 0,
      sampledIn: 0,
      sampledOut: 0,
      byLevel: {},
    };

    if (this.config.enabled) {
      console.log(`[LogSampler] Initialized: defaultRate=${this.config.defaultRate}, highVolumeRate=${this.config.highVolumeRate}`);
    }
  }

  /**
   * Determine if a log entry should be kept or sampled out
   * @returns Object with shouldLog and sampled flag
   */
  shouldLog(level: string, message: string): { shouldLog: boolean; sampled: boolean } {
    this.stats.totalEvents++;
    this.updateLevelStats(level, false);

    // Always log if sampling is disabled
    if (!this.config.enabled) {
      return { shouldLog: true, sampled: false };
    }

    // Never sample important levels
    if (NEVER_SAMPLE_LEVELS.has(level.toLowerCase())) {
      this.stats.sampledIn++;
      this.updateLevelStats(level, true);
      return { shouldLog: true, sampled: false };
    }

    // Always log important events
    if (this.matchesPatterns(message, ALWAYS_LOG_PATTERNS)) {
      this.stats.sampledIn++;
      this.updateLevelStats(level, true);
      return { shouldLog: true, sampled: false };
    }

    // Determine sample rate based on message pattern
    const rate = this.matchesPatterns(message, HIGH_VOLUME_PATTERNS)
      ? this.config.highVolumeRate
      : this.config.defaultRate;

    // Use deterministic sampling based on message hash for consistency
    const shouldLog = this.deterministicSample(message, rate);

    if (shouldLog) {
      this.stats.sampledIn++;
      this.updateLevelStats(level, true);
    } else {
      this.stats.sampledOut++;
    }

    // Periodically log sampling stats
    this.maybeLogStats();

    return { shouldLog, sampled: rate < 1 };
  }

  /**
   * Deterministic sampling based on message hash
   * Same message will always be sampled the same way
   */
  private deterministicSample(message: string, rate: number): boolean {
    if (rate >= 1) return true;
    if (rate <= 0) return false;

    // Simple hash function for deterministic sampling
    let hash = 0;
    for (let i = 0; i < message.length; i++) {
      const char = message.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Normalize hash to 0-1 range and compare to rate
    const normalized = Math.abs(hash % 10000) / 10000;
    return normalized < rate;
  }

  /**
   * Check if message matches any patterns in the list
   */
  private matchesPatterns(message: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(message));
  }

  /**
   * Update per-level statistics
   */
  private updateLevelStats(level: string, kept: boolean): void {
    const normalized = level.toLowerCase();
    if (!this.stats.byLevel[normalized]) {
      this.stats.byLevel[normalized] = { total: 0, kept: 0 };
    }
    this.stats.byLevel[normalized].total++;
    if (kept) {
      this.stats.byLevel[normalized].kept++;
    }
  }

  /**
   * Log sampling statistics periodically
   */
  private maybeLogStats(): void {
    const now = Date.now();
    if (now - this.lastStatsLog < this.statsLogInterval) {
      return;
    }

    this.lastStatsLog = now;
    const reduction = this.stats.totalEvents > 0
      ? ((this.stats.sampledOut / this.stats.totalEvents) * 100).toFixed(1)
      : '0';

    console.log(`[LogSampler] Stats: total=${this.stats.totalEvents}, kept=${this.stats.sampledIn}, dropped=${this.stats.sampledOut}, reduction=${reduction}%`);
  }

  /**
   * Get current sampling statistics
   */
  getStats(): SamplerStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics (useful for testing)
   */
  resetStats(): void {
    this.stats = {
      totalEvents: 0,
      sampledIn: 0,
      sampledOut: 0,
      byLevel: {},
    };
  }

  /**
   * Update configuration at runtime
   */
  configure(config: Partial<SamplerConfig>): void {
    Object.assign(this.config, config);
    console.log(`[LogSampler] Reconfigured:`, this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): SamplerConfig {
    return { ...this.config };
  }
}

// Singleton instance
export const logSampler = new LogSampler();

/**
 * Convenience function to check if a log should be emitted
 */
export function shouldEmitLog(level: string, message: string): { shouldLog: boolean; sampled: boolean } {
  return logSampler.shouldLog(level, message);
}

/**
 * Get sampling statistics
 */
export function getSamplingStats(): SamplerStats {
  return logSampler.getStats();
}
