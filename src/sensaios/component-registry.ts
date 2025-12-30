/**
 * SensaiOS Component Registry
 * 
 * Tracks installed, enabled, and disabled components with state machine.
 * 
 * @module sensaios/component-registry
 */

import type { SensaiComponent, ComponentContext, HostKind } from './component-context.js';
import { scopedLogger } from '../observability/envelope/console.js';
import { componentError, COMPONENT_ERRORS } from './sensai-error.js';

/** Scoped logger for registry operations */
const log = scopedLogger('sensaios-registry');

// ============================================================================
// COMPONENT STATE
// ============================================================================

/**
 * Component lifecycle states
 * 
 * State Machine:
 * ```
 * UNINSTALLED → [install] → INSTALLED (disabled)
 *                               ↓
 *                          [enable]
 *                               ↓
 *                            ENABLED
 *                               ↓
 *                          [disable]
 *                               ↓
 *                          INSTALLED (disabled)
 *                               ↓
 *                         [uninstall]
 *                               ↓
 *                          UNINSTALLED
 * ```
 */
export type ComponentState = 'uninstalled' | 'installed' | 'enabled';

/**
 * Registered component entry with state tracking
 */
export interface RegisteredComponent {
  /** Component manifest */
  manifest: SensaiComponent;

  /** Current lifecycle state */
  state: ComponentState;

  /** When the component was installed */
  installedAt?: Date;

  /** When the component was last enabled */
  enabledAt?: Date;

  /** When the component was last disabled */
  disabledAt?: Date;

  /** Error if component failed to load/enable */
  lastError?: Error;
}

/**
 * Component registry statistics
 */
export interface RegistryStats {
  /** Total registered components */
  total: number;

  /** Components by state */
  byState: Record<ComponentState, number>;

  /** Components by host type */
  byHost: Record<HostKind, number>;

  /** Components with errors */
  errored: number;
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

/**
 * Validation result for a component manifest
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;

  /** Validation errors (if any) */
  errors: ValidationError[];

  /** Validation warnings (non-fatal) */
  warnings: ValidationWarning[];
}

/**
 * Validation error that blocks installation
 */
export interface ValidationError {
  /** Error code */
  code: string;

  /** Human-readable message */
  message: string;

  /** Field that failed validation */
  field?: string;
}

/**
 * Validation warning (non-fatal)
 */
export interface ValidationWarning {
  /** Warning code */
  code: string;

  /** Human-readable message */
  message: string;

  /** Field with issue */
  field?: string;
}

// ============================================================================
// COMPONENT REGISTRY
// ============================================================================

/**
 * ComponentRegistry — Manages component registration and lifecycle state
 * 
 * Thread-safe registry for tracking installed, enabled, and disabled
 * components. Provides validation, dependency tracking, and state queries.
 * 
 * @example
 * ```typescript
 * const registry = new ComponentRegistry();
 * 
 * // Register a component
 * registry.install(battleComponent);
 * 
 * // Enable it
 * await registry.enable('game.battles', ctx);
 * 
 * // Query state
 * const enabled = registry.getEnabled();
 * ```
 */
export class ComponentRegistry {
  /** Internal component storage */
  private readonly components = new Map<string, RegisteredComponent>();

  /** Dependency graph (component -> dependencies) */
  private readonly dependencyGraph = new Map<string, Set<string>>();

  /** Reverse dependency graph (component -> dependents) */
  private readonly dependentGraph = new Map<string, Set<string>>();

  // ==========================================================================
  // INSTALLATION
  // ==========================================================================

  /**
   * Install a component into the registry
   * 
   * @param manifest - Component manifest to install
   * @returns Validation result (installation fails if invalid)
   */
  install(manifest: SensaiComponent): ValidationResult {
    const validation = this.validate(manifest);

    if (!validation.valid) {
      log.error('install', `Component ${manifest.name} failed validation`, {
        errors: validation.errors.map(e => e.message),
      });
      return validation;
    }

    // Check for duplicate
    if (this.components.has(manifest.name)) {
      const existing = this.components.get(manifest.name)!;
      if (existing.state !== 'uninstalled') {
        validation.valid = false;
        validation.errors.push({
          code: 'ALREADY_INSTALLED',
          message: `Component ${manifest.name} is already installed`,
        });
        return validation;
      }
    }

    // Register component
    this.components.set(manifest.name, {
      manifest,
      state: 'installed',
      installedAt: new Date(),
    });

    // Build dependency graph
    this.buildDependencyGraph(manifest);

    log.info('install', `Component ${manifest.name} installed`, {
      version: manifest.version,
      hosts: manifest.hosts,
    });

    return validation;
  }

  /**
   * Uninstall a component from the registry
   * 
   * @param name - Component name to uninstall
   * @throws If component is enabled or has dependents
   */
  uninstall(name: string): void {
    const entry = this.components.get(name);

    if (!entry) {
      throw componentError(
        COMPONENT_ERRORS.NOT_FOUND,
        `Component ${name} not found`
      );
    }

    if (entry.state === 'enabled') {
      throw componentError(
        COMPONENT_ERRORS.INVALID_STATE,
        `Cannot uninstall enabled component ${name}. Disable it first.`
      );
    }

    // Check for dependents
    const dependents = this.getDependents(name);
    const enabledDependents = dependents.filter(d => {
      const dep = this.components.get(d);
      return dep && dep.state === 'enabled';
    });

    if (enabledDependents.length > 0) {
      throw componentError(
        COMPONENT_ERRORS.HAS_DEPENDENTS,
        `Cannot uninstall ${name}: enabled dependents: ${enabledDependents.join(', ')}`
      );
    }

    // Clean up graphs
    this.cleanupDependencyGraph(name);

    // Remove from registry
    this.components.delete(name);

    log.info('uninstall', `Component ${name} uninstalled`);
  }

  // ==========================================================================
  // ENABLE / DISABLE
  // ==========================================================================

  /**
   * Enable a component
   * 
   * @param name - Component name to enable
   * @param ctx - Context for lifecycle hooks
   * @throws If dependencies not met or onEnable fails
   */
  async enable(name: string, ctx: ComponentContext): Promise<void> {
    const entry = this.components.get(name);

    if (!entry) {
      throw componentError(
        COMPONENT_ERRORS.NOT_FOUND,
        `Component ${name} not found`
      );
    }

    if (entry.state === 'enabled') {
      log.debug('enable', `Component ${name} already enabled`);
      return;
    }

    if (entry.state !== 'installed') {
      throw componentError(
        COMPONENT_ERRORS.INVALID_STATE,
        `Component ${name} must be installed before enabling (state: ${entry.state})`
      );
    }

    // Check dependencies are enabled
    const unmetDeps = this.getUnmetDependencies(name);
    if (unmetDeps.length > 0) {
      throw componentError(
        COMPONENT_ERRORS.UNMET_DEPENDENCIES,
        `Cannot enable ${name}: unmet dependencies: ${unmetDeps.join(', ')}`
      );
    }

    try {
      // Call onLoad if defined
      if (entry.manifest.onLoad) {
        await entry.manifest.onLoad(ctx);
      }

      // Call onEnable if defined
      if (entry.manifest.onEnable) {
        await entry.manifest.onEnable(ctx);
      }

      // Update state
      entry.state = 'enabled';
      entry.enabledAt = new Date();
      entry.lastError = undefined;

      log.info('enable', `Component ${name} enabled`, {
        version: entry.manifest.version,
      });
    } catch (error) {
      entry.lastError = error instanceof Error ? error : new Error(String(error));
      log.error('enable', `Failed to enable component ${name}`, {
        error: entry.lastError.message,
      });
      throw error;
    }
  }

  /**
   * Disable a component
   * 
   * @param name - Component name to disable
   * @param ctx - Context for lifecycle hooks
   * @throws If has enabled dependents or onDisable fails
   */
  async disable(name: string, ctx: ComponentContext): Promise<void> {
    const entry = this.components.get(name);

    if (!entry) {
      throw componentError(
        COMPONENT_ERRORS.NOT_FOUND,
        `Component ${name} not found`
      );
    }

    if (entry.state !== 'enabled') {
      log.debug('disable', `Component ${name} not enabled (state: ${entry.state})`);
      return;
    }

    // Check for enabled dependents
    const enabledDependents = this.getEnabledDependents(name);
    if (enabledDependents.length > 0) {
      throw componentError(
        COMPONENT_ERRORS.HAS_DEPENDENTS,
        `Cannot disable ${name}: enabled dependents: ${enabledDependents.join(', ')}`
      );
    }

    try {
      // Call onDisable if defined
      if (entry.manifest.onDisable) {
        await entry.manifest.onDisable(ctx);
      }

      // Call onUnload if defined
      if (entry.manifest.onUnload) {
        await entry.manifest.onUnload(ctx);
      }

      // Update state
      entry.state = 'installed';
      entry.disabledAt = new Date();

      log.info('disable', `Component ${name} disabled`);
    } catch (error) {
      entry.lastError = error instanceof Error ? error : new Error(String(error));
      log.error('disable', `Failed to disable component ${name}`, {
        error: entry.lastError.message,
      });
      throw error;
    }
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  /**
   * Validate a component manifest
   * 
   * @param manifest - Manifest to validate
   * @returns Validation result with errors and warnings
   */
  validate(manifest: SensaiComponent): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Required fields
    if (!manifest.name || manifest.name.trim() === '') {
      errors.push({
        code: 'MISSING_NAME',
        message: 'Component name is required',
        field: 'name',
      });
    } else if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/.test(manifest.name)) {
      errors.push({
        code: 'INVALID_NAME',
        message: 'Component name must be dot-separated lowercase identifiers (e.g., "game.battles")',
        field: 'name',
      });
    }

    if (!manifest.version || manifest.version.trim() === '') {
      errors.push({
        code: 'MISSING_VERSION',
        message: 'Component version is required',
        field: 'version',
      });
    } else if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
      warnings.push({
        code: 'INVALID_SEMVER',
        message: 'Version should follow semver (e.g., "1.0.0")',
        field: 'version',
      });
    }

    // Hosts validation
    if (!manifest.hosts || manifest.hosts.length === 0) {
      errors.push({
        code: 'MISSING_HOSTS',
        message: 'At least one host type is required',
        field: 'hosts',
      });
    } else {
      const validHosts: HostKind[] = ['bot', 'worker', 'cron', 'cli'];
      for (const host of manifest.hosts) {
        if (!validHosts.includes(host)) {
          errors.push({
            code: 'INVALID_HOST',
            message: `Invalid host type: ${host}. Must be one of: ${validHosts.join(', ')}`,
            field: 'hosts',
          });
        }
      }
    }

    // Capabilities validation
    if (!manifest.capabilities) {
      errors.push({
        code: 'MISSING_CAPABILITIES',
        message: 'Capabilities declaration is required',
        field: 'capabilities',
      });
    } else {
      if (!manifest.capabilities.db || manifest.capabilities.db.length === 0) {
        warnings.push({
          code: 'NO_DB_CAPABILITIES',
          message: 'No database capabilities declared',
          field: 'capabilities.db',
        });
      }

      const validDbCaps = ['read', 'write', 'migrate'];
      for (const cap of manifest.capabilities.db || []) {
        if (!validDbCaps.includes(cap)) {
          errors.push({
            code: 'INVALID_DB_CAPABILITY',
            message: `Invalid DB capability: ${cap}`,
            field: 'capabilities.db',
          });
        }
      }
    }

    // Dependency validation
    if (manifest.dependencies) {
      for (const dep of manifest.dependencies) {
        if (dep === manifest.name) {
          errors.push({
            code: 'SELF_DEPENDENCY',
            message: 'Component cannot depend on itself',
            field: 'dependencies',
          });
        }
      }
    }

    // Data ownership validation
    if (manifest.owns) {
      if (manifest.owns.canonical && manifest.owns.canonical.length > 0) {
        if (!manifest.capabilities?.db?.includes('write')) {
          errors.push({
            code: 'OWNERSHIP_WITHOUT_WRITE',
            message: 'Component owns canonical tables but lacks write capability',
            field: 'owns.canonical',
          });
        }
      }
    }

    // Resource budget warnings
    if (manifest.resources) {
      if (manifest.resources.maxCacheMb && manifest.resources.maxCacheMb > 100) {
        warnings.push({
          code: 'LARGE_CACHE',
          message: `Cache budget ${manifest.resources.maxCacheMb}MB is large`,
          field: 'resources.maxCacheMb',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  /**
   * Get a component by name
   */
  get(name: string): RegisteredComponent | undefined {
    return this.components.get(name);
  }

  /**
   * Check if a component is installed
   */
  has(name: string): boolean {
    return this.components.has(name);
  }

  /**
   * Check if a component is enabled
   */
  isEnabled(name: string): boolean {
    const entry = this.components.get(name);
    return entry?.state === 'enabled';
  }

  /**
   * Get all registered components
   */
  getAll(): RegisteredComponent[] {
    return Array.from(this.components.values());
  }

  /**
   * Get all enabled components
   */
  getEnabled(): RegisteredComponent[] {
    return this.getAll().filter(c => c.state === 'enabled');
  }

  /**
   * Get all installed (but not enabled) components
   */
  getInstalled(): RegisteredComponent[] {
    return this.getAll().filter(c => c.state === 'installed');
  }

  /**
   * Get components by host type
   */
  getByHost(host: HostKind): RegisteredComponent[] {
    return this.getAll().filter(c => c.manifest.hosts.includes(host));
  }

  /**
   * Get components that can run on this host
   */
  getForHost(host: HostKind): SensaiComponent[] {
    return this.getEnabled()
      .filter(c => c.manifest.hosts.includes(host))
      .map(c => c.manifest);
  }

  /**
   * Get registry statistics
   */
  getStats(): RegistryStats {
    const all = this.getAll();

    const byState: Record<ComponentState, number> = {
      uninstalled: 0,
      installed: 0,
      enabled: 0,
    };

    const byHost: Record<HostKind, number> = {
      bot: 0,
      worker: 0,
      cron: 0,
      cli: 0,
    };

    let errored = 0;

    for (const entry of all) {
      byState[entry.state]++;

      for (const host of entry.manifest.hosts) {
        byHost[host]++;
      }

      if (entry.lastError) {
        errored++;
      }
    }

    return {
      total: all.length,
      byState,
      byHost,
      errored,
    };
  }

  // ==========================================================================
  // DEPENDENCY MANAGEMENT
  // ==========================================================================

  /**
   * Get direct dependencies of a component
   */
  getDependencies(name: string): string[] {
    return Array.from(this.dependencyGraph.get(name) || []);
  }

  /**
   * Get components that depend on this one
   */
  getDependents(name: string): string[] {
    return Array.from(this.dependentGraph.get(name) || []);
  }

  /**
   * Get unmet dependencies for a component
   */
  getUnmetDependencies(name: string): string[] {
    const deps = this.getDependencies(name);
    return deps.filter(dep => !this.isEnabled(dep));
  }

  /**
   * Get enabled dependents of a component
   */
  getEnabledDependents(name: string): string[] {
    const dependents = this.getDependents(name);
    return dependents.filter(d => this.isEnabled(d));
  }

  /**
   * Get components in dependency order (topological sort)
   * 
   * Returns components such that dependencies come before dependents.
   */
  getInDependencyOrder(): RegisteredComponent[] {
    const visited = new Set<string>();
    const result: RegisteredComponent[] = [];

    const visit = (name: string) => {
      if (visited.has(name)) return;
      visited.add(name);

      // Visit dependencies first
      for (const dep of this.getDependencies(name)) {
        if (this.components.has(dep)) {
          visit(dep);
        }
      }

      const entry = this.components.get(name);
      if (entry) {
        result.push(entry);
      }
    };

    // Visit all components
    for (const name of this.components.keys()) {
      visit(name);
    }

    return result;
  }

  /**
   * Detect circular dependencies
   * 
   * @returns Array of cycles found (each cycle is array of component names)
   */
  detectCircularDependencies(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const stack: string[] = [];

    const dfs = (name: string): boolean => {
      if (inStack.has(name)) {
        // Found cycle - extract it from stack
        const cycleStart = stack.indexOf(name);
        cycles.push([...stack.slice(cycleStart), name]);
        return true;
      }

      if (visited.has(name)) return false;

      visited.add(name);
      inStack.add(name);
      stack.push(name);

      for (const dep of this.getDependencies(name)) {
        if (this.components.has(dep)) {
          dfs(dep);
        }
      }

      stack.pop();
      inStack.delete(name);
      return false;
    };

    for (const name of this.components.keys()) {
      if (!visited.has(name)) {
        dfs(name);
      }
    }

    return cycles;
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Build dependency graph for a component
   */
  private buildDependencyGraph(manifest: SensaiComponent): void {
    const deps = manifest.dependencies || [];

    // Forward graph: component -> dependencies
    this.dependencyGraph.set(manifest.name, new Set(deps));

    // Reverse graph: dependency -> dependents
    for (const dep of deps) {
      if (!this.dependentGraph.has(dep)) {
        this.dependentGraph.set(dep, new Set());
      }
      this.dependentGraph.get(dep)!.add(manifest.name);
    }
  }

  /**
   * Clean up dependency graph when uninstalling
   */
  private cleanupDependencyGraph(name: string): void {
    // Remove from forward graph
    const deps = this.dependencyGraph.get(name) || new Set();
    this.dependencyGraph.delete(name);

    // Remove from reverse graph entries
    for (const dep of deps) {
      const dependents = this.dependentGraph.get(dep);
      if (dependents) {
        dependents.delete(name);
      }
    }

    // Remove own reverse entry
    this.dependentGraph.delete(name);
  }

  /**
   * Clear the registry (for testing)
   */
  clear(): void {
    this.components.clear();
    this.dependencyGraph.clear();
    this.dependentGraph.clear();
    log.debug('clear', 'Registry cleared');
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/** Default component registry instance */
export const componentRegistry = new ComponentRegistry();
