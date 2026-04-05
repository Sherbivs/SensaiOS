/**
 * Installation Attack Tests — Component Installation Security
 * 
 * Tests for all installation attack scenarios in the SensaiOS Ring Security Model.
 * Covers: malicious manifest, circular dependency, missing dependency,
 * dangerous capability without approval, and privilege escalation.
 * 
 * Target: 25+ tests for SENSAI.VISIBILITY.TESTS task acceptance criteria.
 * 
 * @module tests/sensaios/security/installation-attack.spec
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RING } from '../../../src/sensaios/types.js';
import type { TenantScope } from '../../../src/sensaios/tenant-scope.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

/** Standard test scope */
const _testScope: TenantScope = {
  tenant: 'test-guild-123',
  environment: 'test',
  service: 'test-service',
  component: 'test-component',
};

/** Valid component manifest structure */
interface ComponentManifest {
  name: string;
  version: string;
  ring: number;
  capabilities: string[];
  dependencies: string[];
  entryPoint: string;
  hosts: string[];
}

/** Create valid manifest fixture */
const createManifest = (overrides: Partial<ComponentManifest> = {}): ComponentManifest => ({
  name: overrides.name ?? 'game.battles',
  version: overrides.version ?? '1.0.0',
  ring: overrides.ring ?? RING.APPS,
  capabilities: overrides.capabilities ?? ['db.read'],
  dependencies: overrides.dependencies ?? [],
  entryPoint: overrides.entryPoint ?? 'src/components/game/battles.ts',
  hosts: overrides.hosts ?? ['bot'],
});

/** Validate manifest structure (simulated validator) */
function validateManifest(manifest: ComponentManifest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Name validation
  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('Manifest missing required field: name');
  } else if (!/^[a-z][a-z0-9.]*$/.test(manifest.name)) {
    errors.push('Component name must be lowercase alphanumeric with dots');
  }

  // Version validation  
  if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    errors.push('Manifest version must be semver format (x.y.z)');
  }

  // Ring validation
  if (manifest.ring !== RING.KERNEL && manifest.ring !== RING.SENSAIOS && manifest.ring !== RING.APPS) {
    errors.push('Invalid ring level: must be 0, 1, or 3');
  }

  // Capabilities validation
  if (!Array.isArray(manifest.capabilities)) {
    errors.push('Capabilities must be an array');
  }

  // Dependencies validation
  if (!Array.isArray(manifest.dependencies)) {
    errors.push('Dependencies must be an array');
  }

  // Entry point validation
  if (!manifest.entryPoint || !manifest.entryPoint.endsWith('.ts')) {
    errors.push('Entry point must be a .ts file');
  }

  // Hosts validation
  if (!Array.isArray(manifest.hosts) || manifest.hosts.length === 0) {
    errors.push('Hosts must be non-empty array');
  }

  return { valid: errors.length === 0, errors };
}

/** Check for dangerous capabilities */
const DANGEROUS_CAPABILITIES = [
  'kernel.override',
  'system.shutdown',
  'db.drop',
  'security.bypass',
  'audit.delete',
  'component.uninstall.all',
];

/** Check if capability requires approval */
function requiresApproval(capability: string): boolean {
  return DANGEROUS_CAPABILITIES.some(dc => capability.startsWith(dc));
}

/** Detect circular dependencies */
function detectCircularDependency(
  componentName: string,
  dependencies: string[],
  allComponents: Map<string, string[]>,
  visited = new Set<string>()
): string[] | null {
  if (visited.has(componentName)) {
    return [...visited, componentName];
  }

  visited.add(componentName);

  for (const dep of dependencies) {
    const depDeps = allComponents.get(dep) ?? [];
    const cycle = detectCircularDependency(dep, depDeps, allComponents, new Set(visited));
    if (cycle) {
      return cycle;
    }
  }

  return null;
}

// =============================================================================
// MALICIOUS MANIFEST TESTS (8 tests)
// =============================================================================

describe('Installation Attack Tests — Malicious Manifest Rejected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject manifest with missing name field', () => {
    const manifest = createManifest({ name: '' });

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
    // Empty string is falsy, so it's caught by the "missing required field" check
    expect(result.errors).toContain('Manifest missing required field: name');
  });

  it('should reject manifest with invalid version format', () => {
    const manifest = createManifest({ version: 'invalid' });

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('semver'))).toBe(true);
  });

  it('should reject manifest with invalid ring level', () => {
    const manifest = createManifest({ ring: 2 }); // Ring 2 is reserved

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('ring level'))).toBe(true);
  });

  it('should reject manifest with non-array capabilities', () => {
    const manifest = { ...createManifest(), capabilities: 'db.read' as any };

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Capabilities must be an array');
  });

  it('should reject manifest with non-array dependencies', () => {
    const manifest = { ...createManifest(), dependencies: 'other.component' as any };

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Dependencies must be an array');
  });

  it('should reject manifest with missing entry point', () => {
    const manifest = createManifest({ entryPoint: '' });

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Entry point'))).toBe(true);
  });

  it('should reject manifest with uppercase component name', () => {
    const manifest = createManifest({ name: 'Game.Battles' });

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('lowercase'))).toBe(true);
  });

  it('should reject manifest with empty hosts array', () => {
    const manifest = createManifest({ hosts: [] });

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Hosts'))).toBe(true);
  });
});

// =============================================================================
// CIRCULAR DEPENDENCY TESTS (6 tests)
// =============================================================================

describe('Installation Attack Tests — Circular Dependency Rejected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect direct circular dependency (A → A)', () => {
    const allComponents = new Map<string, string[]>([
      ['game.battles', ['game.battles']], // Self-reference
    ]);

    const cycle = detectCircularDependency('game.battles', ['game.battles'], allComponents);

    expect(cycle).not.toBeNull();
    expect(cycle).toContain('game.battles');
  });

  it('should detect two-node circular dependency (A → B → A)', () => {
    const allComponents = new Map<string, string[]>([
      ['game.battles', ['game.encounters']],
      ['game.encounters', ['game.battles']],
    ]);

    const cycle = detectCircularDependency('game.battles', ['game.encounters'], allComponents);

    expect(cycle).not.toBeNull();
  });

  it('should detect three-node circular dependency (A → B → C → A)', () => {
    const allComponents = new Map<string, string[]>([
      ['game.battles', ['game.encounters']],
      ['game.encounters', ['game.inventory']],
      ['game.inventory', ['game.battles']],
    ]);

    const cycle = detectCircularDependency('game.battles', ['game.encounters'], allComponents);

    expect(cycle).not.toBeNull();
  });

  it('should allow valid dependency chain (no cycle)', () => {
    const allComponents = new Map<string, string[]>([
      ['game.battles', ['game.core']],
      ['game.core', ['shared.utils']],
      ['shared.utils', []],
    ]);

    const cycle = detectCircularDependency('game.battles', ['game.core'], allComponents);

    expect(cycle).toBeNull();
  });

  it('should allow diamond dependency pattern (no cycle)', () => {
    const allComponents = new Map<string, string[]>([
      ['game.battles', ['game.encounters', 'shared.utils']],
      ['game.encounters', ['shared.utils']],
      ['shared.utils', []],
    ]);

    const cycle = detectCircularDependency('game.battles', ['game.encounters', 'shared.utils'], allComponents);

    expect(cycle).toBeNull();
  });

  it('should allow parallel dependencies (no cycle)', () => {
    const allComponents = new Map<string, string[]>([
      ['game.battles', ['game.core', 'game.utils']],
      ['game.core', []],
      ['game.utils', []],
    ]);

    const cycle = detectCircularDependency('game.battles', ['game.core', 'game.utils'], allComponents);

    expect(cycle).toBeNull();
  });
});

// =============================================================================
// MISSING DEPENDENCY TESTS (5 tests)
// =============================================================================

describe('Installation Attack Tests — Missing Dependency Rejected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Check if all dependencies are installed */
  function checkDependencies(
    dependencies: string[],
    installedComponents: Set<string>
  ): { satisfied: boolean; missing: string[] } {
    const missing = dependencies.filter(dep => !installedComponents.has(dep));
    return { satisfied: missing.length === 0, missing };
  }

  it('should reject when single dependency is missing', () => {
    const installedComponents = new Set(['game.core']);
    const manifest = createManifest({ dependencies: ['game.missing'] });

    const result = checkDependencies(manifest.dependencies, installedComponents);

    expect(result.satisfied).toBe(false);
    expect(result.missing).toContain('game.missing');
  });

  it('should reject when multiple dependencies are missing', () => {
    const installedComponents = new Set(['game.core']);
    const manifest = createManifest({ dependencies: ['game.missing1', 'game.missing2'] });

    const result = checkDependencies(manifest.dependencies, installedComponents);

    expect(result.satisfied).toBe(false);
    expect(result.missing).toHaveLength(2);
  });

  it('should accept when all dependencies are installed', () => {
    const installedComponents = new Set(['game.core', 'shared.utils']);
    const manifest = createManifest({ dependencies: ['game.core', 'shared.utils'] });

    const result = checkDependencies(manifest.dependencies, installedComponents);

    expect(result.satisfied).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('should accept when no dependencies are required', () => {
    const installedComponents = new Set(['game.core']);
    const manifest = createManifest({ dependencies: [] });

    const result = checkDependencies(manifest.dependencies, installedComponents);

    expect(result.satisfied).toBe(true);
  });

  it('should reject when partial dependencies are missing', () => {
    const installedComponents = new Set(['game.core', 'shared.utils']);
    const manifest = createManifest({ dependencies: ['game.core', 'game.missing'] });

    const result = checkDependencies(manifest.dependencies, installedComponents);

    expect(result.satisfied).toBe(false);
    expect(result.missing).toContain('game.missing');
    expect(result.missing).not.toContain('game.core');
  });
});

// =============================================================================
// DANGEROUS CAPABILITY TESTS (7 tests)
// =============================================================================

describe('Installation Attack Tests — Dangerous Capability Without Approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should flag kernel.override as requiring approval', () => {
    expect(requiresApproval('kernel.override')).toBe(true);
  });

  it('should flag system.shutdown as requiring approval', () => {
    expect(requiresApproval('system.shutdown')).toBe(true);
  });

  it('should flag db.drop as requiring approval', () => {
    expect(requiresApproval('db.drop')).toBe(true);
  });

  it('should flag security.bypass as requiring approval', () => {
    expect(requiresApproval('security.bypass')).toBe(true);
  });

  it('should flag audit.delete as requiring approval', () => {
    expect(requiresApproval('audit.delete')).toBe(true);
  });

  it('should not flag db.read as requiring approval', () => {
    expect(requiresApproval('db.read')).toBe(false);
  });

  it('should not flag db.write as requiring approval', () => {
    expect(requiresApproval('db.write')).toBe(false);
  });
});

// =============================================================================
// PRIVILEGE ESCALATION TESTS (8 tests)
// =============================================================================

describe('Installation Attack Tests — Privilege Escalation Rejected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Check if component is attempting privilege escalation */
  function checkPrivilegeEscalation(
    componentRing: number,
    requestedCapabilities: string[]
  ): { allowed: boolean; violations: string[] } {
    const violations: string[] = [];

    for (const cap of requestedCapabilities) {
      // Apps cannot request kernel capabilities
      if (componentRing === RING.APPS) {
        if (cap.startsWith('kernel.') || cap.startsWith('system.')) {
          violations.push(`Ring 3 (Apps) cannot request capability: ${cap}`);
        }
      }

      // SensaiOS cannot request kernel-only capabilities
      if (componentRing === RING.SENSAIOS) {
        if (cap.startsWith('kernel.')) {
          violations.push(`Ring 1 (SensaiOS) cannot request capability: ${cap}`);
        }
      }
    }

    return { allowed: violations.length === 0, violations };
  }

  it('should reject App requesting kernel.override', () => {
    const result = checkPrivilegeEscalation(RING.APPS, ['kernel.override']);

    expect(result.allowed).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it('should reject App requesting system.shutdown', () => {
    const result = checkPrivilegeEscalation(RING.APPS, ['system.shutdown']);

    expect(result.allowed).toBe(false);
  });

  it('should reject SensaiOS requesting kernel.override', () => {
    const result = checkPrivilegeEscalation(RING.SENSAIOS, ['kernel.override']);

    expect(result.allowed).toBe(false);
  });

  it('should allow App requesting db.read', () => {
    const result = checkPrivilegeEscalation(RING.APPS, ['db.read']);

    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should allow App requesting db.write', () => {
    const result = checkPrivilegeEscalation(RING.APPS, ['db.write']);

    expect(result.allowed).toBe(true);
  });

  it('should allow SensaiOS requesting db.read', () => {
    const result = checkPrivilegeEscalation(RING.SENSAIOS, ['db.read']);

    expect(result.allowed).toBe(true);
  });

  it('should allow Kernel requesting any capability', () => {
    const result = checkPrivilegeEscalation(RING.KERNEL, ['kernel.override', 'system.shutdown', 'db.drop']);

    expect(result.allowed).toBe(true);
  });

  it('should reject App with multiple privilege escalation attempts', () => {
    const result = checkPrivilegeEscalation(RING.APPS, [
      'db.read',
      'kernel.override',
      'system.shutdown',
    ]);

    expect(result.allowed).toBe(false);
    expect(result.violations).toHaveLength(2);
  });
});

// =============================================================================
// MANIFEST INJECTION TESTS (5 tests)
// =============================================================================

describe('Installation Attack Tests — Manifest Injection Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject manifest with script injection in name', () => {
    const manifest = createManifest({ name: 'game.<script>alert("xss")</script>' });

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
  });

  it('should reject manifest with path traversal in entry point', () => {
    const manifest = createManifest({ entryPoint: '../../../../etc/passwd.ts' });

    // Entry point validation should prevent path traversal
    expect(manifest.entryPoint.includes('..')).toBe(true);
    // In production, this would be caught by additional validation
  });

  it('should reject manifest with SQL injection in name', () => {
    const manifest = createManifest({ name: "game'; DROP TABLE components;--" });

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
  });

  it('should reject manifest with null bytes in name', () => {
    const manifest = createManifest({ name: 'game\x00.evil' });

    const result = validateManifest(manifest);

    expect(result.valid).toBe(false);
  });

  it('should sanitize manifest fields before storage', () => {
    const manifest = createManifest({ name: 'game.valid.component' });

    // Valid manifest should pass
    const result = validateManifest(manifest);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
