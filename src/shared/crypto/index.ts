/**
 * Cryptographic Utilities Module
 * 
 * @module src/shared/crypto
 * @description Centralized cryptographic operations with security best practices.
 * All operations are designed to prevent timing attacks (CWE-208).
 * 
 * @example
 * ```typescript
 * import {
 *   timingSafeCompare,
 *   verifyHmacSafe,
 *   generateSecureToken,
 *   validateTokenSafe
 * } from '../shared/crypto/index.js';
 * 
 * // Compare API keys safely
 * if (timingSafeCompare(providedKey, storedKey)) {
 *   // Authenticated
 * }
 * 
 * // Verify HMAC signatures
 * const isValid = verifyHmacSafe(data, signature, secret);
 * 
 * // Generate secure tokens
 * const sessionToken = generateSecureToken(32);
 * 
 * // Comprehensive token validation
 * const result = validateTokenSafe(authHeader, expectedToken);
 * ```
 * 
 * @author Security Specialist (Sprint 1)
 * @since 2025-01-XX
 */

// ============================================================================
// Timing-Safe Operations (CWE-208 Prevention)
// ============================================================================

export {
  // Configuration
  configureTimingSafe,
  getTimingSafeConfig,
  
  // Core Comparisons
  timingSafeBufferCompare,
  timingSafeCompare,
  timingSafeHexCompare,
  
  // HMAC Operations
  generateHmac,
  verifyHmacSafe,
  verifyHmacBuffers,
  
  // Token Validation
  validateTokenSafe,
  
  // Signature Operations
  verifyDataSignature,
  generateDataSignature,
  
  // Random Generation
  generateSecureToken,
  generateSecureBytes,
  
  // Hash Operations
  sha256,
  sha384,
  sha512,
  verifyHash,
  
  // Utilities
  constantTimeLengthCompare,
  secureWipe,
} from './timing-safe.js';

// ============================================================================
// Type Exports
// ============================================================================

export type {
  TimingSafeConfig,
  TokenValidationOptions,
  TokenValidationResult,
  SignatureOptions,
} from './timing-safe.js';

// ============================================================================
// Cryptographic Provider Abstraction (S11 - Cryptographic Agility)
// ============================================================================

export {
  // Provider Classes
  DefaultCryptoProvider,
  FIPSCryptoProvider,
  
  // Provider Management
  getCryptoProvider,
  getCryptoProviderByName,
  setCryptoProvider,
  registerCryptoProvider,
  unregisterCryptoProvider,
  getCurrentProviderName,
  listCryptoProviders,
  resetCryptoRegistry,
  
  // Convenience Functions
  hash,
  verifyHash as verifyHashProvider,
  sign,
  verify,
  encrypt,
  decrypt,
  deriveKey,
} from './crypto-provider.js';

export type {
  HashAlgorithm,
  HmacAlgorithm,
  EncryptionAlgorithm,
  AlgorithmCapabilities,
  ProviderMetadata,
  EncryptedPayload,
  ICryptoProvider,
} from './crypto-provider.js';

// ============================================================================
// Module Documentation
// ============================================================================

/**
 * Security Guidelines for Using This Module:
 * 
 * 1. ALWAYS use timing-safe comparisons for:
 *    - API keys and tokens
 *    - HMAC signatures
 *    - Password hashes (though use bcrypt/argon2 for passwords)
 *    - Any security-sensitive string comparison
 * 
 * 2. NEVER use standard equality (===, ==) for:
 *    - Secrets
 *    - Tokens
 *    - Signatures
 *    - Any value that could be timing-attacked
 * 
 * 3. Token validation best practices:
 *    - Use validateTokenSafe() for comprehensive validation
 *    - Set appropriate min/max lengths
 *    - Define format regex for structured tokens
 * 
 * 4. HMAC verification best practices:
 *    - Use verifyHmacSafe() instead of manual comparison
 *    - Store secrets securely (env vars, secret manager)
 *    - Use SHA-256 or higher for new implementations
 * 
 * 5. Random generation:
 *    - Use generateSecureToken() for session IDs, API keys
 *    - Use generateSecureBytes() for cryptographic operations
 *    - Never use Math.random() for security purposes
 * 
 * @security CWE-208 - All comparison operations are constant-time
 * @reference https://cwe.mitre.org/data/definitions/208.html
 */
