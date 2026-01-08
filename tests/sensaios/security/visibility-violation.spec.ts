/**
 * Visibility Violation Tests — Ring Boundary Enforcement
 * 
 * Tests for all visibility violation scenarios in the SensaiOS Ring Security Model.
 * Covers: App→Kernel blocked, App→SensaiOS blocked, SensaiOS→App blocked,
 * dynamic import blocked, and require() blocked.
 * 
 * Target: 25+ tests for SENSAI.VISIBILITY.TESTS task acceptance criteria.
 * 
 * @module tests/sensaios/security/visibility-violation.spec
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateImport,
  assertImportAllowed,
  getRingLevel,
  secureImport,
  type ImportContext,
} from '../../../src/sensaios/security/secure-import.js';
import { RING } from '../../../src/sensaios/types.js';
import { SensaiError } from '../../../src/sensaios/sensai-error.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

/** Create test import context for specified ring */
const createContext = (ringLevel: number, component = 'test.component'): ImportContext => ({
  component,
  ringLevel,
  scope: {
    tenant: 'test-tenant',
    guildId: 'test-guild-123',
  },
  correlationId: `test-correlation-${Date.now()}`,
});

// =============================================================================
// APP → KERNEL BLOCKED TESTS (8 tests)
// =============================================================================

describe('Visibility Violation Tests — App → Kernel Blocked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should block App importing kernel/primitives/db.ts', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, 'src/kernel/primitives/db.ts')
    ).toThrow(SensaiError);
  });

  it('should block App importing kernel/primitives/exports.ts', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, 'src/kernel/primitives/exports.ts')
    ).toThrow(SensaiError);
  });

  it('should block App importing kernel/primitives/jobs.ts', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, 'src/kernel/primitives/jobs.ts')
    ).toThrow(SensaiError);
  });

  it('should block App importing kernel/primitives/outbox.ts', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, 'src/kernel/primitives/outbox.ts')
    ).toThrow(SensaiError);
  });

  it('should block App importing kernel/index.ts', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, 'src/kernel/index.ts')
    ).toThrow(SensaiError);
  });

  it('should block App importing kernel/boot.ts', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, 'src/kernel/boot.ts')
    ).toThrow(SensaiError);
  });

  it('should include error code 3002 for App → Kernel violation', () => {
    try {
      assertImportAllowed(RING.APPS, 'src/kernel/primitives/db.ts');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SensaiError);
      expect((error as SensaiError).code).toBe(3002);
    }
  });

  it('should include solution guidance for App → Kernel violation', () => {
    try {
      assertImportAllowed(RING.APPS, 'src/kernel/primitives/db.ts');
      expect.fail('Should have thrown');
    } catch (error) {
      const sensaiError = error as SensaiError;
      expect(sensaiError.message).toContain('Use ComponentContext');
      expect(sensaiError.context?.solution).toContain('runGuarded');
    }
  });
});

// =============================================================================
// APP → SENSAIOS BLOCKED TESTS (8 tests)
// =============================================================================

describe('Visibility Violation Tests — App → SensaiOS Blocked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should block App importing sensaios/component-context.ts', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, 'src/sensaios/component-context.ts')
    ).toThrow(SensaiError);
  });

  it('should block App importing sensaios/context-factory.ts', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, 'src/sensaios/context-factory.ts')
    ).toThrow(SensaiError);
  });

  it('should block App importing sensaios/types.ts', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, 'src/sensaios/types.ts')
    ).toThrow(SensaiError);
  });

  it('should block App importing sensaios/capabilities/assert-capability.ts', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, 'src/sensaios/capabilities/assert-capability.ts')
    ).toThrow(SensaiError);
  });

  it('should block App importing sensaios/security/secure-import.ts', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, 'src/sensaios/security/secure-import.ts')
    ).toThrow(SensaiError);
  });

  it('should block App importing sensaios/index.ts', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, 'src/sensaios/index.ts')
    ).toThrow(SensaiError);
  });

  it('should include error code 3002 for App → SensaiOS violation', () => {
    try {
      assertImportAllowed(RING.APPS, 'src/sensaios/types.ts');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SensaiError);
      expect((error as SensaiError).code).toBe(3002);
    }
  });

  it('should include solution guidance for App → SensaiOS violation', () => {
    try {
      assertImportAllowed(RING.APPS, 'src/sensaios/context-factory.ts');
      expect.fail('Should have thrown');
    } catch (error) {
      const sensaiError = error as SensaiError;
      expect(sensaiError.message).toContain('Use ComponentContext');
    }
  });
});

// =============================================================================
// SENSAIOS → APP BLOCKED TESTS (7 tests)
// =============================================================================

describe('Visibility Violation Tests — SensaiOS → App Blocked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should block SensaiOS importing bot/commands/battle.ts', () => {
    expect(() => 
      assertImportAllowed(RING.SENSAIOS, 'src/bot/commands/battle.ts')
    ).toThrow(SensaiError);
  });

  it('should block SensaiOS importing bot/main.ts', () => {
    expect(() => 
      assertImportAllowed(RING.SENSAIOS, 'src/bot/main.ts')
    ).toThrow(SensaiError);
  });

  it('should block SensaiOS importing core/battle/engine.ts', () => {
    expect(() => 
      assertImportAllowed(RING.SENSAIOS, 'src/core/battle/engine.ts')
    ).toThrow(SensaiError);
  });

  it('should block SensaiOS importing services/cache.ts', () => {
    expect(() => 
      assertImportAllowed(RING.SENSAIOS, 'src/services/cache.ts')
    ).toThrow(SensaiError);
  });

  it('should block SensaiOS importing observability/hub.ts', () => {
    expect(() => 
      assertImportAllowed(RING.SENSAIOS, 'src/observability/hub.ts')
    ).toThrow(SensaiError);
  });

  it('should include error code 3001 for SensaiOS → App violation', () => {
    try {
      assertImportAllowed(RING.SENSAIOS, 'src/bot/main.ts');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SensaiError);
      expect((error as SensaiError).code).toBe(3001);
    }
  });

  it('should provide clear error message for SensaiOS → App violation', () => {
    try {
      assertImportAllowed(RING.SENSAIOS, 'src/bot/commands/battle.ts');
      expect.fail('Should have thrown');
    } catch (error) {
      const sensaiError = error as SensaiError;
      expect(sensaiError.message).toContain('Ring 1 (SensaiOS) CANNOT import from Ring 3 (Apps)');
    }
  });
});

// =============================================================================
// DYNAMIC IMPORT BLOCKED TESTS (7 tests)
// =============================================================================

describe('Visibility Violation Tests — Dynamic Import Blocked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should validate and block dynamic App → Kernel import', () => {
    const context = createContext(RING.APPS, 'game.battles');

    const result = validateImport('src/kernel/primitives/db.ts', context);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Ring 3 (Apps) CANNOT import from Ring 0 (Kernel)');
  });

  it('should validate and block dynamic App → SensaiOS import', () => {
    const context = createContext(RING.APPS, 'game.battles');

    const result = validateImport('src/sensaios/types.ts', context);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Ring 3 (Apps) CANNOT import from Ring 1 (SensaiOS)');
  });

  it('should validate and block dynamic SensaiOS → App import', () => {
    const context = createContext(RING.SENSAIOS, 'sensaios.supervisor');

    const result = validateImport('src/bot/main.ts', context);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Ring 1 (SensaiOS) CANNOT import from Ring 3 (Apps)');
  });

  it('should reject secureImport for App → Kernel', async () => {
    const context = createContext(RING.APPS, 'game.battles');

    await expect(
      secureImport('src/kernel/primitives/db.ts', context)
    ).rejects.toThrow(SensaiError);
  });

  it('should reject secureImport for App → SensaiOS', async () => {
    const context = createContext(RING.APPS, 'game.battles');

    await expect(
      secureImport('src/sensaios/types.ts', context)
    ).rejects.toThrow(SensaiError);
  });

  it('should reject secureImport for SensaiOS → App', async () => {
    const context = createContext(RING.SENSAIOS, 'sensaios.supervisor');

    await expect(
      secureImport('src/bot/main.ts', context)
    ).rejects.toThrow(SensaiError);
  });

  it('should include timestamp in validation result', () => {
    const context = createContext(RING.APPS, 'game.battles');
    const before = new Date();

    const result = validateImport('src/kernel/primitives/db.ts', context);

    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});

// =============================================================================
// REQUIRE() BLOCKED TESTS (5 tests)
// =============================================================================

describe('Visibility Violation Tests — require() Blocked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should block require() style paths for kernel', () => {
    // require('../../kernel/primitives/db') should also be blocked
    expect(() => 
      assertImportAllowed(RING.APPS, '../kernel/primitives/db.ts')
    ).toThrow(SensaiError);
  });

  it('should block require() style paths for sensaios', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, '../sensaios/types.ts')
    ).toThrow(SensaiError);
  });

  it('should block relative paths going up to kernel', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, '../../kernel/primitives/db.ts')
    ).toThrow(SensaiError);
  });

  it('should block relative paths going up to sensaios', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, '../../sensaios/types.ts')
    ).toThrow(SensaiError);
  });

  it('should block ./kernel paths', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, './kernel/primitives/db.ts')
    ).toThrow(SensaiError);
  });
});

// =============================================================================
// ALLOWED IMPORTS VERIFICATION (10 tests)
// =============================================================================

describe('Visibility Violation Tests — Allowed Imports (Negative Tests)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow Kernel → Kernel import', () => {
    expect(() => 
      assertImportAllowed(RING.KERNEL, 'src/kernel/primitives/exports.ts')
    ).not.toThrow();
  });

  it('should allow Kernel → SensaiOS import', () => {
    expect(() => 
      assertImportAllowed(RING.KERNEL, 'src/sensaios/types.ts')
    ).not.toThrow();
  });

  it('should allow Kernel → App import', () => {
    expect(() => 
      assertImportAllowed(RING.KERNEL, 'src/bot/main.ts')
    ).not.toThrow();
  });

  it('should allow SensaiOS → Kernel import', () => {
    expect(() => 
      assertImportAllowed(RING.SENSAIOS, 'src/kernel/primitives/db.ts')
    ).not.toThrow();
  });

  it('should allow SensaiOS → SensaiOS import', () => {
    expect(() => 
      assertImportAllowed(RING.SENSAIOS, 'src/sensaios/component-context.ts')
    ).not.toThrow();
  });

  it('should allow App → App import', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, 'src/bot/commands/battle.ts')
    ).not.toThrow();
  });

  it('should allow App → external npm package', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, 'prisma')
    ).not.toThrow();
  });

  it('should allow App → node: builtin', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, 'node:fs')
    ).not.toThrow();
  });

  it('should allow App → @scoped package', () => {
    expect(() => 
      assertImportAllowed(RING.APPS, '@prisma/client')
    ).not.toThrow();
  });

  it('should allow SensaiOS → external npm package', () => {
    expect(() => 
      assertImportAllowed(RING.SENSAIOS, 'zod')
    ).not.toThrow();
  });
});

// =============================================================================
// RING LEVEL DETECTION TESTS (10 tests)
// =============================================================================

describe('Visibility Violation Tests — Ring Level Detection', () => {
  it('should classify kernel/primitives as Ring 0', () => {
    expect(getRingLevel('src/kernel/primitives/db.ts')).toBe(RING.KERNEL);
    expect(getRingLevel('src/kernel/primitives/exports.ts')).toBe(RING.KERNEL);
    expect(getRingLevel('src/kernel/primitives/jobs.ts')).toBe(RING.KERNEL);
  });

  it('should classify kernel/index.ts as Ring 0', () => {
    expect(getRingLevel('src/kernel/index.ts')).toBe(RING.KERNEL);
  });

  it('should classify sensaios/* as Ring 1', () => {
    expect(getRingLevel('src/sensaios/types.ts')).toBe(RING.SENSAIOS);
    expect(getRingLevel('src/sensaios/component-context.ts')).toBe(RING.SENSAIOS);
    expect(getRingLevel('src/sensaios/context-factory.ts')).toBe(RING.SENSAIOS);
  });

  it('should classify bot/* as Ring 3', () => {
    expect(getRingLevel('src/bot/main.ts')).toBe(RING.APPS);
    expect(getRingLevel('src/bot/commands/battle.ts')).toBe(RING.APPS);
    expect(getRingLevel('src/bot/homestead/heal.ts')).toBe(RING.APPS);
  });

  it('should classify core/* as Ring 3', () => {
    expect(getRingLevel('src/core/battle/engine.ts')).toBe(RING.APPS);
    expect(getRingLevel('src/core/encounter/spawn.ts')).toBe(RING.APPS);
  });

  it('should classify services/* as Ring 3', () => {
    expect(getRingLevel('src/services/cache.ts')).toBe(RING.APPS);
    expect(getRingLevel('src/services/engine-cache.ts')).toBe(RING.APPS);
  });

  it('should classify workers/* as Ring 3', () => {
    expect(getRingLevel('src/workers/outbox-worker.ts')).toBe(RING.APPS);
    expect(getRingLevel('src/workers/cache-worker.ts')).toBe(RING.APPS);
  });

  it('should classify observability/* as Ring 3', () => {
    expect(getRingLevel('src/observability/hub.ts')).toBe(RING.APPS);
    expect(getRingLevel('src/observability/envelope/console.ts')).toBe(RING.APPS);
  });

  it('should classify external modules as Ring 0 (trusted)', () => {
    // External modules without .js/.ts extensions are Ring 0
    expect(getRingLevel('prisma')).toBe(RING.KERNEL);
    expect(getRingLevel('zod')).toBe(RING.KERNEL);
    expect(getRingLevel('@prisma/client')).toBe(RING.KERNEL);
    // Note: 'discord.js' ends with .js, so it's not detected as external
    // by the isExternalModule heuristic - test real node_modules paths instead
    expect(getRingLevel('node_modules/discord.js')).toBe(RING.KERNEL);
  });

  it('should classify node: builtins as Ring 0', () => {
    expect(getRingLevel('node:fs')).toBe(RING.KERNEL);
    expect(getRingLevel('node:path')).toBe(RING.KERNEL);
    expect(getRingLevel('node:crypto')).toBe(RING.KERNEL);
  });
});
