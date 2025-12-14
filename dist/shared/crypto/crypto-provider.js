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
// Default Provider Implementation
// ============================================================================
/**
 * Default Cryptographic Provider
 *
 * Uses Node.js crypto module with timing-safe comparisons.
 * Supports SHA-256/384/512 for hashing and HMAC.
 */
export class DefaultCryptoProvider {
    defaultHashAlgorithm = 'sha256';
    defaultHmacAlgorithm = 'sha256';
    defaultEncryptionAlgorithm = 'aes-256-gcm';
    constructor(config) {
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
    getMetadata() {
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
    hash(data, algorithm = this.defaultHashAlgorithm) {
        const input = typeof data === 'string' ? data : data.toString('utf8');
        return crypto.createHash(algorithm).update(input).digest('hex');
    }
    verifyHash(data, hash, algorithm = this.defaultHashAlgorithm) {
        const computed = this.hash(data, algorithm);
        return timingSafeHexCompare(computed, hash);
    }
    // ==========================================================================
    // HMAC
    // ==========================================================================
    sign(data, secret, algorithm = this.defaultHmacAlgorithm) {
        const input = typeof data === 'string' ? data : data.toString('utf8');
        return crypto.createHmac(algorithm, secret).update(input).digest('hex');
    }
    verify(data, signature, secret, algorithm = this.defaultHmacAlgorithm) {
        const computed = this.sign(data, secret, algorithm);
        return timingSafeHexCompare(computed, signature);
    }
    // ==========================================================================
    // Encryption
    // ==========================================================================
    encrypt(plaintext, key, algorithm = this.defaultEncryptionAlgorithm) {
        this.validateKey(key, algorithm);
        const iv = this.generateIV(algorithm);
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let ciphertext;
        let authTag;
        if (this.isAEAD(algorithm)) {
            const encrypted = Buffer.concat([
                cipher.update(plaintext, 'utf8'),
                cipher.final(),
            ]);
            ciphertext = encrypted.toString('base64');
            authTag = cipher.getAuthTag().toString('base64');
        }
        else {
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
    decrypt(payload, key) {
        this.validateKey(key, payload.algorithm);
        const iv = Buffer.from(payload.iv, 'base64');
        const ciphertext = Buffer.from(payload.ciphertext, 'base64');
        const decipher = crypto.createDecipheriv(payload.algorithm, key, iv);
        if (this.isAEAD(payload.algorithm)) {
            if (!payload.authTag) {
                throw new Error('Auth tag required for AEAD algorithms');
            }
            decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
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
    deriveKey(password, salt, keyLength = 32) {
        return crypto.pbkdf2Sync(password, salt, 100000, keyLength, 'sha256');
    }
    // ==========================================================================
    // Helper Methods
    // ==========================================================================
    validateKey(key, algorithm) {
        const expectedLength = this.getKeyLength(algorithm);
        if (key.length !== expectedLength) {
            throw new Error(`Key must be ${expectedLength} bytes for ${algorithm}, got ${key.length}`);
        }
    }
    getKeyLength(algorithm) {
        switch (algorithm) {
            case 'aes-256-gcm':
            case 'aes-256-cbc':
            case 'chacha20-poly1305':
                return 32;
            default:
                return 32;
        }
    }
    generateIV(algorithm) {
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
    isAEAD(algorithm) {
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
    getMetadata() {
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
    hash(data, algorithm = 'sha256') {
        // Restrict to FIPS-approved algorithms
        if (!this.isFIPSApprovedHash(algorithm)) {
            throw new Error(`Algorithm ${algorithm} is not FIPS 140-2 approved`);
        }
        return super.hash(data, algorithm);
    }
    sign(data, secret, algorithm = 'sha256') {
        if (!this.isFIPSApprovedHmac(algorithm)) {
            throw new Error(`HMAC algorithm ${algorithm} is not FIPS 140-2 approved`);
        }
        return super.sign(data, secret, algorithm);
    }
    encrypt(plaintext, key, algorithm = 'aes-256-gcm') {
        if (!this.isFIPSApprovedEncryption(algorithm)) {
            throw new Error(`Encryption algorithm ${algorithm} is not FIPS 140-2 approved`);
        }
        return super.encrypt(plaintext, key, algorithm);
    }
    isFIPSApprovedHash(algorithm) {
        return ['sha256', 'sha384', 'sha512'].includes(algorithm);
    }
    isFIPSApprovedHmac(algorithm) {
        return ['sha256', 'sha384', 'sha512'].includes(algorithm);
    }
    isFIPSApprovedEncryption(algorithm) {
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
    providers = new Map();
    currentProviderName = 'default';
    constructor() {
        // Register default providers
        this.providers.set('default', new DefaultCryptoProvider());
        this.providers.set('fips', new FIPSCryptoProvider());
    }
    /**
     * Register a new crypto provider
     */
    register(name, provider) {
        if (this.providers.has(name)) {
            throw new Error(`Provider '${name}' is already registered`);
        }
        this.providers.set(name, provider);
    }
    /**
     * Unregister a crypto provider
     */
    unregister(name) {
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
    setCurrent(name) {
        if (!this.providers.has(name)) {
            throw new Error(`Provider '${name}' is not registered`);
        }
        this.currentProviderName = name;
    }
    /**
     * Get the current provider
     */
    getCurrent() {
        const provider = this.providers.get(this.currentProviderName);
        if (!provider) {
            throw new Error(`Current provider '${this.currentProviderName}' not found`);
        }
        return provider;
    }
    /**
     * Get provider by name
     */
    getByName(name) {
        return this.providers.get(name);
    }
    /**
     * Get current provider name
     */
    getCurrentName() {
        return this.currentProviderName;
    }
    /**
     * List all registered provider names
     */
    listProviders() {
        return Array.from(this.providers.keys());
    }
    /**
     * Reset to default state (for testing)
     */
    reset() {
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
export function getCryptoProvider() {
    return registry.getCurrent();
}
/**
 * Get provider by name
 */
export function getCryptoProviderByName(name) {
    return registry.getByName(name);
}
/**
 * Set the current crypto provider
 */
export function setCryptoProvider(name) {
    registry.setCurrent(name);
}
/**
 * Register a new crypto provider
 */
export function registerCryptoProvider(name, provider) {
    registry.register(name, provider);
}
/**
 * Unregister a crypto provider
 */
export function unregisterCryptoProvider(name) {
    return registry.unregister(name);
}
/**
 * Get current provider name
 */
export function getCurrentProviderName() {
    return registry.getCurrentName();
}
/**
 * List all registered provider names
 */
export function listCryptoProviders() {
    return registry.listProviders();
}
/**
 * Reset registry to default state (for testing)
 */
export function resetCryptoRegistry() {
    registry.reset();
}
// ============================================================================
// Convenience Functions
// ============================================================================
/**
 * Hash data using current provider
 */
export function hash(data, algorithm) {
    return getCryptoProvider().hash(data, algorithm);
}
/**
 * Verify hash using current provider
 */
export function verifyHash(data, hashValue, algorithm) {
    return getCryptoProvider().verifyHash(data, hashValue, algorithm);
}
/**
 * Sign data using current provider
 */
export function sign(data, secret, algorithm) {
    return getCryptoProvider().sign(data, secret, algorithm);
}
/**
 * Verify signature using current provider
 */
export function verify(data, signature, secret, algorithm) {
    return getCryptoProvider().verify(data, signature, secret, algorithm);
}
/**
 * Encrypt data using current provider
 */
export function encrypt(plaintext, key, algorithm) {
    const provider = getCryptoProvider();
    if (!provider.encrypt) {
        throw new Error('Current provider does not support encryption');
    }
    return provider.encrypt(plaintext, key, algorithm);
}
/**
 * Decrypt data using current provider
 */
export function decrypt(payload, key) {
    const provider = getCryptoProvider();
    if (!provider.decrypt) {
        throw new Error('Current provider does not support decryption');
    }
    return provider.decrypt(payload, key);
}
/**
 * Derive key using current provider
 */
export function deriveKey(password, salt, keyLength) {
    const provider = getCryptoProvider();
    if (!provider.deriveKey) {
        throw new Error('Current provider does not support key derivation');
    }
    return provider.deriveKey(password, salt, keyLength);
}
