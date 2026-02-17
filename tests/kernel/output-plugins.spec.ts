/**
 * Output Plugin System Tests — KERNEL.LOGGING.OUTPUT_PLUGINS
 * 
 * Comprehensive tests for the kernel output plugin architecture:
 * 1. Plugin registration and lifecycle
 * 2. Dispatch wiring (kernel-logger → plugins)
 * 3. ConsoleOutput plugin
 * 4. FileOutput plugin (no-op)
 * 5. Level filtering and custom filters
 * 6. Error isolation (plugin failures don't break logging)
 * 7. BufferedPlugin and FilteredPlugin factories
 * 
 * @module tests/kernel/output-plugins.spec
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { KernelLogEntry, KernelLogLevel } from '../../src/kernel/kernel-logger.js';
import type { KernelOutputPlugin, PluginStats } from '../../src/kernel/kernel-output-plugins.js';

// ============================================================================
// MOCK HELPERS
// ============================================================================

/**
 * Create a minimal valid KernelLogEntry for testing
 */
function createEntry(overrides: Partial<KernelLogEntry> = {}): KernelLogEntry {
  return {
    timestamp: new Date().toISOString(),
    uptimeMs: 1234,
    level: 'INFO',
    component: 'test-component',
    message: 'Test message',
    ...overrides,
  };
}

/**
 * Create a spy plugin that records all calls
 */
function createSpyPlugin(overrides: Partial<KernelOutputPlugin> = {}): KernelOutputPlugin & {
  writeCalls: KernelLogEntry[];
  flushCalls: number;
  shutdownCalls: number;
  initCalls: number;
} {
  const state = {
    writeCalls: [] as KernelLogEntry[],
    flushCalls: 0,
    shutdownCalls: 0,
    initCalls: 0,
  };

  return {
    name: 'spy-plugin',
    version: '1.0.0',
    enabled: true,
    minLevel: 'TRACE' as KernelLogLevel,

    initialize() {
      state.initCalls++;
    },
    write(entry: KernelLogEntry) {
      state.writeCalls.push(entry);
    },
    flush() {
      state.flushCalls++;
    },
    shutdown() {
      state.shutdownCalls++;
    },
    getStats(): PluginStats {
      return {
        entriesProcessed: state.writeCalls.length,
        entriesFiltered: 0,
        writeErrors: 0,
        lastWriteTime: null,
        lastError: null,
      };
    },

    ...overrides,
    // Expose state for assertions
    get writeCalls() { return state.writeCalls; },
    get flushCalls() { return state.flushCalls; },
    get shutdownCalls() { return state.shutdownCalls; },
    get initCalls() { return state.initCalls; },
  };
}

// ============================================================================
// TESTS: Plugin Registration & Lifecycle
// ============================================================================

describe('Kernel Output Plugin System', () => {
  // We test the plugin system in isolation by importing its functions directly
  // rather than going through the full kernel boot sequence.

  let registerOutputPlugin: typeof import('../../src/kernel/kernel-output-plugins.js').registerOutputPlugin;
  let unregisterOutputPlugin: typeof import('../../src/kernel/kernel-output-plugins.js').unregisterOutputPlugin;
  let getPlugin: typeof import('../../src/kernel/kernel-output-plugins.js').getPlugin;
  let getAllPlugins: typeof import('../../src/kernel/kernel-output-plugins.js').getAllPlugins;
  let setPluginEnabled: typeof import('../../src/kernel/kernel-output-plugins.js').setPluginEnabled;
  let dispatchToPlugins: typeof import('../../src/kernel/kernel-output-plugins.js').dispatchToPlugins;
  let dispatchToPluginsSync: typeof import('../../src/kernel/kernel-output-plugins.js').dispatchToPluginsSync;
  let initializePluginSystem: typeof import('../../src/kernel/kernel-output-plugins.js').initializePluginSystem;
  let flushAllPlugins: typeof import('../../src/kernel/kernel-output-plugins.js').flushAllPlugins;
  let shutdownPluginSystem: typeof import('../../src/kernel/kernel-output-plugins.js').shutdownPluginSystem;
  let getPluginSystemState: typeof import('../../src/kernel/kernel-output-plugins.js').getPluginSystemState;
  let isPluginSystemReady: typeof import('../../src/kernel/kernel-output-plugins.js').isPluginSystemReady;
  let createConsolePlugin: typeof import('../../src/kernel/kernel-output-plugins.js').createConsolePlugin;
  let createBufferedPlugin: typeof import('../../src/kernel/kernel-output-plugins.js').createBufferedPlugin;
  let createFilteredPlugin: typeof import('../../src/kernel/kernel-output-plugins.js').createFilteredPlugin;

  beforeEach(async () => {
    // Dynamic import to get fresh module state for each test
    // We use vi.importActual to bypass any mocks
    const mod = await import('../../src/kernel/kernel-output-plugins.js');
    registerOutputPlugin = mod.registerOutputPlugin;
    unregisterOutputPlugin = mod.unregisterOutputPlugin;
    getPlugin = mod.getPlugin;
    getAllPlugins = mod.getAllPlugins;
    setPluginEnabled = mod.setPluginEnabled;
    dispatchToPlugins = mod.dispatchToPlugins;
    dispatchToPluginsSync = mod.dispatchToPluginsSync;
    initializePluginSystem = mod.initializePluginSystem;
    flushAllPlugins = mod.flushAllPlugins;
    shutdownPluginSystem = mod.shutdownPluginSystem;
    getPluginSystemState = mod.getPluginSystemState;
    isPluginSystemReady = mod.isPluginSystemReady;
    createConsolePlugin = mod.createConsolePlugin;
    createBufferedPlugin = mod.createBufferedPlugin;
    createFilteredPlugin = mod.createFilteredPlugin;

    // Initialize plugin system for tests
    initializePluginSystem();
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await shutdownPluginSystem();
    } catch {
      // Ignore shutdown errors in tests
    }
  });

  // ── Registration ──────────────────────────────────────────────────────

  describe('Plugin Registration', () => {
    it('should register a plugin successfully', async () => {
      const plugin = createSpyPlugin();
      const result = await registerOutputPlugin(plugin);
      expect(result.success).toBe(true);
      expect(result.name).toBe('spy-plugin');
    });

    it('should call initialize() on registration', async () => {
      const plugin = createSpyPlugin();
      await registerOutputPlugin(plugin);
      expect(plugin.initCalls).toBe(1);
    });

    it('should reject duplicate plugin names', async () => {
      const plugin1 = createSpyPlugin({ name: 'dup' });
      const plugin2 = createSpyPlugin({ name: 'dup' });
      await registerOutputPlugin(plugin1);
      const result = await registerOutputPlugin(plugin2);
      expect(result.success).toBe(false);
    });

    it('should retrieve registered plugin by name', async () => {
      const plugin = createSpyPlugin({ name: 'my-plugin' });
      await registerOutputPlugin(plugin);
      const retrieved = getPlugin('my-plugin');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('my-plugin');
    });

    it('should return undefined for non-existent plugin', () => {
      expect(getPlugin('nonexistent')).toBeUndefined();
    });

    it('should list all registered plugins', async () => {
      await registerOutputPlugin(createSpyPlugin({ name: 'a' }));
      await registerOutputPlugin(createSpyPlugin({ name: 'b' }));
      const all = getAllPlugins();
      expect(all).toHaveLength(2);
      expect(all.map(p => p.name)).toContain('a');
      expect(all.map(p => p.name)).toContain('b');
    });

    it('should unregister plugin and call shutdown()', async () => {
      const plugin = createSpyPlugin({ name: 'removable' });
      await registerOutputPlugin(plugin);
      const removed = await unregisterOutputPlugin('removable');
      expect(removed).toBe(true);
      expect(plugin.shutdownCalls).toBe(1);
      expect(getPlugin('removable')).toBeUndefined();
    });

    it('should return false when unregistering non-existent plugin', async () => {
      const removed = await unregisterOutputPlugin('ghost');
      expect(removed).toBe(false);
    });
  });

  // ── Enable/Disable ────────────────────────────────────────────────────

  describe('Plugin Enable/Disable', () => {
    it('should enable and disable a plugin', async () => {
      const plugin = createSpyPlugin({ name: 'toggle' });
      await registerOutputPlugin(plugin);

      expect(setPluginEnabled('toggle', false)).toBe(true);
      expect(getPlugin('toggle')?.enabled).toBe(false);

      expect(setPluginEnabled('toggle', true)).toBe(true);
      expect(getPlugin('toggle')?.enabled).toBe(true);
    });

    it('should return false for non-existent plugin', () => {
      expect(setPluginEnabled('ghost', true)).toBe(false);
    });

    it('should skip disabled plugins during dispatch', async () => {
      const plugin = createSpyPlugin({ name: 'disabled-test' });
      await registerOutputPlugin(plugin);
      setPluginEnabled('disabled-test', false);

      dispatchToPluginsSync(createEntry());
      expect(plugin.writeCalls).toHaveLength(0);
    });
  });

  // ── Dispatch ──────────────────────────────────────────────────────────

  describe('Dispatch to Plugins', () => {
    it('should dispatch entry to all enabled plugins (sync)', async () => {
      const plugin1 = createSpyPlugin({ name: 'p1' });
      const plugin2 = createSpyPlugin({ name: 'p2' });
      await registerOutputPlugin(plugin1);
      await registerOutputPlugin(plugin2);

      const entry = createEntry({ message: 'dispatch test' });
      dispatchToPluginsSync(entry);

      expect(plugin1.writeCalls).toHaveLength(1);
      expect(plugin1.writeCalls[0].message).toBe('dispatch test');
      expect(plugin2.writeCalls).toHaveLength(1);
    });

    it('should dispatch entry to all enabled plugins (async)', async () => {
      const plugin = createSpyPlugin({ name: 'async-test' });
      await registerOutputPlugin(plugin);

      await dispatchToPlugins(createEntry({ message: 'async dispatch' }));
      expect(plugin.writeCalls).toHaveLength(1);
      expect(plugin.writeCalls[0].message).toBe('async dispatch');
    });

    it('should dispatch in registration order', async () => {
      const order: string[] = [];
      const plugin1 = createSpyPlugin({
        name: 'first',
        write: () => { order.push('first'); },
      });
      const plugin2 = createSpyPlugin({
        name: 'second',
        write: () => { order.push('second'); },
      });

      await registerOutputPlugin(plugin1);
      await registerOutputPlugin(plugin2);
      dispatchToPluginsSync(createEntry());

      expect(order).toEqual(['first', 'second']);
    });
  });

  // ── Level Filtering ───────────────────────────────────────────────────

  describe('Level Filtering', () => {
    it('should filter entries below plugin minLevel', async () => {
      const plugin = createSpyPlugin({ name: 'level-test', minLevel: 'WARN' });
      await registerOutputPlugin(plugin);

      // INFO (priority 4) > WARN (priority 3) → filtered
      dispatchToPluginsSync(createEntry({ level: 'INFO' }));
      expect(plugin.writeCalls).toHaveLength(0);

      // WARN (priority 3) == WARN (priority 3) → passes
      dispatchToPluginsSync(createEntry({ level: 'WARN' }));
      expect(plugin.writeCalls).toHaveLength(1);

      // ERROR (priority 2) < WARN (priority 3) → passes
      dispatchToPluginsSync(createEntry({ level: 'ERROR' }));
      expect(plugin.writeCalls).toHaveLength(2);
    });

    it('should allow all levels when minLevel is TRACE', async () => {
      const plugin = createSpyPlugin({ name: 'all-levels', minLevel: 'TRACE' });
      await registerOutputPlugin(plugin);

      const levels: KernelLogLevel[] = ['KERNEL', 'CRITICAL', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];
      for (const level of levels) {
        dispatchToPluginsSync(createEntry({ level }));
      }
      expect(plugin.writeCalls).toHaveLength(7);
    });

    it('should only pass KERNEL level when minLevel is KERNEL', async () => {
      const plugin = createSpyPlugin({ name: 'kernel-only', minLevel: 'KERNEL' });
      await registerOutputPlugin(plugin);

      dispatchToPluginsSync(createEntry({ level: 'KERNEL' }));
      dispatchToPluginsSync(createEntry({ level: 'CRITICAL' }));
      dispatchToPluginsSync(createEntry({ level: 'INFO' }));
      expect(plugin.writeCalls).toHaveLength(1);
    });
  });

  // ── Custom Filters ────────────────────────────────────────────────────

  describe('Custom Filters', () => {
    it('should respect custom filter function', async () => {
      const plugin = createSpyPlugin({
        name: 'filtered',
        filter: (entry: KernelLogEntry) => entry.component === 'battle-engine',
      });
      await registerOutputPlugin(plugin);

      dispatchToPluginsSync(createEntry({ component: 'battle-engine' }));
      dispatchToPluginsSync(createEntry({ component: 'cache-worker' }));
      dispatchToPluginsSync(createEntry({ component: 'battle-engine' }));

      expect(plugin.writeCalls).toHaveLength(2);
    });
  });

  // ── Error Isolation ───────────────────────────────────────────────────

  describe('Error Isolation', () => {
    it('should not break dispatch when a plugin throws', async () => {
      const bad = createSpyPlugin({
        name: 'bad-plugin',
        write: () => { throw new Error('kaboom'); },
      });
      const good = createSpyPlugin({ name: 'good-plugin' });

      await registerOutputPlugin(bad);
      await registerOutputPlugin(good);

      // Should not throw
      dispatchToPluginsSync(createEntry());
      expect(good.writeCalls).toHaveLength(1);
    });

    it('should isolate async plugin errors', async () => {
      const bad = createSpyPlugin({
        name: 'async-bad',
        write: () => Promise.reject(new Error('async kaboom')),
      });
      const good = createSpyPlugin({ name: 'async-good' });

      await registerOutputPlugin(bad);
      await registerOutputPlugin(good);

      // Should not throw
      await dispatchToPlugins(createEntry());
      expect(good.writeCalls).toHaveLength(1);
    });
  });

  // ── System State ──────────────────────────────────────────────────────

  describe('System State', () => {
    it('should report system readiness', () => {
      expect(isPluginSystemReady()).toBe(true);
    });

    it('should report plugin system state', async () => {
      await registerOutputPlugin(createSpyPlugin({ name: 'state-test' }));
      const state = getPluginSystemState();
      expect(state.totalPlugins).toBe(1);
      expect(state.enabledPlugins).toBe(1);
      expect(state.plugins).toHaveLength(1);
      expect(state.plugins[0].name).toBe('state-test');
    });

    it('should report not ready after shutdown', async () => {
      await shutdownPluginSystem();
      expect(isPluginSystemReady()).toBe(false);
    });
  });

  // ── Flush & Shutdown ──────────────────────────────────────────────────

  describe('Flush & Shutdown', () => {
    it('should flush all plugins', async () => {
      const p1 = createSpyPlugin({ name: 'f1' });
      const p2 = createSpyPlugin({ name: 'f2' });
      await registerOutputPlugin(p1);
      await registerOutputPlugin(p2);

      await flushAllPlugins();
      expect(p1.flushCalls).toBe(1);
      expect(p2.flushCalls).toBe(1);
    });

    it('should shutdown all plugins in reverse order', async () => {
      const order: string[] = [];
      const p1 = createSpyPlugin({
        name: 'first',
        shutdown: () => { order.push('first'); },
      });
      const p2 = createSpyPlugin({
        name: 'second',
        shutdown: () => { order.push('second'); },
      });

      await registerOutputPlugin(p1);
      await registerOutputPlugin(p2);
      await shutdownPluginSystem();

      expect(order).toEqual(['second', 'first']);
    });

    it('should flush before shutdown', async () => {
      const events: string[] = [];
      const plugin = createSpyPlugin({
        name: 'order-test',
        flush: () => { events.push('flush'); },
        shutdown: () => { events.push('shutdown'); },
      });

      await registerOutputPlugin(plugin);
      await shutdownPluginSystem();

      expect(events).toEqual(['flush', 'shutdown']);
    });
  });

  // ── Factory: createConsolePlugin ──────────────────────────────────────

  describe('createConsolePlugin factory', () => {
    it('should create a console plugin with defaults', () => {
      const plugin = createConsolePlugin({});
      expect(plugin.name).toBe('console');
      expect(plugin.enabled).toBe(true);
      expect(plugin.minLevel).toBe('TRACE');
    });

    it('should write to stdout for INFO level', async () => {
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const plugin = createConsolePlugin({});

      plugin.write(createEntry({ level: 'INFO' }));
      expect(stdoutSpy).toHaveBeenCalled();

      stdoutSpy.mockRestore();
    });

    it('should write to stderr for ERROR level', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const plugin = createConsolePlugin({});

      plugin.write(createEntry({ level: 'ERROR' }));
      expect(stderrSpy).toHaveBeenCalled();

      stderrSpy.mockRestore();
    });

    it('should track stats', () => {
      const plugin = createConsolePlugin({});
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      plugin.write(createEntry());
      plugin.write(createEntry());

      const stats = plugin.getStats!();
      expect(stats.entriesProcessed).toBe(2);

      stdoutSpy.mockRestore();
    });
  });

  // ── Factory: createBufferedPlugin ─────────────────────────────────────

  describe('createBufferedPlugin factory', () => {
    it('should buffer entries until flush', async () => {
      const flushed: KernelLogEntry[][] = [];
      const plugin = createBufferedPlugin({
        name: 'buf-test',
        bufferSize: 5,
        flushIntervalMs: 60000, // Long interval — won't auto-flush in test
        onFlush: async (entries) => { flushed.push([...entries]); },
      });

      plugin.write(createEntry({ message: 'one' }));
      plugin.write(createEntry({ message: 'two' }));

      // Not flushed yet
      expect(flushed).toHaveLength(0);

      // Manual flush
      await plugin.flush!();
      expect(flushed).toHaveLength(1);
      expect(flushed[0]).toHaveLength(2);
    });

    it('should auto-flush when buffer is full', async () => {
      const flushed: KernelLogEntry[][] = [];
      const plugin = createBufferedPlugin({
        name: 'autobuf',
        bufferSize: 2,
        flushIntervalMs: 60000,
        onFlush: async (entries) => { flushed.push([...entries]); },
      });

      plugin.write(createEntry());
      // Buffer not full yet
      expect(flushed).toHaveLength(0);

      plugin.write(createEntry());
      // Buffer full → auto-flush triggered (async)
      // Wait a tick for the promise to settle
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(flushed).toHaveLength(1);
    });

    it('should track stats', () => {
      const plugin = createBufferedPlugin({
        name: 'stats-buf',
        onFlush: async () => {},
      });

      plugin.write(createEntry());
      const stats = plugin.getStats!();
      expect(stats.entriesProcessed).toBe(1);
    });
  });

  // ── Factory: createFilteredPlugin ─────────────────────────────────────

  describe('createFilteredPlugin factory', () => {
    it('should filter entries via provided function', () => {
      const base = createSpyPlugin({ name: 'base' });
      const filtered = createFilteredPlugin(
        base,
        (entry) => entry.level === 'ERROR',
      );

      // Write directly to the filtered plugin
      if (filtered.filter && filtered.filter(createEntry({ level: 'ERROR' }))) {
        filtered.write(createEntry({ level: 'ERROR' }));
      }
      if (filtered.filter && !filtered.filter(createEntry({ level: 'INFO' }))) {
        // Filtered out — don't write
      }

      expect(base.writeCalls).toHaveLength(1);
    });

    it('should accumulate filtered counts in stats', () => {
      const base = createSpyPlugin({ name: 'stat-base' });
      const filtered = createFilteredPlugin(
        base,
        (entry) => entry.component === 'target',
      );

      // Simulate dispatch with filter check
      const entries = [
        createEntry({ component: 'target' }),
        createEntry({ component: 'other' }),
        createEntry({ component: 'other' }),
      ];
      for (const entry of entries) {
        if (!filtered.filter || filtered.filter(entry)) {
          filtered.write(entry);
        }
      }

      const stats = filtered.getStats!();
      expect(stats.entriesFiltered).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// TESTS: ConsoleOutputPlugin (concrete implementation)
// ============================================================================

describe('ConsoleOutputPlugin (outputs/console-output.ts)', () => {
  it('should create with default options', async () => {
    const { ConsoleOutputPlugin } = await import('../../src/kernel/outputs/console-output.js');
    const plugin = new ConsoleOutputPlugin();
    expect(plugin.name).toBe('console-output');
    expect(plugin.version).toBe('1.0.0');
    expect(plugin.enabled).toBe(true);
    expect(plugin.minLevel).toBe('TRACE');
  });

  it('should write formatted text to stdout for INFO', async () => {
    const { ConsoleOutputPlugin } = await import('../../src/kernel/outputs/console-output.js');
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const plugin = new ConsoleOutputPlugin({ colorize: false });
    plugin.write(createEntry({ level: 'INFO', message: 'hello world' }));

    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const written = stdoutSpy.mock.calls[0][0] as string;
    expect(written).toContain('hello world');
    expect(written).toContain('INFO');

    stdoutSpy.mockRestore();
  });

  it('should write to stderr for ERROR/CRITICAL/WARN', async () => {
    const { ConsoleOutputPlugin } = await import('../../src/kernel/outputs/console-output.js');
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const plugin = new ConsoleOutputPlugin({ colorize: false });

    for (const level of ['ERROR', 'CRITICAL', 'WARN', 'KERNEL'] as KernelLogLevel[]) {
      plugin.write(createEntry({ level }));
    }

    expect(stderrSpy).toHaveBeenCalledTimes(4);
    stderrSpy.mockRestore();
  });

  it('should output JSON in jsonMode', async () => {
    const { ConsoleOutputPlugin } = await import('../../src/kernel/outputs/console-output.js');
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const plugin = new ConsoleOutputPlugin({ jsonMode: true });
    plugin.write(createEntry({ level: 'INFO', message: 'json test', data: { key: 'val' } }));

    const written = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(written.trim());
    expect(parsed.msg).toBe('json test');
    expect(parsed.level).toBe('INFO');
    expect(parsed.data.key).toBe('val');

    stdoutSpy.mockRestore();
  });

  it('should track stats correctly', async () => {
    const { ConsoleOutputPlugin } = await import('../../src/kernel/outputs/console-output.js');
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const plugin = new ConsoleOutputPlugin();
    plugin.write(createEntry());
    plugin.write(createEntry());
    plugin.write(createEntry());

    const stats = plugin.getStats();
    expect(stats.entriesProcessed).toBe(3);
    expect(stats.writeErrors).toBe(0);
    expect(stats.lastWriteTime).not.toBeNull();

    stdoutSpy.mockRestore();
  });

  it('should use factory function', async () => {
    const { createConsoleOutputPlugin } = await import('../../src/kernel/outputs/console-output.js');
    const plugin = createConsoleOutputPlugin({ name: 'custom-name', minLevel: 'WARN' });
    expect(plugin.name).toBe('custom-name');
    expect(plugin.minLevel).toBe('WARN');
  });
});

// ============================================================================
// TESTS: FileOutputPlugin (no-op stub)
// ============================================================================

describe('FileOutputPlugin (outputs/file-output.ts)', () => {
  it('should create disabled by default', async () => {
    const { FileOutputPlugin } = await import('../../src/kernel/outputs/file-output.js');
    const plugin = new FileOutputPlugin();
    expect(plugin.name).toBe('file-output');
    expect(plugin.enabled).toBe(false);
  });

  it('should accept entries without writing to disk', async () => {
    const { FileOutputPlugin } = await import('../../src/kernel/outputs/file-output.js');
    const plugin = new FileOutputPlugin();
    plugin.enabled = true;

    // Should not throw
    plugin.write(createEntry());
    plugin.write(createEntry());

    const stats = plugin.getStats();
    expect(stats.entriesProcessed).toBe(2);
    expect(stats.custom?.mode).toBe('database-first-noop');
  });

  it('should have no-op flush and shutdown', async () => {
    const { FileOutputPlugin } = await import('../../src/kernel/outputs/file-output.js');
    const plugin = new FileOutputPlugin();

    // Should not throw
    plugin.flush!();
    plugin.shutdown!();
  });

  it('should use factory function', async () => {
    const { createFileOutputPlugin } = await import('../../src/kernel/outputs/file-output.js');
    const plugin = createFileOutputPlugin({ name: 'custom-file', minLevel: 'ERROR' });
    expect(plugin.name).toBe('custom-file');
    expect(plugin.minLevel).toBe('ERROR');
    expect(plugin.enabled).toBe(false); // Disabled by default
  });
});

// ============================================================================
// TESTS: Plugin Dispatch Wiring (kernel-logger → plugins)
// ============================================================================

describe('Plugin Dispatch Wiring', () => {
  it('should export setPluginDispatch and isPluginDispatchWired', async () => {
    const logger = await import('../../src/kernel/kernel-logger.js');
    expect(typeof logger.setPluginDispatch).toBe('function');
    expect(typeof logger.isPluginDispatchWired).toBe('function');
  });

  it('should wire dispatch function via setPluginDispatch', async () => {
    const logger = await import('../../src/kernel/kernel-logger.js');
    const calls: KernelLogEntry[] = [];

    logger.setPluginDispatch((entry) => { calls.push(entry); });
    expect(logger.isPluginDispatchWired()).toBe(true);

    // klog only routes through processLogEntry (and thus pluginDispatchFn)
    // AFTER markBooted() is called. Before boot, entries go to preBootQueue.
    logger.markBooted();

    // Suppress console output for the test entry
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    logger.klog('INFO', 'test', 'wiring test');

    // The entry should have been dispatched via pluginDispatchFn
    expect(calls.length).toBeGreaterThan(0);
    const found = calls.find(e => e.message === 'wiring test');
    expect(found).toBeDefined();
    expect(found?.level).toBe('INFO');
    expect(found?.component).toBe('test');

    stdoutSpy.mockRestore();
  });
});
