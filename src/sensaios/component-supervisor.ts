/**
 * SensaiOS Component Supervisor
 * 
 * Manages component lifecycle, handler registration, and orchestration.
 * 
 * @module sensaios/component-supervisor
 */

import type {
  SensaiComponent,
  ComponentContext,
  HostKind,
  DiscordHandler,
  ExportHandler,
  JobHandler,
  HttpHandler,
  CliHandler,
} from './component-context.js';
import {
  ComponentRegistry,
  componentRegistry,
  type RegisteredComponent,
  type RegistryStats,
} from './component-registry.js';
import { createComponentContext, systemContext as _systemContext } from './context-factory.js';
import type { TenantScope } from './tenant-scope.js';
import { scopedLogger } from '../observability/envelope/console.js';

/** Scoped logger for supervisor operations */
const log = scopedLogger('sensaios-supervisor');

// ============================================================================
// HANDLER REGISTRY TYPES
// ============================================================================

/**
 * Registered handler entry with metadata
 */
export interface RegisteredHandler<T = unknown> {
  /** Component that owns this handler */
  component: string;

  /** Handler name/key */
  name: string;

  /** Handler function */
  handler: T;

  /** When the handler was registered */
  registeredAt: Date;
}

/**
 * Handler lookup result
 */
export interface HandlerLookup<T> {
  /** Component name */
  component: string;

  /** Handler function */
  handler: T;
}

/**
 * Supervisor statistics
 */
export interface SupervisorStats extends RegistryStats {
  /** Handler counts by type */
  handlers: {
    discord: number;
    exports: number;
    jobs: number;
    http: number;
    cli: number;
  };

  /** Boot status */
  bootStatus: 'not-started' | 'booting' | 'ready' | 'shutting-down' | 'shutdown';

  /** Boot time in ms (if booted) */
  bootTimeMs?: number;
}

// ============================================================================
// COMPONENT SUPERVISOR
// ============================================================================

/**
 * ComponentSupervisor — Orchestrates component lifecycle and handlers
 * 
 * The supervisor is responsible for:
 * - Loading and enabling components in dependency order
 * - Registering handlers for Discord, exports, jobs, HTTP, CLI
 * - Graceful shutdown with proper ordering
 * - Providing handler lookups for runtime dispatch
 * 
 * @example
 * ```typescript
 * const supervisor = new ComponentSupervisor();
 * 
 * // Register components
 * supervisor.register(battleComponent);
 * supervisor.register(encounterComponent);
 * 
 * // Boot all components
 * await supervisor.boot();
 * 
 * // Look up handler at runtime
 * const handler = supervisor.getDiscordHandler('battle:attack');
 * 
 * // Graceful shutdown
 * await supervisor.shutdown();
 * ```
 */
export class ComponentSupervisor {
  /** Component registry */
  private readonly registry: ComponentRegistry;

  /** Discord handlers */
  private readonly discordHandlers = new Map<string, RegisteredHandler<DiscordHandler>>();

  /** Export handlers */
  private readonly exportHandlers = new Map<string, RegisteredHandler<ExportHandler>>();

  /** Job handlers */
  private readonly jobHandlers = new Map<string, RegisteredHandler<JobHandler>>();

  /** HTTP handlers */
  private readonly httpHandlers = new Map<string, RegisteredHandler<HttpHandler>>();

  /** CLI handlers */
  private readonly cliHandlers = new Map<string, RegisteredHandler<CliHandler>>();

  /** Current boot status */
  private _bootStatus: SupervisorStats['bootStatus'] = 'not-started';

  /** Boot start time */
  private bootStartTime?: number;

  /** Boot duration */
  private bootDuration?: number;

  /** Current host type */
  private readonly host: HostKind;

  /** Default tenant scope */
  private readonly defaultScope: TenantScope;

  /**
   * Create a new supervisor
   * 
   * @param options - Supervisor options
   */
  constructor(options: {
    /** Component registry (defaults to singleton) */
    registry?: ComponentRegistry;
    /** Host type for this process */
    host?: HostKind;
    /** Default tenant scope */
    scope?: Partial<TenantScope>;
  } = {}) {
    this.registry = options.registry ?? componentRegistry;
    this.host = options.host ?? 'bot';
    this.defaultScope = {
      tenant: options.scope?.tenant ?? 'default',
      environment: options.scope?.environment ?? (process.env.NODE_ENV as 'production' | 'staging' | 'development') ?? 'development',
      service: options.scope?.service ?? `infinity-gauntlet-${this.host}`,
      component: options.scope?.component ?? 'supervisor',
    };
  }

  // ==========================================================================
  // COMPONENT REGISTRATION
  // ==========================================================================

  /**
   * Register a component with the supervisor
   * 
   * @param component - Component manifest to register
   * @throws If validation fails
   */
  register(component: SensaiComponent): void {
    const result = this.registry.install(component);

    if (!result.valid) {
      const errors = result.errors.map(e => e.message).join('; ');
      throw new Error(`Failed to register ${component.name}: ${errors}`);
    }

    // Log warnings
    for (const warning of result.warnings) {
      log.warn('register', `[${component.name}] ${warning.message}`, {
        code: warning.code,
        field: warning.field,
      });
    }

    log.info('register', `Registered component: ${component.name}`, {
      version: component.version,
      hosts: component.hosts,
    });
  }

  /**
   * Register multiple components
   */
  registerAll(components: SensaiComponent[]): void {
    for (const component of components) {
      this.register(component);
    }
  }

  // ==========================================================================
  // BOOT & SHUTDOWN
  // ==========================================================================

  /**
   * Boot the supervisor — enable all components for this host
   * 
   * Components are enabled in dependency order (dependencies first).
   */
  async boot(): Promise<void> {
    if (this._bootStatus !== 'not-started') {
      throw new Error(`Cannot boot: supervisor is ${this._bootStatus}`);
    }

    this._bootStatus = 'booting';
    this.bootStartTime = performance.now();

    log.info('boot', 'Starting supervisor boot sequence', {
      host: this.host,
    });

    try {
      // Check for circular dependencies
      const cycles = this.registry.detectCircularDependencies();
      if (cycles.length > 0) {
        throw new Error(`Circular dependencies detected: ${cycles.map(c => c.join(' -> ')).join('; ')}`);
      }

      // Get components in dependency order that can run on this host
      const components = this.registry.getInDependencyOrder()
        .filter(c => c.manifest.hosts.includes(this.host));

      log.info('boot', `Enabling ${components.length} components`, {
        components: components.map(c => c.manifest.name),
      });

      // Enable each component
      for (const entry of components) {
        await this.enableComponent(entry);
      }

      this.bootDuration = performance.now() - this.bootStartTime;
      this._bootStatus = 'ready';

      log.info('boot', 'Supervisor boot complete', {
        bootTimeMs: Math.round(this.bootDuration),
        componentsEnabled: this.registry.getEnabled().length,
        handlersRegistered: this.getHandlerCounts(),
      });
    } catch (error) {
      this._bootStatus = 'not-started';
      log.error('boot', 'Boot failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Graceful shutdown — disable all components in reverse dependency order
   * 
   * @param timeoutMs - Maximum time to wait for shutdown (default: 30s)
   */
  async shutdown(timeoutMs = 30000): Promise<void> {
    if (this._bootStatus === 'shutdown' || this._bootStatus === 'shutting-down') {
      log.warn('shutdown', 'Supervisor already shutting down');
      return;
    }

    this._bootStatus = 'shutting-down';
    const startTime = performance.now();

    log.info('shutdown', 'Starting graceful shutdown', { timeoutMs });

    try {
      // Get enabled components in reverse dependency order
      const components = this.registry.getInDependencyOrder()
        .filter(c => c.state === 'enabled')
        .reverse();

      // Disable each component
      for (const entry of components) {
        const elapsed = performance.now() - startTime;
        if (elapsed > timeoutMs) {
          log.warn('shutdown', 'Shutdown timeout reached', {
            remaining: components.filter(c => c.state === 'enabled').map(c => c.manifest.name),
          });
          break;
        }

        await this.disableComponent(entry);
      }

      // Clear handler registrations
      this.clearHandlers();

      this._bootStatus = 'shutdown';

      log.info('shutdown', 'Shutdown complete', {
        durationMs: Math.round(performance.now() - startTime),
      });
    } catch (error) {
      log.error('shutdown', 'Shutdown error', {
        error: error instanceof Error ? error.message : String(error),
      });
      this._bootStatus = 'shutdown';
      throw error;
    }
  }

  // ==========================================================================
  // HANDLER REGISTRATION
  // ==========================================================================

  /**
   * Register handlers from a component
   */
  private registerHandlers(component: SensaiComponent): void {
    const handlers = component.handlers;
    if (!handlers) return;

    // Discord handlers
    if (handlers.discord) {
      for (const [name, handler] of Object.entries(handlers.discord)) {
        this.discordHandlers.set(name, {
          component: component.name,
          name,
          handler,
          registeredAt: new Date(),
        });
      }
    }

    // Export handlers
    if (handlers.exports) {
      for (const [name, handler] of Object.entries(handlers.exports)) {
        this.exportHandlers.set(name, {
          component: component.name,
          name,
          handler,
          registeredAt: new Date(),
        });
      }
    }

    // Job handlers
    if (handlers.jobs) {
      for (const [name, handler] of Object.entries(handlers.jobs)) {
        this.jobHandlers.set(name, {
          component: component.name,
          name,
          handler,
          registeredAt: new Date(),
        });
      }
    }

    // HTTP handlers
    if (handlers.http) {
      for (const [name, handler] of Object.entries(handlers.http)) {
        this.httpHandlers.set(name, {
          component: component.name,
          name,
          handler,
          registeredAt: new Date(),
        });
      }
    }

    // CLI handlers
    if (handlers.cli) {
      for (const [name, handler] of Object.entries(handlers.cli)) {
        this.cliHandlers.set(name, {
          component: component.name,
          name,
          handler,
          registeredAt: new Date(),
        });
      }
    }
  }

  /**
   * Unregister handlers from a component
   */
  private unregisterHandlers(componentName: string): void {
    // Remove Discord handlers
    for (const [key, entry] of this.discordHandlers) {
      if (entry.component === componentName) {
        this.discordHandlers.delete(key);
      }
    }

    // Remove export handlers
    for (const [key, entry] of this.exportHandlers) {
      if (entry.component === componentName) {
        this.exportHandlers.delete(key);
      }
    }

    // Remove job handlers
    for (const [key, entry] of this.jobHandlers) {
      if (entry.component === componentName) {
        this.jobHandlers.delete(key);
      }
    }

    // Remove HTTP handlers
    for (const [key, entry] of this.httpHandlers) {
      if (entry.component === componentName) {
        this.httpHandlers.delete(key);
      }
    }

    // Remove CLI handlers
    for (const [key, entry] of this.cliHandlers) {
      if (entry.component === componentName) {
        this.cliHandlers.delete(key);
      }
    }
  }

  /**
   * Clear all handler registrations
   */
  private clearHandlers(): void {
    this.discordHandlers.clear();
    this.exportHandlers.clear();
    this.jobHandlers.clear();
    this.httpHandlers.clear();
    this.cliHandlers.clear();
  }

  // ==========================================================================
  // HANDLER LOOKUPS
  // ==========================================================================

  /**
   * Get a Discord handler by name
   */
  getDiscordHandler(name: string): HandlerLookup<DiscordHandler> | undefined {
    const entry = this.discordHandlers.get(name);
    if (!entry) return undefined;

    return {
      component: entry.component,
      handler: entry.handler,
    };
  }

  /**
   * Get an export handler by type
   */
  getExportHandler(type: string): HandlerLookup<ExportHandler> | undefined {
    const entry = this.exportHandlers.get(type);
    if (!entry) return undefined;

    return {
      component: entry.component,
      handler: entry.handler,
    };
  }

  /**
   * Get a job handler by kind
   */
  getJobHandler(kind: string): HandlerLookup<JobHandler> | undefined {
    const entry = this.jobHandlers.get(kind);
    if (!entry) return undefined;

    return {
      component: entry.component,
      handler: entry.handler,
    };
  }

  /**
   * Get an HTTP handler by route
   */
  getHttpHandler(route: string): HandlerLookup<HttpHandler> | undefined {
    const entry = this.httpHandlers.get(route);
    if (!entry) return undefined;

    return {
      component: entry.component,
      handler: entry.handler,
    };
  }

  /**
   * Get a CLI handler by command
   */
  getCliHandler(command: string): HandlerLookup<CliHandler> | undefined {
    const entry = this.cliHandlers.get(command);
    if (!entry) return undefined;

    return {
      component: entry.component,
      handler: entry.handler,
    };
  }

  /**
   * Get all registered Discord handler names
   */
  getDiscordHandlerNames(): string[] {
    return Array.from(this.discordHandlers.keys());
  }

  /**
   * Get all registered export types
   */
  getExportTypes(): string[] {
    return Array.from(this.exportHandlers.keys());
  }

  /**
   * Get all registered job kinds
   */
  getJobKinds(): string[] {
    return Array.from(this.jobHandlers.keys());
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  /**
   * Get current boot status
   */
  get bootStatus(): SupervisorStats['bootStatus'] {
    return this._bootStatus;
  }

  /**
   * Check if supervisor is ready
   */
  get isReady(): boolean {
    return this._bootStatus === 'ready';
  }

  /**
   * Get supervisor statistics
   */
  getStats(): SupervisorStats {
    return {
      ...this.registry.getStats(),
      handlers: this.getHandlerCounts(),
      bootStatus: this._bootStatus,
      bootTimeMs: this.bootDuration,
    };
  }

  /**
   * Get handler counts by type
   */
  getHandlerCounts(): SupervisorStats['handlers'] {
    return {
      discord: this.discordHandlers.size,
      exports: this.exportHandlers.size,
      jobs: this.jobHandlers.size,
      http: this.httpHandlers.size,
      cli: this.cliHandlers.size,
    };
  }

  /**
   * Get all enabled components
   */
  getEnabledComponents(): RegisteredComponent[] {
    return this.registry.getEnabled();
  }

  /**
   * Get component registry
   */
  getRegistry(): ComponentRegistry {
    return this.registry;
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Create context for a component
   */
  private createContextForComponent(componentName: string): ComponentContext {
    return createComponentContext({
      component: componentName,
      scope: {
        ...this.defaultScope,
        component: componentName,
      },
    });
  }

  /**
   * Enable a single component
   */
  private async enableComponent(entry: RegisteredComponent): Promise<void> {
    const ctx = this.createContextForComponent(entry.manifest.name);

    try {
      await this.registry.enable(entry.manifest.name, ctx);
      this.registerHandlers(entry.manifest);

      log.debug('enable', `Enabled: ${entry.manifest.name}`, {
        handlers: this.countHandlersForComponent(entry.manifest),
      });
    } catch (error) {
      log.error('enable', `Failed to enable ${entry.manifest.name}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Disable a single component
   */
  private async disableComponent(entry: RegisteredComponent): Promise<void> {
    const ctx = this.createContextForComponent(entry.manifest.name);

    try {
      this.unregisterHandlers(entry.manifest.name);
      await this.registry.disable(entry.manifest.name, ctx);

      log.debug('disable', `Disabled: ${entry.manifest.name}`);
    } catch (error) {
      log.error('disable', `Failed to disable ${entry.manifest.name}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue shutdown despite errors
    }
  }

  /**
   * Count handlers for a component
   */
  private countHandlersForComponent(manifest: SensaiComponent): number {
    let count = 0;
    if (manifest.handlers?.discord) count += Object.keys(manifest.handlers.discord).length;
    if (manifest.handlers?.exports) count += Object.keys(manifest.handlers.exports).length;
    if (manifest.handlers?.jobs) count += Object.keys(manifest.handlers.jobs).length;
    if (manifest.handlers?.http) count += Object.keys(manifest.handlers.http).length;
    if (manifest.handlers?.cli) count += Object.keys(manifest.handlers.cli).length;
    return count;
  }

  /**
   * Reset supervisor state (for testing)
   */
  reset(): void {
    this.clearHandlers();
    this.registry.clear();
    this._bootStatus = 'not-started';
    this.bootStartTime = undefined;
    this.bootDuration = undefined;
    log.debug('reset', 'Supervisor reset');
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/** Default supervisor instance */
export const supervisor = new ComponentSupervisor();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Register a component with the default supervisor
 */
export function registerComponent(component: SensaiComponent): void {
  supervisor.register(component);
}

/**
 * Boot the default supervisor
 */
export async function bootSupervisor(): Promise<void> {
  await supervisor.boot();
}

/**
 * Shutdown the default supervisor
 */
export async function shutdownSupervisor(timeoutMs?: number): Promise<void> {
  await supervisor.shutdown(timeoutMs);
}
