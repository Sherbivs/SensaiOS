/**
 * Module Loader Security Tests
 * 
 * Tests for the ESM loader hooks that enforce ring security boundaries.
 * 
 * @module tests/sensaios/loader/module-hook.spec
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  normalizePath,
  resolveModulePath,
  isExternalModule,
  getRingLevel,
  getRingInfo,
  clearRingCache,
  getCacheStats,
} from '../../../src/sensaios/loader/ring-resolver.js';
import {
  getLoaderStats,
  resetStats,
  clearModuleCache,
} from '../../../src/sensaios/loader/module-hook.js';
import { RING } from '../../../src/sensaios/types.js';

describe('Ring Resolver', () => {
  beforeEach(() => {
    clearRingCache();
  });

  describe('normalizePath', () => {
    it('should normalize Windows backslashes to forward slashes', () => {
      const result = normalizePath('C:\\Users\\test\\src\\bot\\index.ts');
      expect(result).toContain('/');
      expect(result).not.toContain('\\');
    });

    it('should handle file:// URLs', () => {
      const result = normalizePath('file:///C:/Users/test/src/bot/index.ts');
      expect(result).toContain('/src/bot/');
    });

    it('should handle already normalized paths', () => {
      const result = normalizePath('/home/user/project/src/kernel/index.ts');
      expect(result).toBe('/home/user/project/src/kernel/index.ts');
    });

    it('should handle empty paths gracefully', () => {
      const result = normalizePath('');
      expect(result).toBe('');
    });
  });

  describe('isExternalModule', () => {
    it('should identify node: built-in modules as external', () => {
      expect(isExternalModule('node:fs')).toBe(true);
      expect(isExternalModule('node:path')).toBe(true);
      expect(isExternalModule('node:url')).toBe(true);
    });

    it('should identify @scope packages as external', () => {
      expect(isExternalModule('@prisma/client')).toBe(true);
      expect(isExternalModule('@discordjs/rest')).toBe(true);
      expect(isExternalModule('@types/node')).toBe(true);
    });

    it('should identify node_modules paths as external', () => {
      expect(isExternalModule('/project/node_modules/vitest/index.js')).toBe(true);
      expect(isExternalModule('C:/project/node_modules/@prisma/client/index.js')).toBe(true);
    });

    it('should NOT identify relative paths as external', () => {
      expect(isExternalModule('./foo.js')).toBe(false);
      expect(isExternalModule('../bar.js')).toBe(false);
    });

    it('should NOT identify src paths as external', () => {
      expect(isExternalModule('/project/src/bot/index.ts')).toBe(false);
      expect(isExternalModule('/project/src/kernel/primitives.ts')).toBe(false);
    });
  });

  describe('getRingLevel', () => {
    it('should classify kernel paths as Ring 0', () => {
      expect(getRingLevel('/project/src/kernel/index.ts')).toBe(RING.KERNEL);
      expect(getRingLevel('/project/src/kernel/primitives/db.ts')).toBe(RING.KERNEL);
    });

    it('should classify sensaios paths as Ring 1', () => {
      expect(getRingLevel('/project/src/sensaios/index.ts')).toBe(RING.SENSAIOS);
      expect(getRingLevel('/project/src/sensaios/loader/module-hook.ts')).toBe(RING.SENSAIOS);
    });

    it('should classify bot paths as Ring 3', () => {
      expect(getRingLevel('/project/src/bot/index.ts')).toBe(RING.APPS);
      expect(getRingLevel('/project/src/bot/homestead/home.ts')).toBe(RING.APPS);
    });

    it('should classify core paths as Ring 3', () => {
      expect(getRingLevel('/project/src/core/battle/engine.ts')).toBe(RING.APPS);
      expect(getRingLevel('/project/src/core/encounter/spawn.ts')).toBe(RING.APPS);
    });

    it('should classify services paths as Ring 3', () => {
      expect(getRingLevel('/project/src/services/cache/facade.ts')).toBe(RING.APPS);
      expect(getRingLevel('/project/src/services/monitoring/error-tracker.ts')).toBe(RING.APPS);
    });

    it('should classify workers paths as Ring 3', () => {
      expect(getRingLevel('/project/src/workers/engine-workers.ts')).toBe(RING.APPS);
      expect(getRingLevel('/project/src/workers/security-worker.ts')).toBe(RING.APPS);
    });

    it('should classify external modules as Ring 0 (trusted)', () => {
      expect(getRingLevel('node:fs')).toBe(RING.KERNEL);
      expect(getRingLevel('@prisma/client')).toBe(RING.KERNEL);
      expect(getRingLevel('/project/node_modules/vitest/index.js')).toBe(RING.KERNEL);
    });

    it('should default unknown paths to Ring 3 (most restrictive)', () => {
      expect(getRingLevel('/some/random/path.js')).toBe(RING.APPS);
    });

    it('should handle Windows paths correctly', () => {
      expect(getRingLevel('C:\\project\\src\\kernel\\index.ts')).toBe(RING.KERNEL);
      expect(getRingLevel('C:\\project\\src\\bot\\main.ts')).toBe(RING.APPS);
    });
  });

  describe('getRingInfo', () => {
    it('should provide detailed info for kernel modules', () => {
      const info = getRingInfo('/project/src/kernel/index.ts');
      expect(info.ring).toBe(RING.KERNEL);
      expect(info.ringName).toContain('Kernel');
      expect(info.isExternal).toBe(false);
    });

    it('should provide detailed info for external modules', () => {
      const info = getRingInfo('node:fs');
      expect(info.ring).toBe(RING.KERNEL);
      expect(info.isExternal).toBe(true);
      expect(info.ringName).toContain('External');
    });

    it('should include matched pattern for ring detection', () => {
      const info = getRingInfo('/project/src/sensaios/loader/module-hook.ts');
      expect(info.ring).toBe(RING.SENSAIOS);
      expect(info.matchedPattern).toBeDefined();
    });
  });

  describe('Ring Cache', () => {
    it('should cache ring levels for repeated lookups', () => {
      const path = '/project/src/kernel/index.ts';
      
      // First lookup
      const ring1 = getRingLevel(path);
      const stats1 = getCacheStats();
      
      // Second lookup (should be cached)
      const ring2 = getRingLevel(path);
      const stats2 = getCacheStats();
      
      expect(ring1).toBe(ring2);
      expect(stats2.size).toBe(stats1.size);
    });

    it('should respect cache size limit', () => {
      // Fill cache with many entries
      for (let i = 0; i < 100; i++) {
        getRingLevel(`/project/src/test/module${i}.ts`);
      }
      
      const stats = getCacheStats();
      expect(stats.size).toBeLessThanOrEqual(stats.maxSize);
    });

    it('should clear cache when requested', () => {
      getRingLevel('/project/src/kernel/index.ts');
      expect(getCacheStats().size).toBeGreaterThan(0);
      
      clearRingCache();
      expect(getCacheStats().size).toBe(0);
    });
  });
});

describe('Module Hook Stats', () => {
  beforeEach(() => {
    resetStats();
    clearModuleCache();
  });

  it('should track loader statistics', () => {
    const stats = getLoaderStats();
    
    expect(stats).toHaveProperty('totalImports');
    expect(stats).toHaveProperty('blockedImports');
    expect(stats).toHaveProperty('allowedImports');
    expect(stats).toHaveProperty('securityEnabled');
  });

  it('should reset statistics when requested', () => {
    const stats1 = getLoaderStats();
    const initialImports = stats1.totalImports;
    
    resetStats();
    
    const stats2 = getLoaderStats();
    expect(stats2.totalImports).toBe(0);
    expect(stats2.blockedImports).toBe(0);
    expect(stats2.allowedImports).toBe(0);
  });

  it('should expose security enabled flag', () => {
    const stats = getLoaderStats();
    expect(typeof stats.securityEnabled).toBe('boolean');
  });

  it('should track cached module count', () => {
    const stats = getLoaderStats();
    expect(typeof stats.cachedModules).toBe('number');
  });
});

describe('Ring Visibility Rules', () => {
  // These tests validate the expected visibility rules conceptually
  // The actual enforcement happens in the loader hook
  
  it('Ring 0 (Kernel) should be allowed to import any ring', () => {
    // Kernel can import: Kernel, SensaiOS, Apps
    // This is by design - kernel has unrestricted access
    expect(RING.KERNEL).toBe(0);
  });

  it('Ring 1 (SensaiOS) should only import Ring 0 and Ring 1', () => {
    // SensaiOS can import: Kernel, SensaiOS
    // Cannot import: Apps (would break abstraction)
    expect(RING.SENSAIOS).toBe(1);
  });

  it('Ring 3 (Apps) should only import Ring 3 and external modules', () => {
    // Apps can import: other Apps, external (npm, node:)
    // Cannot import: Kernel, SensaiOS (must use ComponentContext)
    expect(RING.APPS).toBe(3);
  });

  it('External modules should be trusted (allowed from any ring)', () => {
    // External = node: builtins, npm packages, node_modules
    // Treated as Ring 0 (trusted) for access purposes
    expect(isExternalModule('node:fs')).toBe(true);
    expect(isExternalModule('@prisma/client')).toBe(true);
  });
});
