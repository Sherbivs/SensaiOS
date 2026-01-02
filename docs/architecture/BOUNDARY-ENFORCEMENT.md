# 3-Layer Architecture Boundary Enforcement

**Status:** ✅ Implemented (2025-12-30)  
**Authority:** OS Architect Expert Recommendations

## Overview

This document describes the boundary enforcement system for Sensai OS's 3-layer architecture:

```
LAYER 3: User Space (Application)     src/app/, src/bot/, src/observability/
         └── imports from SensaiOS only (NOT Kernel directly)

LAYER 2: SensaiOS (Component OS)      src/sensaios/
         └── imports from Kernel only

LAYER 1: Kernel (Primitives)          src/kernel/
         └── imports NOTHING (zero dependencies on upper layers)
```

## Enforcement Mechanisms

### 1. TypeScript Path Mappings (`tsconfig.json`)

Provides IDE autocomplete and type checking:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@kernel/*": ["src/kernel/*"],
      "@sensai/*": ["src/sensaios/*"],
      "@app/*": ["src/app/*"],
      "@observability/*": ["src/observability/*"]
    }
  }
}
```

### 2. ESLint Import Rules (`eslint.config.js`)

Blocks violations during development and CI:

```javascript
// Kernel Layer: CANNOT import from upper layers
{
  files: ['src/kernel/**/*.ts'],
  rules: {
    'import/no-restricted-paths': ['error', {
      zones: [
        { target: './src/kernel', from: './src/sensaios' },
        { target: './src/kernel', from: './src/app' },
        { target: './src/kernel', from: './src/observability' }
      ]
    }]
  }
}

// Application Layer: CANNOT import Kernel directly
{
  files: ['src/app/**/*.ts', 'src/bot/**/*.ts', 'src/observability/**/*.ts'],
  rules: {
    'import/no-restricted-paths': ['error', {
      zones: [
        { target: './src/app', from: './src/kernel' },
        { target: './src/observability', from: './src/kernel' },
        { target: './src/bot', from: './src/kernel' }
      ]
    }]
  }
}
```

### 3. Validation Script (`scripts/validate-boundaries.ts`)

Comprehensive AST-based validation:

```bash
npm run validate:boundaries
```

Output example:
```
🔍 Validating 3-layer architecture boundaries...

Checking Kernel layer (cannot import from upper layers)...
  Found 23 kernel files
Checking Application layer (cannot import Kernel directly)...
  Found 147 application files

✅ All boundary rules satisfied!
```

### 4. CI Pipeline (`.github/workflows/ci.yml`)

Blocks PRs with violations:

```yaml
- name: Validate layer boundaries
  run: npm run validate:boundaries

- name: Lint (includes boundary rules)
  run: npm run lint
```

## Import Rules

### ✅ ALLOWED

```typescript
// Kernel imports NOTHING
// (no external dependencies beyond Node.js built-ins)

// SensaiOS imports from Kernel
import { ExportsPrimitive } from '@kernel/primitives/exports';
import { ComponentContext } from '@kernel/types';

// Application imports from SensaiOS (NOT Kernel directly)
import { ComponentManifest } from '@sensai/component';
import { runGuarded } from '@sensai/guarded';
```

### ❌ FORBIDDEN

```typescript
// ❌ Kernel importing from SensaiOS
import { ComponentContext } from '@sensai/component';
// ERROR: Kernel CANNOT import from SensaiOS layer

// ❌ Kernel importing from Application
import { handleBattle } from '@app/battles/handler';
// ERROR: Kernel CANNOT import from Application layer

// ❌ Application importing Kernel directly
import { ExportsPrimitive } from '@kernel/primitives/exports';
// ERROR: Application MUST use SensaiOS adapters, not Kernel directly
```

## Fixing Violations

### Example 1: Application importing Kernel

**❌ Before (WRONG):**
```typescript
// File: src/app/battles/handler.ts
import { ExportsPrimitive } from '@kernel/primitives/exports';

export async function handleBattle() {
  const exports = new ExportsPrimitive();
  await exports.append({ type: 'battle.completed' });
}
```

**✅ After (CORRECT):**
```typescript
// File: src/app/battles/handler.ts
import { ComponentContext } from '@sensai/component';

export async function handleBattle(ctx: ComponentContext) {
  // ctx.exports is provided by SensaiOS (which wraps Kernel)
  await ctx.exports.append({ type: 'battle.completed', payload: {} });
}
```

### Example 2: Kernel importing from upper layers

**❌ Before (WRONG):**
```typescript
// File: src/kernel/primitives/exports.ts
import { ComponentLifecycle } from '@sensai/lifecycle';

export class ExportsPrimitive {
  constructor(private lifecycle: ComponentLifecycle) {}
}
```

**✅ After (CORRECT):**
Move the lifecycle-aware code to SensaiOS:

```typescript
// File: src/sensaios/component-exports.ts
import { ExportsPrimitive } from '@kernel/primitives/exports';
import { ComponentLifecycle } from './lifecycle';

export class ComponentExports {
  private kernel: ExportsPrimitive;
  
  constructor(private lifecycle: ComponentLifecycle) {
    this.kernel = new ExportsPrimitive();
  }
  
  async append(envelope: ExportEnvelope): Promise<void> {
    // Lifecycle check happens in SensaiOS layer
    this.lifecycle.assertReady();
    
    // Delegate to kernel primitive
    await this.kernel.append(envelope);
  }
}
```

## Testing

### Unit Tests

```typescript
// File: tests/boundaries/kernel.spec.ts
describe('Kernel Layer Boundaries', () => {
  it('should have zero imports from SensaiOS', async () => {
    const violations = await checkBoundaries(['src/kernel/**/*.ts']);
    const sensaiImports = violations.filter(v => 
      v.imported.includes('sensaios') || v.imported.includes('@sensai')
    );
    expect(sensaiImports).toHaveLength(0);
  });
});
```

### CI Validation

```bash
# Run in CI pipeline
npm run validate:boundaries
npm run lint
```

## Benefits

1. **Architectural Integrity**: Prevents erosion of layer separation over time
2. **Kernel Independence**: Ensures kernel primitives remain dependency-free and stable
3. **Clear Boundaries**: Developers know exactly where code belongs
4. **Easy Refactoring**: Layer violations caught immediately, not months later
5. **Documentation via Code**: The structure itself documents the architecture

## Troubleshooting

### ESLint Resolver Errors

If you see `typescript with invalid interface loaded as resolver`:

```javascript
// eslint.config.js
settings: {
  'import/resolver': {
    typescript: {
      project: ['tsconfig.json', 'tsconfig.build.json'],
      alwaysTryTypes: true  // ← Add this
    }
  }
}
```

### False Positives

If a file legitimately needs to cross boundaries (rare):

```typescript
// Disable rule for specific import
// eslint-disable-next-line import/no-restricted-paths
import { ExportsPrimitive } from '@kernel/primitives/exports';
```

**Note:** Document WHY the exception is needed in a comment.

## References

- **Architecture Guide**: `docs/architecture/EXPERT-OS-ARCHITECT.md` § Section 7
- **System Overview**: `docs/architecture/SENSAIOS-SYSTEM-OVERVIEW.md`
- **Validation Script**: `scripts/validate-boundaries.ts`
- **ESLint Config**: `eslint.config.js` (3-layer architecture sections)

---

**Document Version:** 1.0  
**Created:** 2025-12-30  
**Updated:** 2025-12-30  
**Purpose:** Implementation guide for 3-layer architecture boundary enforcement
