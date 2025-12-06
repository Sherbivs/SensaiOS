/**
 * Key Rotation Service
 * 
 * @module src/bot/security/services/key-rotation-service
 * @description Manages HMAC key rotation with backwards compatibility for
 * signature verification during key transition periods.
 * 
 * @security
 * - CWE-320: Key rotation prevents long-term key compromise
 * - CWE-321: Secure key storage and lifecycle management
 * - CWE-327: Uses approved cryptographic algorithms (SHA-256, SHA-512)
 * 
 * @compliance
 * - SOC 2 Type II: Key rotation demonstrates security controls
 * - NIST 800-57: Key management best practices
 * - PCI-DSS: Periodic key rotation requirements
 * 
 * @research
 * - P0-005: Key Rotation Service (Sprint 1)
 * - R1: Timing-Safe HMAC verification during rotation
 * 
 * @example
 * ```typescript
 * const keyService = new KeyRotationService(config);
 * 
 * // Sign with current key
 * const signature = keyService.sign(data);
 * 
 * // Verify against current + historical keys
 * const valid = keyService.verifyWithRotation(data, signature);
 * 
 * // Rotate to new key
 * await keyService.rotate(newKeyId, newSecret);
 * ```
 * 
 * @author Security Specialist (Sprint 1)
 * @since 2025-12-05
 */

import crypto from 'crypto';
import { generateHmac, verifyHmacSafe } from '../../../shared/crypto/timing-safe.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Supported HMAC algorithms
 */
export type HmacAlgorithm = 'sha256' | 'sha384' | 'sha512';

/**
 * Key status in rotation lifecycle
 */
export type KeyStatus = 
  | 'active'      // Currently used for signing and verification
  | 'deprecated'  // Still valid for verification, not for signing
  | 'revoked';    // No longer valid for any operation

/**
 * A managed cryptographic key
 */
export interface ManagedKey {
  /** Unique key identifier */
  id: string;
  /** Key secret (sensitive - never log or expose) */
  secret: string;
  /** Key status in lifecycle */
  status: KeyStatus;
  /** HMAC algorithm used with this key */
  algorithm: HmacAlgorithm;
  /** When the key was created (ISO 8601) */
  createdAt: string;
  /** When the key was deprecated (ISO 8601, if applicable) */
  deprecatedAt?: string;
  /** When the key was revoked (ISO 8601, if applicable) */
  revokedAt?: string;
  /** Optional metadata (e.g., rotation reason) */
  metadata?: Record<string, string>;
}

/**
 * Key rotation configuration
 */
export interface KeyRotationConfig {
  /** Maximum number of deprecated keys to keep for verification */
  maxDeprecatedKeys: number;
  /** Duration in days to keep deprecated keys (0 = indefinite) */
  deprecationWindowDays: number;
  /** Whether to automatically revoke expired deprecated keys */
  autoRevokeExpired: boolean;
  /** Callback when key rotation occurs */
  onRotation?: (oldKeyId: string, newKeyId: string) => void;
  /** Callback when key is revoked */
  onRevocation?: (keyId: string, reason: string) => void;
}

/**
 * Key rotation service configuration
 */
export interface KeyRotationServiceConfig {
  /** Initial active key ID */
  activeKeyId: string;
  /** Initial active key secret */
  activeSecret: string;
  /** Algorithm to use (default: sha256) */
  algorithm?: HmacAlgorithm;
  /** Rotation configuration */
  rotation?: Partial<KeyRotationConfig>;
}

/**
 * Verification result with key metadata
 */
export interface VerificationResult {
  /** Whether signature is valid */
  valid: boolean;
  /** ID of key that verified the signature (if valid) */
  keyId?: string;
  /** Status of the key that verified */
  keyStatus?: KeyStatus;
  /** Whether signature was verified by deprecated key (needs re-signing) */
  needsResign: boolean;
  /** Error message if verification failed */
  error?: string;
}

/**
 * Key rotation statistics
 */
export interface KeyRotationStats {
  /** ID of current active key */
  activeKeyId: string;
  /** Number of deprecated keys */
  deprecatedKeysCount: number;
  /** Number of revoked keys */
  revokedKeysCount: number;
  /** Total rotations performed */
  totalRotations: number;
  /** Last rotation timestamp */
  lastRotation?: string;
  /** Active key age in days */
  activeKeyAgeDays: number;
}

/**
 * Events emitted by key rotation service
 */
export interface KeyRotationEvent {
  type: 'rotation' | 'deprecation' | 'revocation' | 'verification';
  timestamp: string;
  keyId: string;
  details: Record<string, unknown>;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_ROTATION_CONFIG: KeyRotationConfig = {
  maxDeprecatedKeys: 3,
  deprecationWindowDays: 30,
  autoRevokeExpired: true,
  onRotation: undefined,
  onRevocation: undefined,
};

// ============================================================================
// Key Rotation Service
// ============================================================================

/**
 * Key Rotation Service
 * 
 * Manages HMAC key lifecycle including rotation with backwards compatibility.
 * During key rotation transitions, verifies signatures against both current
 * and deprecated keys to ensure seamless migration.
 * 
 * @security
 * - Keys are stored in memory only (not persisted by this service)
 * - All comparisons use timing-safe algorithms
 * - Key secrets are never logged or exposed
 * 
 * @example
 * ```typescript
 * const service = new KeyRotationService({
 *   activeKeyId: 'key-2025-001',
 *   activeSecret: process.env.HMAC_SECRET!,
 *   rotation: { maxDeprecatedKeys: 2, deprecationWindowDays: 14 }
 * });
 * ```
 */
export class KeyRotationService {
  private keys: Map<string, ManagedKey> = new Map();
  private activeKeyId: string;
  private rotationConfig: KeyRotationConfig;
  private rotationHistory: KeyRotationEvent[] = [];
  private totalRotations: number = 0;

  /**
   * Create a new KeyRotationService
   * 
   * @param config - Service configuration
   * @throws Error if activeKeyId or activeSecret is missing
   */
  constructor(config: KeyRotationServiceConfig) {
    if (!config.activeKeyId) {
      throw new Error('activeKeyId is required');
    }
    if (!config.activeSecret) {
      throw new Error('activeSecret is required');
    }

    this.rotationConfig = {
      ...DEFAULT_ROTATION_CONFIG,
      ...config.rotation,
    };
    this.activeKeyId = config.activeKeyId;

    // Initialize with the active key
    const activeKey: ManagedKey = {
      id: config.activeKeyId,
      secret: config.activeSecret,
      status: 'active',
      algorithm: config.algorithm || 'sha256',
      createdAt: new Date().toISOString(),
    };

    this.keys.set(config.activeKeyId, activeKey);
  }

  // ==========================================================================
  // Signing Operations
  // ==========================================================================

  /**
   * Sign data using the current active key
   * 
   * @param data - Data to sign (will be stringified if object)
   * @returns HMAC signature (hex string)
   * @throws Error if no active key available
   */
  sign(data: string | object): string {
    const activeKey = this.getActiveKey();
    if (!activeKey) {
      throw new Error('No active key available for signing');
    }

    const payload = typeof data === 'object' ? JSON.stringify(data) : data;
    return generateHmac(payload, activeKey.secret, activeKey.algorithm);
  }

  /**
   * Sign data with key ID prefix for verification routing
   * 
   * @param data - Data to sign
   * @returns Signature in format "keyId:signature"
   */
  signWithKeyId(data: string | object): string {
    const signature = this.sign(data);
    return `${this.activeKeyId}:${signature}`;
  }

  // ==========================================================================
  // Verification Operations
  // ==========================================================================

  /**
   * Verify signature using only the active key
   * 
   * @param data - Original data
   * @param signature - Signature to verify
   * @returns True if valid, false otherwise
   */
  verify(data: string | object, signature: string): boolean {
    const activeKey = this.getActiveKey();
    if (!activeKey) {
      return false;
    }

    const payload = typeof data === 'object' ? JSON.stringify(data) : data;
    return verifyHmacSafe(payload, signature, activeKey.secret, activeKey.algorithm);
  }

  /**
   * Verify signature against active and deprecated keys
   * 
   * Returns detailed result including which key verified and whether
   * the data should be re-signed with the current key.
   * 
   * @param data - Original data
   * @param signature - Signature to verify
   * @returns Detailed verification result
   */
  verifyWithRotation(data: string | object, signature: string): VerificationResult {
    const payload = typeof data === 'object' ? JSON.stringify(data) : data;

    // Try active key first
    const activeKey = this.getActiveKey();
    if (activeKey) {
      const valid = verifyHmacSafe(payload, signature, activeKey.secret, activeKey.algorithm);
      if (valid) {
        return {
          valid: true,
          keyId: activeKey.id,
          keyStatus: 'active',
          needsResign: false,
        };
      }
    }

    // Try deprecated keys
    for (const key of this.getDeprecatedKeys()) {
      const valid = verifyHmacSafe(payload, signature, key.secret, key.algorithm);
      if (valid) {
        this.recordEvent({
          type: 'verification',
          timestamp: new Date().toISOString(),
          keyId: key.id,
          details: {
            status: 'verified_with_deprecated_key',
            deprecatedAt: key.deprecatedAt,
            message: 'Signature verified with deprecated key, should be re-signed',
          },
        });

        return {
          valid: true,
          keyId: key.id,
          keyStatus: 'deprecated',
          needsResign: true,
        };
      }
    }

    return {
      valid: false,
      needsResign: false,
      error: 'Signature does not match any active or deprecated key',
    };
  }

  /**
   * Verify signature with key ID prefix routing
   * 
   * If signature is in format "keyId:signature", uses the specific key.
   * Otherwise falls back to verifyWithRotation.
   * 
   * @param data - Original data
   * @param signature - Signature (optionally with key ID prefix)
   * @returns Verification result
   */
  verifyWithKeyId(data: string | object, signature: string): VerificationResult {
    const parts = signature.split(':');
    
    if (parts.length === 2) {
      const [keyId, sig] = parts;
      const key = this.keys.get(keyId);
      
      if (!key) {
        return {
          valid: false,
          needsResign: false,
          error: `Key not found: ${keyId}`,
        };
      }

      if (key.status === 'revoked') {
        return {
          valid: false,
          keyId,
          keyStatus: 'revoked',
          needsResign: false,
          error: 'Key has been revoked',
        };
      }

      const payload = typeof data === 'object' ? JSON.stringify(data) : data;
      const valid = verifyHmacSafe(payload, sig, key.secret, key.algorithm);

      return {
        valid,
        keyId,
        keyStatus: key.status,
        needsResign: key.status === 'deprecated',
        error: valid ? undefined : 'Invalid signature',
      };
    }

    // No key ID prefix, use rotation-aware verification
    return this.verifyWithRotation(data, signature);
  }

  // ==========================================================================
  // Key Rotation Operations
  // ==========================================================================

  /**
   * Rotate to a new key
   * 
   * The current active key becomes deprecated, and the new key becomes active.
   * Triggers automatic cleanup of old deprecated keys if configured.
   * 
   * @param newKeyId - ID for the new key
   * @param newSecret - Secret for the new key
   * @param algorithm - Algorithm for the new key (defaults to current)
   * @param metadata - Optional metadata about the rotation
   * @returns The new active key
   */
  rotate(
    newKeyId: string,
    newSecret: string,
    algorithm?: HmacAlgorithm,
    metadata?: Record<string, string>
  ): ManagedKey {
    if (!newKeyId || !newSecret) {
      throw new Error('newKeyId and newSecret are required');
    }

    if (this.keys.has(newKeyId)) {
      throw new Error(`Key with ID ${newKeyId} already exists`);
    }

    const oldKeyId = this.activeKeyId;
    const oldKey = this.getActiveKey();

    // Deprecate the old active key
    if (oldKey) {
      oldKey.status = 'deprecated';
      oldKey.deprecatedAt = new Date().toISOString();
      this.keys.set(oldKeyId, oldKey);
    }

    // Create the new active key
    const newKey: ManagedKey = {
      id: newKeyId,
      secret: newSecret,
      status: 'active',
      algorithm: algorithm || oldKey?.algorithm || 'sha256',
      createdAt: new Date().toISOString(),
      metadata,
    };

    this.keys.set(newKeyId, newKey);
    this.activeKeyId = newKeyId;
    this.totalRotations++;

    // Record rotation event
    this.recordEvent({
      type: 'rotation',
      timestamp: new Date().toISOString(),
      keyId: newKeyId,
      details: {
        previousKeyId: oldKeyId,
        algorithm: newKey.algorithm,
        metadata,
      },
    });

    // Notify callback
    if (this.rotationConfig.onRotation) {
      this.rotationConfig.onRotation(oldKeyId, newKeyId);
    }

    // Cleanup old keys
    this.cleanupDeprecatedKeys();

    return { ...newKey, secret: '[REDACTED]' };
  }

  /**
   * Generate a new random key and rotate to it
   * 
   * @param keyIdPrefix - Prefix for the new key ID (default: 'key')
   * @param secretLength - Length of the random secret (default: 64 bytes)
   * @param algorithm - Algorithm for the new key
   * @param metadata - Optional rotation metadata
   * @returns The new active key (with redacted secret)
   */
  rotateWithNewSecret(
    keyIdPrefix: string = 'key',
    secretLength: number = 64,
    algorithm?: HmacAlgorithm,
    metadata?: Record<string, string>
  ): ManagedKey {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const newKeyId = `${keyIdPrefix}-${timestamp}`;
    const newSecret = crypto.randomBytes(secretLength).toString('hex');

    return this.rotate(newKeyId, newSecret, algorithm, {
      ...metadata,
      generatedAt: new Date().toISOString(),
      secretLength: secretLength.toString(),
    });
  }

  /**
   * Revoke a key by ID
   * 
   * Revoked keys are no longer valid for signing or verification.
   * 
   * @param keyId - ID of key to revoke
   * @param reason - Reason for revocation
   * @returns True if revoked, false if key not found
   */
  revoke(keyId: string, reason: string = 'Manual revocation'): boolean {
    const key = this.keys.get(keyId);
    if (!key) {
      return false;
    }

    if (key.status === 'active') {
      throw new Error('Cannot revoke active key. Rotate first.');
    }

    key.status = 'revoked';
    key.revokedAt = new Date().toISOString();
    this.keys.set(keyId, key);

    this.recordEvent({
      type: 'revocation',
      timestamp: new Date().toISOString(),
      keyId,
      details: { reason },
    });

    if (this.rotationConfig.onRevocation) {
      this.rotationConfig.onRevocation(keyId, reason);
    }

    return true;
  }

  // ==========================================================================
  // Key Query Operations
  // ==========================================================================

  /**
   * Get the current active key
   */
  getActiveKey(): ManagedKey | undefined {
    return this.keys.get(this.activeKeyId);
  }

  /**
   * Get the current active key ID
   */
  getActiveKeyId(): string {
    return this.activeKeyId;
  }

  /**
   * Get all deprecated keys (valid for verification)
   */
  getDeprecatedKeys(): ManagedKey[] {
    return Array.from(this.keys.values())
      .filter(k => k.status === 'deprecated');
  }

  /**
   * Get all revoked keys
   */
  getRevokedKeys(): ManagedKey[] {
    return Array.from(this.keys.values())
      .filter(k => k.status === 'revoked');
  }

  /**
   * Get a key by ID
   */
  getKey(keyId: string): ManagedKey | undefined {
    const key = this.keys.get(keyId);
    if (key) {
      // Return copy with redacted secret
      return { ...key, secret: '[REDACTED]' };
    }
    return undefined;
  }

  /**
   * Check if a key exists and is valid (active or deprecated)
   */
  isKeyValid(keyId: string): boolean {
    const key = this.keys.get(keyId);
    return key !== undefined && key.status !== 'revoked';
  }

  // ==========================================================================
  // Statistics and Monitoring
  // ==========================================================================

  /**
   * Get key rotation statistics
   */
  getStats(): KeyRotationStats {
    const activeKey = this.getActiveKey();
    const createdAt = activeKey ? new Date(activeKey.createdAt) : new Date();
    const ageDays = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    return {
      activeKeyId: this.activeKeyId,
      deprecatedKeysCount: this.getDeprecatedKeys().length,
      revokedKeysCount: this.getRevokedKeys().length,
      totalRotations: this.totalRotations,
      lastRotation: this.rotationHistory
        .filter(e => e.type === 'rotation')
        .pop()?.timestamp,
      activeKeyAgeDays: ageDays,
    };
  }

  /**
   * Get rotation history (most recent first)
   */
  getRotationHistory(limit: number = 10): KeyRotationEvent[] {
    return [...this.rotationHistory]
      .reverse()
      .slice(0, limit);
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  /**
   * Record a key rotation event
   */
  private recordEvent(event: KeyRotationEvent): void {
    this.rotationHistory.push(event);
    
    // Keep history bounded
    if (this.rotationHistory.length > 100) {
      this.rotationHistory = this.rotationHistory.slice(-100);
    }
  }

  /**
   * Clean up old deprecated keys based on configuration
   */
  private cleanupDeprecatedKeys(): void {
    const deprecated = this.getDeprecatedKeys();
    const config = this.rotationConfig;

    // Sort by deprecation date (oldest first)
    const sorted = deprecated.sort((a, b) => {
      const aDate = a.deprecatedAt ? new Date(a.deprecatedAt).getTime() : 0;
      const bDate = b.deprecatedAt ? new Date(b.deprecatedAt).getTime() : 0;
      return aDate - bDate;
    });

    // Check max deprecated keys
    if (sorted.length > config.maxDeprecatedKeys) {
      const toRevoke = sorted.slice(0, sorted.length - config.maxDeprecatedKeys);
      for (const key of toRevoke) {
        this.revoke(key.id, 'Exceeded max deprecated keys limit');
      }
    }

    // Check deprecation window
    if (config.autoRevokeExpired && config.deprecationWindowDays > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - config.deprecationWindowDays);

      for (const key of this.getDeprecatedKeys()) {
        if (key.deprecatedAt) {
          const deprecatedDate = new Date(key.deprecatedAt);
          if (deprecatedDate < cutoff) {
            this.revoke(key.id, `Exceeded deprecation window of ${config.deprecationWindowDays} days`);
          }
        }
      }
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a KeyRotationService from environment variables
 * 
 * @param envKeyId - Environment variable name for key ID (default: HMAC_KEY_ID)
 * @param envSecret - Environment variable name for secret (default: HMAC_SECRET)
 * @param config - Additional configuration
 * @returns Configured KeyRotationService
 * @throws Error if required environment variables are missing
 */
export function createKeyRotationService(
  envKeyId: string = 'HMAC_KEY_ID',
  envSecret: string = 'HMAC_SECRET',
  config?: Partial<KeyRotationServiceConfig>
): KeyRotationService {
  const keyId = process.env[envKeyId];
  const secret = process.env[envSecret];

  if (!secret) {
    throw new Error(`Environment variable ${envSecret} is required`);
  }

  return new KeyRotationService({
    activeKeyId: keyId || 'default-key',
    activeSecret: secret,
    ...config,
  });
}
