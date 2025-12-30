/**
 * SensaiOS Component Registry & Supervisor Tests
 * 
 * Tests for component lifecycle, validation, and handler registration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  // Registry
  ComponentRegistry,
  // Supervisor
  ComponentSupervisor,
  // Types
  type SensaiComponent,
  type ComponentContext,
  // Context factory
  createTestContext,
} from '../../src/sensaios/index.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createValidComponent(
  name: string,
  options: Partial<SensaiComponent> = {}
): SensaiComponent {
  return {
    name,
    version: '1.0.0',
    hosts: ['bot'],
    capabilities: { db: ['read'] },
    ...options,
  };
}

function createComponentWithHandlers(name: string): SensaiComponent {
  return {
    name,
    version: '1.0.0',
    hosts: ['bot'],
    capabilities: { db: ['read', 'write'] },
    handlers: {
      discord: {
        [`${name}:command`]: vi.fn(),
        [`${name}:button`]: vi.fn(),
      },
      exports: {
        [`${name}.event`]: vi.fn(),
      },
      jobs: {
        [`${name}.process`]: vi.fn(),
      },
    },
  };
}

// ============================================================================
// COMPONENT REGISTRY TESTS
// ============================================================================

describe('ComponentRegistry', () => {
  let registry: ComponentRegistry;

  beforeEach(() => {
    registry = new ComponentRegistry();
  });

  describe('install', () => {
    it('should install a valid component', () => {
      const component = createValidComponent('game.battles');
      const result = registry.install(component);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(registry.has('game.battles')).toBe(true);
    });

    it('should reject component with missing name', () => {
      const component = createValidComponent('');
      const result = registry.install(component);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_NAME')).toBe(true);
    });

    it('should reject component with invalid name format', () => {
      const component = createValidComponent('InvalidName');
      const result = registry.install(component);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_NAME')).toBe(true);
    });

    it('should reject component with missing version', () => {
      const component = createValidComponent('game.test', { version: '' });
      const result = registry.install(component);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_VERSION')).toBe(true);
    });

    it('should reject component with missing hosts', () => {
      const component = createValidComponent('game.test', { hosts: [] });
      const result = registry.install(component);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_HOSTS')).toBe(true);
    });

    it('should reject component with missing capabilities', () => {
      const component = createValidComponent('game.test');
      // @ts-expect-error Testing invalid input
      component.capabilities = undefined;
      const result = registry.install(component);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_CAPABILITIES')).toBe(true);
    });

    it('should reject duplicate installation', () => {
      const component = createValidComponent('game.battles');
      registry.install(component);

      const result = registry.install(component);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'ALREADY_INSTALLED')).toBe(true);
    });

    it('should warn on non-semver version', () => {
      const component = createValidComponent('game.test', { version: 'alpha' });
      const result = registry.install(component);

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.code === 'INVALID_SEMVER')).toBe(true);
    });

    it('should reject self-dependency', () => {
      const component = createValidComponent('game.test', {
        dependencies: ['game.test'],
      });
      const result = registry.install(component);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'SELF_DEPENDENCY')).toBe(true);
    });

    it('should reject ownership without write capability', () => {
      const component = createValidComponent('game.test', {
        owns: { canonical: ['trainers'] },
      });
      const result = registry.install(component);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'OWNERSHIP_WITHOUT_WRITE')).toBe(true);
    });
  });

  describe('uninstall', () => {
    it('should uninstall a disabled component', () => {
      const component = createValidComponent('game.battles');
      registry.install(component);
      registry.uninstall('game.battles');

      expect(registry.has('game.battles')).toBe(false);
    });

    it('should throw when uninstalling non-existent component', () => {
      expect(() => registry.uninstall('nonexistent')).toThrow('not found');
    });

    it('should throw when uninstalling enabled component', async () => {
      const component = createValidComponent('game.battles');
      registry.install(component);
      await registry.enable('game.battles', createTestContext());

      expect(() => registry.uninstall('game.battles')).toThrow('Disable it first');
    });
  });

  describe('enable/disable', () => {
    it('should enable a component', async () => {
      const component = createValidComponent('game.battles');
      registry.install(component);

      await registry.enable('game.battles', createTestContext());

      expect(registry.isEnabled('game.battles')).toBe(true);
    });

    it('should call onLoad and onEnable hooks', async () => {
      const onLoad = vi.fn();
      const onEnable = vi.fn();

      const component = createValidComponent('game.battles', { onLoad, onEnable });
      registry.install(component);

      await registry.enable('game.battles', createTestContext());

      expect(onLoad).toHaveBeenCalled();
      expect(onEnable).toHaveBeenCalled();
    });

    it('should disable a component', async () => {
      const component = createValidComponent('game.battles');
      registry.install(component);
      await registry.enable('game.battles', createTestContext());

      await registry.disable('game.battles', createTestContext());

      expect(registry.isEnabled('game.battles')).toBe(false);
    });

    it('should call onDisable and onUnload hooks', async () => {
      const onDisable = vi.fn();
      const onUnload = vi.fn();

      const component = createValidComponent('game.battles', { onDisable, onUnload });
      registry.install(component);
      await registry.enable('game.battles', createTestContext());

      await registry.disable('game.battles', createTestContext());

      expect(onDisable).toHaveBeenCalled();
      expect(onUnload).toHaveBeenCalled();
    });

    it('should throw when enabling without dependencies', async () => {
      const dep = createValidComponent('game.core');
      const component = createValidComponent('game.battles', {
        dependencies: ['game.core'],
      });

      registry.install(dep);
      registry.install(component);
      // Note: game.core is not enabled

      await expect(
        registry.enable('game.battles', createTestContext())
      ).rejects.toThrow('unmet dependencies');
    });

    it('should throw when disabling with enabled dependents', async () => {
      const core = createValidComponent('game.core');
      const battles = createValidComponent('game.battles', {
        dependencies: ['game.core'],
      });

      registry.install(core);
      registry.install(battles);
      await registry.enable('game.core', createTestContext());
      await registry.enable('game.battles', createTestContext());

      await expect(
        registry.disable('game.core', createTestContext())
      ).rejects.toThrow('enabled dependents');
    });
  });

  describe('dependency management', () => {
    it('should track dependencies', () => {
      const core = createValidComponent('game.core');
      const battles = createValidComponent('game.battles', {
        dependencies: ['game.core'],
      });

      registry.install(core);
      registry.install(battles);

      expect(registry.getDependencies('game.battles')).toContain('game.core');
      expect(registry.getDependents('game.core')).toContain('game.battles');
    });

    it('should return components in dependency order', () => {
      const core = createValidComponent('game.core');
      const battles = createValidComponent('game.battles', {
        dependencies: ['game.core'],
      });
      const economy = createValidComponent('game.economy', {
        dependencies: ['game.core', 'game.battles'],
      });

      // Install in wrong order
      registry.install(economy);
      registry.install(battles);
      registry.install(core);

      const ordered = registry.getInDependencyOrder();
      const names = ordered.map(c => c.manifest.name);

      // Core must come before battles, battles before economy
      expect(names.indexOf('game.core')).toBeLessThan(names.indexOf('game.battles'));
      expect(names.indexOf('game.battles')).toBeLessThan(names.indexOf('game.economy'));
    });

    it('should detect circular dependencies', () => {
      const a = createValidComponent('mod.a', { dependencies: ['mod.b'] });
      const b = createValidComponent('mod.b', { dependencies: ['mod.c'] });
      const c = createValidComponent('mod.c', { dependencies: ['mod.a'] });

      registry.install(a);
      registry.install(b);
      registry.install(c);

      const cycles = registry.detectCircularDependencies();

      expect(cycles.length).toBeGreaterThan(0);
    });
  });

  describe('queries', () => {
    beforeEach(async () => {
      registry.install(createValidComponent('game.core'));
      registry.install(createValidComponent('game.battles', { hosts: ['bot', 'worker'] }));
      registry.install(createValidComponent('game.encounters'));

      await registry.enable('game.core', createTestContext());
      await registry.enable('game.battles', createTestContext());
    });

    it('should get all components', () => {
      expect(registry.getAll()).toHaveLength(3);
    });

    it('should get enabled components', () => {
      const enabled = registry.getEnabled();
      expect(enabled).toHaveLength(2);
      expect(enabled.map(c => c.manifest.name)).toContain('game.core');
      expect(enabled.map(c => c.manifest.name)).toContain('game.battles');
    });

    it('should get installed (not enabled) components', () => {
      const installed = registry.getInstalled();
      expect(installed).toHaveLength(1);
      expect(installed[0].manifest.name).toBe('game.encounters');
    });

    it('should get components by host', () => {
      const botComponents = registry.getByHost('bot');
      expect(botComponents).toHaveLength(3);

      const workerComponents = registry.getByHost('worker');
      expect(workerComponents).toHaveLength(1);
      expect(workerComponents[0].manifest.name).toBe('game.battles');
    });

    it('should get components for host (enabled only)', () => {
      const forBot = registry.getForHost('bot');
      expect(forBot).toHaveLength(2);

      const forWorker = registry.getForHost('worker');
      expect(forWorker).toHaveLength(1);
    });

    it('should get stats', () => {
      const stats = registry.getStats();

      expect(stats.total).toBe(3);
      expect(stats.byState.enabled).toBe(2);
      expect(stats.byState.installed).toBe(1);
      expect(stats.byHost.bot).toBe(3);
    });
  });
});

// ============================================================================
// COMPONENT SUPERVISOR TESTS
// ============================================================================

describe('ComponentSupervisor', () => {
  let supervisor: ComponentSupervisor;
  let registry: ComponentRegistry;

  beforeEach(() => {
    registry = new ComponentRegistry();
    supervisor = new ComponentSupervisor({ registry, host: 'bot' });
  });

  afterEach(async () => {
    if (supervisor.bootStatus === 'ready') {
      await supervisor.shutdown();
    }
    supervisor.reset();
  });

  describe('register', () => {
    it('should register a valid component', () => {
      const component = createValidComponent('game.battles');
      supervisor.register(component);

      expect(registry.has('game.battles')).toBe(true);
    });

    it('should throw on invalid component', () => {
      const component = createValidComponent('');

      expect(() => supervisor.register(component)).toThrow('Failed to register');
    });

    it('should register multiple components', () => {
      supervisor.registerAll([
        createValidComponent('game.core'),
        createValidComponent('game.battles'),
        createValidComponent('game.encounters'),
      ]);

      expect(registry.getAll()).toHaveLength(3);
    });
  });

  describe('boot', () => {
    it('should boot and enable components', async () => {
      supervisor.register(createValidComponent('game.core'));
      supervisor.register(createValidComponent('game.battles', {
        dependencies: ['game.core'],
      }));

      await supervisor.boot();

      expect(supervisor.bootStatus).toBe('ready');
      expect(supervisor.isReady).toBe(true);
      expect(registry.isEnabled('game.core')).toBe(true);
      expect(registry.isEnabled('game.battles')).toBe(true);
    });

    it('should register handlers during boot', async () => {
      supervisor.register(createComponentWithHandlers('game.battles'));

      await supervisor.boot();

      expect(supervisor.getDiscordHandler('game.battles:command')).toBeDefined();
      expect(supervisor.getDiscordHandler('game.battles:button')).toBeDefined();
      expect(supervisor.getExportHandler('game.battles.event')).toBeDefined();
      expect(supervisor.getJobHandler('game.battles.process')).toBeDefined();
    });

    it('should fail on circular dependencies', async () => {
      supervisor.register(createValidComponent('mod.a', { dependencies: ['mod.b'] }));
      supervisor.register(createValidComponent('mod.b', { dependencies: ['mod.a'] }));

      await expect(supervisor.boot()).rejects.toThrow('Circular dependencies');
    });

    it('should throw if already booting', async () => {
      supervisor.register(createValidComponent('game.core'));

      const bootPromise = supervisor.boot();

      await expect(supervisor.boot()).rejects.toThrow('Cannot boot');

      await bootPromise;
    });
  });

  describe('shutdown', () => {
    it('should disable components in reverse order', async () => {
      const disableOrder: string[] = [];

      supervisor.register(createValidComponent('game.core', {
        onDisable: async () => { disableOrder.push('game.core'); },
      }));
      supervisor.register(createValidComponent('game.battles', {
        dependencies: ['game.core'],
        onDisable: async () => { disableOrder.push('game.battles'); },
      }));

      await supervisor.boot();
      await supervisor.shutdown();

      // battles should be disabled before core (reverse dependency order)
      expect(disableOrder).toEqual(['game.battles', 'game.core']);
      expect(supervisor.bootStatus).toBe('shutdown');
    });

    it('should clear handlers on shutdown', async () => {
      supervisor.register(createComponentWithHandlers('game.battles'));

      await supervisor.boot();
      expect(supervisor.getDiscordHandler('game.battles:command')).toBeDefined();

      await supervisor.shutdown();
      expect(supervisor.getDiscordHandler('game.battles:command')).toBeUndefined();
    });
  });

  describe('handler lookups', () => {
    beforeEach(async () => {
      supervisor.register(createComponentWithHandlers('game.battles'));
      supervisor.register(createComponentWithHandlers('game.encounters'));
      await supervisor.boot();
    });

    it('should get Discord handler', () => {
      const lookup = supervisor.getDiscordHandler('game.battles:command');

      expect(lookup).toBeDefined();
      expect(lookup!.component).toBe('game.battles');
      expect(typeof lookup!.handler).toBe('function');
    });

    it('should get export handler', () => {
      const lookup = supervisor.getExportHandler('game.battles.event');

      expect(lookup).toBeDefined();
      expect(lookup!.component).toBe('game.battles');
    });

    it('should get job handler', () => {
      const lookup = supervisor.getJobHandler('game.battles.process');

      expect(lookup).toBeDefined();
      expect(lookup!.component).toBe('game.battles');
    });

    it('should return undefined for unknown handler', () => {
      expect(supervisor.getDiscordHandler('unknown:command')).toBeUndefined();
      expect(supervisor.getExportHandler('unknown.event')).toBeUndefined();
      expect(supervisor.getJobHandler('unknown.job')).toBeUndefined();
    });

    it('should list all handler names', () => {
      const discordNames = supervisor.getDiscordHandlerNames();
      expect(discordNames).toContain('game.battles:command');
      expect(discordNames).toContain('game.encounters:command');

      const exportTypes = supervisor.getExportTypes();
      expect(exportTypes).toContain('game.battles.event');

      const jobKinds = supervisor.getJobKinds();
      expect(jobKinds).toContain('game.battles.process');
    });
  });

  describe('stats', () => {
    beforeEach(async () => {
      supervisor.register(createComponentWithHandlers('game.battles'));
      supervisor.register(createValidComponent('game.core'));
      await supervisor.boot();
    });

    it('should return complete stats', () => {
      const stats = supervisor.getStats();

      expect(stats.total).toBe(2);
      expect(stats.byState.enabled).toBe(2);
      expect(stats.bootStatus).toBe('ready');
      expect(stats.bootTimeMs).toBeGreaterThan(0);
      expect(stats.handlers.discord).toBeGreaterThan(0);
    });

    it('should get handler counts', () => {
      const counts = supervisor.getHandlerCounts();

      expect(counts.discord).toBe(2); // command + button
      expect(counts.exports).toBe(1);
      expect(counts.jobs).toBe(1);
    });

    it('should get enabled components', () => {
      const enabled = supervisor.getEnabledComponents();

      expect(enabled).toHaveLength(2);
    });
  });

  describe('host filtering', () => {
    it('should only enable components for current host', async () => {
      supervisor.register(createValidComponent('game.core', { hosts: ['bot'] }));
      supervisor.register(createValidComponent('worker.cache', { hosts: ['worker'] }));

      await supervisor.boot();

      // Only bot components should be enabled
      expect(registry.isEnabled('game.core')).toBe(true);
      expect(registry.isEnabled('worker.cache')).toBe(false);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Component Lifecycle Integration', () => {
  let supervisor: ComponentSupervisor;
  let callOrder: string[] = [];

  beforeEach(() => {
    callOrder = [];
    const registry = new ComponentRegistry();
    supervisor = new ComponentSupervisor({ registry, host: 'bot' });
  });

  afterEach(async () => {
    if (supervisor.bootStatus === 'ready') {
      await supervisor.shutdown();
    }
    supervisor.reset();
  });

  it('should execute full lifecycle in correct order', async () => {
    supervisor.register(createValidComponent('game.core', {
      onLoad: async () => { callOrder.push('core:onLoad'); },
      onEnable: async () => { callOrder.push('core:onEnable'); },
      onDisable: async () => { callOrder.push('core:onDisable'); },
      onUnload: async () => { callOrder.push('core:onUnload'); },
    }));

    supervisor.register(createValidComponent('game.battles', {
      dependencies: ['game.core'],
      onLoad: async () => { callOrder.push('battles:onLoad'); },
      onEnable: async () => { callOrder.push('battles:onEnable'); },
      onDisable: async () => { callOrder.push('battles:onDisable'); },
      onUnload: async () => { callOrder.push('battles:onUnload'); },
    }));

    // Boot
    await supervisor.boot();

    expect(callOrder).toEqual([
      'core:onLoad',
      'core:onEnable',
      'battles:onLoad',
      'battles:onEnable',
    ]);

    callOrder = [];

    // Shutdown
    await supervisor.shutdown();

    expect(callOrder).toEqual([
      'battles:onDisable',
      'battles:onUnload',
      'core:onDisable',
      'core:onUnload',
    ]);
  });

  it('should provide context to lifecycle hooks', async () => {
    let capturedContext: ComponentContext | undefined;

    supervisor.register(createValidComponent('game.test', {
      onEnable: async (ctx) => {
        capturedContext = ctx;
      },
    }));

    await supervisor.boot();

    expect(capturedContext).toBeDefined();
    expect(capturedContext!.scope).toBeDefined();
    expect(capturedContext!.db).toBeDefined();
    expect(capturedContext!.exports).toBeDefined();
    expect(capturedContext!.obs).toBeDefined();
  });
});
