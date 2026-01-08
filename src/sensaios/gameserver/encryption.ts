/**
 * SensaiOS GameServer Encryption — AES-256-GCM Encryption for Sensitive Data
 * 
 * This module provides encryption/decryption for sensitive data passed through
 * the GameServerAPI boundary. Apps receive encrypted tokens instead of raw
 * Discord IDs, guild IDs, and other sensitive information.
 * 
 * ## Security Model
 * 
 * - **Algorithm**: AES-256-GCM (authenticated encryption)
 * - **Key Derivation**: Per-app keys derived from master key + app ID
 * - **Nonce**: Random 12-byte IV per encryption (stored with ciphertext)
 * - **Authentication Tag**: 16-byte tag for integrity verification
 * 
 * ## Token Format
 * 
 * Encrypted tokens are Base64-encoded strings with format:
 * `enc_{version}_{base64(iv + ciphertext + tag)}`
 * 
 * @module sensaios/gameserver/encryption
 * @since 2026-01-03
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

import type { EncryptedToken, EncryptedFieldType } from './types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Encryption algorithm (AES-256-GCM)
 */
const ALGORITHM = 'aes-256-gcm';

/**
 * IV (nonce) length in bytes
 */
const IV_LENGTH = 12;

/**
 * Auth tag length in bytes
 */
const AUTH_TAG_LENGTH = 16;

/**
 * Key length in bytes (256 bits)
 */
const KEY_LENGTH = 32;

/**
 * Current encryption version (for future format changes)
 */
const ENCRYPTION_VERSION = 'v1';

/**
 * Token prefix
 */
const TOKEN_PREFIX = 'enc';

// ============================================================================
// KEY MANAGEMENT
// ============================================================================

/**
 * Master encryption key (loaded from environment)
 * 
 * In production, this should be:
 * - Loaded from a secure key management system (e.g., AWS KMS, HashiCorp Vault)
 * - Rotated periodically
 * - Never logged or exposed
 * 
 * For development, a deterministic key is derived from environment.
 */
let masterKey: Buffer | null = null;

/**
 * Cache for derived per-app keys
 */
const appKeyCache = new Map<string, Buffer>();

/**
 * Initialize the master encryption key
 * 
 * Must be called before any encryption/decryption operations.
 * 
 * @param key - 32-byte master key (or hex/base64 string)
 */
export function initializeEncryption(key: Buffer | string): void {
  if (typeof key === 'string') {
    // Try to parse as hex first, then base64
    if (/^[0-9a-fA-F]{64}$/.test(key)) {
      masterKey = Buffer.from(key, 'hex');
    } else {
      masterKey = Buffer.from(key, 'base64');
    }
  } else {
    masterKey = key;
  }
  
  if (masterKey.length !== KEY_LENGTH) {
    throw new Error(`Master key must be ${KEY_LENGTH} bytes, got ${masterKey.length}`);
  }
  
  // Clear the app key cache when master key changes
  appKeyCache.clear();
}

/**
 * Initialize with a development key (deterministic, NOT for production)
 * 
 * This generates a key based on environment variables for local development.
 * In production, use `initializeEncryption()` with a real key.
 */
export function initializeDevelopmentEncryption(): void {
  const seed = process.env.SENSAI_DEV_KEY_SEED ?? 'sensai-development-only';
  const hash = createHash('sha256').update(seed).digest();
  initializeEncryption(hash);
}

/**
 * Check if encryption is initialized
 */
export function isEncryptionInitialized(): boolean {
  return masterKey !== null;
}

/**
 * Derive a per-app encryption key from the master key
 * 
 * Uses HKDF-like derivation: SHA-256(masterKey || appId || "sensai-app-key")
 * 
 * @param appId - Application identifier
 * @returns 32-byte derived key
 */
function deriveAppKey(appId: string): Buffer {
  // Check cache first
  const cached = appKeyCache.get(appId);
  if (cached) {
    return cached;
  }
  
  if (!masterKey) {
    throw new Error('Encryption not initialized. Call initializeEncryption() first.');
  }
  
  // Derive key using SHA-256
  const derivedKey = createHash('sha256')
    .update(masterKey)
    .update(appId)
    .update('sensai-app-key')
    .digest();
  
  // Cache the derived key
  appKeyCache.set(appId, derivedKey);
  
  return derivedKey;
}

// ============================================================================
// ENCRYPTION/DECRYPTION
// ============================================================================

/**
 * Encrypt sensitive data for an app
 * 
 * The data is encrypted with a per-app key, so different apps cannot
 * decrypt each other's tokens.
 * 
 * @param appId - Application ID (used for key derivation)
 * @param data - Sensitive data to encrypt (string or object)
 * @param fieldType - Type of field being encrypted (for token metadata)
 * @returns Encrypted token
 * 
 * @example
 * ```ts
 * const token = encryptForApp('my-app', '123456789012345678', 'discord_id');
 * // Returns: { token: 'enc_v1_abc123...', type: 'discord_id' }
 * ```
 */
export function encryptForApp(
  appId: string,
  data: string | Record<string, unknown>,
  fieldType: EncryptedFieldType,
): EncryptedToken {
  const key = deriveAppKey(appId);
  
  // Serialize data to JSON if it's an object
  const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
  
  // Generate random IV
  const iv = randomBytes(IV_LENGTH);
  
  // Create cipher
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  // Encrypt
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  
  // Get auth tag
  const authTag = cipher.getAuthTag();
  
  // Combine: iv + encrypted + authTag
  const combined = Buffer.concat([iv, encrypted, authTag]);
  
  // Create token string
  const tokenString = `${TOKEN_PREFIX}_${ENCRYPTION_VERSION}_${combined.toString('base64url')}`;
  
  return {
    token: tokenString,
    type: fieldType,
  };
}

/**
 * Decrypt an encrypted token
 * 
 * @param appId - Application ID (must match the app that encrypted)
 * @param token - Encrypted token to decrypt
 * @returns Decrypted data (string or parsed object)
 * @throws Error if decryption fails (wrong key, tampered data, etc.)
 * 
 * @example
 * ```ts
 * const discordId = decryptFromApp('my-app', encryptedToken);
 * // Returns: '123456789012345678'
 * ```
 */
export function decryptFromApp(
  appId: string,
  token: EncryptedToken,
): string {
  const key = deriveAppKey(appId);
  
  // Parse token string
  // Format: enc_v1_<base64url-data>
  // Note: base64url data may contain underscores, so we can't just split on '_'
  const firstUnderscore = token.token.indexOf('_');
  const secondUnderscore = token.token.indexOf('_', firstUnderscore + 1);
  
  if (firstUnderscore === -1 || secondUnderscore === -1) {
    throw new EncryptionError('Invalid token format', 'INVALID_FORMAT');
  }
  
  const prefix = token.token.substring(0, firstUnderscore);
  const version = token.token.substring(firstUnderscore + 1, secondUnderscore);
  const encodedData = token.token.substring(secondUnderscore + 1);
  
  if (prefix !== TOKEN_PREFIX) {
    throw new EncryptionError('Invalid token format', 'INVALID_FORMAT');
  }
  
  if (version !== ENCRYPTION_VERSION) {
    throw new EncryptionError(`Unsupported token version: ${version}`, 'UNSUPPORTED_VERSION');
  }
  
  // Decode combined data
  const combined = Buffer.from(encodedData, 'base64url');
  
  // Minimum size check: iv + at least 1 byte + authTag
  if (combined.length < IV_LENGTH + 1 + AUTH_TAG_LENGTH) {
    throw new EncryptionError('Token too short', 'INVALID_FORMAT');
  }
  
  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(-AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH, -AUTH_TAG_LENGTH);
  
  // Create decipher
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  try {
    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    // Decryption failed (wrong key, tampered data, etc.)
    throw new EncryptionError(
      'Decryption failed - token may be tampered or from different app',
      'DECRYPTION_FAILED',
      error as Error,
    );
  }
}

/**
 * Verify a token can be decrypted without returning the data
 * 
 * Useful for validation without exposing sensitive data.
 * 
 * @param appId - Application ID
 * @param token - Token to verify
 * @returns true if token is valid and can be decrypted
 */
export function verifyToken(appId: string, token: EncryptedToken): boolean {
  try {
    decryptFromApp(appId, token);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create an encrypted token from a raw value (for internal use)
 * 
 * This is used by the GameServerAPI to encrypt data before returning to apps.
 * 
 * @param appId - Application ID
 * @param rawValue - Raw value to encrypt
 * @param fieldType - Type of field
 * @returns Encrypted token
 */
export function createEncryptedToken(
  appId: string,
  rawValue: string,
  fieldType: EncryptedFieldType,
): EncryptedToken {
  return encryptForApp(appId, rawValue, fieldType);
}

/**
 * Extract raw value from an encrypted token (for internal use)
 * 
 * This is used by the GameServerAPI to decrypt data received from apps.
 * 
 * @param appId - Application ID
 * @param token - Encrypted token (or raw string for convenience)
 * @returns Raw value
 */
export function extractRawValue(
  appId: string,
  token: EncryptedToken | string,
): string {
  // If it's a plain string, return as-is (for convenience in some APIs)
  if (typeof token === 'string') {
    // Check if it looks like an encrypted token
    if (token.startsWith(`${TOKEN_PREFIX}_`)) {
      // It's an encrypted token string, parse it
      return decryptFromApp(appId, { token, type: 'custom' });
    }
    // It's a plain string (e.g., internal system call)
    return token;
  }
  
  return decryptFromApp(appId, token);
}

// ============================================================================
// BULK ENCRYPTION
// ============================================================================

/**
 * Encrypt multiple fields in an object
 * 
 * @param appId - Application ID
 * @param data - Object with sensitive fields
 * @param fieldMap - Map of field names to their types
 * @returns Object with encrypted fields
 * 
 * @example
 * ```ts
 * const encrypted = encryptFields('my-app', 
 *   { discordId: '123', guildId: '456', name: 'Trainer' },
 *   { discordId: 'discord_id', guildId: 'guild_id' }
 * );
 * // Returns: { discordId: EncryptedToken, guildId: EncryptedToken, name: 'Trainer' }
 * ```
 */
export function encryptFields<T extends Record<string, unknown>>(
  appId: string,
  data: T,
  fieldMap: Partial<Record<keyof T, EncryptedFieldType>>,
): { [K in keyof T]: K extends keyof typeof fieldMap ? EncryptedToken : T[K] } {
  const result = { ...data } as Record<string, unknown>;
  
  for (const [field, fieldType] of Object.entries(fieldMap)) {
    if (field in data && data[field] !== null && data[field] !== undefined) {
      const value = data[field];
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      result[field] = encryptForApp(appId, stringValue, fieldType as EncryptedFieldType);
    }
  }
  
  return result as { [K in keyof T]: K extends keyof typeof fieldMap ? EncryptedToken : T[K] };
}

// ============================================================================
// ERROR CLASS
// ============================================================================

/**
 * Error thrown for encryption/decryption failures
 */
export class EncryptionError extends Error {
  readonly code: EncryptionErrorCode;
  readonly cause?: Error;
  
  constructor(message: string, code: EncryptionErrorCode, cause?: Error) {
    super(message);
    this.name = 'EncryptionError';
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Encryption error codes
 */
export type EncryptionErrorCode = 
  | 'NOT_INITIALIZED'
  | 'INVALID_FORMAT'
  | 'UNSUPPORTED_VERSION'
  | 'DECRYPTION_FAILED'
  | 'INVALID_KEY';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a random encryption key (for setup/testing)
 * 
 * @returns Random 32-byte key as hex string
 */
export function generateRandomKey(): string {
  return randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Hash a value for logging (safe to log, cannot be reversed)
 * 
 * Use this when you need to log something about sensitive data
 * without exposing the actual value.
 * 
 * @param value - Value to hash
 * @returns First 8 characters of SHA-256 hash
 */
export function hashForLogging(value: string): string {
  return createHash('sha256').update(value).digest('hex').substring(0, 8);
}

/**
 * Check if a string looks like an encrypted token
 * 
 * @param value - String to check
 * @returns true if it looks like an encrypted token
 */
export function isEncryptedToken(value: string): boolean {
  return value.startsWith(`${TOKEN_PREFIX}_${ENCRYPTION_VERSION}_`);
}

/**
 * Get token metadata without decrypting
 * 
 * @param token - Encrypted token
 * @returns Token metadata (version, type, length)
 */
export function getTokenMetadata(token: EncryptedToken): TokenMetadata {
  const parts = token.token.split('_');
  
  return {
    version: parts[1] ?? 'unknown',
    type: token.type,
    payloadLength: parts[2]?.length ?? 0,
  };
}

/**
 * Token metadata (safe to expose)
 */
export interface TokenMetadata {
  /** Encryption version */
  version: string;
  
  /** Field type */
  type: EncryptedFieldType;
  
  /** Encoded payload length */
  payloadLength: number;
}
