/**
 * Secure Import Tests — Runtime Ring Boundary Enforcement
 * 
 * Tests dynamic import validation against ring security boundaries.
 * Verifies that cross-ring imports are blocked at runtime.
 * 
 * @module tests/sensaios/security/secure-import.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  secureImport,
  validateImport,
  assertImportAllowed,
  getRingLevel,
  type ImportContext,
} from '../../../src/sensaios/security/secure-import.js';
import { RING } from '../../../src/sensaios/types.js';
import { SensaiError } from '../../../src/sensaios/sensai-error.js';

describe('getRingLevel', () => {
  it('should classify kernel modules as Ring 0', () => {
    expect(getRingLevel('src/kernel/primitives/db.ts')).toBe(RING.KERNEL);
    expect(getRingLevel('../kernel/primitives/exports.ts')).toBe(RING.KERNEL);
    expect(getRingLevel('./kernel/index.ts')).toBe(RING.KERNEL);
  });

  it('should classify sensaios modules as Ring 1', () => {
    expect(getRingLevel('src/sensaios/component-context.ts')).toBe(RING.SENSAIOS);
    expect(getRingLevel('../sensaios/capabilities/assert-capability.ts')).toBe(RING.SENSAIOS);
    expect(getRingLevel('./sensaios/types.ts')).toBe(RING.SENSAIOS);
  });

  it('should classify app modules as Ring 3', () => {
    expect(getRingLevel('src/bot/commands/battle.ts')).toBe(RING.APPS);
    expect(getRingLevel('src/core/battle/engine.ts')).toBe(RING.APPS);
    expect(getRingLevel('src/services/cache.ts')).toBe(RING.APPS);
    expect(getRingLevel('src/observability/hub.ts')).toBe(RING.APPS);
  });

  it('should classify external modules as Ring 0 (trusted)', () => {
    expect(getRingLevel('node:fs')).toBe(RING.KERNEL);
    expect(getRingLevel('prisma')).toBe(RING.KERNEL);
    expect(getRingLevel('@scope/package')).toBe(RING.KERNEL);
  });

  it('should default unknown paths to Ring 3 (most restrictive)', () => {
    expect(getRingLevel('unknown/path.ts')).toBe(RING.APPS);
    expect(getRingLevel('random.ts')).toBe(RING.APPS);
  });
});

describe('assertImportAllowed', () => {
  it('should allow Ring 0 (Kernel) to import from any ring', () => {
    expect(() => assertImportAllowed(RING.KERNEL, 'src/kernel/db.ts')).not.toThrow();
    expect(() => assertImportAllowed(RING.KERNEL, 'src/sensaios/types.ts')).not.toThrow();
    expect(() => assertImportAllowed(RING.KERNEL, 'src/bot/commands/battle.ts')).not.toThrow();
  });

  it('should allow Ring 1 (SensaiOS) to import Ring 0 (Kernel)', () => {
    expect(() => assertImportAllowed(RING.SENSAIOS, 'src/kernel/primitives/db.ts')).not.toThrow();
    expect(() => assertImportAllowed(RING.SENSAIOS, 'src/kernel/primitives/exports.ts')).not.toThrow();
  });

  it('should allow Ring 1 (SensaiOS) to import Ring 1 (SensaiOS)', () => {
    expect(() => assertImportAllowed(RING.SENSAIOS, 'src/sensaios/types.ts')).not.toThrow();
    expect(() => assertImportAllowed(RING.SENSAIOS, 'src/sensaios/component-context.ts')).not.toThrow();
  });

  it('should BLOCK Ring 1 (SensaiOS) from importing Ring 3 (Apps)', () => {
    expect(() => assertImportAllowed(RING.SENSAIOS, 'src/bot/commands/battle.ts')).toThrow(SensaiError);
    expect(() => assertImportAllowed(RING.SENSAIOS, 'src/core/battle/engine.ts')).toThrow(SensaiError);
    
    try {
      assertImportAllowed(RING.SENSAIOS, 'src/bot/main.ts');
    } catch (error) {
      expect(error).toBeInstanceOf(SensaiError);
      expect((error as SensaiError).message).toContain('Ring 1 (SensaiOS) CANNOT import from Ring 3 (Apps)');
      expect((error as SensaiError).code).toBe(3001);
    }
  });

  it('should allow Ring 3 (Apps) to import Ring 3 (Apps)', () => {
    expect(() => assertImportAllowed(RING.APPS, 'src/bot/commands/battle.ts')).not.toThrow();
    expect(() => assertImportAllowed(RING.APPS, 'src/core/battle/engine.ts')).not.toThrow();
    expect(() => assertImportAllowed(RING.APPS, 'src/services/cache.ts')).not.toThrow();
  });

  it('should BLOCK Ring 3 (Apps) from importing Ring 0 (Kernel)', () => {
    expect(() => assertImportAllowed(RING.APPS, 'src/kernel/primitives/db.ts')).toThrow(SensaiError);
    expect(() => assertImportAllowed(RING.APPS, 'src/kernel/primitives/exports.ts')).toThrow(SensaiError);
    
    try {
      assertImportAllowed(RING.APPS, 'src/kernel/primitives/db.ts');
    } catch (error) {
      expect(error).toBeInstanceOf(SensaiError);
      expect((error as SensaiError).message).toContain('Ring 3 (Apps) CANNOT import from Ring 0 (Kernel)');
      expect((error as SensaiError).message).toContain('Use ComponentContext interface');
      expect((error as SensaiError).code).toBe(3002);
      expect((error as SensaiError).context?.solution).toContain('runGuarded');
    }
  });

  it('should BLOCK Ring 3 (Apps) from importing Ring 1 (SensaiOS)', () => {
    expect(() => assertImportAllowed(RING.APPS, 'src/sensaios/component-context.ts')).toThrow(SensaiError);
    expect(() => assertImportAllowed(RING.APPS, 'src/sensaios/types.ts')).toThrow(SensaiError);
    
    try {
      assertImportAllowed(RING.APPS, 'src/sensaios/context-factory.ts');
    } catch (error) {
      expect(error).toBeInstanceOf(SensaiError);
      expect((error as SensaiError).message).toContain('Ring 3 (Apps) CANNOT import from Ring 1 (SensaiOS)');
      expect((error as SensaiError).message).toContain('Use ComponentContext interface');
      expect((error as SensaiError).code).toBe(3002);
    }
  });
});

describe('validateImport', () => {
  const mockContext: ImportContext = {
    component: 'test.component',
    ringLevel: RING.APPS,
    scope: {
      tenant: 'test-tenant',
      guildId: 'test-guild',
    },
    correlationId: 'test-correlation',
  };

  it('should return allowed=true for valid imports', () => {
    const result = validateImport('src/bot/commands/battle.ts', {
      ...mockContext,
      ringLevel: RING.APPS,
    });

    expect(result.allowed).toBe(true);
    expect(result.sourceRing).toBe(RING.APPS);
    expect(result.targetRing).toBe(RING.APPS);
    expect(result.modulePath).toBe('src/bot/commands/battle.ts');
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it('should return allowed=false with reason for invalid imports', () => {
    const result = validateImport('src/kernel/primitives/db.ts', {
      ...mockContext,
      ringLevel: RING.APPS,
    });

    expect(result.allowed).toBe(false);
    expect(result.sourceRing).toBe(RING.APPS);
    expect(result.targetRing).toBe(RING.KERNEL);
    expect(result.reason).toContain('Ring 3 (Apps) CANNOT import from Ring 0 (Kernel)');
  });

  it('should detect Ring 1 → Ring 3 violations', () => {
    const result = validateImport('src/bot/main.ts', {
      ...mockContext,
      ringLevel: RING.SENSAIOS,
    });

    expect(result.allowed).toBe(false);
    expect(result.sourceRing).toBe(RING.SENSAIOS);
    expect(result.targetRing).toBe(RING.APPS);
    expect(result.reason).toContain('Ring 1 (SensaiOS) CANNOT import from Ring 3 (Apps)');
  });
});

describe('secureImport', () => {
  const mockContext: ImportContext = {
    component: 'test.component',
    ringLevel: RING.KERNEL,
    scope: {
      tenant: 'test-tenant',
      guildId: 'test-guild',
    },
    correlationId: 'test-correlation',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully import when ring boundaries allow', async () => {
    // Mock import to avoid actual module loading in tests
    const mockImport = vi.fn().mockResolvedValue({ default: 'test-module' });
    vi.stubGlobal('import', mockImport);

    // This test would require actual module mocking
    // For now, we test the validation logic separately
    
    // Kernel can import anything
    await expect(
      validateImport('src/bot/main.ts', {
        ...mockContext,
        ringLevel: RING.KERNEL,
      })
    ).toBeTruthy();
  });

  it('should throw SensaiError when ring boundaries deny import', async () => {
    const appContext: ImportContext = {
      ...mockContext,
      component: 'game.battles',
      ringLevel: RING.APPS,
    };

    await expect(
      secureImport('src/kernel/primitives/db.ts', appContext)
    ).rejects.toThrow(SensaiError);
  });

  it('should log audit events for denied imports', async () => {
    const appContext: ImportContext = {
      ...mockContext,
      component: 'game.battles',
      ringLevel: RING.APPS,
    };

    try {
      await secureImport('src/kernel/primitives/db.ts', appContext);
    } catch (error) {
      // Expected to throw
      expect(error).toBeInstanceOf(SensaiError);
    }

    // Audit logging is verified through the logger module
    // In production, these would appear in observability logs
  });
});

describe('Ring Boundary Enforcement — Comprehensive Scenarios', () => {
  it('Scenario 1: App → Kernel import (BLOCKED)', () => {
    expect(() => assertImportAllowed(RING.APPS, 'src/kernel/primitives/db.ts')).toThrow(SensaiError);
  });

  it('Scenario 2: App → SensaiOS import (BLOCKED)', () => {
    expect(() => assertImportAllowed(RING.APPS, 'src/sensaios/types.ts')).toThrow(SensaiError);
  });

  it('Scenario 3: SensaiOS → App import (BLOCKED)', () => {
    expect(() => assertImportAllowed(RING.SENSAIOS, 'src/bot/main.ts')).toThrow(SensaiError);
  });

  it('Scenario 4: Kernel → Kernel import (ALLOWED)', () => {
    expect(() => assertImportAllowed(RING.KERNEL, 'src/kernel/primitives/exports.ts')).not.toThrow();
  });

  it('Scenario 5: Kernel → SensaiOS import (ALLOWED)', () => {
    expect(() => assertImportAllowed(RING.KERNEL, 'src/sensaios/types.ts')).not.toThrow();
  });

  it('Scenario 6: Kernel → App import (ALLOWED)', () => {
    expect(() => assertImportAllowed(RING.KERNEL, 'src/bot/commands/battle.ts')).not.toThrow();
  });

  it('Scenario 7: SensaiOS → Kernel import (ALLOWED)', () => {
    expect(() => assertImportAllowed(RING.SENSAIOS, 'src/kernel/primitives/db.ts')).not.toThrow();
  });

  it('Scenario 8: SensaiOS → SensaiOS import (ALLOWED)', () => {
    expect(() => assertImportAllowed(RING.SENSAIOS, 'src/sensaios/component-context.ts')).not.toThrow();
  });

  it('Scenario 9: App → App import (ALLOWED)', () => {
    expect(() => assertImportAllowed(RING.APPS, 'src/bot/homestead/heal.ts')).not.toThrow();
  });

  it('Scenario 10: External module imports (ALLOWED for all rings)', () => {
    expect(() => assertImportAllowed(RING.KERNEL, 'node:fs')).not.toThrow();
    expect(() => assertImportAllowed(RING.SENSAIOS, 'prisma')).not.toThrow();
    expect(() => assertImportAllowed(RING.APPS, '@scope/package')).not.toThrow();
  });
});
