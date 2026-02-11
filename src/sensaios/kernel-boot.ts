/**
 * SensaiOS Kernel Boot Sequence
 * 
 * Orchestrates kernel initialization in the correct order:
 * 1. Boot logger (observability before DB)
 * 2. Configuration loading
 * 3. Database connection
 * 4. Kernel primitives initialization
 * 5. Component loading and enabling
 * 6. Handler registration
 * 
 * Per v1.1.2: Observability-first boot sequence.
 * 
 * @module sensaios/kernel-boot
 */

import { scopedLogger } from '../observability/envelope/console.js';
import type { PrismaClient } from '@prisma/client';
import type { HostKind, SensaiComponent, ComponentContext } from './component-context.js';
import { ComponentSupervisor } from './component-supervisor.js';
import { ComponentRegistry } from './component-registry.js';
import { createComponentContext } from './context-factory.js';
import type { TenantScope } from './tenant-scope.js';
import { KERNEL_ERRORS, kernelError } from './sensai-error.js';
import {
  createBootLogger,
  createBootStatus,
  completeBootPhase,
  failBoot,
  clearBootLogger,
  type BootLogger,
  type BootStatus,
  type BootPhase,
} from './boot-logger.js';

const log = scopedLogger('sensaios-kernel');

// ============================================================================
// KERNEL CONFIGURATION
// ============================================================================

/**
 * Kernel boot configuration
 */
export interface KernelConfig {
  /** Service/instance name */
  name: string;
  /** Tenant identifier */
  tenantId: string;
  /** Host type for this instance */
  host: HostKind;
  /** Enable verbose boot logging */
  verboseBoot?: boolean;
  /** Boot timeout in milliseconds */
  bootTimeoutMs?: number;
  /** Shutdown timeout in milliseconds */
  shutdownTimeoutMs?: number;
}

/**
 * Database configuration
 */
export interface DatabaseConfig {
  /** Prisma client instance */
  client: PrismaClient;
  /** Database URL (for logging, not connection) */
  url?: string;
}

/**
 * Kernel instance
 */
export interface SensaiKernel {
  /** Kernel configuration */
  config: KernelConfig;
  /** Boot status */
  bootStatus: BootStatus;
  /** Boot logger */
  bootLog: BootLogger;
  /** Component registry */
  registry: ComponentRegistry;
  /** Component supervisor */
  supervisor: ComponentSupervisor;
  /** Database client */
  db: PrismaClient | null;
  /** Whether kernel is ready */
  isReady: boolean;
  
  // Lifecycle methods
  /** Boot the kernel */
  boot(db: DatabaseConfig, components: SensaiComponent[]): Promise<void>;
  /** Shutdown the kernel */
  shutdown(): Promise<void>;
  /** Get context for a scope */
  getContext(scope: TenantScope): ComponentContext;
  /** Get kernel stats */
  getStats(): KernelStats;
}

/**
 * Kernel statistics
 */
export interface KernelStats {
  /** Kernel name */
  name: string;
  /** Tenant ID */
  tenantId: string;
  /** Host type */
  host: HostKind;
  /** Whether kernel is ready */
  isReady: boolean;
  /** Boot duration in ms */
  bootDurationMs?: number;
  /** Boot phase times */
  bootPhaseTimes: Partial<Record<BootPhase, number>>;
  /** Component count */
  componentCount: number;
  /** Enabled component count */
  enabledCount: number;
  /** Handler counts */
  handlerCounts: {
    discord: number;
    exports: number;
    jobs: number;
    http: number;
    cli: number;
  };
  /** Uptime in ms */
  uptimeMs: number;
}

// ============================================================================
// KERNEL IMPLEMENTATION
// ============================================================================

/**
 * Create a new Sensai kernel instance.
 * 
 * The kernel is the central coordinator for all SensaiOS services.
 * It manages the boot sequence, component lifecycle, and handler dispatch.
 * 
 * @example
 * ```typescript
 * // Create kernel
 * const kernel = createKernel({
 *   name: 'infinity-gauntlet',
 *   tenantId: 'prod',
 *   host: 'bot',
 * });
 * 
 * // Boot with database and components
 * await kernel.boot(
 *   { client: prisma },
 *   [gameCoreComponent, battlesComponent, encountersComponent]
 * );
 * 
 * // Use kernel context
 * const ctx = kernel.getContext({ tenantId: 'prod', guildId: '123' });
 * 
 * // Graceful shutdown
 * await kernel.shutdown();
 * ```
 */
export function createKernel(config: KernelConfig): SensaiKernel {
  const {
    name,
    tenantId,
    host,
    verboseBoot = false,
    bootTimeoutMs = 60000,
    shutdownTimeoutMs = 30000,
  } = config;

  // Initialize boot logger FIRST (before anything else)
  clearBootLogger(); // Clear any previous boot logger
  const bootLog = createBootLogger({
    name: `${name}-boot`,
    json: !verboseBoot,
    minLevel: verboseBoot ? 'debug' : 'info',
  });

  // Initialize boot status
  let bootStatus = createBootStatus();
  bootLog.phase('logger', 'complete');
  bootStatus = completeBootPhase(bootStatus, 'logger');

  // Create registry and supervisor
  const registry = new ComponentRegistry();
  const supervisor = new ComponentSupervisor({ registry, host });

  // Database reference (set during boot)
  let db: PrismaClient | null = null;
  let bootStartTime = Date.now();

  // Boot implementation
  async function boot(
    dbConfig: DatabaseConfig,
    components: SensaiComponent[]
  ): Promise<void> {
    bootStartTime = Date.now();

    // Create boot timeout
    const bootTimeout = setTimeout(() => {
      const error = new Error(`Kernel boot timed out after ${bootTimeoutMs}ms`);
      bootStatus = failBoot(bootStatus, error);
      bootLog.fatal('boot', 'Boot timed out', { timeoutMs: bootTimeoutMs });
      throw error;
    }, bootTimeoutMs);

    try {
      // Phase: Config (already done if we got here)
      bootLog.phase('config', 'start');
      bootLog.info('config', 'Kernel configuration loaded', {
        name,
        tenantId,
        host,
        componentCount: components.length,
      });
      bootLog.phase('config', 'complete');
      bootStatus = completeBootPhase(bootStatus, 'config');

      // Phase: Database
      bootLog.phase('database', 'start');
      db = dbConfig.client;
      
      // Test database connection
      try {
        await db.$queryRaw`SELECT 1`;
        bootLog.info('database', 'Database connection verified');
      } catch (error) {
        const err = error as Error;
        bootLog.error('database', 'Database connection failed', {
          error: err.message,
        });
        throw err;
      }
      bootLog.phase('database', 'complete');
      bootStatus = completeBootPhase(bootStatus, 'database');

      // Phase: Kernel primitives
      bootLog.phase('kernel', 'start');
      bootLog.info('kernel', 'Initializing kernel primitives');
      // Primitives are initialized lazily via context factory
      bootLog.phase('kernel', 'complete');
      bootStatus = completeBootPhase(bootStatus, 'kernel');

      // Phase: Components
      bootLog.phase('components', 'start');
      bootLog.info('components', 'Registering components', {
        count: components.length,
      });
      
      for (const component of components) {
        try {
          supervisor.register(component);
          bootLog.debug('components', `Registered: ${component.name}`, {
            version: component.version,
            hosts: component.hosts,
          });
        } catch (error) {
          const err = error as Error;
          bootLog.error('components', `Failed to register: ${component.name}`, {
            error: err.message,
          });
          throw err;
        }
      }
      bootLog.phase('components', 'complete');
      bootStatus = completeBootPhase(bootStatus, 'components');

      // Phase: Handlers
      bootLog.phase('handlers', 'start');
      bootLog.info('handlers', 'Booting supervisor (enabling components, registering handlers)');
      
      await supervisor.boot();
      
      const handlerCounts = supervisor.getHandlerCounts();
      bootLog.info('handlers', 'Handlers registered', handlerCounts);
      bootLog.phase('handlers', 'complete');
      bootStatus = completeBootPhase(bootStatus, 'handlers');

      // Phase: Ready
      bootLog.phase('ready', 'start');
      bootStatus = completeBootPhase(bootStatus, 'ready');
      
      const totalDuration = Date.now() - bootStartTime;
      bootLog.info('ready', 'Kernel boot complete', {
        durationMs: totalDuration,
        enabledComponents: registry.getEnabled().length,
        handlerCounts,
      });
      bootLog.phase('ready', 'complete');

      log.info('boot', 'SensaiOS kernel ready', {
        name,
        tenantId,
        host,
        bootDurationMs: totalDuration,
        components: registry.getEnabled().length,
      });

    } catch (error) {
      const err = error as Error;
      bootStatus = failBoot(bootStatus, err);
      bootLog.fatal('boot', 'Kernel boot failed', {
        error: err.message,
        phase: bootStatus.currentPhase,
      });
      throw err;
    } finally {
      clearTimeout(bootTimeout);
    }
  }

  // Shutdown implementation
  async function shutdown(): Promise<void> {
    log.info('shutdown', 'Starting kernel shutdown', { timeoutMs: shutdownTimeoutMs });

    const shutdownTimeout = setTimeout(() => {
      log.error('shutdown', 'Shutdown timed out, forcing exit', {
        timeoutMs: shutdownTimeoutMs,
      });
    }, shutdownTimeoutMs);

    try {
      // Shutdown supervisor (disables components in reverse order)
      if (supervisor.isReady) {
        await supervisor.shutdown();
      }

      // Disconnect database
      if (db) {
        await db.$disconnect();
        db = null;
      }

      log.info('shutdown', 'Kernel shutdown complete');
    } finally {
      clearTimeout(shutdownTimeout);
    }
  }

  // Context factory
  function getContext(scope: TenantScope): ComponentContext {
    if (!db) {
      throw kernelError(
        KERNEL_ERRORS.BOOT_DB_UNAVAILABLE,
        'Kernel not booted - database not available'
      );
    }
    return createComponentContext({ scope, component: 'kernel', prisma: db });
  }

  // Stats
  function getStats(): KernelStats {
    return {
      name,
      tenantId,
      host,
      isReady: bootStatus.isReady,
      bootDurationMs: bootStatus.durationMs,
      bootPhaseTimes: bootStatus.phaseTimes,
      componentCount: registry.getAll().length,
      enabledCount: registry.getEnabled().length,
      handlerCounts: supervisor.getHandlerCounts(),
      uptimeMs: Date.now() - bootStartTime,
    };
  }

  return {
    config: { name, tenantId, host, verboseBoot, bootTimeoutMs, shutdownTimeoutMs },
    get bootStatus() { return bootStatus; },
    bootLog,
    registry,
    supervisor,
    get db() { return db; },
    get isReady() { return bootStatus.isReady; },
    boot,
    shutdown,
    getContext,
    getStats,
  };
}

// ============================================================================
// GLOBAL KERNEL INSTANCE
// ============================================================================

let globalKernel: SensaiKernel | null = null;

/**
 * Initialize the global kernel instance.
 */
export function initKernel(config: KernelConfig): SensaiKernel {
  if (globalKernel) {
    throw kernelError(
      KERNEL_ERRORS.BOOT_ALREADY_INITIALIZED,
      'Kernel already initialized'
    );
  }
  globalKernel = createKernel(config);
  return globalKernel;
}

/**
 * Get the global kernel instance.
 */
export function getKernel(): SensaiKernel {
  if (!globalKernel) {
    throw kernelError(
      KERNEL_ERRORS.BOOT_NOT_INITIALIZED,
      'Kernel not initialized - call initKernel() first'
    );
  }
  return globalKernel;
}

/**
 * Check if kernel is initialized.
 */
export function isKernelInitialized(): boolean {
  return globalKernel !== null;
}

/**
 * Clear the global kernel (for testing).
 */
export function clearKernel(): void {
  globalKernel = null;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Boot the global kernel with database and components.
 * 
 * @example
 * ```typescript
 * import { initKernel, bootKernel } from './sensaios/index.js';
 * import { prisma } from './shared/prisma.js';
 * 
 * // Initialize
 * initKernel({ name: 'bot', tenantId: 'prod', host: 'bot' });
 * 
 * // Boot
 * await bootKernel({ client: prisma }, [
 *   gameCoreComponent,
 *   battlesComponent,
 * ]);
 * ```
 */
export async function bootKernel(
  db: DatabaseConfig,
  components: SensaiComponent[]
): Promise<void> {
  const kernel = getKernel();
  await kernel.boot(db, components);
}

/**
 * Shutdown the global kernel gracefully.
 */
export async function shutdownKernel(): Promise<void> {
  if (!globalKernel) {
    return; // Already shutdown or never initialized
  }
  await globalKernel.shutdown();
  globalKernel = null;
}

/**
 * Get context from the global kernel.
 */
export function getKernelContext(scope: TenantScope): ComponentContext {
  return getKernel().getContext(scope);
}

/**
 * Get kernel stats.
 */
export function getKernelStats(): KernelStats {
  return getKernel().getStats();
}
