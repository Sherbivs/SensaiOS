# ROUTER — Cryptographic Utilities

**Path:** `src/shared/crypto/`  
**Purpose:** Centralized cryptographic operations with timing-attack prevention  
**Last Updated:** 2025-01-XX  
**Sprint:** 1 (S6: Timing-Safe Token Validation)

---

## Overview

This module provides security-hardened cryptographic utilities designed to prevent timing attacks (CWE-208: Observable Timing Discrepancy). All comparison operations use constant-time algorithms.

## Files

| File | Purpose | Key Exports |
|------|---------|-------------|
| `timing-safe.ts` | Core timing-safe operations | `timingSafeCompare`, `verifyHmacSafe`, `validateTokenSafe` |
| `index.ts` | Public API exports | All timing-safe functions and types |

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     Application Layer                          │
│   (roleArchive.js, securityBaselines.js, API endpoints)       │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                   Crypto Module (timing-safe.ts)               │
│                                                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │ Core Comparisons│  │ HMAC Operations │  │ Token Validation│ │
│  │                 │  │                 │  │                 │ │
│  │ • bufferCompare │  │ • generateHmac  │  │ • validateToken │ │
│  │ • stringCompare │  │ • verifyHmacSafe│  │ • format check  │ │
│  │ • hexCompare    │  │ • verifyBuffers │  │ • length check  │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
│           │                    │                    │          │
│           └────────────────────┼────────────────────┘          │
│                                ▼                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              crypto.timingSafeEqual()                    │  │
│  │         (Node.js constant-time comparison)               │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

## Security Features

### CWE-208 Prevention (Timing Attacks)

All comparison operations execute in constant time regardless of:
- Input validity
- Match position (early vs late mismatch)
- String/buffer length differences

**Techniques Used:**
1. **Dummy comparisons** - Always perform crypto.timingSafeEqual even on invalid input
2. **Length padding** - Compare against random bytes when lengths differ
3. **No early returns** - All code paths execute similar operations
4. **Format-independent timing** - Format validation doesn't affect comparison timing

### Example: Timing-Safe Token Validation

```typescript
// BAD - Vulnerable to timing attacks
if (providedToken === expectedToken) { // Early return on first mismatch
  // Authenticated
}

// GOOD - Constant-time comparison
import { timingSafeCompare } from '../shared/crypto/index.js';
if (timingSafeCompare(providedToken, expectedToken)) {
  // Authenticated
}
```

## API Reference

### Core Comparisons

```typescript
// Buffer comparison
timingSafeBufferCompare(a: Buffer, b: Buffer): boolean

// String comparison
timingSafeCompare(a: string, b: string, encoding?: BufferEncoding): boolean

// Hex string comparison (for signatures)
timingSafeHexCompare(a: string, b: string): boolean
```

### HMAC Operations

```typescript
// Generate HMAC signature
generateHmac(data: string | Buffer, secret: string | Buffer): string

// Verify HMAC with timing-safe comparison
verifyHmacSafe(data: string | Buffer, signature: string, secret: string | Buffer): boolean
```

### Token Validation

```typescript
// Comprehensive token validation
validateTokenSafe(
  provided: string | undefined,
  expected: string,
  options?: {
    minLength?: number,
    maxLength?: number,
    format?: RegExp,
    caseSensitive?: boolean
  }
): { valid: boolean, error?: string, durationNs?: bigint }
```

### Signature Operations

```typescript
// For archive/baseline integrity
verifyDataSignature(data: string, signature: string, secret: string | Buffer): boolean
generateDataSignature(data: string, secret: string | Buffer): string
```

## Integration Points

### Replacing Existing Implementations

This module consolidates timing-safe operations from:
- `src/bot/state/roleArchive.js` - `verifySignature()`
- `src/bot/state/securityBaselines.js` - `verifySignature()`

**Migration Pattern:**
```typescript
// Before (in roleArchive.js)
function verifySignature(data, signature) {
  const expectedSignature = generateSignature(data);
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

// After (using crypto module)
import { verifyDataSignature } from '../shared/crypto/index.js';

function verifySignature(data, signature) {
  return verifyDataSignature(data, signature, ARCHIVE_SECRET);
}
```

### Plugin Integration

Plugins can use timing-safe operations via:
```typescript
import { verifyHmacSafe, validateTokenSafe } from '../../shared/crypto/index.js';

class MySecurityPlugin extends BaseSecurityPlugin {
  async validateRequest(token: string): Promise<boolean> {
    const result = validateTokenSafe(token, this.expectedToken, {
      minLength: 32,
      format: /^Bearer\s+[a-zA-Z0-9._-]+$/
    });
    return result.valid;
  }
}
```

## Testing

```bash
# Run timing-safe crypto tests
npm test -- --grep "timing-safe"

# Security audit
npm audit
```

## Dependencies

- **Node.js crypto** - Built-in cryptographic primitives
- **No external dependencies** - Security-critical code uses only Node.js stdlib

## References

- [CWE-208: Observable Timing Discrepancy](https://cwe.mitre.org/data/definitions/208.html)
- [Node.js crypto.timingSafeEqual](https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b)
- [OWASP Timing Attack Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

## Related

- `src/bot/security/plugins/` - Plugin system consuming crypto operations
- `src/bot/state/roleArchive.js` - Legacy signature verification (to migrate)
- `src/bot/state/securityBaselines.js` - Legacy signature verification (to migrate)
- `docs/security/SECURITY-HARDENING-PROJECT.md` - Security documentation

---

**Security Specialist Signoff:** S6 Timing-Safe Token Validation ✅
