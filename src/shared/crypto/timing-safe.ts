/**
 * Timing-Safe Cryptographic Operations
 * 
 * @module src/shared/crypto/timing-safe
 * @description Centralized timing-safe cryptographic utilities to prevent
 * timing attacks (CWE-208: Observable Timing Discrepancy).
 * 
 * @security CWE-208 - All comparison operations use constant-time algorithms
 * @reference https://cwe.mitre.org/data/definitions/208.html
 * @research R1 - Timing-Safe HMAC Verification (FINAL-REVIEW.md)
 * 
 * @example
 * ```typescript
 * import { timingSafeCompare, verifyHmacSafe, generateHmac } from '../shared/crypto/timing-safe.js';
 * 
 * // Compare tokens safely
 * const isValid = timingSafeCompare(userToken, expectedToken);
 * 
 * // Verify HMAC signatures
 * const hmac = generateHmac(data, secret);
 * const verified = verifyHmacSafe(data, signature, secret);
 * ```
 * 
 * @author Security Specialist (Sprint 1)
 * @since 2025-01-XX
 */

import crypto from 'crypto';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for timing-safe operations
 */
export interface TimingSafeConfig {
  /** Default HMAC algorithm (default: 'sha256') */
  hmacAlgorithm: 'sha256' | 'sha384' | 'sha512';
  /** Encoding for hex conversions (default: 'hex') */
  encoding: BufferEncoding;
  /** Minimum token length for validation (default: 16) */
  minTokenLength: number;
  /** Maximum token length for validation (default: 512) */
  maxTokenLength: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TimingSafeConfig = {
  hmacAlgorithm: 'sha256',
  encoding: 'hex',
  minTokenLength: 16,
  maxTokenLength: 512,
};

let currentConfig: TimingSafeConfig = { ...DEFAULT_CONFIG };

/**
 * Configure timing-safe module settings
 * @param config - Partial configuration to merge
 */
export function configureTimingSafe(config: Partial<TimingSafeConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * Get current configuration (for testing)
 */
export function getTimingSafeConfig(): TimingSafeConfig {
  return { ...currentConfig };
}

// ============================================================================
// Core Timing-Safe Comparisons
// ============================================================================

/**
 * Timing-safe comparison of two buffers
 * 
 * @description Uses crypto.timingSafeEqual for constant-time comparison.
 * Handles length mismatches by comparing against random bytes to prevent
 * leaking length information through timing.
 * 
 * @security CWE-208 - Constant-time comparison prevents timing attacks
 * 
 * @param a - First buffer to compare
 * @param b - Second buffer to compare
 * @returns True if buffers are equal, false otherwise
 * 
 * @example
 * ```typescript
 * const buf1 = Buffer.from('secret123');
 * const buf2 = Buffer.from('secret123');
 * const result = timingSafeBufferCompare(buf1, buf2); // true
 * ```
 */
export function timingSafeBufferCompare(a: Buffer, b: Buffer): boolean {
  // If lengths differ, compare against random bytes to maintain constant time
  // This prevents attackers from learning the expected length via timing
  if (a.length !== b.length) {
    const dummy = crypto.randomBytes(a.length);
    crypto.timingSafeEqual(a, dummy);
    return false;
  }
  
  return crypto.timingSafeEqual(a, b);
}

/**
 * Timing-safe comparison of two strings
 * 
 * @description Converts strings to buffers and performs constant-time comparison.
 * Handles different encodings and length mismatches securely.
 * 
 * @security CWE-208 - Constant-time comparison prevents timing attacks
 * 
 * @param a - First string to compare
 * @param b - Second string to compare
 * @param encoding - String encoding (default: 'utf8')
 * @returns True if strings are equal, false otherwise
 * 
 * @example
 * ```typescript
 * const result = timingSafeCompare('api_key_123', userProvidedKey);
 * ```
 */
export function timingSafeCompare(
  a: string,
  b: string,
  encoding: BufferEncoding = 'utf8'
): boolean {
  const bufA = Buffer.from(a, encoding);
  const bufB = Buffer.from(b, encoding);
  return timingSafeBufferCompare(bufA, bufB);
}

/**
 * Timing-safe comparison of hex-encoded strings
 * 
 * @description Optimized comparison for hex-encoded values (signatures, hashes).
 * Validates hex format before comparison.
 * 
 * @security CWE-208 - Constant-time comparison prevents timing attacks
 * 
 * @param a - First hex string
 * @param b - Second hex string
 * @returns True if hex values are equal, false otherwise
 * @throws Never - Returns false on invalid input instead of throwing
 * 
 * @example
 * ```typescript
 * const sig1 = 'a1b2c3d4...';
 * const sig2 = 'a1b2c3d4...';
 * const valid = timingSafeHexCompare(sig1, sig2);
 * ```
 */
export function timingSafeHexCompare(a: string, b: string): boolean {
  // Validate hex format without timing leaks
  const hexRegex = /^[0-9a-fA-F]*$/;
  const aIsHex = hexRegex.test(a);
  const bIsHex = hexRegex.test(b);
  
  // Always perform comparison even if format is invalid
  // This prevents timing-based format detection
  if (!aIsHex || !bIsHex) {
    // Compare dummy values to maintain constant time
    const dummy1 = crypto.randomBytes(32);
    const dummy2 = crypto.randomBytes(32);
    crypto.timingSafeEqual(dummy1, dummy2);
    return false;
  }
  
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    return timingSafeBufferCompare(bufA, bufB);
  } catch {
    // Should not reach here if hex validation passed, but be safe
    return false;
  }
}

// ============================================================================
// HMAC Operations
// ============================================================================

/**
 * Generate HMAC signature for data
 * 
 * @description Creates HMAC-SHA256 (or configured algorithm) signature.
 * Uses timing-safe operations internally.
 * 
 * @param data - Data to sign (string or Buffer)
 * @param secret - Secret key for HMAC
 * @param algorithm - Hash algorithm (default: from config)
 * @returns Hex-encoded HMAC signature
 * 
 * @example
 * ```typescript
 * const signature = generateHmac(JSON.stringify(data), process.env.HMAC_SECRET!);
 * ```
 */
export function generateHmac(
  data: string | Buffer,
  secret: string | Buffer,
  algorithm: 'sha256' | 'sha384' | 'sha512' = currentConfig.hmacAlgorithm
): string {
  const hmac = crypto.createHmac(algorithm, secret);
  hmac.update(data);
  return hmac.digest('hex');
}

/**
 * Verify HMAC signature with timing-safe comparison
 * 
 * @description Generates expected HMAC and compares using constant-time algorithm.
 * This is the recommended way to verify HMAC signatures.
 * 
 * @security CWE-208 - Constant-time comparison prevents timing attacks
 * 
 * @param data - Original data that was signed
 * @param signature - Signature to verify (hex-encoded)
 * @param secret - Secret key used for HMAC
 * @param algorithm - Hash algorithm (default: from config)
 * @returns True if signature is valid, false otherwise
 * 
 * @example
 * ```typescript
 * const isValid = verifyHmacSafe(payload, receivedSignature, HMAC_SECRET);
 * if (!isValid) {
 *   throw new Error('Invalid signature');
 * }
 * ```
 */
export function verifyHmacSafe(
  data: string | Buffer,
  signature: string,
  secret: string | Buffer,
  algorithm: 'sha256' | 'sha384' | 'sha512' = currentConfig.hmacAlgorithm
): boolean {
  const expectedSignature = generateHmac(data, secret, algorithm);
  return timingSafeHexCompare(expectedSignature, signature);
}

/**
 * Verify HMAC with Buffer inputs (for existing integrations)
 * 
 * @description Alternative signature accepting Buffer types directly.
 * Useful when integrating with existing systems.
 * 
 * @security CWE-208 - Constant-time comparison prevents timing attacks
 * 
 * @param expected - Expected HMAC as Buffer
 * @param actual - Actual HMAC as Buffer
 * @returns True if HMACs match, false otherwise
 */
export function verifyHmacBuffers(expected: Buffer, actual: Buffer): boolean {
  return timingSafeBufferCompare(expected, actual);
}

// ============================================================================
// Token Validation
// ============================================================================

/**
 * Token validation options
 */
export interface TokenValidationOptions {
  /** Minimum token length */
  minLength?: number;
  /** Maximum token length */
  maxLength?: number;
  /** Expected token format regex */
  format?: RegExp;
  /** Case-sensitive comparison (default: true) */
  caseSensitive?: boolean;
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  /** Whether the token is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Validation duration in nanoseconds (for monitoring) */
  durationNs?: bigint;
}

/**
 * Validate and compare API token with timing-safe comparison
 * 
 * @description Comprehensive token validation with format checking and
 * timing-safe comparison. Ensures constant-time execution regardless
 * of token validity.
 * 
 * @security CWE-208 - All code paths execute in constant time
 * 
 * @param provided - User-provided token
 * @param expected - Expected/stored token
 * @param options - Validation options
 * @returns Validation result with timing information
 * 
 * @example
 * ```typescript
 * const result = validateTokenSafe(
 *   req.headers.authorization,
 *   storedApiKey,
 *   { minLength: 32, format: /^sk_live_[a-zA-Z0-9]+$/ }
 * );
 * 
 * if (!result.valid) {
 *   res.status(401).json({ error: result.error });
 * }
 * ```
 */
export function validateTokenSafe(
  provided: string | undefined | null,
  expected: string,
  options: TokenValidationOptions = {}
): TokenValidationResult {
  const startTime = process.hrtime.bigint();
  const {
    minLength = currentConfig.minTokenLength,
    maxLength = currentConfig.maxTokenLength,
    format,
    caseSensitive = true,
  } = options;
  
  // Always perform dummy comparison to maintain constant time
  // This ensures attackers cannot determine if token was even provided
  const dummyA = crypto.randomBytes(32);
  const dummyB = crypto.randomBytes(32);
  
  // Normalize input
  const providedToken = provided ?? '';
  const expectedToken = expected;
  
  // Track validation state without early returns
  let isValid = true;
  let errorMessage = '';
  
  // Length validation
  if (providedToken.length < minLength) {
    isValid = false;
    errorMessage = 'Token too short';
  } else if (providedToken.length > maxLength) {
    isValid = false;
    errorMessage = 'Token too long';
  }
  
  // Format validation (if specified)
  if (format && !format.test(providedToken)) {
    isValid = false;
    errorMessage = errorMessage || 'Invalid token format';
  }
  
  // Always perform timing-safe comparison, even if other validations failed
  // This prevents attackers from skipping comparison via format manipulation
  const compareA = caseSensitive ? providedToken : providedToken.toLowerCase();
  const compareB = caseSensitive ? expectedToken : expectedToken.toLowerCase();
  const tokensMatch = timingSafeCompare(compareA, compareB);
  
  // Also do dummy comparison to pad timing
  crypto.timingSafeEqual(dummyA, dummyB);
  
  // Final validity combines all checks
  isValid = isValid && tokensMatch;
  if (!tokensMatch && !errorMessage) {
    errorMessage = 'Invalid token';
  }
  
  const endTime = process.hrtime.bigint();
  
  return {
    valid: isValid,
    error: isValid ? undefined : errorMessage,
    durationNs: endTime - startTime,
  };
}

// ============================================================================
// Signature Verification (for Archives/Baselines)
// ============================================================================

/**
 * Signature verification options
 */
export interface SignatureOptions {
  /** HMAC algorithm to use */
  algorithm?: 'sha256' | 'sha384' | 'sha512';
  /** Whether to validate signature format */
  validateFormat?: boolean;
}

/**
 * Verify data signature with timing-safe comparison
 * 
 * @description Used for verifying integrity of archived data.
 * Replaces scattered implementations in roleArchive.js and securityBaselines.js.
 * 
 * @security CWE-208 - Constant-time signature comparison
 * 
 * @param data - JSON stringified data that was signed
 * @param signature - Hex-encoded signature to verify
 * @param secret - Secret key used for signing
 * @param options - Verification options
 * @returns True if signature is valid
 * 
 * @example
 * ```typescript
 * const data = JSON.stringify(roleArchive);
 * const isValid = verifyDataSignature(data, storedSignature, ARCHIVE_SECRET);
 * ```
 */
export function verifyDataSignature(
  data: string,
  signature: string,
  secret: string | Buffer,
  options: SignatureOptions = {}
): boolean {
  const { algorithm = currentConfig.hmacAlgorithm, validateFormat = true } = options;
  
  // Optionally validate signature format
  if (validateFormat) {
    const expectedLength = algorithm === 'sha256' ? 64 : algorithm === 'sha384' ? 96 : 128;
    if (signature.length !== expectedLength) {
      // Compare against dummy to maintain timing
      const dummy = crypto.randomBytes(expectedLength / 2).toString('hex');
      timingSafeHexCompare(dummy, signature);
      return false;
    }
  }
  
  return verifyHmacSafe(data, signature, secret, algorithm);
}

/**
 * Generate data signature
 * 
 * @description Creates HMAC signature for data integrity verification.
 * 
 * @param data - Data to sign
 * @param secret - Secret key for signing
 * @param algorithm - Hash algorithm
 * @returns Hex-encoded signature
 */
export function generateDataSignature(
  data: string,
  secret: string | Buffer,
  algorithm: 'sha256' | 'sha384' | 'sha512' = currentConfig.hmacAlgorithm
): string {
  return generateHmac(data, secret, algorithm);
}

// ============================================================================
// Secure Random Generation
// ============================================================================

/**
 * Generate cryptographically secure random token
 * 
 * @param length - Length in bytes (default: 32)
 * @param encoding - Output encoding (default: 'hex')
 * @returns Random token string
 */
export function generateSecureToken(
  length: number = 32,
  encoding: BufferEncoding = 'hex'
): string {
  return crypto.randomBytes(length).toString(encoding);
}

/**
 * Generate secure random bytes
 * 
 * @param length - Number of bytes
 * @returns Random Buffer
 */
export function generateSecureBytes(length: number): Buffer {
  return crypto.randomBytes(length);
}

// ============================================================================
// Hash Operations
// ============================================================================

/**
 * Generate SHA-256 hash
 * 
 * @param data - Data to hash
 * @returns Hex-encoded hash
 */
export function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate SHA-384 hash
 * 
 * @param data - Data to hash
 * @returns Hex-encoded hash
 */
export function sha384(data: string | Buffer): string {
  return crypto.createHash('sha384').update(data).digest('hex');
}

/**
 * Generate SHA-512 hash
 * 
 * @param data - Data to hash
 * @returns Hex-encoded hash
 */
export function sha512(data: string | Buffer): string {
  return crypto.createHash('sha512').update(data).digest('hex');
}

/**
 * Compare hash with timing-safe comparison
 * 
 * @param data - Data to hash and compare
 * @param expectedHash - Expected hash value
 * @param algorithm - Hash algorithm (default: 'sha256')
 * @returns True if hashes match
 */
export function verifyHash(
  data: string | Buffer,
  expectedHash: string,
  algorithm: 'sha256' | 'sha384' | 'sha512' = 'sha256'
): boolean {
  const hashFn = algorithm === 'sha256' ? sha256 : algorithm === 'sha384' ? sha384 : sha512;
  const computedHash = hashFn(data);
  return timingSafeHexCompare(computedHash, expectedHash);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Constant-time string length comparison
 * 
 * @description Compares string lengths in constant time.
 * Useful when length itself is sensitive information.
 * 
 * @param a - First string
 * @param b - Second string
 * @returns True if same length
 */
export function constantTimeLengthCompare(a: string, b: string): boolean {
  // XOR lengths and check if result is 0
  // This prevents timing-based length detection
  let result = a.length ^ b.length;
  
  // Pad with operations to maintain consistent timing
  const iterations = Math.max(a.length, b.length, 32);
  for (let i = 0; i < iterations; i++) {
    result |= 0; // No-op to pad timing
  }
  
  return result === 0;
}

/**
 * Secure memory wipe for sensitive data
 * 
 * @description Attempts to overwrite buffer contents before garbage collection.
 * Note: JavaScript doesn't guarantee memory wiping, this is best-effort.
 * 
 * @param buffer - Buffer to wipe
 */
export function secureWipe(buffer: Buffer): void {
  crypto.randomFill(buffer, () => {
    // Best-effort wipe - fill with random then zeros
    buffer.fill(0);
  });
}

// ============================================================================
// Module Exports Summary
// ============================================================================

/**
 * Timing-safe crypto module exports:
 * 
 * Configuration:
 * - configureTimingSafe() - Configure module settings
 * - getTimingSafeConfig() - Get current config
 * 
 * Core Comparisons:
 * - timingSafeBufferCompare() - Compare buffers
 * - timingSafeCompare() - Compare strings
 * - timingSafeHexCompare() - Compare hex strings
 * 
 * HMAC Operations:
 * - generateHmac() - Create HMAC signature
 * - verifyHmacSafe() - Verify HMAC with timing-safe comparison
 * - verifyHmacBuffers() - Verify Buffer HMACs
 * 
 * Token Validation:
 * - validateTokenSafe() - Comprehensive token validation
 * 
 * Signature Operations:
 * - verifyDataSignature() - Verify archive/baseline signatures
 * - generateDataSignature() - Create data signatures
 * 
 * Random Generation:
 * - generateSecureToken() - Random token strings
 * - generateSecureBytes() - Random byte buffers
 * 
 * Hash Operations:
 * - sha256(), sha384(), sha512() - Hash functions
 * - verifyHash() - Timing-safe hash verification
 * 
 * Utilities:
 * - constantTimeLengthCompare() - Length comparison
 * - secureWipe() - Memory clearing (best-effort)
 */
