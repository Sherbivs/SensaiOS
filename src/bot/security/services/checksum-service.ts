/**
 * Checksum Service
 * ================
 *
 * Centralized service for computing and verifying checksums and signatures
 * across all security services. Uses timing-safe cryptographic operations
 * to prevent timing attacks (CWE-208).
 *
 * @module security/services/checksum-service
 * @task P0-004 (Checksum Implementation + Timing-Safe R1)
 * @security CWE-208 - All verification operations use constant-time algorithms
 *
 * @example
 * ```typescript
 * import { ChecksumService } from './checksum-service';
 *
 * const service = new ChecksumService({
 *   hmacSecret: process.env.HMAC_SECRET!,
 *   algorithm: 'sha256',
 * });
 *
 * // Compute checksum for an event
 * const checksum = service.computeEventChecksum({
 *   eventType: 'role-change',
 *   severity: 'HIGH',
 *   guildId: '123',
 * });
 *
 * // Verify integrity
 * const isValid = service.verifyEventIntegrity(event);
 * ```
 */

import {
  generateHmac,
  verifyHmacSafe,
  timingSafeHexCompare,
  sha256,
  sha384,
  sha512,
  generateSecureToken,
} from '../../../shared/crypto/timing-safe.js';
import type {
  SecurityEvent,
  RoleChangeAudit,
} from '../types/database-models.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Checksum service configuration
 */
export interface ChecksumServiceConfig {
  /** HMAC secret for signature generation */
  hmacSecret: string;
  /** Hash algorithm (default: 'sha256') */
  algorithm?: 'sha256' | 'sha384' | 'sha512';
  /** Whether to include timestamps in checksum computation (default: false) */
  includeTimestamps?: boolean;
  /** Whether to enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * Result of integrity verification
 */
export interface IntegrityResult {
  /** Whether the record passed verification */
  valid: boolean;
  /** Checksum verification result */
  checksumValid?: boolean;
  /** Signature verification result */
  signatureValid?: boolean;
  /** Hash chain verification result */
  hashChainValid?: boolean;
  /** Error message if invalid */
  error?: string;
  /** Verification duration in milliseconds */
  durationMs: number;
}

/**
 * Checksum computation result
 */
export interface ChecksumResult {
  /** Computed checksum (SHA-256/384/512) */
  checksum: string;
  /** HMAC signature */
  signature: string;
  /** Data that was checksummed (for debugging) */
  inputData?: string;
}

/**
 * Hash chain link
 */
export interface HashChainLink {
  /** Record ID */
  id: bigint;
  /** Record checksum */
  checksum: string;
  /** Previous record's checksum */
  previousHash: string | null;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<ChecksumServiceConfig> = {
  hmacSecret: '',
  algorithm: 'sha256',
  includeTimestamps: false,
  debug: false,
};

// ============================================================================
// ChecksumService Class
// ============================================================================

/**
 * Centralized checksum and signature service.
 *
 * Provides consistent, timing-safe checksum computation and verification
 * for all security-related database records.
 */
export class ChecksumService {
  private readonly config: Required<ChecksumServiceConfig>;
  private readonly hashFn: (data: string | Buffer) => string;

  constructor(config: ChecksumServiceConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (!this.config.hmacSecret) {
      throw new Error('ChecksumService: hmacSecret is required');
    }

    // Select hash function based on algorithm
    this.hashFn =
      this.config.algorithm === 'sha256'
        ? sha256
        : this.config.algorithm === 'sha384'
          ? sha384
          : sha512;
  }

  // ==========================================================================
  // SecurityEvent Checksums
  // ==========================================================================

  /**
   * Compute checksum for a SecurityEvent.
   *
   * @param event - Event data to checksum
   * @param previousHash - Hash of the previous event (for chain linking)
   * @returns Checksum result with checksum, signature, and optionally input data
   */
  computeEventChecksum(
    event: Omit<SecurityEvent, 'id' | 'checksum' | 'signature' | 'previousHash' | 'createdAt'>,
    previousHash: string | null = null
  ): ChecksumResult {
    const checksumData = this.buildEventChecksumData(event);
    const checksum = this.hashFn(checksumData);

    const signatureData = this.buildEventSignatureData(event, checksum, previousHash);
    const signature = generateHmac(signatureData, this.config.hmacSecret, this.config.algorithm);

    return {
      checksum,
      signature,
      inputData: this.config.debug ? checksumData : undefined,
    };
  }

  /**
   * Verify SecurityEvent integrity using timing-safe comparison.
   *
   * @param event - Event to verify
   * @returns Integrity result
   */
  verifyEventIntegrity(event: SecurityEvent): IntegrityResult {
    const startTime = Date.now();

    // Verify checksum
    const checksumData = this.buildEventChecksumData(event);
    const expectedChecksum = this.hashFn(checksumData);
    const checksumValid = timingSafeHexCompare(event.checksum, expectedChecksum);

    // Verify signature if present
    let signatureValid = true;
    if (event.signature) {
      const signatureData = this.buildEventSignatureData(
        event,
        event.checksum,
        event.previousHash ?? null
      );
      signatureValid = verifyHmacSafe(
        signatureData,
        event.signature,
        this.config.hmacSecret,
        this.config.algorithm
      );
    }

    const valid = checksumValid && signatureValid;

    return {
      valid,
      checksumValid,
      signatureValid,
      error: !valid
        ? !checksumValid
          ? 'Checksum mismatch'
          : 'Signature mismatch'
        : undefined,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Build checksum input data for SecurityEvent.
   */
  private buildEventChecksumData(
    event: Omit<SecurityEvent, 'id' | 'checksum' | 'signature' | 'previousHash' | 'createdAt'>
  ): string {
    const parts = [
      event.eventType,
      event.severity,
      event.guildId,
      event.guildName,
      event.origin,
      event.memberId ?? '',
      event.memberTag ?? '',
      event.roleId ?? '',
      event.roleName ?? '',
      event.executorId ?? '',
      event.executorTag ?? '',
      JSON.stringify(event.metadata ?? {}),
    ];

    return parts.join('|');
  }

  /**
   * Build signature input data for SecurityEvent.
   */
  private buildEventSignatureData(
    event: Omit<SecurityEvent, 'id' | 'checksum' | 'signature' | 'previousHash' | 'createdAt'>,
    checksum: string,
    previousHash: string | null
  ): string {
    return JSON.stringify({
      eventType: event.eventType,
      severity: event.severity,
      guildId: event.guildId,
      origin: event.origin,
      checksum,
      previousHash,
    });
  }

  // ==========================================================================
  // RoleChangeAudit Checksums
  // ==========================================================================

  /**
   * Compute checksum for a RoleChangeAudit record.
   *
   * @param audit - Audit data to checksum
   * @param previousHash - Hash of the previous audit (for chain linking)
   * @returns Checksum result
   */
  computeAuditChecksum(
    audit: Omit<
      RoleChangeAudit,
      'id' | 'checksum' | 'signature' | 'previousHash' | 'createdAt' | 'reverted' | 'revertedAt' | 'revertedBy' | 'revertReason'
    >,
    previousHash: string | null = null
  ): ChecksumResult {
    const checksumData = this.buildAuditChecksumData(audit);
    const checksum = this.hashFn(checksumData);

    const signatureData = this.buildAuditSignatureData(audit, checksum, previousHash);
    const signature = generateHmac(signatureData, this.config.hmacSecret, this.config.algorithm);

    return {
      checksum,
      signature,
      inputData: this.config.debug ? checksumData : undefined,
    };
  }

  /**
   * Verify RoleChangeAudit integrity using timing-safe comparison.
   *
   * @param audit - Audit record to verify
   * @returns Integrity result
   */
  verifyAuditIntegrity(audit: RoleChangeAudit): IntegrityResult {
    const startTime = Date.now();

    // Verify checksum
    const checksumData = this.buildAuditChecksumData(audit);
    const expectedChecksum = this.hashFn(checksumData);
    const checksumValid = timingSafeHexCompare(audit.checksum, expectedChecksum);

    // Verify signature if present
    let signatureValid = true;
    if (audit.signature) {
      const signatureData = this.buildAuditSignatureData(
        audit,
        audit.checksum,
        audit.previousHash ?? null
      );
      signatureValid = verifyHmacSafe(
        signatureData,
        audit.signature,
        this.config.hmacSecret,
        this.config.algorithm
      );
    }

    const valid = checksumValid && signatureValid;

    return {
      valid,
      checksumValid,
      signatureValid,
      error: !valid
        ? !checksumValid
          ? 'Checksum mismatch'
          : 'Signature mismatch'
        : undefined,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Build checksum input data for RoleChangeAudit.
   */
  private buildAuditChecksumData(
    audit: Omit<
      RoleChangeAudit,
      'id' | 'checksum' | 'signature' | 'previousHash' | 'createdAt' | 'reverted' | 'revertedAt' | 'revertedBy' | 'revertReason'
    >
  ): string {
    const parts = [
      audit.guildId.toString(),
      audit.guildName,
      audit.memberId.toString(),
      audit.memberTag,
      audit.roleId.toString(),
      audit.roleName,
      audit.changeType,
      audit.executorId?.toString() ?? '',
      audit.executorTag ?? '',
      audit.origin,
      audit.authReason ?? '',
      JSON.stringify(audit.metadata ?? {}),
    ];

    return parts.join('|');
  }

  /**
   * Build signature input data for RoleChangeAudit.
   */
  private buildAuditSignatureData(
    audit: Omit<
      RoleChangeAudit,
      'id' | 'checksum' | 'signature' | 'previousHash' | 'createdAt' | 'reverted' | 'revertedAt' | 'revertedBy' | 'revertReason'
    >,
    checksum: string,
    previousHash: string | null
  ): string {
    return JSON.stringify({
      guildId: audit.guildId.toString(),
      memberId: audit.memberId.toString(),
      roleId: audit.roleId.toString(),
      changeType: audit.changeType,
      origin: audit.origin,
      checksum,
      previousHash,
    });
  }

  // ==========================================================================
  // Hash Chain Operations
  // ==========================================================================

  /**
   * Verify hash chain integrity for a sequence of records.
   *
   * @param chain - Array of hash chain links in order
   * @returns Integrity result
   */
  verifyHashChain(chain: HashChainLink[]): IntegrityResult {
    const startTime = Date.now();

    if (chain.length === 0) {
      return {
        valid: true,
        hashChainValid: true,
        durationMs: Date.now() - startTime,
      };
    }

    let previousChecksum: string | null = null;
    let brokenAt: bigint | undefined;

    for (const link of chain) {
      // First record: previousHash must be null
      // Subsequent records: previousHash must match previous record's checksum
      const expectedPreviousHash = previousChecksum;
      const actualPreviousHash = link.previousHash;

      // Compare using timing-safe method (handling null as empty string)
      const linkValid = timingSafeHexCompare(
        actualPreviousHash ?? '',
        expectedPreviousHash ?? ''
      );

      // Also check that both are either null or both have values
      const nullConsistent =
        (actualPreviousHash === null && expectedPreviousHash === null) ||
        (actualPreviousHash !== null && expectedPreviousHash !== null);

      if (!linkValid || !nullConsistent) {
        brokenAt = link.id;
        break;
      }

      previousChecksum = link.checksum;
    }

    const valid = brokenAt === undefined;

    return {
      valid,
      hashChainValid: valid,
      error: !valid ? `Hash chain broken at ID ${brokenAt}` : undefined,
      durationMs: Date.now() - startTime,
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Generate a secure random nonce for record uniqueness.
   *
   * @param length - Length in bytes (default: 16)
   * @returns Hex-encoded nonce
   */
  generateNonce(length: number = 16): string {
    return generateSecureToken(length, 'hex');
  }

  /**
   * Compute a simple hash for data (no HMAC, just hash).
   *
   * @param data - Data to hash
   * @returns Hex-encoded hash
   */
  hash(data: string): string {
    return this.hashFn(data);
  }

  /**
   * Get the current algorithm.
   */
  getAlgorithm(): 'sha256' | 'sha384' | 'sha512' {
    return this.config.algorithm;
  }

  // ==========================================================================
  // Batch Operations
  // ==========================================================================

  /**
   * Batch verify SecurityEvent integrity.
   *
   * @param events - Array of events to verify
   * @returns Array of integrity results
   */
  batchVerifyEventIntegrity(events: SecurityEvent[]): IntegrityResult[] {
    return events.map((event) => this.verifyEventIntegrity(event));
  }

  /**
   * Batch verify RoleChangeAudit integrity.
   *
   * @param audits - Array of audits to verify
   * @returns Array of integrity results
   */
  batchVerifyAuditIntegrity(audits: RoleChangeAudit[]): IntegrityResult[] {
    return audits.map((audit) => this.verifyAuditIntegrity(audit));
  }

  /**
   * Compute checksums for multiple events.
   *
   * @param events - Array of events to checksum
   * @returns Array of checksum results with running previousHash
   */
  batchComputeEventChecksums(
    events: Array<Omit<SecurityEvent, 'id' | 'checksum' | 'signature' | 'previousHash' | 'createdAt'>>
  ): ChecksumResult[] {
    let previousHash: string | null = null;
    const results: ChecksumResult[] = [];

    for (const event of events) {
      const result = this.computeEventChecksum(event, previousHash);
      results.push(result);
      previousHash = result.checksum;
    }

    return results;
  }

  /**
   * Compute checksums for multiple audits.
   *
   * @param audits - Array of audits to checksum
   * @returns Array of checksum results with running previousHash
   */
  batchComputeAuditChecksums(
    audits: Array<
      Omit<
        RoleChangeAudit,
        'id' | 'checksum' | 'signature' | 'previousHash' | 'createdAt' | 'reverted' | 'revertedAt' | 'revertedBy' | 'revertReason'
      >
    >
  ): ChecksumResult[] {
    let previousHash: string | null = null;
    const results: ChecksumResult[] = [];

    for (const audit of audits) {
      const result = this.computeAuditChecksum(audit, previousHash);
      results.push(result);
      previousHash = result.checksum;
    }

    return results;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a ChecksumService instance with environment configuration.
 *
 * @param hmacSecret - Override HMAC secret (default: from HMAC_SECRET env)
 * @returns Configured ChecksumService
 */
export function createChecksumService(hmacSecret?: string): ChecksumService {
  const secret = hmacSecret ?? process.env.HMAC_SECRET ?? process.env.SECURITY_HMAC_SECRET;

  if (!secret) {
    throw new Error(
      'ChecksumService: HMAC_SECRET or SECURITY_HMAC_SECRET environment variable required'
    );
  }

  return new ChecksumService({
    hmacSecret: secret,
    algorithm: 'sha256',
    includeTimestamps: false,
    debug: process.env.NODE_ENV === 'development',
  });
}
