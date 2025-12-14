/**
 * Column Encryption Service
 * ==========================
 *
 * Field-level encryption service for protecting Personally Identifiable Information (PII)
 * in the security database. Implements GDPR Article 32 compliance for data protection.
 *
 * @module security/services/column-encryption-service
 * @task R5 (Column Encryption - GDPR Art. 32)
 * @compliance GDPR Article 32 - Security of processing
 * @compliance CWE-311 - Missing Encryption of Sensitive Data
 * @compliance CWE-327 - Use of Broken Crypto Algorithm
 *
 * Features:
 * - AES-256-GCM authenticated encryption for PII fields
 * - Searchable encryption with deterministic hashing for lookups
 * - Key derivation for per-field encryption keys
 * - Transparent encrypt/decrypt for database operations
 * - Support for key rotation without data re-encryption
 *
 * @example
 * ```typescript
 * import { ColumnEncryptionService } from './column-encryption-service';
 *
 * const service = new ColumnEncryptionService({
 *   masterKey: process.env.COLUMN_ENCRYPTION_KEY!,
 *   keyVersion: 1,
 * });
 *
 * // Encrypt a PII field
 * const encrypted = service.encryptField('user@email.com', 'email');
 *
 * // Decrypt for display
 * const decrypted = service.decryptField(encrypted, 'email');
 *
 * // Generate searchable hash for lookups
 * const searchHash = service.hashForSearch('user@email.com', 'email');
 * ```
 *
 * @author Security Specialist (Sprint 1)
 * @since 2025-01-XX
 */
import crypto from 'crypto';
// ============================================================================
// Constants
// ============================================================================
/** Default algorithm for field encryption */
const DEFAULT_ALGORITHM = 'aes-256-gcm';
/** Key derivation iterations (PBKDF2) */
const KDF_ITERATIONS = 100000;
/** Derived key length in bytes */
const DERIVED_KEY_LENGTH = 32;
/** Field prefixes for key derivation */
const FIELD_PREFIXES = {
    email: 'pii:email:',
    ip_address: 'pii:ip:',
    member_tag: 'pii:member:',
    executor_tag: 'pii:executor:',
    guild_name: 'pii:guild:',
    role_name: 'pii:role:',
    custom: 'pii:custom:',
};
// ============================================================================
// Service Implementation
// ============================================================================
/**
 * Column Encryption Service
 *
 * Provides field-level encryption for PII data in security database.
 * Implements GDPR Article 32 requirements for data protection.
 */
export class ColumnEncryptionService {
    masterKey;
    keyVersion;
    derivationSalt;
    algorithm;
    debug;
    // Per-field derived keys (cached)
    fieldKeys = new Map();
    // Statistics
    stats;
    /**
     * Create a new Column Encryption Service
     */
    constructor(config) {
        // Validate and normalize master key
        this.masterKey = this.normalizeKey(config.masterKey);
        if (this.masterKey.length !== 32) {
            throw new Error('Master key must be 32 bytes (256 bits)');
        }
        this.keyVersion = config.keyVersion ?? 1;
        this.algorithm = config.algorithm ?? DEFAULT_ALGORITHM;
        this.debug = config.debug ?? false;
        // Generate or use provided salt
        this.derivationSalt = config.derivationSalt
            ? typeof config.derivationSalt === 'string'
                ? Buffer.from(config.derivationSalt, 'hex')
                : config.derivationSalt
            : crypto.randomBytes(32);
        // Initialize statistics
        this.stats = {
            encryptionCount: 0,
            decryptionCount: 0,
            searchHashCount: 0,
            encryptionErrors: 0,
            decryptionErrors: 0,
            keyVersion: this.keyVersion,
            startedAt: new Date(),
        };
        this.log('ColumnEncryptionService initialized', {
            keyVersion: this.keyVersion,
            algorithm: this.algorithm,
        });
    }
    // ==========================================================================
    // Core Encryption/Decryption
    // ==========================================================================
    /**
     * Encrypt a PII field value
     *
     * @param plaintext - The value to encrypt
     * @param fieldType - Type of PII field (for key derivation)
     * @returns Encrypted field payload (JSON serializable)
     */
    encryptField(plaintext, fieldType) {
        const startTime = performance.now();
        try {
            // Get or derive field-specific key
            const fieldKey = this.getFieldKey(fieldType);
            // Generate random IV
            const iv = crypto.randomBytes(this.algorithm === 'chacha20-poly1305' ? 12 : 16);
            // Encrypt based on algorithm
            let ciphertext;
            let authTag;
            if (this.algorithm === 'aes-256-gcm') {
                const cipher = crypto.createCipheriv('aes-256-gcm', fieldKey, iv);
                ciphertext = Buffer.concat([
                    cipher.update(plaintext, 'utf8'),
                    cipher.final(),
                ]);
                authTag = cipher.getAuthTag();
            }
            else if (this.algorithm === 'aes-256-cbc') {
                const cipher = crypto.createCipheriv('aes-256-cbc', fieldKey, iv);
                ciphertext = Buffer.concat([
                    cipher.update(plaintext, 'utf8'),
                    cipher.final(),
                ]);
            }
            else {
                // ChaCha20-Poly1305
                const cipher = crypto.createCipheriv('chacha20-poly1305', fieldKey, iv, {
                    authTagLength: 16,
                });
                ciphertext = Buffer.concat([
                    cipher.update(plaintext, 'utf8'),
                    cipher.final(),
                ]);
                authTag = cipher.getAuthTag();
            }
            const payload = {
                v: this.keyVersion,
                alg: this.algorithm,
                field: fieldType,
                ct: ciphertext.toString('base64'),
                iv: iv.toString('base64'),
            };
            if (authTag) {
                payload.tag = authTag.toString('base64');
            }
            this.stats.encryptionCount++;
            this.log('Field encrypted', {
                fieldType,
                algorithm: this.algorithm,
                durationMs: performance.now() - startTime,
            });
            return payload;
        }
        catch (error) {
            this.stats.encryptionErrors++;
            throw new Error(`Field encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Decrypt an encrypted field value
     *
     * @param payload - Encrypted field payload
     * @param fieldType - Type of PII field (must match encryption)
     * @returns Decrypted plaintext value
     */
    decryptField(payload, fieldType) {
        const startTime = performance.now();
        try {
            // Validate field type matches
            if (payload.field !== fieldType) {
                throw new Error(`Field type mismatch: expected ${fieldType}, got ${payload.field}`);
            }
            // Get field-specific key (may need to handle key version for rotation)
            const fieldKey = this.getFieldKey(fieldType, payload.v);
            // Decode components
            const iv = Buffer.from(payload.iv, 'base64');
            const ciphertext = Buffer.from(payload.ct, 'base64');
            const authTag = payload.tag ? Buffer.from(payload.tag, 'base64') : undefined;
            // Decrypt based on algorithm
            let plaintext;
            if (payload.alg === 'aes-256-gcm') {
                if (!authTag) {
                    throw new Error('Auth tag required for AES-256-GCM');
                }
                const decipher = crypto.createDecipheriv('aes-256-gcm', fieldKey, iv);
                decipher.setAuthTag(authTag);
                plaintext = decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
            }
            else if (payload.alg === 'aes-256-cbc') {
                const decipher = crypto.createDecipheriv('aes-256-cbc', fieldKey, iv);
                plaintext = decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
            }
            else if (payload.alg === 'chacha20-poly1305') {
                if (!authTag) {
                    throw new Error('Auth tag required for ChaCha20-Poly1305');
                }
                const decipher = crypto.createDecipheriv('chacha20-poly1305', fieldKey, iv, {
                    authTagLength: 16,
                });
                decipher.setAuthTag(authTag);
                plaintext = decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
            }
            else {
                throw new Error(`Unsupported algorithm: ${payload.alg}`);
            }
            this.stats.decryptionCount++;
            this.log('Field decrypted', {
                fieldType,
                algorithm: payload.alg,
                keyVersion: payload.v,
                durationMs: performance.now() - startTime,
            });
            return plaintext;
        }
        catch (error) {
            this.stats.decryptionErrors++;
            throw new Error(`Field decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    // ==========================================================================
    // Searchable Encryption
    // ==========================================================================
    /**
     * Generate a searchable hash for encrypted field lookups
     *
     * This creates a deterministic hash that can be stored alongside
     * encrypted data to enable exact-match searches without decryption.
     *
     * @param plaintext - The value to hash
     * @param fieldType - Type of PII field
     * @returns Searchable hash object
     */
    hashForSearch(plaintext, fieldType) {
        const startTime = performance.now();
        // Use HMAC for deterministic but keyed hashing
        const searchKey = this.getSearchKey(fieldType);
        const hmac = crypto.createHmac('sha256', searchKey);
        hmac.update(plaintext);
        const searchHash = hmac.digest('hex');
        this.stats.searchHashCount++;
        this.log('Search hash generated', {
            fieldType,
            durationMs: performance.now() - startTime,
        });
        return {
            hash: searchHash,
            field: fieldType,
            v: this.keyVersion,
        };
    }
    /**
     * Verify a searchable hash matches a plaintext value
     *
     * @param plaintext - The value to verify
     * @param searchHash - The stored search hash
     * @returns true if hash matches
     */
    verifySearchHash(plaintext, searchHash) {
        const computed = this.hashForSearch(plaintext, searchHash.field);
        return crypto.timingSafeEqual(Buffer.from(computed.hash, 'hex'), Buffer.from(searchHash.hash, 'hex'));
    }
    // ==========================================================================
    // Batch Operations
    // ==========================================================================
    /**
     * Encrypt multiple fields in a record
     *
     * @param record - Record with plaintext fields
     * @param fieldMappings - Map of field names to PII types
     * @returns Record with encrypted fields
     */
    encryptRecord(record, fieldMappings) {
        const encrypted = { ...record };
        for (const [fieldName, fieldType] of Object.entries(fieldMappings)) {
            const value = record[fieldName];
            if (value !== null && value !== undefined && typeof value === 'string') {
                encrypted[fieldName] = this.encryptField(value, fieldType);
            }
        }
        return encrypted;
    }
    /**
     * Decrypt multiple fields in a record
     *
     * @param record - Record with encrypted fields
     * @param fieldMappings - Map of field names to PII types
     * @returns Record with decrypted fields
     */
    decryptRecord(record, fieldMappings) {
        const decrypted = { ...record };
        for (const [fieldName, fieldType] of Object.entries(fieldMappings)) {
            const value = record[fieldName];
            if (value && typeof value === 'object' && 'ct' in value && 'iv' in value) {
                decrypted[fieldName] = this.decryptField(value, fieldType);
            }
        }
        return decrypted;
    }
    /**
     * Encrypt multiple records in batch
     *
     * @param records - Array of records to encrypt
     * @param fieldMappings - Map of field names to PII types
     * @returns Batch result with encrypted records and failures
     */
    encryptBatch(records, fieldMappings) {
        const startTime = performance.now();
        const encrypted = [];
        const failed = [];
        for (const record of records) {
            try {
                encrypted.push(this.encryptRecord(record, fieldMappings));
            }
            catch (error) {
                failed.push({
                    record,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }
        return {
            encrypted,
            failed,
            durationMs: performance.now() - startTime,
        };
    }
    /**
     * Decrypt multiple records in batch
     *
     * @param records - Array of records to decrypt
     * @param fieldMappings - Map of field names to PII types
     * @returns Batch result with decrypted records and failures
     */
    decryptBatch(records, fieldMappings) {
        const startTime = performance.now();
        const decrypted = [];
        const failed = [];
        for (const record of records) {
            try {
                decrypted.push(this.decryptRecord(record, fieldMappings));
            }
            catch (error) {
                failed.push({
                    record,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }
        return {
            encrypted: decrypted,
            failed,
            durationMs: performance.now() - startTime,
        };
    }
    // ==========================================================================
    // Key Management
    // ==========================================================================
    /**
     * Get or derive a field-specific encryption key
     *
     * @param fieldType - Type of PII field
     * @param version - Key version (for rotation support)
     * @returns Derived encryption key
     */
    getFieldKey(fieldType, version) {
        const keyVersion = version ?? this.keyVersion;
        const cacheKey = `${fieldType}:${keyVersion}`;
        // Check cache
        const cached = this.fieldKeys.get(cacheKey);
        if (cached) {
            return cached;
        }
        // Derive field-specific key using PBKDF2
        const prefix = FIELD_PREFIXES[fieldType];
        const info = Buffer.from(`${prefix}v${keyVersion}`);
        const derived = crypto.pbkdf2Sync(this.masterKey, Buffer.concat([this.derivationSalt, info]), KDF_ITERATIONS, DERIVED_KEY_LENGTH, 'sha256');
        // Cache for future use
        this.fieldKeys.set(cacheKey, derived);
        return derived;
    }
    /**
     * Get search key for deterministic hashing
     *
     * @param fieldType - Type of PII field
     * @returns Derived search key
     */
    getSearchKey(fieldType) {
        const cacheKey = `search:${fieldType}:${this.keyVersion}`;
        const cached = this.fieldKeys.get(cacheKey);
        if (cached) {
            return cached;
        }
        // Derive search-specific key (different from encryption key)
        const prefix = FIELD_PREFIXES[fieldType];
        const info = Buffer.from(`search:${prefix}v${this.keyVersion}`);
        const derived = crypto.pbkdf2Sync(this.masterKey, Buffer.concat([this.derivationSalt, info]), KDF_ITERATIONS, DERIVED_KEY_LENGTH, 'sha256');
        this.fieldKeys.set(cacheKey, derived);
        return derived;
    }
    /**
     * Normalize key input to Buffer
     */
    normalizeKey(key) {
        if (Buffer.isBuffer(key)) {
            return key;
        }
        // Try hex decoding first
        if (/^[a-f0-9]+$/i.test(key) && key.length === 64) {
            return Buffer.from(key, 'hex');
        }
        // Try base64
        if (key.length === 44 && key.endsWith('=')) {
            return Buffer.from(key, 'base64');
        }
        // Use as-is (will be hashed to correct length)
        const hashed = crypto.createHash('sha256').update(key).digest();
        return hashed;
    }
    // ==========================================================================
    // Key Rotation Support
    // ==========================================================================
    /**
     * Re-encrypt a field with the current key version
     *
     * Used during key rotation to migrate encrypted data to new key.
     *
     * @param payload - Encrypted field with old key version
     * @param fieldType - Type of PII field
     * @returns Re-encrypted field with current key version
     */
    reEncryptField(payload, fieldType) {
        // Decrypt with old key
        const plaintext = this.decryptField(payload, fieldType);
        // Re-encrypt with current key
        return this.encryptField(plaintext, fieldType);
    }
    /**
     * Check if a field needs re-encryption (key version mismatch)
     *
     * @param payload - Encrypted field to check
     * @returns true if field uses older key version
     */
    needsReEncryption(payload) {
        return payload.v < this.keyVersion;
    }
    /**
     * Clear the field key cache (e.g., after key rotation)
     */
    clearKeyCache() {
        this.fieldKeys.clear();
        this.log('Key cache cleared');
    }
    // ==========================================================================
    // Statistics & Utilities
    // ==========================================================================
    /**
     * Get encryption service statistics
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * Get the current key version
     */
    getKeyVersion() {
        return this.keyVersion;
    }
    /**
     * Get the configured algorithm
     */
    getAlgorithm() {
        return this.algorithm;
    }
    /**
     * Serialize encrypted field to JSON string for database storage
     */
    serializeField(payload) {
        return JSON.stringify(payload);
    }
    /**
     * Deserialize encrypted field from JSON string
     */
    deserializeField(json) {
        return JSON.parse(json);
    }
    /**
     * Debug logging helper
     */
    log(message, data) {
        if (this.debug) {
            // eslint-disable-next-line no-console
            console.log(`[ColumnEncryption] ${message}`, data ?? '');
        }
    }
}
// ============================================================================
// Factory Function
// ============================================================================
/**
 * Create a Column Encryption Service with environment-based configuration
 *
 * @param overrides - Configuration overrides
 * @returns Configured ColumnEncryptionService instance
 */
export function createColumnEncryptionService(overrides) {
    const masterKey = overrides?.masterKey ?? process.env.COLUMN_ENCRYPTION_KEY;
    if (!masterKey) {
        throw new Error('Column encryption key required. Set COLUMN_ENCRYPTION_KEY environment variable.');
    }
    return new ColumnEncryptionService({
        masterKey,
        keyVersion: overrides?.keyVersion ?? parseInt(process.env.COLUMN_ENCRYPTION_VERSION ?? '1', 10),
        derivationSalt: overrides?.derivationSalt ?? process.env.COLUMN_ENCRYPTION_SALT,
        algorithm: overrides?.algorithm,
        debug: overrides?.debug ?? process.env.COLUMN_ENCRYPTION_DEBUG === 'true',
    });
}
// ============================================================================
// Exports
// ============================================================================
export default ColumnEncryptionService;
