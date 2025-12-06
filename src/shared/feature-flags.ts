/**
 * Feature Flags System
 *
 * @module src/shared/feature-flags
 * @description Type-safe feature flags for gradual rollout and experimentation
 *
 * This module provides:
 * - Type-safe feature flag definitions
 * - Runtime toggle capabilities
 * - Environment-based configuration
 * - Observability hooks for flag changes
 * - Guild-specific overrides
 *
 * @research R2 (Feature Toggles) - Martin Fowler patterns for safe deployment
 *
 * @since Sprint 0 - Foundation Enhancement
 * @version 1.0.0
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Feature flag category for organization
 */
export type FeatureFlagCategory =
  | "security" // Security-related features
  | "database" // Database features
  | "performance" // Performance optimizations
  | "ui" // User interface features
  | "experimental"; // Experimental features

/**
 * Feature flag definition
 */
export interface FeatureFlagDefinition {
  /** Unique flag identifier */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Description of what this flag controls */
  readonly description: string;

  /** Category for organization */
  readonly category: FeatureFlagCategory;

  /** Default value if not configured */
  readonly defaultValue: boolean;

  /** Environment variable to override default */
  readonly envVar?: string;

  /** Whether this flag can be toggled at runtime */
  readonly runtimeToggleable: boolean;

  /** Whether this flag supports guild-specific overrides */
  readonly guildOverrideable: boolean;

  /** Rollout percentage (0-100) for gradual rollout */
  readonly rolloutPercentage?: number;

  /** Dependencies on other flags (all must be true) */
  readonly dependencies?: readonly string[];

  /** Date when this flag was added */
  readonly addedAt: string;

  /** Planned removal date (if temporary) */
  readonly removalTarget?: string;

  /** Tags for filtering */
  readonly tags?: readonly string[];
}

/**
 * Runtime flag state
 */
interface FlagState {
  /** Current value */
  value: boolean;

  /** How the value was determined */
  source: "default" | "env" | "runtime" | "guild" | "rollout";

  /** When it was last changed */
  lastChanged: Date;

  /** Number of times checked */
  checkCount: number;

  /** Guild-specific overrides */
  guildOverrides: Map<string, boolean>;
}

/**
 * Flag change event for observability
 */
export interface FlagChangeEvent {
  /** Flag ID that changed */
  flagId: string;

  /** Old value */
  oldValue: boolean;

  /** New value */
  newValue: boolean;

  /** Source of the change */
  source: FlagState["source"];

  /** Guild ID if guild-specific change */
  guildId?: string;

  /** Timestamp of change */
  timestamp: Date;
}

/**
 * Flag check context
 */
export interface FlagCheckContext {
  /** User ID for rollout calculation */
  userId?: string;

  /** Guild ID for guild-specific overrides */
  guildId?: string;

  /** Additional context for logging */
  metadata?: Record<string, unknown>;
}

/**
 * Feature flags snapshot for serialization
 */
export interface FeatureFlagsSnapshot {
  /** All flag values */
  flags: Record<string, boolean>;

  /** Timestamp of snapshot */
  timestamp: string;

  /** Version for compatibility */
  version: string;
}

// ============================================================================
// Flag Definitions
// ============================================================================

/**
 * All feature flag definitions
 *
 * Add new flags here with full metadata for documentation and observability.
 */
export const FEATURE_FLAG_DEFINITIONS: readonly FeatureFlagDefinition[] = [
  // Security Flags
  {
    id: "security.plugin_system",
    name: "Security Plugin System",
    description: "Enable the new plugin-based security architecture",
    category: "security",
    defaultValue: false,
    envVar: "FF_SECURITY_PLUGIN_SYSTEM",
    runtimeToggleable: true,
    guildOverrideable: true,
    addedAt: "2025-12-05",
    tags: ["sprint-0", "plugin-system"],
  },
  {
    id: "security.role_monitor_plugin",
    name: "Role Monitor Plugin",
    description: "Enable the role monitoring plugin for change detection",
    category: "security",
    defaultValue: false,
    envVar: "FF_SECURITY_ROLE_MONITOR",
    runtimeToggleable: true,
    guildOverrideable: true,
    dependencies: ["security.plugin_system"],
    addedAt: "2025-12-05",
    tags: ["sprint-0", "role-monitoring"],
  },
  {
    id: "security.drip_alerts",
    name: "DRIP Alerts",
    description: "Send alerts to DripTVDD for admin role changes",
    category: "security",
    defaultValue: true,
    envVar: "FF_SECURITY_DRIP_ALERTS",
    runtimeToggleable: true,
    guildOverrideable: false,
    addedAt: "2025-12-05",
    tags: ["alerts"],
  },
  {
    id: "security.auto_revert",
    name: "Auto Revert Unauthorized Changes",
    description: "Automatically revert unauthorized role/permission changes",
    category: "security",
    defaultValue: false,
    envVar: "FF_SECURITY_AUTO_REVERT",
    runtimeToggleable: true,
    guildOverrideable: true,
    dependencies: ["security.plugin_system", "security.role_monitor_plugin"],
    addedAt: "2025-12-05",
    tags: ["sprint-1", "auto-revert"],
  },
  {
    id: "security.baseline_comparison",
    name: "Baseline Comparison",
    description: "Compare current state against role baselines for drift detection",
    category: "security",
    defaultValue: false,
    envVar: "FF_SECURITY_BASELINE",
    runtimeToggleable: true,
    guildOverrideable: true,
    dependencies: ["security.plugin_system"],
    addedAt: "2025-12-05",
    tags: ["sprint-1", "baseline"],
  },

  // Database Flags
  {
    id: "database.security_tables",
    name: "Security Database Tables",
    description: "Enable the new security-specific database tables",
    category: "database",
    defaultValue: false,
    envVar: "FF_DATABASE_SECURITY_TABLES",
    runtimeToggleable: false,
    guildOverrideable: false,
    addedAt: "2025-12-05",
    tags: ["sprint-1", "schema"],
  },
  {
    id: "database.audit_logging",
    name: "Database Audit Logging",
    description: "Log all security events to database audit tables",
    category: "database",
    defaultValue: false,
    envVar: "FF_DATABASE_AUDIT",
    runtimeToggleable: true,
    guildOverrideable: false,
    dependencies: ["database.security_tables"],
    addedAt: "2025-12-05",
    tags: ["sprint-1", "audit"],
  },

  // Performance Flags
  {
    id: "performance.cache_role_baselines",
    name: "Cache Role Baselines",
    description: "Cache role baselines in memory for faster lookups",
    category: "performance",
    defaultValue: true,
    envVar: "FF_PERF_CACHE_BASELINES",
    runtimeToggleable: true,
    guildOverrideable: false,
    addedAt: "2025-12-05",
    tags: ["performance", "cache"],
  },

  // Experimental Flags
  {
    id: "experimental.threat_ml",
    name: "ML Threat Detection",
    description: "Use machine learning for threat pattern detection",
    category: "experimental",
    defaultValue: false,
    envVar: "FF_EXPERIMENTAL_THREAT_ML",
    runtimeToggleable: true,
    guildOverrideable: false,
    rolloutPercentage: 0,
    addedAt: "2025-12-05",
    removalTarget: "2026-06-01",
    tags: ["experimental", "ml"],
  },
  {
    id: "experimental.dev_mode",
    name: "Development Mode",
    description: "Restrict gameplay to whitelisted users only (pre-release testing)",
    category: "experimental",
    defaultValue: false,
    envVar: "FF_DEV_MODE",
    runtimeToggleable: true,
    guildOverrideable: false,
    addedAt: "2025-12-06",
    removalTarget: "2026-01-01",
    tags: ["development", "testing", "whitelist"],
  },
  {
    id: "experimental.dev_mode_whitelist",
    name: "Dev Mode User Whitelist",
    description: "Comma-separated Discord user IDs or usernames allowed in dev mode",
    category: "experimental",
    defaultValue: false,
    envVar: "FF_DEV_MODE_WHITELIST",
    runtimeToggleable: true,
    guildOverrideable: false,
    addedAt: "2025-12-06",
    removalTarget: "2026-01-01",
    tags: ["development", "testing", "whitelist"],
  },
] as const;

/**
 * Type-safe flag ID type
 */
export type FeatureFlagId = (typeof FEATURE_FLAG_DEFINITIONS)[number]["id"];

// ============================================================================
// Feature Flags Manager
// ============================================================================

/**
 * Feature Flags Manager
 *
 * Manages feature flag state, evaluation, and observability.
 */
export class FeatureFlagsManager {
  /** Singleton instance */
  private static instance: FeatureFlagsManager | null = null;

  /** Flag definitions indexed by ID */
  private readonly definitions: ReadonlyMap<string, FeatureFlagDefinition>;

  /** Runtime flag state */
  private readonly state: Map<string, FlagState>;

  /** Change listeners */
  private readonly listeners: Set<(event: FlagChangeEvent) => void>;

  /** Whether manager is initialized */
  private initialized = false;

  /**
   * Private constructor for singleton
   */
  private constructor() {
    this.definitions = new Map(
      FEATURE_FLAG_DEFINITIONS.map((def) => [def.id, def])
    );
    this.state = new Map();
    this.listeners = new Set();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): FeatureFlagsManager {
    if (!FeatureFlagsManager.instance) {
      FeatureFlagsManager.instance = new FeatureFlagsManager();
    }
    return FeatureFlagsManager.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  static resetInstance(): void {
    FeatureFlagsManager.instance = null;
  }

  /**
   * Initialize manager from environment
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    for (const def of this.definitions.values()) {
      let value = def.defaultValue;
      let source: FlagState["source"] = "default";

      // Check environment variable
      if (def.envVar) {
        const envValue = process.env[def.envVar];
        if (envValue !== undefined) {
          value = envValue.toLowerCase() === "true" || envValue === "1";
          source = "env";
        }
      }

      this.state.set(def.id, {
        value,
        source,
        lastChanged: new Date(),
        checkCount: 0,
        guildOverrides: new Map(),
      });
    }

    this.initialized = true;
  }

  /**
   * Check if a flag is enabled
   */
  isEnabled(flagId: string, context?: FlagCheckContext): boolean {
    this.ensureInitialized();

    const state = this.state.get(flagId);
    if (!state) {
      // Unknown flag - return false silently to avoid log spam
      return false;
    }

    const def = this.definitions.get(flagId);
    if (!def) {
      return false;
    }

    // Update check count
    state.checkCount++;

    // Check dependencies first
    if (def.dependencies) {
      for (const depId of def.dependencies) {
        if (!this.isEnabled(depId, context)) {
          return false;
        }
      }
    }

    // Check guild override
    if (context?.guildId && def.guildOverrideable) {
      const guildOverride = state.guildOverrides.get(context.guildId);
      if (guildOverride !== undefined) {
        return guildOverride;
      }
    }

    // Check rollout percentage
    if (def.rolloutPercentage !== undefined && context?.userId) {
      const hash = this.hashString(`${flagId}:${context.userId}`);
      const bucket = hash % 100;
      if (bucket >= def.rolloutPercentage) {
        return false;
      }
    }

    return state.value;
  }

  /**
   * Set flag value at runtime
   */
  setEnabled(flagId: string, enabled: boolean, guildId?: string): boolean {
    this.ensureInitialized();

    const state = this.state.get(flagId);
    const def = this.definitions.get(flagId);

    if (!state || !def) {
      // Unknown flag
      return false;
    }

    if (!def.runtimeToggleable) {
      // Flag not runtime toggleable
      return false;
    }

    if (guildId) {
      if (!def.guildOverrideable) {
        // Flag not guild overrideable
        return false;
      }

      const oldValue = state.guildOverrides.get(guildId) ?? state.value;
      state.guildOverrides.set(guildId, enabled);

      this.emitChange({
        flagId,
        oldValue,
        newValue: enabled,
        source: "guild",
        guildId,
        timestamp: new Date(),
      });
    } else {
      const oldValue = state.value;
      state.value = enabled;
      state.source = "runtime";
      state.lastChanged = new Date();

      this.emitChange({
        flagId,
        oldValue,
        newValue: enabled,
        source: "runtime",
        timestamp: new Date(),
      });
    }

    return true;
  }

  /**
   * Get flag definition
   */
  getDefinition(flagId: string): FeatureFlagDefinition | undefined {
    return this.definitions.get(flagId);
  }

  /**
   * Get all flag definitions
   */
  getAllDefinitions(): readonly FeatureFlagDefinition[] {
    return [...this.definitions.values()];
  }

  /**
   * Get flags by category
   */
  getFlagsByCategory(
    category: FeatureFlagCategory
  ): readonly FeatureFlagDefinition[] {
    return [...this.definitions.values()].filter(
      (def) => def.category === category
    );
  }

  /**
   * Get current flag values snapshot
   */
  getSnapshot(): FeatureFlagsSnapshot {
    this.ensureInitialized();

    const flags: Record<string, boolean> = {};
    for (const [id, state] of this.state) {
      flags[id] = state.value;
    }

    return {
      flags,
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    };
  }

  /**
   * Get flag statistics
   */
  getStats(): Record<
    string,
    {
      value: boolean;
      source: string;
      checkCount: number;
      guildOverrideCount: number;
    }
  > {
    this.ensureInitialized();

    const stats: Record<string, {
      value: boolean;
      source: string;
      checkCount: number;
      guildOverrideCount: number;
    }> = {};

    for (const [id, state] of this.state) {
      stats[id] = {
        value: state.value,
        source: state.source,
        checkCount: state.checkCount,
        guildOverrideCount: state.guildOverrides.size,
      };
    }

    return stats;
  }

  /**
   * Subscribe to flag changes
   */
  onChange(listener: (event: FlagChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Clear guild overrides
   */
  clearGuildOverrides(guildId: string): void {
    for (const state of this.state.values()) {
      state.guildOverrides.delete(guildId);
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      this.initialize();
    }
  }

  private emitChange(event: FlagChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener error - continue with other listeners
      }
    }
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get the feature flags manager instance
 */
export function getFeatureFlags(): FeatureFlagsManager {
  return FeatureFlagsManager.getInstance();
}

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(
  flagId: string,
  context?: FlagCheckContext
): boolean {
  return getFeatureFlags().isEnabled(flagId, context);
}

/**
 * Enable a feature flag at runtime
 */
export function enableFeature(flagId: string, guildId?: string): boolean {
  return getFeatureFlags().setEnabled(flagId, true, guildId);
}

/**
 * Disable a feature flag at runtime
 */
export function disableFeature(flagId: string, guildId?: string): boolean {
  return getFeatureFlags().setEnabled(flagId, false, guildId);
}

/**
 * Get feature flags snapshot
 */
export function getFeatureFlagsSnapshot(): FeatureFlagsSnapshot {
  return getFeatureFlags().getSnapshot();
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a string is a valid feature flag ID
 */
export function isValidFlagId(id: string): id is FeatureFlagId {
  return getFeatureFlags().getDefinition(id) !== undefined;
}

// ============================================================================
// Default Export
// ============================================================================

export default FeatureFlagsManager;
