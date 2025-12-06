/**
 * Cryptographic Provider Abstraction
 * 
 * @module src/shared/crypto/crypto-provider
 * @description Provides cryptographic agility through a provider abstraction.
 * Allows runtime switching of cryptographic algorithms without code changes.
 * 
 * @security
 * - CWE-327: Use of broken/risky cryptographic algorithms (mitigated by provider validation)
 * - CWE-328: Reversible one-way hash (prevented by algorithm constraints)
 * - NIST SP 800-131A: Cryptographic algorithm transitions
 * 
 * @compliance
 * - SOC 2 Type II: Cryptographic controls
 * - FIPS 140-2: Algorithm requirements (optional mode)
 * 
 * @research S11: Cryptographic Agility (Sprint 1)
 * 
 * @example
 * ```typescript
 * // Using default provider
 * const provider = getCryptoProvider();
 * const hash = provider.hash('data');
 * const signature = provider.sign('data', 'secret');
 * 
 * // Register custom provider
 * registerCryptoProvider('fips', new FIPSCryptoProvider());
 * setCryptoProvider('fips');
 * ```
 * 
 * @author Security Specialist (Sprint 1)
 * @since 2025-12-05
 */

import crypto from 'crypto';
import { timingSafeHexCompare } from './timing-safe.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Supported hash algorithms
 */
export type HashAlgorithm = 'sha256' | 'sha384' | 'sha512' | 'sha3-256' | 'sha3-384' | 'sha3-512';

/**
 * Supported HMAC algorithms
 */
export type HmacAlgorithm = 'sha256' | 'sha384' | 'sha512';

/**
 * Supported encryption algorithms
 */
export type EncryptionAlgorithm = 'aes-256-gcm' | 'aes-256-cbc' | 'chacha20-poly1305';

/**
 * Algorithm capability flags
 */
export interface AlgorithmCapabilities {
  /** Supports hashing */
  supportsHash: boolean;
  /** Supports HMAC */
  supportsHmac: boolean;
  /** Supports symmetric encryption */
  supportsEncryption: boolean;
  /** Supports key derivation */
  supportsKdf: boolean;
  /** FIPS 140-2 compliant */
  fipsCompliant: boolean;
  /** Quantum-resistant (post-quantum cryptography) */
  quantumResistant: boolean;
}

/**
 * Provider metadata
 */
export interface ProviderMetadata {
  /** Provider name */
  name: string;
  /** Provider version */
  version: string;
  /** Provider description */
  description: string;
  /** Supported hash algorithms */
  hashAlgorithms: HashAlgorithm[];
  /** Supported HMAC algorithms */
  hmacAlgorithms: HmacAlgorithm[];
  /** Supported encryption algorithms */
  encryptionAlgorithms: EncryptionAlgorithm[];
  /** Algorithm capabilities */
  capabilities: AlgorithmCapabilities;
}

/**
 * Encrypted payload with metadata
 */
export interface EncryptedPayload {
  /** Algorithm used */
  algorithm: EncryptionAlgorithm;
  /** Encrypted ciphertext (base64) */
  ciphertext: string;
  /** Initialization vector (base64) */
  iv: string;
  /** Authentication tag (base64, for AEAD modes) */
  authTag?: string;
  /** Provider that created this payload */
  provider: string;
  /** Provider version */
  providerVersion: string;
}

/**
 * Cryptographic Provider Interface
 * 
 * All crypto providers must implement this interface to ensure
 * consistent behavior and algorithm agility.
 */
export interface ICryptoProvider {
  /** Get provider metadata */
  getMetadata(): ProviderMetadata;

  // ==========================================================================
  // Hashing
  // ==========================================================================

  /**
   * Compute hash of data
   * @param data - Data to hash
   * @param algorithm - Hash algorithm (default: provider default)
   */
  hash(data: string | Buffer, algorithm?: HashAlgorithm): string;

  /**
   * Verify hash matches data
   * @param data - Original data
   * @param hash - Hash to verify
   * @param algorithm - Hash algorithm
   */
  verifyHash(data: string | Buffer, hash: string, algorithm?: HashAlgorithm): boolean;

  // ==========================================================================
  // HMAC
  // ==========================================================================

  /**
   * Generate HMAC signature
   * @param data - Data to sign
   * @param secret - HMAC secret
   * @param algorithm - HMAC algorithm (default: provider default)
   */
  sign(data: string | Buffer, secret: string, algorithm?: HmacAlgorithm): string;

  /**
   * Verify HMAC signature (timing-safe)
   * @param data - Original data
   * @param signature - Signature to verify
   * @param secret - HMAC secret
   * @param algorithm - HMAC algorithm
   */
  verify(data: string | Buffer, signature: string, secret: string, algorithm?: HmacAlgorithm): boolean;

  // ==========================================================================
  // Encryption (Optional)
  // ==========================================================================

  /**
   * Encrypt data
   * @param plaintext - Data to encrypt
   * @param key - Encryption key
   * @param algorithm - Encryption algorithm
   */
  encrypt?(plaintext: string, key: Buffer, algorithm?: EncryptionAlgorithm): EncryptedPayload;

  /**
   * Decrypt data
   * @param payload - Encrypted payload
   * @param key - Decryption key
   */
  decrypt?(payload: EncryptedPayload, key: Buffer): string;

  // ==========================================================================
  // Key Derivation (Optional)
  // ==========================================================================

  /**
   * Derive key from password
   * @param password - Password to derive from
   * @param salt - Salt for derivation
   * @param keyLength - Desired key length in bytes
   */
  deriveKey?(password: string, salt: Buffer, keyLength?: number): Buffer;
}

// ============================================================================
// Default Provider Implementation
// ============================================================================

/**
 * Default Cryptographic Provider
 * 
 * Uses Node.js crypto module with timing-safe comparisons.
 * Supports SHA-256/384/512 for hashing and HMAC.
 */
export class DefaultCryptoProvider implements ICryptoProvider {
  private readonly defaultHashAlgorithm: HashAlgorithm = 'sha256';
  private readonly defaultHmacAlgorithm: HmacAlgorithm = 'sha256';
  private readonly defaultEncryptionAlgorithm: EncryptionAlgorithm = 'aes-256-gcm';

  constructor(config?: {
    defaultHashAlgorithm?: HashAlgorithm;
    defaultHmacAlgorithm?: HmacAlgorithm;
    defaultEncryptionAlgorithm?: EncryptionAlgorithm;
  }) {
    if (config?.defaultHashAlgorithm) {
      this.defaultHashAlgorithm = config.defaultHashAlgorithm;
    }
    if (config?.defaultHmacAlgorithm) {
      this.defaultHmacAlgorithm = config.defaultHmacAlgorithm;
    }
    if (config?.defaultEncryptionAlgorithm) {
      this.defaultEncryptionAlgorithm = config.defaultEncryptionAlgorithm;
    }
  }

  getMetadata(): ProviderMetadata {
    return {
      name: 'default',
      version: '1.0.0',
      description: 'Default crypto provider using Node.js crypto module',
      hashAlgorithms: ['sha256', 'sha384', 'sha512', 'sha3-256', 'sha3-384', 'sha3-512'],
      hmacAlgorithms: ['sha256', 'sha384', 'sha512'],
      encryptionAlgorithms: ['aes-256-gcm', 'aes-256-cbc', 'chacha20-poly1305'],
      capabilities: {
        supportsHash: true,
        supportsHmac: true,
        supportsEncryption: true,
        supportsKdf: true,
        fipsCompliant: false,
        quantumResistant: false,
      },
    };
  }

  // ==========================================================================
  // Hashing
  // ==========================================================================

  hash(data: string | Buffer, algorithm: HashAlgorithm = this.defaultHashAlgorithm): string {
    const input = typeof data === 'string' ? data : data.toString('utf8');
    return crypto.createHash(algorithm).update(input).digest('hex');
  }

  verifyHash(data: string | Buffer, hash: string, algorithm: HashAlgorithm = this.defaultHashAlgorithm): boolean {
    const computed = this.hash(data, algorithm);
    return timingSafeHexCompare(computed, hash);
  }

  // ==========================================================================
  // HMAC
  // ==========================================================================

  sign(data: string | Buffer, secret: string, algorithm: HmacAlgorithm = this.defaultHmacAlgorithm): string {
    const input = typeof data === 'string' ? data : data.toString('utf8');
    return crypto.createHmac(algorithm, secret).update(input).digest('hex');
  }

  verify(
    data: string | Buffer,
    signature: string,
    secret: string,
    algorithm: HmacAlgorithm = this.defaultHmacAlgorithm
  ): boolean {
    const computed = this.sign(data, secret, algorithm);
    return timingSafeHexCompare(computed, signature);
  }

  // ==========================================================================
  // Encryption
  // ==========================================================================

  encrypt(
    plaintext: string,
    key: Buffer,
    algorithm: EncryptionAlgorithm = this.defaultEncryptionAlgorithm
  ): EncryptedPayload {
    this.validateKey(key, algorithm);

    const iv = this.generateIV(algorithm);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let ciphertext: string;
    let authTag: string | undefined;

    if (this.isAEAD(algorithm)) {
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);
      ciphertext = encrypted.toString('base64');
      authTag = (cipher as crypto.CipherGCM).getAuthTag().toString('base64');
    } else {
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);
      ciphertext = encrypted.toString('base64');
    }

    return {
      algorithm,
      ciphertext,
      iv: iv.toString('base64'),
      authTag,
      provider: 'default',
      providerVersion: '1.0.0',
    };
  }

  decrypt(payload: EncryptedPayload, key: Buffer): string {
    this.validateKey(key, payload.algorithm);

    const iv = Buffer.from(payload.iv, 'base64');
    const ciphertext = Buffer.from(payload.ciphertext, 'base64');
    const decipher = crypto.createDecipheriv(payload.algorithm, key, iv);

    if (this.isAEAD(payload.algorithm)) {
      if (!payload.authTag) {
        throw new Error('Auth tag required for AEAD algorithms');
      }
      (decipher as crypto.DecipherGCM).setAuthTag(Buffer.from(payload.authTag, 'base64'));
    }

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  // ==========================================================================
  // Key Derivation
  // ==========================================================================

  deriveKey(password: string, salt: Buffer, keyLength: number = 32): Buffer {
    return crypto.pbkdf2Sync(password, salt, 100000, keyLength, 'sha256');
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private validateKey(key: Buffer, algorithm: EncryptionAlgorithm): void {
    const expectedLength = this.getKeyLength(algorithm);
    if (key.length !== expectedLength) {
      throw new Error(`Key must be ${expectedLength} bytes for ${algorithm}, got ${key.length}`);
    }
  }

  private getKeyLength(algorithm: EncryptionAlgorithm): number {
    switch (algorithm) {
      case 'aes-256-gcm':
      case 'aes-256-cbc':
      case 'chacha20-poly1305':
        return 32;
      default:
        return 32;
    }
  }

  private generateIV(algorithm: EncryptionAlgorithm): Buffer {
    switch (algorithm) {
      case 'aes-256-gcm':
      case 'chacha20-poly1305':
        return crypto.randomBytes(12); // 96-bit nonce for GCM/ChaCha20
      case 'aes-256-cbc':
        return crypto.randomBytes(16); // 128-bit IV for CBC
      default:
        return crypto.randomBytes(16);
    }
  }

  private isAEAD(algorithm: EncryptionAlgorithm): boolean {
    return algorithm === 'aes-256-gcm' || algorithm === 'chacha20-poly1305';
  }
}

// ============================================================================
// FIPS-Compliant Provider
// ============================================================================

/**
 * FIPS 140-2 Compliant Cryptographic Provider
 * 
 * Restricts algorithms to FIPS-approved set only.
 * Use when FIPS compliance is required.
 */
export class FIPSCryptoProvider extends DefaultCryptoProvider {
  constructor() {
    super({
      defaultHashAlgorithm: 'sha256',
      defaultHmacAlgorithm: 'sha256',
      defaultEncryptionAlgorithm: 'aes-256-gcm',
    });
  }

  override getMetadata(): ProviderMetadata {
    return {
      name: 'fips',
      version: '1.0.0',
      description: 'FIPS 140-2 compliant crypto provider',
      hashAlgorithms: ['sha256', 'sha384', 'sha512'], // No SHA-3 in FIPS mode
      hmacAlgorithms: ['sha256', 'sha384', 'sha512'],
      encryptionAlgorithms: ['aes-256-gcm', 'aes-256-cbc'], // No ChaCha20 in FIPS
      capabilities: {
        supportsHash: true,
        supportsHmac: true,
        supportsEncryption: true,
        supportsKdf: true,
        fipsCompliant: true,
        quantumResistant: false,
      },
    };
  }

  override hash(data: string | Buffer, algorithm: HashAlgorithm = 'sha256'): string {
    // Restrict to FIPS-approved algorithms
    if (!this.isFIPSApprovedHash(algorithm)) {
      throw new Error(`Algorithm ${algorithm} is not FIPS 140-2 approved`);
    }
    return super.hash(data, algorithm);
  }

  override sign(data: string | Buffer, secret: string, algorithm: HmacAlgorithm = 'sha256'): string {
    if (!this.isFIPSApprovedHmac(algorithm)) {
      throw new Error(`HMAC algorithm ${algorithm} is not FIPS 140-2 approved`);
    }
    return super.sign(data, secret, algorithm);
  }

  override encrypt(
    plaintext: string,
    key: Buffer,
    algorithm: EncryptionAlgorithm = 'aes-256-gcm'
  ): EncryptedPayload {
    if (!this.isFIPSApprovedEncryption(algorithm)) {
      throw new Error(`Encryption algorithm ${algorithm} is not FIPS 140-2 approved`);
    }
    return super.encrypt(plaintext, key, algorithm);
  }

  private isFIPSApprovedHash(algorithm: HashAlgorithm): boolean {
    return ['sha256', 'sha384', 'sha512'].includes(algorithm);
  }

  private isFIPSApprovedHmac(algorithm: HmacAlgorithm): boolean {
    return ['sha256', 'sha384', 'sha512'].includes(algorithm);
  }

  private isFIPSApprovedEncryption(algorithm: EncryptionAlgorithm): boolean {
    return ['aes-256-gcm', 'aes-256-cbc'].includes(algorithm);
  }
}

// ============================================================================
// Provider Registry & Management
// ============================================================================

/**
 * Provider registry for managing crypto providers
 */
class CryptoProviderRegistry {
  private providers: Map<string, ICryptoProvider> = new Map();
  private currentProviderName: string = 'default';

  constructor() {
    // Register default providers
    this.providers.set('default', new DefaultCryptoProvider());
    this.providers.set('fips', new FIPSCryptoProvider());
  }

  /**
   * Register a new crypto provider
   */
  register(name: string, provider: ICryptoProvider): void {
    if (this.providers.has(name)) {
      throw new Error(`Provider '${name}' is already registered`);
    }
    this.providers.set(name, provider);
  }

  /**
   * Unregister a crypto provider
   */
  unregister(name: string): boolean {
    if (name === 'default') {
      throw new Error("Cannot unregister the 'default' provider");
    }
    if (this.currentProviderName === name) {
      throw new Error(`Cannot unregister currently active provider '${name}'`);
    }
    return this.providers.delete(name);
  }

  /**
   * Set the current provider
   */
  setCurrent(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`Provider '${name}' is not registered`);
    }
    this.currentProviderName = name;
  }

  /**
   * Get the current provider
   */
  getCurrent(): ICryptoProvider {
    const provider = this.providers.get(this.currentProviderName);
    if (!provider) {
      throw new Error(`Current provider '${this.currentProviderName}' not found`);
    }
    return provider;
  }

  /**
   * Get provider by name
   */
  getByName(name: string): ICryptoProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Get current provider name
   */
  getCurrentName(): string {
    return this.currentProviderName;
  }

  /**
   * List all registered provider names
   */
  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Reset to default state (for testing)
   */
  reset(): void {
    this.providers.clear();
    this.providers.set('default', new DefaultCryptoProvider());
    this.providers.set('fips', new FIPSCryptoProvider());
    this.currentProviderName = 'default';
  }
}

// Singleton registry instance
const registry = new CryptoProviderRegistry();

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the current crypto provider
 */
export function getCryptoProvider(): ICryptoProvider {
  return registry.getCurrent();
}

/**
 * Get provider by name
 */
export function getCryptoProviderByName(name: string): ICryptoProvider | undefined {
  return registry.getByName(name);
}

/**
 * Set the current crypto provider
 */
export function setCryptoProvider(name: string): void {
  registry.setCurrent(name);
}

/**
 * Register a new crypto provider
 */
export function registerCryptoProvider(name: string, provider: ICryptoProvider): void {
  registry.register(name, provider);
}

/**
 * Unregister a crypto provider
 */
export function unregisterCryptoProvider(name: string): boolean {
  return registry.unregister(name);
}

/**
 * Get current provider name
 */
export function getCurrentProviderName(): string {
  return registry.getCurrentName();
}

/**
 * List all registered provider names
 */
export function listCryptoProviders(): string[] {
  return registry.listProviders();
}

/**
 * Reset registry to default state (for testing)
 */
export function resetCryptoRegistry(): void {
  registry.reset();
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Hash data using current provider
 */
export function hash(data: string | Buffer, algorithm?: HashAlgorithm): string {
  return getCryptoProvider().hash(data, algorithm);
}

/**
 * Verify hash using current provider
 */
export function verifyHash(data: string | Buffer, hashValue: string, algorithm?: HashAlgorithm): boolean {
  return getCryptoProvider().verifyHash(data, hashValue, algorithm);
}

/**
 * Sign data using current provider
 */
export function sign(data: string | Buffer, secret: string, algorithm?: HmacAlgorithm): string {
  return getCryptoProvider().sign(data, secret, algorithm);
}

/**
 * Verify signature using current provider
 */
export function verify(data: string | Buffer, signature: string, secret: string, algorithm?: HmacAlgorithm): boolean {
  return getCryptoProvider().verify(data, signature, secret, algorithm);
}

/**
 * Encrypt data using current provider
 */
export function encrypt(plaintext: string, key: Buffer, algorithm?: EncryptionAlgorithm): EncryptedPayload {
  const provider = getCryptoProvider();
  if (!provider.encrypt) {
    throw new Error('Current provider does not support encryption');
  }
  return provider.encrypt(plaintext, key, algorithm);
}

/**
 * Decrypt data using current provider
 */
export function decrypt(payload: EncryptedPayload, key: Buffer): string {
  const provider = getCryptoProvider();
  if (!provider.decrypt) {
    throw new Error('Current provider does not support decryption');
  }
  return provider.decrypt(payload, key);
}

/**
 * Derive key using current provider
 */
export function deriveKey(password: string, salt: Buffer, keyLength?: number): Buffer {
  const provider = getCryptoProvider();
  if (!provider.deriveKey) {
    throw new Error('Current provider does not support key derivation');
  }
  return provider.deriveKey(password, salt, keyLength);
}
