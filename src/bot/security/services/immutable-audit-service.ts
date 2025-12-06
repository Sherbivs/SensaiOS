/**
 * Immutable Audit Log Service
 * ============================
 *
 * Provides append-only, tamper-evident audit logging for SOC 2 compliance.
 * Implements cryptographic hash chaining to ensure audit trail integrity
 * and detect any unauthorized modifications.
 *
 * @module security/services/immutable-audit-service
 * @task R6 (Immutable Audit Log - SOC 2)
 * @compliance SOC 2 Type II - CC6.1, CC6.6, CC6.7 (Logical Access Controls)
 * @compliance SOC 2 Type II - CC7.2 (System Monitoring)
 * @compliance CWE-778 - Insufficient Logging
 * @compliance CWE-779 - Logging of Excessive Data
 *
 * Features:
 * - Append-only semantics (no update/delete operations)
 * - Cryptographic hash chain linking (SHA-256)
 * - HMAC signatures for authenticity
 * - Sequence number enforcement
 * - Chain integrity verification
 * - Tamper detection with gap analysis
 * - Batch append with atomic verification
 *
 * @example
 * ```typescript
 * import { ImmutableAuditService } from './immutable-audit-service';
 *
 * const service = new ImmutableAuditService({
 *   hmacSecret: process.env.AUDIT_HMAC_SECRET!,
 *   chainId: 'security-events',
 * });
 *
 * // Append entry (automatically links to chain)
 * const entry = await service.append({
 *   action: 'role-change',
 *   actor: 'user123',
 *   target: 'role456',
 *   metadata: { guildId: '789' },
 * });
 *
 * // Verify chain integrity
 * const result = await service.verifyChain();
 * console.log(`Chain valid: ${result.valid}, entries: ${result.verifiedCount}`);
 * ```
 *
 * @author Security Specialist (Sprint 1)
 * @since 2025-01-XX
 */

import crypto from 'crypto';
import { timingSafeHexCompare } from '../../../shared/crypto/timing-safe.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Immutable audit service configuration
 */
export interface ImmutableAuditConfig {
  /** HMAC secret for signature generation */
  hmacSecret: string;
  /** Chain identifier for multi-chain support */
  chainId: string;
  /** Hash algorithm (default: 'sha256') */
  algorithm?: 'sha256' | 'sha384' | 'sha512';
  /** Whether to enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * Audit entry input (before chain processing)
 */
export interface AuditEntryInput {
  /** Action type (e.g., 'role-change', 'login', 'permission-grant') */
  action: string;
  /** Actor identifier (who performed the action) */
  actor: string;
  /** Target identifier (what was affected) */
  target?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Entry timestamp (auto-generated if not provided) */
  timestamp?: Date;
}

/**
 * Immutable audit entry (after chain processing)
 */
export interface AuditEntry {
  /** Entry sequence number (monotonically increasing) */
  sequence: bigint;
  /** Chain identifier */
  chainId: string;
  /** Entry timestamp */
  timestamp: Date;
  /** Action type */
  action: string;
  /** Actor identifier */
  actor: string;
  /** Target identifier */
  target?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Hash of previous entry (null for genesis) */
  previousHash: string | null;
  /** Hash of this entry's content */
  contentHash: string;
  /** HMAC signature for authenticity */
  signature: string;
}

/**
 * Chain verification result
 */
export interface ChainVerificationResult {
  /** Overall chain validity */
  valid: boolean;
  /** Number of entries verified */
  verifiedCount: number;
  /** First invalid entry (if any) */
  firstInvalidEntry?: bigint;
  /** Type of integrity failure */
  failureType?: 'hash-mismatch' | 'signature-invalid' | 'sequence-gap' | 'timestamp-regression';
  /** Detailed error message */
  error?: string;
  /** Verification duration in milliseconds */
  durationMs: number;
}

/**
 * Entry verification result
 */
export interface EntryVerificationResult {
  /** Entry validity */
  valid: boolean;
  /** Content hash valid */
  contentHashValid: boolean;
  /** Signature valid */
  signatureValid: boolean;
  /** Previous hash link valid */
  previousHashValid: boolean;
  /** Error message if invalid */
  error?: string;
}

/**
 * Chain statistics
 */
export interface ChainStats {
  /** Chain identifier */
  chainId: string;
  /** Total entries in chain */
  entryCount: bigint;
  /** First entry sequence */
  firstSequence: bigint;
  /** Last entry sequence */
  lastSequence: bigint;
  /** Chain head hash (latest entry) */
  headHash: string;
  /** Genesis hash (first entry) */
  genesisHash: string;
  /** First entry timestamp */
  firstTimestamp: Date;
  /** Last entry timestamp */
  lastTimestamp: Date;
  /** Append operations count */
  appendCount: number;
  /** Verification operations count */
  verificationCount: number;
}

/**
 * Gap detection result
 */
export interface GapDetectionResult {
  /** Whether gaps were found */
  hasGaps: boolean;
  /** Missing sequence numbers */
  missingSequences: bigint[];
  /** Total gap count */
  gapCount: number;
}

/**
 * Storage adapter interface for audit entries
 */
export interface IAuditStorage {
  /** Append entry to storage */
  append(entry: AuditEntry): Promise<void>;
  /** Get entry by sequence */
  getBySequence(chainId: string, sequence: bigint): Promise<AuditEntry | null>;
  /** Get latest entry */
  getLatest(chainId: string): Promise<AuditEntry | null>;
  /** Get entries in range */
  getRange(chainId: string, startSequence: bigint, endSequence: bigint): Promise<AuditEntry[]>;
  /** Get all entries (use with caution) */
  getAll(chainId: string): Promise<AuditEntry[]>;
  /** Count entries */
  count(chainId: string): Promise<bigint>;
}

// ============================================================================
// In-Memory Storage (Default)
// ============================================================================

/**
 * In-memory audit storage implementation
 * For production, use database-backed storage
 */
export class InMemoryAuditStorage implements IAuditStorage {
  private readonly chains: Map<string, Map<string, AuditEntry>> = new Map();

  async append(entry: AuditEntry): Promise<void> {
    let chain = this.chains.get(entry.chainId);
    if (!chain) {
      chain = new Map();
      this.chains.set(entry.chainId, chain);
    }
    chain.set(entry.sequence.toString(), entry);
  }

  async getBySequence(chainId: string, sequence: bigint): Promise<AuditEntry | null> {
    const chain = this.chains.get(chainId);
    return chain?.get(sequence.toString()) ?? null;
  }

  async getLatest(chainId: string): Promise<AuditEntry | null> {
    const chain = this.chains.get(chainId);
    if (!chain || chain.size === 0) return null;

    let latest: AuditEntry | null = null;
    for (const entry of chain.values()) {
      if (!latest || entry.sequence > latest.sequence) {
        latest = entry;
      }
    }
    return latest;
  }

  async getRange(chainId: string, startSequence: bigint, endSequence: bigint): Promise<AuditEntry[]> {
    const chain = this.chains.get(chainId);
    if (!chain) return [];

    const entries: AuditEntry[] = [];
    for (let seq = startSequence; seq <= endSequence; seq++) {
      const entry = chain.get(seq.toString());
      if (entry) entries.push(entry);
    }
    return entries.sort((a, b) => (a.sequence < b.sequence ? -1 : 1));
  }

  async getAll(chainId: string): Promise<AuditEntry[]> {
    const chain = this.chains.get(chainId);
    if (!chain) return [];
    return Array.from(chain.values()).sort((a, b) => (a.sequence < b.sequence ? -1 : 1));
  }

  async count(chainId: string): Promise<bigint> {
    const chain = this.chains.get(chainId);
    return BigInt(chain?.size ?? 0);
  }

  /** Clear all entries (for testing) */
  clear(): void {
    this.chains.clear();
  }
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Immutable Audit Log Service
 *
 * Provides SOC 2 compliant append-only audit logging with
 * cryptographic hash chain linking for tamper detection.
 */
export class ImmutableAuditService {
  private readonly hmacSecret: string;
  private readonly chainId: string;
  private readonly algorithm: 'sha256' | 'sha384' | 'sha512';
  private readonly debug: boolean;
  private readonly storage: IAuditStorage;

  // Runtime state
  private nextSequence: bigint = 1n;
  private lastHash: string | null = null;
  private initialized: boolean = false;

  // Statistics
  private appendCount: number = 0;
  private verificationCount: number = 0;

  /**
   * Create a new Immutable Audit Service
   */
  constructor(config: ImmutableAuditConfig, storage?: IAuditStorage) {
    if (!config.hmacSecret || config.hmacSecret.length < 32) {
      throw new Error('HMAC secret must be at least 32 characters');
    }

    this.hmacSecret = config.hmacSecret;
    this.chainId = config.chainId;
    this.algorithm = config.algorithm ?? 'sha256';
    this.debug = config.debug ?? false;
    this.storage = storage ?? new InMemoryAuditStorage();

    this.log('ImmutableAuditService initialized', { chainId: this.chainId });
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize service by loading chain state from storage
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const latest = await this.storage.getLatest(this.chainId);
    if (latest) {
      this.nextSequence = latest.sequence + 1n;
      this.lastHash = this.computeEntryHash(latest);
    } else {
      this.nextSequence = 1n;
      this.lastHash = null;
    }

    this.initialized = true;
    this.log('Chain state loaded', {
      nextSequence: this.nextSequence.toString(),
      hasHistory: !!latest,
    });
  }

  /**
   * Ensure service is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // ==========================================================================
  // Append Operations
  // ==========================================================================

  /**
   * Append a new entry to the audit log
   *
   * @param input - Audit entry data
   * @returns Created audit entry with chain metadata
   */
  async append(input: AuditEntryInput): Promise<AuditEntry> {
    await this.ensureInitialized();

    const timestamp = input.timestamp ?? new Date();

    // Build entry
    const entry: AuditEntry = {
      sequence: this.nextSequence,
      chainId: this.chainId,
      timestamp,
      action: input.action,
      actor: input.actor,
      target: input.target,
      metadata: input.metadata,
      previousHash: this.lastHash,
      contentHash: '', // Will be computed
      signature: '', // Will be computed
    };

    // Compute content hash (excludes signature)
    entry.contentHash = this.computeContentHash(entry);

    // Compute HMAC signature
    entry.signature = this.computeSignature(entry);

    // Persist
    await this.storage.append(entry);

    // Update chain state
    this.lastHash = this.computeEntryHash(entry);
    this.nextSequence++;
    this.appendCount++;

    this.log('Entry appended', {
      sequence: entry.sequence.toString(),
      action: entry.action,
    });

    return entry;
  }

  /**
   * Append multiple entries atomically
   *
   * @param inputs - Array of audit entry data
   * @returns Created audit entries
   */
  async appendBatch(inputs: AuditEntryInput[]): Promise<AuditEntry[]> {
    const entries: AuditEntry[] = [];
    for (const input of inputs) {
      entries.push(await this.append(input));
    }
    return entries;
  }

  // ==========================================================================
  // Verification Operations
  // ==========================================================================

  /**
   * Verify a single entry's integrity
   *
   * @param entry - Entry to verify
   * @param expectedPreviousHash - Expected previous hash (from chain)
   * @returns Verification result
   */
  verifyEntry(entry: AuditEntry, expectedPreviousHash: string | null): EntryVerificationResult {
    // Verify content hash
    const computedContentHash = this.computeContentHash(entry);
    const contentHashValid = timingSafeHexCompare(entry.contentHash, computedContentHash);

    // Verify signature
    const computedSignature = this.computeSignature({
      ...entry,
      contentHash: computedContentHash,
    });
    const signatureValid = timingSafeHexCompare(entry.signature, computedSignature);

    // Verify previous hash link
    let previousHashValid = true;
    if (entry.sequence === 1n) {
      previousHashValid = entry.previousHash === null;
    } else {
      previousHashValid = entry.previousHash === expectedPreviousHash;
    }

    const valid = contentHashValid && signatureValid && previousHashValid;

    return {
      valid,
      contentHashValid,
      signatureValid,
      previousHashValid,
      error: valid ? undefined : this.getVerificationError(contentHashValid, signatureValid, previousHashValid),
    };
  }

  /**
   * Verify entire chain integrity
   *
   * @param startSequence - Starting sequence (default: 1)
   * @param endSequence - Ending sequence (default: latest)
   * @returns Chain verification result
   */
  async verifyChain(startSequence?: bigint, endSequence?: bigint): Promise<ChainVerificationResult> {
    const startTime = performance.now();
    await this.ensureInitialized();

    const start = startSequence ?? 1n;
    const latest = await this.storage.getLatest(this.chainId);
    const end = endSequence ?? (latest?.sequence ?? 0n);

    if (end < start) {
      return {
        valid: true,
        verifiedCount: 0,
        durationMs: performance.now() - startTime,
      };
    }

    const entries = await this.storage.getRange(this.chainId, start, end);

    let previousHash: string | null = null;
    let previousTimestamp: Date | null = null;
    let verifiedCount = 0;

    // Get hash before start sequence if not genesis
    if (start > 1n) {
      const priorEntry = await this.storage.getBySequence(this.chainId, start - 1n);
      if (priorEntry) {
        previousHash = this.computeEntryHash(priorEntry);
        previousTimestamp = priorEntry.timestamp;
      }
    }

    for (const entry of entries) {
      // Check sequence continuity
      const expectedSequence = start + BigInt(verifiedCount);
      if (entry.sequence !== expectedSequence) {
        this.verificationCount++;
        return {
          valid: false,
          verifiedCount,
          firstInvalidEntry: expectedSequence,
          failureType: 'sequence-gap',
          error: `Expected sequence ${expectedSequence}, found ${entry.sequence}`,
          durationMs: performance.now() - startTime,
        };
      }

      // Check timestamp progression
      if (previousTimestamp && entry.timestamp < previousTimestamp) {
        this.verificationCount++;
        return {
          valid: false,
          verifiedCount,
          firstInvalidEntry: entry.sequence,
          failureType: 'timestamp-regression',
          error: `Timestamp regression at sequence ${entry.sequence}`,
          durationMs: performance.now() - startTime,
        };
      }

      // Verify entry
      const entryResult = this.verifyEntry(entry, previousHash);
      if (!entryResult.valid) {
        this.verificationCount++;
        return {
          valid: false,
          verifiedCount,
          firstInvalidEntry: entry.sequence,
          failureType: entryResult.contentHashValid ? 
            (entryResult.signatureValid ? 'hash-mismatch' : 'signature-invalid') : 
            'hash-mismatch',
          error: entryResult.error,
          durationMs: performance.now() - startTime,
        };
      }

      previousHash = this.computeEntryHash(entry);
      previousTimestamp = entry.timestamp;
      verifiedCount++;
    }

    this.verificationCount++;
    this.log('Chain verified', { verifiedCount, durationMs: performance.now() - startTime });

    return {
      valid: true,
      verifiedCount,
      durationMs: performance.now() - startTime,
    };
  }

  /**
   * Detect gaps in sequence numbers
   *
   * @returns Gap detection result
   */
  async detectGaps(): Promise<GapDetectionResult> {
    await this.ensureInitialized();

    const entries = await this.storage.getAll(this.chainId);
    const sequences = new Set(entries.map(e => e.sequence));
    const missingSequences: bigint[] = [];

    if (entries.length === 0) {
      return { hasGaps: false, missingSequences: [], gapCount: 0 };
    }

    const maxSequence = entries.reduce((max, e) => e.sequence > max ? e.sequence : max, 0n);

    for (let seq = 1n; seq <= maxSequence; seq++) {
      if (!sequences.has(seq)) {
        missingSequences.push(seq);
      }
    }

    return {
      hasGaps: missingSequences.length > 0,
      missingSequences,
      gapCount: missingSequences.length,
    };
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * Get entry by sequence number
   */
  async getEntry(sequence: bigint): Promise<AuditEntry | null> {
    return this.storage.getBySequence(this.chainId, sequence);
  }

  /**
   * Get latest entry
   */
  async getLatestEntry(): Promise<AuditEntry | null> {
    return this.storage.getLatest(this.chainId);
  }

  /**
   * Get entries in a range
   */
  async getEntries(startSequence: bigint, endSequence: bigint): Promise<AuditEntry[]> {
    return this.storage.getRange(this.chainId, startSequence, endSequence);
  }

  /**
   * Get all entries (use with caution for large chains)
   */
  async getAllEntries(): Promise<AuditEntry[]> {
    return this.storage.getAll(this.chainId);
  }

  /**
   * Get chain statistics
   */
  async getStats(): Promise<ChainStats> {
    await this.ensureInitialized();

    const entries = await this.storage.getAll(this.chainId);
    const count = BigInt(entries.length);

    if (count === 0n) {
      return {
        chainId: this.chainId,
        entryCount: 0n,
        firstSequence: 0n,
        lastSequence: 0n,
        headHash: '',
        genesisHash: '',
        firstTimestamp: new Date(0),
        lastTimestamp: new Date(0),
        appendCount: this.appendCount,
        verificationCount: this.verificationCount,
      };
    }

    const first = entries[0];
    const last = entries[entries.length - 1];

    return {
      chainId: this.chainId,
      entryCount: count,
      firstSequence: first.sequence,
      lastSequence: last.sequence,
      headHash: this.computeEntryHash(last),
      genesisHash: this.computeEntryHash(first),
      firstTimestamp: first.timestamp,
      lastTimestamp: last.timestamp,
      appendCount: this.appendCount,
      verificationCount: this.verificationCount,
    };
  }

  // ==========================================================================
  // Hash Computations
  // ==========================================================================

  /**
   * Compute content hash for an entry (excludes signature)
   */
  private computeContentHash(entry: Omit<AuditEntry, 'contentHash' | 'signature'>): string {
    const data = this.serializeForHash({
      sequence: entry.sequence.toString(),
      chainId: entry.chainId,
      timestamp: entry.timestamp.toISOString(),
      action: entry.action,
      actor: entry.actor,
      target: entry.target ?? '',
      metadata: entry.metadata ?? {},
      previousHash: entry.previousHash ?? '',
    });

    return this.hash(data);
  }

  /**
   * Compute HMAC signature for an entry
   */
  private computeSignature(entry: Omit<AuditEntry, 'signature'>): string {
    const data = this.serializeForHash({
      sequence: entry.sequence.toString(),
      chainId: entry.chainId,
      timestamp: entry.timestamp.toISOString(),
      action: entry.action,
      actor: entry.actor,
      target: entry.target ?? '',
      metadata: entry.metadata ?? {},
      previousHash: entry.previousHash ?? '',
      contentHash: entry.contentHash,
    });

    return this.hmac(data);
  }

  /**
   * Compute full entry hash (for chain linking)
   */
  private computeEntryHash(entry: AuditEntry): string {
    const data = this.serializeForHash({
      sequence: entry.sequence.toString(),
      chainId: entry.chainId,
      timestamp: entry.timestamp.toISOString(),
      action: entry.action,
      actor: entry.actor,
      target: entry.target ?? '',
      metadata: entry.metadata ?? {},
      previousHash: entry.previousHash ?? '',
      contentHash: entry.contentHash,
      signature: entry.signature,
    });

    return this.hash(data);
  }

  /**
   * Serialize object for hashing (deterministic)
   */
  private serializeForHash(obj: Record<string, unknown>): string {
    const sortedKeys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const key of sortedKeys) {
      const value = obj[key];
      const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
      parts.push(`${key}=${serialized}`);
    }
    return parts.join('|');
  }

  /**
   * Compute hash
   */
  private hash(data: string): string {
    return crypto.createHash(this.algorithm).update(data).digest('hex');
  }

  /**
   * Compute HMAC
   */
  private hmac(data: string): string {
    return crypto.createHmac(this.algorithm, this.hmacSecret).update(data).digest('hex');
  }

  /**
   * Get verification error message
   */
  private getVerificationError(
    contentHashValid: boolean,
    signatureValid: boolean,
    previousHashValid: boolean
  ): string {
    const errors: string[] = [];
    if (!contentHashValid) errors.push('content hash mismatch');
    if (!signatureValid) errors.push('signature invalid');
    if (!previousHashValid) errors.push('previous hash link broken');
    return errors.join(', ');
  }

  /**
   * Debug logging helper
   */
  private log(message: string, data?: Record<string, unknown>): void {
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.log(`[ImmutableAudit] ${message}`, data ?? '');
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an Immutable Audit Service with environment-based configuration
 *
 * @param overrides - Configuration overrides
 * @param storage - Storage adapter (optional)
 * @returns Configured ImmutableAuditService instance
 */
export function createImmutableAuditService(
  overrides?: Partial<ImmutableAuditConfig>,
  storage?: IAuditStorage
): ImmutableAuditService {
  const hmacSecret = overrides?.hmacSecret ?? process.env.AUDIT_HMAC_SECRET;

  if (!hmacSecret) {
    throw new Error(
      'Audit HMAC secret required. Set AUDIT_HMAC_SECRET environment variable.'
    );
  }

  return new ImmutableAuditService(
    {
      hmacSecret,
      chainId: overrides?.chainId ?? process.env.AUDIT_CHAIN_ID ?? 'default',
      algorithm: overrides?.algorithm,
      debug: overrides?.debug ?? process.env.AUDIT_DEBUG === 'true',
    },
    storage
  );
}

// ============================================================================
// Exports
// ============================================================================

export default ImmutableAuditService;
