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
// Flag Definitions
// ============================================================================
/**
 * All feature flag definitions
 *
 * Add new flags here with full metadata for documentation and observability.
 */
export const FEATURE_FLAG_DEFINITIONS = [
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
        id: "experimental.dev_restricted_access",
        name: "Development Restricted Access",
        description: "Restrict bot access to allowed users only (for pre-release testing). Set DEV_ALLOWED_USER_IDS env var.",
        category: "experimental",
        defaultValue: false,
        envVar: "FF_DEV_RESTRICTED_ACCESS",
        runtimeToggleable: true,
        guildOverrideable: false,
        addedAt: "2025-12-06",
        removalTarget: "2026-01-01",
        tags: ["development", "access-control", "pre-release"],
    },
];
// ============================================================================
// Development Mode Access Control
// ============================================================================
/**
 * Allowed user IDs for development/pre-release mode.
 * Set via DEV_ALLOWED_USER_IDS environment variable (comma-separated).
 * Default includes DripTVDD's user ID.
 */
export const DEV_ALLOWED_USER_IDS = (() => {
    const envValue = process.env.DEV_ALLOWED_USER_IDS;
    if (envValue) {
        return envValue.split(",").map(id => id.trim()).filter(Boolean);
    }
    // Default: DripTVDD only
    return ["243759220057571328"]; // DripTVDD's Discord user ID
})();
/**
 * Check if a user is allowed access during development mode.
 * Returns true if:
 * - dev_restricted_access flag is disabled (normal mode)
 * - user ID is in the allowed list
 * - user ID is not provided (allows system operations)
 */
export function isUserAllowedInDevMode(userId) {
    const flags = FeatureFlagsManager.getInstance();
    flags.initialize(); // Safe to call multiple times
    // If restricted access is disabled, everyone is allowed
    if (!flags.isEnabled("experimental.dev_restricted_access")) {
        return true;
    }
    // If no user ID provided, allow (system operations)
    if (!userId) {
        return true;
    }
    // Check if user is in allowed list
    return DEV_ALLOWED_USER_IDS.includes(userId);
}
/**
 * Get the development mode access denied message.
 */
export function getDevModeAccessDeniedMessage() {
    return "🔒 **Development Mode Active**\n\nThis bot is currently in pre-release testing mode and access is restricted to authorized testers.\n\nPlease check back later when public access is enabled!";
}
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
    static instance = null;
    /** Flag definitions indexed by ID */
    definitions;
    /** Runtime flag state */
    state;
    /** Change listeners */
    listeners;
    /** Whether manager is initialized */
    initialized = false;
    /**
     * Private constructor for singleton
     */
    constructor() {
        this.definitions = new Map(FEATURE_FLAG_DEFINITIONS.map((def) => [def.id, def]));
        this.state = new Map();
        this.listeners = new Set();
    }
    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!FeatureFlagsManager.instance) {
            FeatureFlagsManager.instance = new FeatureFlagsManager();
        }
        return FeatureFlagsManager.instance;
    }
    /**
     * Reset singleton (for testing)
     */
    static resetInstance() {
        FeatureFlagsManager.instance = null;
    }
    /**
     * Initialize manager from environment
     */
    initialize() {
        if (this.initialized) {
            return;
        }
        for (const def of this.definitions.values()) {
            let value = def.defaultValue;
            let source = "default";
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
    isEnabled(flagId, context) {
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
    setEnabled(flagId, enabled, guildId) {
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
        }
        else {
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
    getDefinition(flagId) {
        return this.definitions.get(flagId);
    }
    /**
     * Get all flag definitions
     */
    getAllDefinitions() {
        return [...this.definitions.values()];
    }
    /**
     * Get flags by category
     */
    getFlagsByCategory(category) {
        return [...this.definitions.values()].filter((def) => def.category === category);
    }
    /**
     * Get current flag values snapshot
     */
    getSnapshot() {
        this.ensureInitialized();
        const flags = {};
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
    getStats() {
        this.ensureInitialized();
        const stats = {};
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
    onChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    /**
     * Clear guild overrides
     */
    clearGuildOverrides(guildId) {
        for (const state of this.state.values()) {
            state.guildOverrides.delete(guildId);
        }
    }
    // ============================================================================
    // Private Methods
    // ============================================================================
    ensureInitialized() {
        if (!this.initialized) {
            this.initialize();
        }
    }
    emitChange(event) {
        for (const listener of this.listeners) {
            try {
                listener(event);
            }
            catch {
                // Listener error - continue with other listeners
            }
        }
    }
    hashString(str) {
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
export function getFeatureFlags() {
    return FeatureFlagsManager.getInstance();
}
/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(flagId, context) {
    return getFeatureFlags().isEnabled(flagId, context);
}
/**
 * Enable a feature flag at runtime
 */
export function enableFeature(flagId, guildId) {
    return getFeatureFlags().setEnabled(flagId, true, guildId);
}
/**
 * Disable a feature flag at runtime
 */
export function disableFeature(flagId, guildId) {
    return getFeatureFlags().setEnabled(flagId, false, guildId);
}
/**
 * Get feature flags snapshot
 */
export function getFeatureFlagsSnapshot() {
    return getFeatureFlags().getSnapshot();
}
// ============================================================================
// Type Guards
// ============================================================================
/**
 * Check if a string is a valid feature flag ID
 */
export function isValidFlagId(id) {
    return getFeatureFlags().getDefinition(id) !== undefined;
}
// ============================================================================
// Default Export
// ============================================================================
export default FeatureFlagsManager;
