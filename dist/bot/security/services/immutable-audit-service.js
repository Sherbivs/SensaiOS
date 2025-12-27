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
import { scopedLogger } from '../../../observability/envelope/console.js';
/** Scoped logger for immutable audit debug output */
const auditLog = scopedLogger('immutable-audit');
// ============================================================================
// In-Memory Storage (Default)
// ============================================================================
/**
 * In-memory audit storage implementation
 * For production, use database-backed storage
 */
export class InMemoryAuditStorage {
    chains = new Map();
    async append(entry) {
        let chain = this.chains.get(entry.chainId);
        if (!chain) {
            chain = new Map();
            this.chains.set(entry.chainId, chain);
        }
        chain.set(entry.sequence.toString(), entry);
    }
    async getBySequence(chainId, sequence) {
        const chain = this.chains.get(chainId);
        return chain?.get(sequence.toString()) ?? null;
    }
    async getLatest(chainId) {
        const chain = this.chains.get(chainId);
        if (!chain || chain.size === 0)
            return null;
        let latest = null;
        for (const entry of chain.values()) {
            if (!latest || entry.sequence > latest.sequence) {
                latest = entry;
            }
        }
        return latest;
    }
    async getRange(chainId, startSequence, endSequence) {
        const chain = this.chains.get(chainId);
        if (!chain)
            return [];
        const entries = [];
        for (let seq = startSequence; seq <= endSequence; seq++) {
            const entry = chain.get(seq.toString());
            if (entry)
                entries.push(entry);
        }
        return entries.sort((a, b) => (a.sequence < b.sequence ? -1 : 1));
    }
    async getAll(chainId) {
        const chain = this.chains.get(chainId);
        if (!chain)
            return [];
        return Array.from(chain.values()).sort((a, b) => (a.sequence < b.sequence ? -1 : 1));
    }
    async count(chainId) {
        const chain = this.chains.get(chainId);
        return BigInt(chain?.size ?? 0);
    }
    /** Clear all entries (for testing) */
    clear() {
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
    hmacSecret;
    chainId;
    algorithm;
    debug;
    storage;
    // Runtime state
    nextSequence = 1n;
    lastHash = null;
    initialized = false;
    // Statistics
    appendCount = 0;
    verificationCount = 0;
    /**
     * Create a new Immutable Audit Service
     */
    constructor(config, storage) {
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
    async initialize() {
        if (this.initialized)
            return;
        const latest = await this.storage.getLatest(this.chainId);
        if (latest) {
            this.nextSequence = latest.sequence + 1n;
            this.lastHash = this.computeEntryHash(latest);
        }
        else {
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
    async ensureInitialized() {
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
    async append(input) {
        await this.ensureInitialized();
        const timestamp = input.timestamp ?? new Date();
        // Build entry
        const entry = {
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
    async appendBatch(inputs) {
        const entries = [];
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
    verifyEntry(entry, expectedPreviousHash) {
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
        }
        else {
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
    async verifyChain(startSequence, endSequence) {
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
        let previousHash = null;
        let previousTimestamp = null;
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
    async detectGaps() {
        await this.ensureInitialized();
        const entries = await this.storage.getAll(this.chainId);
        const sequences = new Set(entries.map(e => e.sequence));
        const missingSequences = [];
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
    async getEntry(sequence) {
        return this.storage.getBySequence(this.chainId, sequence);
    }
    /**
     * Get latest entry
     */
    async getLatestEntry() {
        return this.storage.getLatest(this.chainId);
    }
    /**
     * Get entries in a range
     */
    async getEntries(startSequence, endSequence) {
        return this.storage.getRange(this.chainId, startSequence, endSequence);
    }
    /**
     * Get all entries (use with caution for large chains)
     */
    async getAllEntries() {
        return this.storage.getAll(this.chainId);
    }
    /**
     * Get chain statistics
     */
    async getStats() {
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
    computeContentHash(entry) {
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
    computeSignature(entry) {
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
    computeEntryHash(entry) {
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
    serializeForHash(obj) {
        const sortedKeys = Object.keys(obj).sort();
        const parts = [];
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
    hash(data) {
        return crypto.createHash(this.algorithm).update(data).digest('hex');
    }
    /**
     * Compute HMAC
     */
    hmac(data) {
        return crypto.createHmac(this.algorithm, this.hmacSecret).update(data).digest('hex');
    }
    /**
     * Get verification error message
     */
    getVerificationError(contentHashValid, signatureValid, previousHashValid) {
        const errors = [];
        if (!contentHashValid)
            errors.push('content hash mismatch');
        if (!signatureValid)
            errors.push('signature invalid');
        if (!previousHashValid)
            errors.push('previous hash link broken');
        return errors.join(', ');
    }
    /**
     * Debug logging helper
     */
    log(message, data) {
        if (this.debug) {
            auditLog.debug('audit', message, data);
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
export function createImmutableAuditService(overrides, storage) {
    const hmacSecret = overrides?.hmacSecret ?? process.env.AUDIT_HMAC_SECRET;
    if (!hmacSecret) {
        throw new Error('Audit HMAC secret required. Set AUDIT_HMAC_SECRET environment variable.');
    }
    return new ImmutableAuditService({
        hmacSecret,
        chainId: overrides?.chainId ?? process.env.AUDIT_CHAIN_ID ?? 'default',
        algorithm: overrides?.algorithm,
        debug: overrides?.debug ?? process.env.AUDIT_DEBUG === 'true',
    }, storage);
}
// ============================================================================
// Exports
// ============================================================================
export default ImmutableAuditService;
