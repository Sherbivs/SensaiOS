/**
 * Kernel Log Sampling — Volume Control for High-Traffic Logs
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * RATE LIMITING AND SAMPLING FOR NOISY COMPONENTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Provides intelligent log sampling to prevent log floods while maintaining
 * visibility into system behavior. Essential for production where some
 * components may emit thousands of logs per second.
 * 
 * SAMPLING STRATEGIES:
 * 
 * 1. RATE_LIMIT — Maximum N logs per time window per component
 * 2. SAMPLE — Accept 1 in N logs (deterministic or probabilistic)
 * 3. FIRST_N — Accept first N logs, then sample
 * 4. ADAPTIVE — Adjust sampling rate based on log volume
 * 5. DEDUP — Deduplicate identical messages within window
 * 
 * USAGE:
 * 
 * // Configure rate limit for noisy component
 * configureSampling('cache-refresh', { strategy: 'RATE_LIMIT', maxPerWindow: 10, windowMs: 1000 });
 * 
 * // Configure sampling for high-volume component
 * configureSampling('discord-events', { strategy: 'SAMPLE', sampleRate: 0.01 }); // 1%
 * 
 * // Check if log should be emitted
 * if (shouldLog('cache-refresh', 'refreshed key: abc')) {
 *   kernel.debug('cache-refresh', 'refreshed key: abc');
 * }
 * 
 * // Or use auto-sampling wrapper
 * const sampledLog = createSampledLogger('cache-refresh', kernel);
 * sampledLog.debug('refreshed key: abc'); // Automatically sampled
 * 
 * @module kernel/log-sampling
 */

import type { KernelLogLevel } from './kernel-logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Sampling strategy type
 */
export type SamplingStrategy = 
  | 'RATE_LIMIT'  // Maximum N logs per window
  | 'SAMPLE'      // Accept 1 in N logs
  | 'FIRST_N'     // Accept first N, then sample
  | 'ADAPTIVE'    // Auto-adjust based on volume
  | 'DEDUP';      // Deduplicate identical messages

/**
 * Sampling configuration for a component
 */
export interface SamplingConfig {
  /** Sampling strategy to use */
  strategy: SamplingStrategy;
  
  /** For RATE_LIMIT: max logs per window */
  maxPerWindow?: number;
  
  /** For RATE_LIMIT: window duration in milliseconds */
  windowMs?: number;
  
  /** For SAMPLE: fraction of logs to keep (0.0 - 1.0) */
  sampleRate?: number;
  
  /** For FIRST_N: number of logs to accept before sampling */
  firstN?: number;
  
  /** For DEDUP: deduplication window in milliseconds */
  dedupWindowMs?: number;
  
  /** For ADAPTIVE: target logs per second */
  targetLogsPerSec?: number;
  
  /** Log levels to apply sampling to (default: all except ERROR, FATAL) */
  appliesTo?: KernelLogLevel[];
  
  /** Whether sampling is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Internal state for tracking sampling
 */
interface SamplingState {
  /** Current window start time */
  windowStart: number;
  
  /** Logs emitted in current window */
  logsInWindow: number;
  
  /** Total logs seen (for SAMPLE counter) */
  totalSeen: number;
  
  /** Total logs emitted */
  totalEmitted: number;
  
  /** Total logs dropped */
  totalDropped: number;
  
  /** For FIRST_N: whether we've passed first N */
  firstNComplete: boolean;
  
  /** For DEDUP: recent message hashes */
  recentHashes: Map<string, number>; // hash -> last seen timestamp
  
  /** For ADAPTIVE: current sample rate */
  adaptiveRate: number;
  
  /** For ADAPTIVE: last rate adjustment time */
  lastAdaptiveAdjust: number;
}

/**
 * Sampling decision result
 */
export interface SamplingDecision {
  /** Whether the log should be emitted */
  shouldLog: boolean;
  
  /** Reason for the decision */
  reason: 'allowed' | 'rate_limited' | 'sampled_out' | 'deduplicated' | 'level_exempt';
  
  /** Current drop rate for this component */
  dropRate: number;
  
  /** Number of similar logs suppressed (for summary messages) */
  suppressedCount: number;
}

/**
 * Sampling statistics
 */
export interface SamplingStats {
  /** Total decisions made */
  totalDecisions: number;
  
  /** Total logs allowed */
  totalAllowed: number;
  
  /** Total logs dropped */
  totalDropped: number;
  
  /** Overall drop rate */
  overallDropRate: number;
  
  /** Per-component stats */
  byComponent: Map<string, ComponentSamplingStats>;
}

/**
 * Per-component sampling statistics
 */
export interface ComponentSamplingStats {
  /** Component name */
  component: string;
  
  /** Active sampling strategy */
  strategy: SamplingStrategy;
  
  /** Total logs seen */
  totalSeen: number;
  
  /** Total logs emitted */
  totalEmitted: number;
  
  /** Total logs dropped */
  totalDropped: number;
  
  /** Drop rate (0.0 - 1.0) */
  dropRate: number;
  
  /** Current effective sample rate */
  effectiveSampleRate: number;
}

// ============================================================================
// STATE
// ============================================================================

/** Sampling configurations by component */
const configs = new Map<string, SamplingConfig>();

/** Sampling state by component */
const states = new Map<string, SamplingState>();

/** Default config for unconfigured components */
let defaultConfig: SamplingConfig | null = null;

/** Global sampling enabled flag */
let samplingEnabled = true;

/** Levels that are never sampled (always emitted) */
const EXEMPT_LEVELS: KernelLogLevel[] = ['ERROR', 'CRITICAL', 'KERNEL'];

/** Global stats */
const globalStats = {
  totalDecisions: 0,
  totalAllowed: 0,
  totalDropped: 0,
};

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configure sampling for a specific component
 */
export function configureSampling(component: string, config: SamplingConfig): void {
  configs.set(component, config);
  
  // Initialize state if not exists
  if (!states.has(component)) {
    states.set(component, createInitialState());
  }
}

/**
 * Remove sampling configuration for a component
 */
export function removeSamplingConfig(component: string): void {
  configs.delete(component);
  states.delete(component);
}

/**
 * Set default sampling config for unconfigured components
 */
export function setDefaultSamplingConfig(config: SamplingConfig | null): void {
  defaultConfig = config;
}

/**
 * Get sampling config for a component
 */
export function getSamplingConfig(component: string): SamplingConfig | null {
  return configs.get(component) ?? defaultConfig;
}

/**
 * Enable or disable global sampling
 */
export function setSamplingEnabled(enabled: boolean): void {
  samplingEnabled = enabled;
}

/**
 * Check if sampling is globally enabled
 */
export function isSamplingEnabled(): boolean {
  return samplingEnabled;
}

// ============================================================================
// CORE SAMPLING LOGIC
// ============================================================================

/**
 * Create initial state for a component
 */
function createInitialState(): SamplingState {
  return {
    windowStart: Date.now(),
    logsInWindow: 0,
    totalSeen: 0,
    totalEmitted: 0,
    totalDropped: 0,
    firstNComplete: false,
    recentHashes: new Map(),
    adaptiveRate: 1.0,
    lastAdaptiveAdjust: Date.now(),
  };
}

/**
 * Get or create state for a component
 */
function getState(component: string): SamplingState {
  let state = states.get(component);
  if (!state) {
    state = createInitialState();
    states.set(component, state);
  }
  return state;
}

/**
 * Simple hash function for deduplication
 */
function hashMessage(message: string): string {
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    const char = message.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}

/**
 * Check if a log should be emitted based on sampling rules
 */
export function shouldLog(
  component: string,
  message: string,
  level: KernelLogLevel = 'INFO'
): SamplingDecision {
  globalStats.totalDecisions++;
  
  // If sampling disabled, allow all
  if (!samplingEnabled) {
    globalStats.totalAllowed++;
    return { shouldLog: true, reason: 'allowed', dropRate: 0, suppressedCount: 0 };
  }
  
  // Exempt levels always pass
  if (EXEMPT_LEVELS.includes(level)) {
    globalStats.totalAllowed++;
    return { shouldLog: true, reason: 'level_exempt', dropRate: 0, suppressedCount: 0 };
  }
  
  // Get config (component-specific or default)
  const config = configs.get(component) ?? defaultConfig;
  
  // No config means allow all
  if (!config || config.enabled === false) {
    globalStats.totalAllowed++;
    return { shouldLog: true, reason: 'allowed', dropRate: 0, suppressedCount: 0 };
  }
  
  // Check if level is covered by this config
  if (config.appliesTo && !config.appliesTo.includes(level)) {
    globalStats.totalAllowed++;
    return { shouldLog: true, reason: 'level_exempt', dropRate: 0, suppressedCount: 0 };
  }
  
  // Get state for this component
  const state = getState(component);
  const now = Date.now();
  
  // Track this log
  state.totalSeen++;
  
  // Apply sampling strategy
  let decision: SamplingDecision;
  
  switch (config.strategy) {
    case 'RATE_LIMIT':
      decision = applyRateLimit(state, config, now);
      break;
    case 'SAMPLE':
      decision = applySample(state, config);
      break;
    case 'FIRST_N':
      decision = applyFirstN(state, config);
      break;
    case 'ADAPTIVE':
      decision = applyAdaptive(state, config, now);
      break;
    case 'DEDUP':
      decision = applyDedup(state, config, message, now);
      break;
    default:
      decision = { shouldLog: true, reason: 'allowed', dropRate: 0, suppressedCount: 0 };
  }
  
  // Update stats
  if (decision.shouldLog) {
    state.totalEmitted++;
    globalStats.totalAllowed++;
  } else {
    state.totalDropped++;
    globalStats.totalDropped++;
  }
  
  // Calculate drop rate
  decision.dropRate = state.totalSeen > 0 
    ? state.totalDropped / state.totalSeen 
    : 0;
  decision.suppressedCount = state.totalDropped;
  
  return decision;
}

/**
 * Apply RATE_LIMIT strategy
 */
function applyRateLimit(state: SamplingState, config: SamplingConfig, now: number): SamplingDecision {
  const windowMs = config.windowMs ?? 1000;
  const maxPerWindow = config.maxPerWindow ?? 100;
  
  // Check if window has expired
  if (now - state.windowStart >= windowMs) {
    // Start new window
    state.windowStart = now;
    state.logsInWindow = 0;
  }
  
  // Check if under limit
  if (state.logsInWindow < maxPerWindow) {
    state.logsInWindow++;
    return { shouldLog: true, reason: 'allowed', dropRate: 0, suppressedCount: 0 };
  }
  
  return { shouldLog: false, reason: 'rate_limited', dropRate: 0, suppressedCount: 0 };
}

/**
 * Apply SAMPLE strategy (probabilistic or deterministic)
 */
function applySample(state: SamplingState, config: SamplingConfig): SamplingDecision {
  const sampleRate = config.sampleRate ?? 0.1;
  
  // Deterministic: use counter
  // Accept every Nth log where N = 1/sampleRate
  const interval = Math.max(1, Math.floor(1 / sampleRate));
  
  if (state.totalSeen % interval === 0) {
    return { shouldLog: true, reason: 'allowed', dropRate: 0, suppressedCount: 0 };
  }
  
  return { shouldLog: false, reason: 'sampled_out', dropRate: 0, suppressedCount: 0 };
}

/**
 * Apply FIRST_N strategy
 */
function applyFirstN(state: SamplingState, config: SamplingConfig): SamplingDecision {
  const firstN = config.firstN ?? 100;
  const sampleRate = config.sampleRate ?? 0.01;
  
  // Accept first N logs
  if (state.totalSeen <= firstN) {
    return { shouldLog: true, reason: 'allowed', dropRate: 0, suppressedCount: 0 };
  }
  
  // After first N, sample
  state.firstNComplete = true;
  const interval = Math.max(1, Math.floor(1 / sampleRate));
  
  if ((state.totalSeen - firstN) % interval === 0) {
    return { shouldLog: true, reason: 'allowed', dropRate: 0, suppressedCount: 0 };
  }
  
  return { shouldLog: false, reason: 'sampled_out', dropRate: 0, suppressedCount: 0 };
}

/**
 * Apply ADAPTIVE strategy
 */
function applyAdaptive(state: SamplingState, config: SamplingConfig, now: number): SamplingDecision {
  const targetLogsPerSec = config.targetLogsPerSec ?? 100;
  const adjustInterval = 1000; // Adjust every second
  
  // Adjust rate periodically
  if (now - state.lastAdaptiveAdjust >= adjustInterval) {
    const elapsed = (now - state.lastAdaptiveAdjust) / 1000;
    const actualRate = state.logsInWindow / elapsed;
    
    if (actualRate > targetLogsPerSec * 1.5) {
      // Too many logs, decrease rate
      state.adaptiveRate = Math.max(0.001, state.adaptiveRate * 0.5);
    } else if (actualRate < targetLogsPerSec * 0.5) {
      // Too few logs, increase rate
      state.adaptiveRate = Math.min(1.0, state.adaptiveRate * 2.0);
    }
    
    state.lastAdaptiveAdjust = now;
    state.logsInWindow = 0;
  }
  
  state.logsInWindow++;
  
  // Sample based on adaptive rate
  const interval = Math.max(1, Math.floor(1 / state.adaptiveRate));
  
  if (state.totalSeen % interval === 0) {
    return { shouldLog: true, reason: 'allowed', dropRate: 0, suppressedCount: 0 };
  }
  
  return { shouldLog: false, reason: 'sampled_out', dropRate: 0, suppressedCount: 0 };
}

/**
 * Apply DEDUP strategy
 */
function applyDedup(
  state: SamplingState, 
  config: SamplingConfig, 
  message: string, 
  now: number
): SamplingDecision {
  const windowMs = config.dedupWindowMs ?? 5000;
  const hash = hashMessage(message);
  
  // Clean old hashes
  for (const [h, timestamp] of state.recentHashes) {
    if (now - timestamp > windowMs) {
      state.recentHashes.delete(h);
    }
  }
  
  // Check if we've seen this message recently
  if (state.recentHashes.has(hash)) {
    return { shouldLog: false, reason: 'deduplicated', dropRate: 0, suppressedCount: 0 };
  }
  
  // Record this message
  state.recentHashes.set(hash, now);
  return { shouldLog: true, reason: 'allowed', dropRate: 0, suppressedCount: 0 };
}

// ============================================================================
// SAMPLED LOGGER WRAPPER
// ============================================================================

/**
 * Kernel-like logger interface
 */
interface KernelLoggerLike {
  debug(component: string, message: string, data?: unknown): void;
  info(component: string, message: string, data?: unknown): void;
  warn(component: string, message: string, data?: unknown): void;
  error(component: string, message: string, data?: unknown): void;
  critical(component: string, message: string, data?: unknown): void;
}

/**
 * Sampled logger interface
 */
export interface SampledLogger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  critical(message: string, data?: unknown): void;
  getDropRate(): number;
  getSuppressedCount(): number;
}

/**
 * Create a sampled logger wrapper for a specific component
 */
export function createSampledLogger(
  component: string,
  kernelLogger: KernelLoggerLike
): SampledLogger {
  let lastDecision: SamplingDecision = { 
    shouldLog: true, 
    reason: 'allowed', 
    dropRate: 0, 
    suppressedCount: 0 
  };
  
  const log = (level: KernelLogLevel, method: keyof KernelLoggerLike) => 
    (message: string, data?: unknown): void => {
      const decision = shouldLog(component, message, level);
      lastDecision = decision;
      
      if (decision.shouldLog) {
        kernelLogger[method](component, message, data);
      }
    };
  
  return {
    debug: log('DEBUG', 'debug'),
    info: log('INFO', 'info'),
    warn: log('WARN', 'warn'),
    error: log('ERROR', 'error'),
    critical: log('CRITICAL', 'critical'),
    getDropRate: () => lastDecision.dropRate,
    getSuppressedCount: () => lastDecision.suppressedCount,
  };
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get sampling statistics
 */
export function getSamplingStats(): SamplingStats {
  const byComponent = new Map<string, ComponentSamplingStats>();
  
  for (const [component, config] of configs) {
    const state = states.get(component) ?? createInitialState();
    
    byComponent.set(component, {
      component,
      strategy: config.strategy,
      totalSeen: state.totalSeen,
      totalEmitted: state.totalEmitted,
      totalDropped: state.totalDropped,
      dropRate: state.totalSeen > 0 ? state.totalDropped / state.totalSeen : 0,
      effectiveSampleRate: state.totalSeen > 0 ? state.totalEmitted / state.totalSeen : 1.0,
    });
  }
  
  return {
    totalDecisions: globalStats.totalDecisions,
    totalAllowed: globalStats.totalAllowed,
    totalDropped: globalStats.totalDropped,
    overallDropRate: globalStats.totalDecisions > 0 
      ? globalStats.totalDropped / globalStats.totalDecisions 
      : 0,
    byComponent,
  };
}

/**
 * Get component-specific stats
 */
export function getComponentSamplingStats(component: string): ComponentSamplingStats | null {
  const config = configs.get(component);
  const state = states.get(component);
  
  if (!config || !state) {
    return null;
  }
  
  return {
    component,
    strategy: config.strategy,
    totalSeen: state.totalSeen,
    totalEmitted: state.totalEmitted,
    totalDropped: state.totalDropped,
    dropRate: state.totalSeen > 0 ? state.totalDropped / state.totalSeen : 0,
    effectiveSampleRate: state.totalSeen > 0 ? state.totalEmitted / state.totalSeen : 1.0,
  };
}

/**
 * Reset all sampling statistics
 */
export function resetSamplingStats(): void {
  globalStats.totalDecisions = 0;
  globalStats.totalAllowed = 0;
  globalStats.totalDropped = 0;
  
  for (const state of states.values()) {
    state.windowStart = Date.now();
    state.logsInWindow = 0;
    state.totalSeen = 0;
    state.totalEmitted = 0;
    state.totalDropped = 0;
    state.firstNComplete = false;
    state.recentHashes.clear();
    state.adaptiveRate = 1.0;
    state.lastAdaptiveAdjust = Date.now();
  }
}

/**
 * Clear all sampling configurations
 */
export function clearSamplingConfigs(): void {
  configs.clear();
  states.clear();
  defaultConfig = null;
}

// ============================================================================
// CONVENIENCE PRESETS
// ============================================================================

/**
 * Common sampling presets
 */
export const SamplingPresets = {
  /** High-volume component (1% sampling after first 100) */
  HIGH_VOLUME: {
    strategy: 'FIRST_N' as const,
    firstN: 100,
    sampleRate: 0.01,
  },
  
  /** Medium-volume component (10% sampling) */
  MEDIUM_VOLUME: {
    strategy: 'SAMPLE' as const,
    sampleRate: 0.1,
  },
  
  /** Rate-limited (max 10 per second) */
  RATE_LIMITED: {
    strategy: 'RATE_LIMIT' as const,
    maxPerWindow: 10,
    windowMs: 1000,
  },
  
  /** Deduplicated (no repeats within 5 seconds) */
  DEDUPLICATED: {
    strategy: 'DEDUP' as const,
    dedupWindowMs: 5000,
  },
  
  /** Adaptive (target 100 logs per second) */
  ADAPTIVE_100: {
    strategy: 'ADAPTIVE' as const,
    targetLogsPerSec: 100,
  },
  
  /** Debug only in production (DEBUG logs sampled 0.1%) */
  DEBUG_ONLY: {
    strategy: 'SAMPLE' as const,
    sampleRate: 0.001,
    appliesTo: ['DEBUG' as KernelLogLevel],
  },
};
