/**
 * Adaptive Resource Tier System — Render Plan Auto-Detection
 *
 * Auto-detects the Render plan (or local dev environment) at boot time and
 * exports a single TIER object consumed by every resource-sensitive module.
 *
 * Detection strategy (in priority order):
 *  1. RENDER_PLAN_TIER env var override (starter|standard|pro|pro-plus|pro-max|pro-ultra)
 *  2. process.constrainedMemory() — cgroup limit on Node 19+ containers
 *  3. os.totalmem() — total system RAM (reflects cgroup on modern runtimes)
 *
 * Render Background Worker pricing (2025):
 *  | Plan       | RAM     | vCPU | $/mo |
 *  |------------|---------|------|------|
 *  | Free       | 512 MB  | 0.1  |   $0 |
 *  | Starter    | 512 MB  | 0.5  |   $7 |
 *  | Standard   | 2 GB    | 1    |  $25 |
 *  | Pro        | 4 GB    | 2    |  $85 |
 *  | Pro Plus   | 8 GB    | 4    | $175 |
 *  | Pro Max    | 16 GB   | 4    | $225 |
 *  | Pro Ultra  | 32 GB   | 8    | $450 |
 *
 * @module resource-tiers
 * @see https://render.com/pricing
 */

import os from 'node:os';
import v8 from 'node:v8';

// ============================================================================
// Types
// ============================================================================

/** Render plan tier identifiers */
export type RenderPlanTier =
  | 'starter'
  | 'standard'
  | 'pro'
  | 'pro-plus'
  | 'pro-max'
  | 'pro-ultra';

/** Memory pressure thresholds (absolute MB values) */
export interface MemoryThresholds {
  /** Total plan RAM in MB */
  planLimitMB: number;
  /** 90% — Immediate emergency action */
  emergencyMB: number;
  /** 85% — Aggressive pruning required */
  criticalMB: number;
  /** 75% — Preemptive monitoring & light pruning */
  warningMB: number;
  /** 60% — Optimal utilization floor */
  optimalMinMB: number;
  /** 75% — Optimal utilization ceiling */
  optimalMaxMB: number;
  /** 50% — Possible under-utilization */
  underutilizedMB: number;
}

/** CPU thresholds */
export interface CpuThresholds {
  /** Plan vCPU count */
  planVCPU: number;
  /** CPU usage % triggering emergency */
  emergencyPercent: number;
  /** CPU usage % triggering critical alert */
  criticalPercent: number;
  /** CPU usage % triggering warning */
  warningPercent: number;
  /** Normal minimum floor (informational) */
  normalMinPercent: number;
}

/** Engine DB resource budgets */
export interface EngineDbBudgets {
  /** L1 in-memory cache max (MB) */
  l1CacheMaxMB: number;
  /** Write buffer max queue size (per queue, 3 queues total) */
  writeBufferMaxQueue: number;
  /** SQLite page cache size (pages × 4 KB) */
  sqliteCachePages: number;
  /** Prisma connection pool size */
  postgresPoolSize: number;
  /** Write-DB max file size (MB) */
  writeDbMaxMB: number;
  /** Validation batch size */
  validationBatchSize: number;
}

/** Discord.js cache limits */
export interface DiscordCacheLimits {
  /** Max messages per channel */
  messagesPerChannel: number;
  /** Max guild members cached */
  guildMembers: number;
  /** Max threads cached */
  threads: number;
}

/** In-memory cache budgets (facade + legacy security cache) */
export interface CacheBudgets {
  /** Cache facade hot-layer max bytes (e.g. 2 MiB on Starter, 5 MiB on Standard) */
  facadeMaxBytes: number;
  /** Cache facade max items in LRU */
  facadeMaxItems: number;
  /** Legacy security cache max in-memory entries */
  memoryCacheMaxEntries: number;
}

/** Suggested V8 heap limit (MB) — for NODE_OPTIONS --max-old-space-size */
export interface HeapConfig {
  /** Recommended --max-old-space-size value (MB) */
  maxOldSpaceMB: number;
}

/** Complete tier profile consumed by all resource-sensitive modules */
export interface TierProfile {
  /** Tier identifier */
  tier: RenderPlanTier;
  /** Human-readable label */
  label: string;
  /** Plan RAM in MB */
  ramMB: number;
  /** Plan vCPU count */
  vcpu: number;
  /** Monthly cost (USD) */
  priceMontlyUSD: number;
  /** How the tier was detected */
  detectedVia: 'env-override' | 'constrained-memory' | 'os-totalmem' | 'fallback';
  /** Raw detected memory in MB (before tier mapping) */
  detectedRamMB: number;
  /** Memory thresholds */
  memory: MemoryThresholds;
  /** CPU thresholds */
  cpu: CpuThresholds;
  /** Engine DB resource budgets */
  engine: EngineDbBudgets;
  /** Discord.js cache limits */
  discord: DiscordCacheLimits;
  /** In-memory cache budgets */
  cache: CacheBudgets;
  /** V8 heap configuration */
  heap: HeapConfig;
}

// ============================================================================
// Tier Profile Definitions
// ============================================================================

/**
 * Helper: compute percentage-based memory thresholds from a plan limit.
 * Percentages match the existing resource-monitor semantics.
 */
function memoryThresholdsFromLimit(limitMB: number): MemoryThresholds {
  return {
    planLimitMB: limitMB,
    emergencyMB: Math.floor(limitMB * 0.90),
    criticalMB: Math.floor(limitMB * 0.85),
    warningMB: Math.floor(limitMB * 0.75),
    optimalMinMB: Math.floor(limitMB * 0.60),
    optimalMaxMB: Math.floor(limitMB * 0.75),
    underutilizedMB: Math.floor(limitMB * 0.50),
  };
}

/** Shared CPU thresholds (percentages stay the same across tiers) */
function cpuThresholds(vcpu: number): CpuThresholds {
  return {
    planVCPU: vcpu,
    emergencyPercent: 90,
    criticalPercent: 70,
    warningPercent: 50,
    normalMinPercent: 30,
  };
}

/** Tier profile lookup table */
const TIER_PROFILES: Record<RenderPlanTier, Omit<TierProfile, 'detectedVia' | 'detectedRamMB'>> = {
  // ─── Starter (512 MB / 0.5 vCPU) ─────────────────────────────────────
  // Covers both Free ($0) and Starter ($7) — same RAM/CPU
  starter: {
    tier: 'starter',
    label: 'Starter (512 MB / 0.5 vCPU)',
    ramMB: 512,
    vcpu: 0.5,
    priceMontlyUSD: 7,
    memory: memoryThresholdsFromLimit(512),
    cpu: cpuThresholds(0.5),
    engine: {
      l1CacheMaxMB: 3,
      writeBufferMaxQueue: 500,
      sqliteCachePages: 500,        // ≈ 2 MB
      postgresPoolSize: 2,
      writeDbMaxMB: 100,
      validationBatchSize: 250,
    },
    discord: {
      messagesPerChannel: 25,
      guildMembers: 500,
      threads: 25,
    },
    cache: {
      facadeMaxBytes: 2 * 1024 * 1024,   // 2 MiB (reduced from 5 MiB)
      facadeMaxItems: 100,                 // Reduced from 200
      memoryCacheMaxEntries: 500,          // Reduced from 1000
    },
    heap: { maxOldSpaceMB: 384 },   // 75% of 512
  },

  // ─── Standard (2 GB / 1 vCPU) ────────────────────────────────────────
  standard: {
    tier: 'standard',
    label: 'Standard (2 GB / 1 vCPU)',
    ramMB: 2048,
    vcpu: 1.0,
    priceMontlyUSD: 25,
    memory: memoryThresholdsFromLimit(2048),
    cpu: cpuThresholds(1.0),
    engine: {
      l1CacheMaxMB: 6,
      writeBufferMaxQueue: 2000,
      sqliteCachePages: 2000,       // ≈ 8 MB
      postgresPoolSize: 5,
      writeDbMaxMB: 500,
      validationBatchSize: 1000,
    },
    discord: {
      messagesPerChannel: 50,
      guildMembers: 1000,
      threads: 50,
    },
    cache: {
      facadeMaxBytes: 5 * 1024 * 1024,   // 5 MiB
      facadeMaxItems: 200,
      memoryCacheMaxEntries: 1000,
    },
    heap: { maxOldSpaceMB: 1536 },  // 75% of 2048
  },

  // ─── Pro (4 GB / 2 vCPU) ─────────────────────────────────────────────
  pro: {
    tier: 'pro',
    label: 'Pro (4 GB / 2 vCPU)',
    ramMB: 4096,
    vcpu: 2.0,
    priceMontlyUSD: 85,
    memory: memoryThresholdsFromLimit(4096),
    cpu: cpuThresholds(2.0),
    engine: {
      l1CacheMaxMB: 12,
      writeBufferMaxQueue: 5000,
      sqliteCachePages: 4000,       // ≈ 16 MB
      postgresPoolSize: 10,
      writeDbMaxMB: 1000,
      validationBatchSize: 2000,
    },
    discord: {
      messagesPerChannel: 100,
      guildMembers: 2000,
      threads: 100,
    },
    cache: {
      facadeMaxBytes: 10 * 1024 * 1024,  // 10 MiB
      facadeMaxItems: 500,
      memoryCacheMaxEntries: 2000,
    },
    heap: { maxOldSpaceMB: 3072 },  // 75% of 4096
  },

  // ─── Pro Plus (8 GB / 4 vCPU) ────────────────────────────────────────
  'pro-plus': {
    tier: 'pro-plus',
    label: 'Pro Plus (8 GB / 4 vCPU)',
    ramMB: 8192,
    vcpu: 4.0,
    priceMontlyUSD: 175,
    memory: memoryThresholdsFromLimit(8192),
    cpu: cpuThresholds(4.0),
    engine: {
      l1CacheMaxMB: 20,
      writeBufferMaxQueue: 10000,
      sqliteCachePages: 8000,       // ≈ 32 MB
      postgresPoolSize: 15,
      writeDbMaxMB: 2000,
      validationBatchSize: 5000,
    },
    discord: {
      messagesPerChannel: 200,
      guildMembers: 5000,
      threads: 200,
    },
    cache: {
      facadeMaxBytes: 16 * 1024 * 1024,  // 16 MiB
      facadeMaxItems: 1000,
      memoryCacheMaxEntries: 5000,
    },
    heap: { maxOldSpaceMB: 6144 },  // 75% of 8192
  },

  // ─── Pro Max (16 GB / 4 vCPU) ────────────────────────────────────────
  'pro-max': {
    tier: 'pro-max',
    label: 'Pro Max (16 GB / 4 vCPU)',
    ramMB: 16384,
    vcpu: 4.0,
    priceMontlyUSD: 225,
    memory: memoryThresholdsFromLimit(16384),
    cpu: cpuThresholds(4.0),
    engine: {
      l1CacheMaxMB: 40,
      writeBufferMaxQueue: 20000,
      sqliteCachePages: 16000,      // ≈ 64 MB
      postgresPoolSize: 20,
      writeDbMaxMB: 4000,
      validationBatchSize: 10000,
    },
    discord: {
      messagesPerChannel: 500,
      guildMembers: 10000,
      threads: 500,
    },
    cache: {
      facadeMaxBytes: 32 * 1024 * 1024,  // 32 MiB
      facadeMaxItems: 2000,
      memoryCacheMaxEntries: 10000,
    },
    heap: { maxOldSpaceMB: 12288 }, // 75% of 16384
  },

  // ─── Pro Ultra (32 GB / 8 vCPU) ──────────────────────────────────────
  'pro-ultra': {
    tier: 'pro-ultra',
    label: 'Pro Ultra (32 GB / 8 vCPU)',
    ramMB: 32768,
    vcpu: 8.0,
    priceMontlyUSD: 450,
    memory: memoryThresholdsFromLimit(32768),
    cpu: cpuThresholds(8.0),
    engine: {
      l1CacheMaxMB: 80,
      writeBufferMaxQueue: 50000,
      sqliteCachePages: 32000,      // ≈ 128 MB
      postgresPoolSize: 30,
      writeDbMaxMB: 8000,
      validationBatchSize: 20000,
    },
    discord: {
      messagesPerChannel: 1000,
      guildMembers: 20000,
      threads: 1000,
    },
    cache: {
      facadeMaxBytes: 64 * 1024 * 1024,  // 64 MiB
      facadeMaxItems: 5000,
      memoryCacheMaxEntries: 20000,
    },
    heap: { maxOldSpaceMB: 24576 }, // 75% of 32768
  },
};

// ============================================================================
// Tier Detection Logic
// ============================================================================

/** Valid tier names for env override validation */
const VALID_TIERS = new Set<RenderPlanTier>([
  'starter', 'standard', 'pro', 'pro-plus', 'pro-max', 'pro-ultra',
]);

/**
 * Detect available RAM in MB using the best available API.
 *
 * Priority:
 *  1. process.constrainedMemory() — cgroup limit (Node 19+, returns undefined if unconstrained)
 *  2. os.totalmem() — total system/container RAM
 *
 * @returns [ramMB, source] tuple
 */
function detectRamMB(): [number, 'constrained-memory' | 'os-totalmem'] {
  // Node 19+ exposes cgroup memory limit directly
  if (typeof process.constrainedMemory === 'function') {
    const constrained = process.constrainedMemory();
    if (constrained !== undefined && constrained > 0) {
      return [Math.floor(constrained / 1024 / 1024), 'constrained-memory'];
    }
  }

  // Fallback: os.totalmem() reflects cgroup limit on modern container runtimes
  return [Math.floor(os.totalmem() / 1024 / 1024), 'os-totalmem'];
}

/**
 * Map detected RAM (MB) to the closest Render plan tier.
 *
 * Uses ceiling-match: the tier whose RAM is ≥ detected but closest.
 * If detected RAM is between two tiers, we round DOWN to the smaller tier
 * to ensure thresholds are conservative (we never assume more RAM than available).
 */
function ramToTier(ramMB: number): RenderPlanTier {
  // Tier boundaries (upper bounds exclusive for each tier)
  // 0–768 MB → starter, 769–3072 MB → standard, 3073–6144 MB → pro, etc.
  if (ramMB < 768) return 'starter';       // Up to ~768 MB → starter (512 MB plan)
  if (ramMB < 3072) return 'standard';     // Up to ~3 GB → standard (2 GB plan)
  if (ramMB < 6144) return 'pro';          // Up to ~6 GB → pro (4 GB plan)
  if (ramMB < 12288) return 'pro-plus';    // Up to ~12 GB → pro-plus (8 GB plan)
  if (ramMB < 24576) return 'pro-max';     // Up to ~24 GB → pro-max (16 GB plan)
  return 'pro-ultra';                       // 24+ GB → pro-ultra (32 GB plan)
}

/**
 * Detect the current Render plan tier.
 *
 * Detection priority:
 *  1. RENDER_PLAN_TIER env var (explicit operator override)
 *  2. Auto-detect via OS/cgroup memory introspection
 *
 * @returns Complete TierProfile with detection metadata
 */
function detectTier(): TierProfile {
  // 1. Check for explicit override
  const envOverride = process.env.RENDER_PLAN_TIER?.toLowerCase().trim() as RenderPlanTier | undefined;
  if (envOverride && VALID_TIERS.has(envOverride)) {
    const [detectedRamMB] = detectRamMB();
    const profile = TIER_PROFILES[envOverride];
    return {
      ...profile,
      detectedVia: 'env-override',
      detectedRamMB,
    };
  }

  // 2. Auto-detect from available RAM
  const [detectedRamMB, source] = detectRamMB();
  const tier = ramToTier(detectedRamMB);
  const profile = TIER_PROFILES[tier];

  return {
    ...profile,
    detectedVia: source,
    detectedRamMB,
  };
}

// ============================================================================
// Module Exports — Evaluated Once at Import Time
// ============================================================================

/**
 * The detected tier profile. Evaluated synchronously at first import.
 *
 * Every resource-sensitive module should import this instead of
 * hardcoding limits:
 *
 * ```ts
 * import { TIER } from '../../config/resource-tiers.js';
 * const maxCacheMB = TIER.engine.l1CacheMaxMB;
 * ```
 */
export const TIER: TierProfile = detectTier();

/**
 * All available tier profiles (for /ops diagnostics, documentation, etc.)
 */
export const ALL_TIER_PROFILES: ReadonlyMap<RenderPlanTier, Omit<TierProfile, 'detectedVia' | 'detectedRamMB'>> =
  new Map(Object.entries(TIER_PROFILES) as [RenderPlanTier, Omit<TierProfile, 'detectedVia' | 'detectedRamMB'>][]);

/**
 * Check if the V8 heap limit is properly configured for the detected tier.
 *
 * @returns Warning message if misconfigured, null if OK
 */
export function checkHeapConfiguration(): string | null {
  const v8HeapLimitMB = Math.floor(
    v8.getHeapStatistics().heap_size_limit / 1024 / 1024,
  );
  const recommended = TIER.heap.maxOldSpaceMB;

  // If V8 heap limit exceeds plan RAM, we'll OOM before V8 GC can act
  if (v8HeapLimitMB > TIER.ramMB) {
    return (
      `V8 heap limit (${v8HeapLimitMB} MB) exceeds plan RAM (${TIER.ramMB} MB). ` +
      `Set NODE_OPTIONS="--max-old-space-size=${recommended}" to prevent OOM kills.`
    );
  }

  return null;
}

/**
 * Format a concise tier summary for boot logs.
 */
export function formatTierSummary(): string {
  return (
    `[ResourceTier] ${TIER.label} | Detected: ${TIER.detectedRamMB} MB via ${TIER.detectedVia} | ` +
    `Memory: ${TIER.memory.planLimitMB} MB | CPU: ${TIER.cpu.planVCPU} vCPU | ` +
    `L1 Cache: ${TIER.engine.l1CacheMaxMB} MB | Pool: ${TIER.engine.postgresPoolSize} | ` +
    `Heap Limit: ${TIER.heap.maxOldSpaceMB} MB`
  );
}
