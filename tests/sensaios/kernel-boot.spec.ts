/**
 * Tests for SensaiOS Kernel Boot — Kernel Lifecycle Management
 *
 * Per v1.1.2: Observability-first boot sequence.
 *
 * @module tests/sensaios/kernel-boot
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { TenantScope } from '../../src/sensaios/tenant-scope.js';
import type { SensaiComponent } from '../../src/sensaios/component-context.js';
import {
  createKernel,
  initKernel,
  getKernel,
  clearKernel,
  isKernelInitialized,
  type SensaiKernel,
  type KernelConfig,
} from '../../src/sensaios/kernel-boot.js';
import { clearBootLogger } from '../../src/sensaios/boot-logger.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const defaultKernelConfig: KernelConfig = {
  name: 'test-kernel',
  tenantId: 'test-tenant',
  host: 'bot',
  verboseBoot: false,
  bootTimeoutMs: 5000,
  shutdownTimeoutMs: 3000,
};

const testScope: TenantScope = {
  tenant: 'test-guild-123',
  environment: 'development',
  service: 'test-service',
  component: 'test-component',
};

// Mock Prisma client
function createMockPrisma(): PrismaClient {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn().mockImplementation(async (fn) => fn({})),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  } as unknown as PrismaClient;
}

// Mock component
function createMockComponent(name: string, overrides?: Partial<SensaiComponent>): SensaiComponent {
  return {
    name,
    version: '1.0.0',
    hosts: ['bot'],
    capabilities: { db: ['read'] },
    onLoad: vi.fn().mockResolvedValue(undefined),
    onEnable: vi.fn().mockResolvedValue(undefined),
    onDisable: vi.fn().mockResolvedValue(undefined),
    onUnload: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ============================================================================
// createKernel Tests
// ============================================================================

describe('createKernel', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    clearBootLogger();
    clearKernel();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearBootLogger();
    clearKernel();
  });

  describe('creation', () => {
    it('should create kernel with config', () => {
      const kernel = createKernel(defaultKernelConfig);

      expect(kernel).toBeDefined();
      expect(kernel.config.name).toBe('test-kernel');
      expect(kernel.config.tenantId).toBe('test-tenant');
      expect(kernel.config.host).toBe('bot');
    });

    it('should initialize boot logger immediately', () => {
      const kernel = createKernel(defaultKernelConfig);

      // Boot logger should exist
      expect(kernel.bootLog).toBeDefined();
      expect(typeof kernel.bootLog.info).toBe('function');
    });

    it('should create registry and supervisor', () => {
      const kernel = createKernel(defaultKernelConfig);

      expect(kernel.registry).toBeDefined();
      expect(kernel.supervisor).toBeDefined();
    });

    it('should start with isReady = false', () => {
      const kernel = createKernel(defaultKernelConfig);

      expect(kernel.isReady).toBe(false);
    });

    it('should have null db before boot', () => {
      const kernel = createKernel(defaultKernelConfig);

      expect(kernel.db).toBeNull();
    });

    it('should use default values for optional config', () => {
      const kernel = createKernel({
        name: 'minimal',
        tenantId: 'test',
        host: 'worker',
      });

      expect(kernel.config.verboseBoot).toBe(false);
      expect(kernel.config.bootTimeoutMs).toBe(60000);
      expect(kernel.config.shutdownTimeoutMs).toBe(30000);
    });
  });
});

// ============================================================================
// Boot Sequence Tests
// ============================================================================

describe('kernel.boot', () => {
  let kernel: SensaiKernel;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    clearBootLogger();
    clearKernel();
    
    kernel = createKernel(defaultKernelConfig);
    mockPrisma = createMockPrisma();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearBootLogger();
    clearKernel();
  });

  describe('successful boot', () => {
    it('should complete boot phases in order', async () => {
      const component = createMockComponent('test.component');

      await kernel.boot({ client: mockPrisma }, [component]);

      expect(kernel.isReady).toBe(true);
      expect(kernel.bootStatus.isReady).toBe(true);
    });

    it('should verify database connection', async () => {
      await kernel.boot({ client: mockPrisma }, []);

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it('should register all components', async () => {
      const comp1 = createMockComponent('test.comp1');
      const comp2 = createMockComponent('test.comp2');

      await kernel.boot({ client: mockPrisma }, [comp1, comp2]);

      expect(kernel.registry.getAll()).toHaveLength(2);
    });

    it('should enable components via supervisor', async () => {
      const component = createMockComponent('test.component');

      await kernel.boot({ client: mockPrisma }, [component]);

      // onEnable should have been called
      expect(component.onEnable).toHaveBeenCalled();
    });

    it('should track boot duration', async () => {
      await kernel.boot({ client: mockPrisma }, []);

      expect(kernel.bootStatus.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should track individual phase times', async () => {
      await kernel.boot({ client: mockPrisma }, []);

      const phaseTimes = kernel.bootStatus.phaseTimes;
      expect(phaseTimes.config).toBeDefined();
      expect(phaseTimes.database).toBeDefined();
      expect(phaseTimes.kernel).toBeDefined();
    });

    it('should store database client reference', async () => {
      await kernel.boot({ client: mockPrisma }, []);

      expect(kernel.db).toBe(mockPrisma);
    });
  });

  describe('boot failures', () => {
    it('should fail if database connection fails', async () => {
      const failingPrisma = {
        ...mockPrisma,
        $queryRaw: vi.fn().mockRejectedValue(new Error('Connection refused')),
      } as unknown as PrismaClient;

      await expect(
        kernel.boot({ client: failingPrisma }, [])
      ).rejects.toThrow('Connection refused');

      expect(kernel.isReady).toBe(false);
      expect(kernel.bootStatus.error).toBeDefined();
    });

    it('should fail if component registration fails', async () => {
      const badComponent = createMockComponent('bad.component');
      // Supervisor throws on duplicate registration or validation error
      // We'll test onLoad failure
      badComponent.onLoad = vi.fn().mockRejectedValue(new Error('Load failed'));

      await expect(
        kernel.boot({ client: mockPrisma }, [badComponent])
      ).rejects.toThrow();

      expect(kernel.isReady).toBe(false);
    });

    it('should mark boot status error on database validation failure', async () => {
      const failingPrisma = {
        ...mockPrisma,
        $queryRaw: vi.fn().mockRejectedValue(new Error('Connection refused')),
      } as unknown as PrismaClient;

      try {
        await kernel.boot({ client: failingPrisma }, []);
      } catch {
        // Expected
      }

      expect(kernel.bootStatus.error).toBeDefined();
      expect(kernel.bootStatus.isReady).toBe(false);
    });
  });

  describe('component lifecycle during boot', () => {
    it('should call onLoad for each component', async () => {
      const comp1 = createMockComponent('test.comp1');
      const comp2 = createMockComponent('test.comp2');

      await kernel.boot({ client: mockPrisma }, [comp1, comp2]);

      expect(comp1.onLoad).toHaveBeenCalled();
      expect(comp2.onLoad).toHaveBeenCalled();
    });

    it('should call onEnable after registration', async () => {
      const component = createMockComponent('test.component');
      const enableOrder: string[] = [];

      component.onLoad = vi.fn().mockImplementation(async () => {
        enableOrder.push('load');
      });
      component.onEnable = vi.fn().mockImplementation(async () => {
        enableOrder.push('enable');
      });

      await kernel.boot({ client: mockPrisma }, [component]);

      expect(enableOrder).toEqual(['load', 'enable']);
    });
  });
});

// ============================================================================
// Shutdown Tests
// ============================================================================

describe('kernel.shutdown', () => {
  let kernel: SensaiKernel;
  let mockPrisma: PrismaClient;

  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    clearBootLogger();
    clearKernel();
    
    kernel = createKernel(defaultKernelConfig);
    mockPrisma = createMockPrisma();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearBootLogger();
    clearKernel();
  });

  it('should complete shutdown gracefully', async () => {
    await kernel.boot({ client: mockPrisma }, []);
    await kernel.shutdown();

    expect(mockPrisma.$disconnect).toHaveBeenCalled();
  });

  it('should disable components in reverse order', async () => {
    const comp1 = createMockComponent('test.comp1');
    const comp2 = createMockComponent('test.comp2');
    const disableOrder: string[] = [];

    comp1.onDisable = vi.fn().mockImplementation(async () => {
      disableOrder.push('comp1');
    });
    comp2.onDisable = vi.fn().mockImplementation(async () => {
      disableOrder.push('comp2');
    });

    await kernel.boot({ client: mockPrisma }, [comp1, comp2]);
    await kernel.shutdown();

    // Should disable in reverse order (LIFO)
    expect(disableOrder).toEqual(['comp2', 'comp1']);
  });

  it('should disconnect database', async () => {
    await kernel.boot({ client: mockPrisma }, []);
    await kernel.shutdown();

    expect(mockPrisma.$disconnect).toHaveBeenCalled();
    expect(kernel.db).toBeNull();
  });

  it('should be safe to call shutdown without boot', async () => {
    // Kernel not booted
    await expect(kernel.shutdown()).resolves.not.toThrow();
  });

  it('should call onDisable for enabled components', async () => {
    const component = createMockComponent('test.component');

    await kernel.boot({ client: mockPrisma }, [component]);
    await kernel.shutdown();

    expect(component.onDisable).toHaveBeenCalled();
  });
});

// ============================================================================
// getContext Tests
// ============================================================================

describe('kernel.getContext', () => {
  let kernel: SensaiKernel;
  let mockPrisma: PrismaClient;

  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    clearBootLogger();
    clearKernel();
    
    kernel = createKernel(defaultKernelConfig);
    mockPrisma = createMockPrisma();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearBootLogger();
    clearKernel();
  });

  it('should create ComponentContext for scope', async () => {
    await kernel.boot({ client: mockPrisma }, []);

    const ctx = kernel.getContext(testScope);

    expect(ctx).toBeDefined();
    expect(ctx.scope).toBe(testScope);
    expect(ctx.db).toBeDefined();
  });

  it('should throw if kernel not ready', () => {
    // Kernel not booted
    expect(() => kernel.getContext(testScope)).toThrow(/not booted/i);
  });

  it('should include all kernel primitives', async () => {
    await kernel.boot({ client: mockPrisma }, []);

    const ctx = kernel.getContext(testScope);

    // Verify all primitives exist
    expect(ctx.db).toBeDefined();
    expect(ctx.exports).toBeDefined();
    expect(ctx.jobs).toBeDefined();
    expect(ctx.outbox).toBeDefined();
    expect(ctx.config).toBeDefined();
    expect(ctx.rbac).toBeDefined();
    expect(ctx.obs).toBeDefined();
    expect(ctx.rng).toBeDefined();
    expect(ctx.storage).toBeDefined();
  });
});

// ============================================================================
// getStats Tests
// ============================================================================

describe('kernel.getStats', () => {
  let kernel: SensaiKernel;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    clearBootLogger();
    clearKernel();
    
    kernel = createKernel(defaultKernelConfig);
    mockPrisma = createMockPrisma();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearBootLogger();
    clearKernel();
  });

  it('should return kernel statistics', () => {
    const stats = kernel.getStats();

    expect(stats.name).toBe('test-kernel');
    expect(stats.tenantId).toBe('test-tenant');
    expect(stats.host).toBe('bot');
  });

  it('should include boot phase times after boot', async () => {
    await kernel.boot({ client: mockPrisma }, []);

    const stats = kernel.getStats();

    expect(stats.isReady).toBe(true);
    expect(stats.bootDurationMs).toBeGreaterThanOrEqual(0);
    expect(stats.bootPhaseTimes).toBeDefined();
  });

  it('should include component counts', async () => {
    const comp1 = createMockComponent('test.comp1');
    const comp2 = createMockComponent('test.comp2');

    await kernel.boot({ client: mockPrisma }, [comp1, comp2]);

    const stats = kernel.getStats();

    expect(stats.componentCount).toBe(2);
    expect(stats.enabledCount).toBe(2);
  });

  it('should include handler counts', async () => {
    const component = createMockComponent('test.component', {
      handlers: {
        discord: {
          'test-command': vi.fn(),
        },
      },
    });

    await kernel.boot({ client: mockPrisma }, [component]);

    const stats = kernel.getStats();

    expect(stats.handlerCounts).toBeDefined();
    expect(stats.handlerCounts.discord).toBe(1);
  });

  it('should track uptime', async () => {
    await kernel.boot({ client: mockPrisma }, []);

    const stats1 = kernel.getStats();
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const stats2 = kernel.getStats();

    expect(stats2.uptimeMs).toBeGreaterThan(stats1.uptimeMs);
  });
});

// ============================================================================
// Global Kernel Tests
// ============================================================================

describe('global kernel', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    clearBootLogger();
    clearKernel();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearBootLogger();
    clearKernel();
  });

  describe('initKernel', () => {
    it('should initialize global kernel', () => {
      const kernel = initKernel(defaultKernelConfig);

      expect(kernel).toBeDefined();
      expect(isKernelInitialized()).toBe(true);
    });

    it('should throw if already initialized', () => {
      initKernel(defaultKernelConfig);

      expect(() => initKernel(defaultKernelConfig)).toThrow(/already initialized/i);
    });
  });

  describe('getKernel', () => {
    it('should return global kernel after init', () => {
      const initialized = initKernel(defaultKernelConfig);
      const retrieved = getKernel();

      expect(retrieved).toBe(initialized);
    });

    it('should throw if not initialized', () => {
      expect(() => getKernel()).toThrow(/not initialized/i);
    });
  });

  describe('clearKernel', () => {
    it('should clear global kernel', () => {
      initKernel(defaultKernelConfig);
      expect(isKernelInitialized()).toBe(true);

      clearKernel();
      expect(isKernelInitialized()).toBe(false);
    });

    it('should be safe to clear when not initialized', () => {
      expect(() => clearKernel()).not.toThrow();
    });
  });

  describe('isKernelInitialized', () => {
    it('should return false before init', () => {
      expect(isKernelInitialized()).toBe(false);
    });

    it('should return true after init', () => {
      initKernel(defaultKernelConfig);
      expect(isKernelInitialized()).toBe(true);
    });

    it('should return false after clear', () => {
      initKernel(defaultKernelConfig);
      clearKernel();
      expect(isKernelInitialized()).toBe(false);
    });
  });
});

// ============================================================================
// Boot Order Verification Tests
// ============================================================================

describe('boot order verification (v1.1.2 compliance)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    clearBootLogger();
    clearKernel();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearBootLogger();
    clearKernel();
  });

  it('should complete logger phase before database phase', async () => {
    const kernel = createKernel(defaultKernelConfig);
    const mockPrisma = createMockPrisma();

    // Boot logger should already have entries from creation
    const entriesBeforeBoot = kernel.bootLog.getEntries();
    expect(entriesBeforeBoot.length).toBeGreaterThan(0);

    await kernel.boot({ client: mockPrisma }, []);

    // Logger phase should be before database phase
    const loggerTime = kernel.bootStatus.phaseTimes.logger;
    const databaseTime = kernel.bootStatus.phaseTimes.database;

    // Logger phase completes first (smaller timestamp)
    if (loggerTime !== undefined && databaseTime !== undefined) {
      expect(loggerTime).toBeLessThanOrEqual(databaseTime);
    }
  });

  it('should have boot logger available if database connection fails', async () => {
    const kernel = createKernel(defaultKernelConfig);
    const failingPrisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('DB failed')),
      $disconnect: vi.fn(),
    } as unknown as PrismaClient;

    try {
      await kernel.boot({ client: failingPrisma }, []);
    } catch {
      // Expected to fail
    }

    // Boot logger should have captured the error
    const entries = kernel.bootLog.getEntries();
    const errorEntry = entries.find(e => e.level === 'error' || e.level === 'fatal');
    expect(errorEntry).toBeDefined();
  });
});
