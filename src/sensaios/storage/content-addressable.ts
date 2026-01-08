/**
 * Content-Addressable Storage for SensaiOS
 * 
 * Implements SHA-256 based blob storage with:
 * - Automatic deduplication (same content = same ID)
 * - Integrity verification on read
 * - Cache-friendly immutable keys
 * 
 * @module sensaios/storage/content-addressable
 * @version 1.0.0
 */

import * as crypto from 'crypto';
import type { BlobMetadata, StorageObject } from '../component-context.js';
import { scopedLogger } from '../../observability/envelope/console.js';

/** Scoped logger for CAS operations */
const log = scopedLogger('sensaios-cas');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Content-addressable blob with SHA-256 ID
 */
export interface ContentAddressableBlob {
  /** SHA-256 hash of content (hex string, 64 chars) */
  id: string;

  /** Raw blob data */
  data: Buffer;

  /** Content metadata */
  metadata?: BlobMetadata;

  /** Size in bytes */
  size: number;

  /** When stored */
  createdAt: Date;

  /** Reference count (how many objects point to this blob) */
  refCount: number;
}

/**
 * Verification result for blob integrity
 */
export interface IntegrityResult {
  /** Whether blob passes integrity check */
  valid: boolean;

  /** Expected hash (from ID) */
  expectedHash: string;

  /** Computed hash of current data */
  computedHash: string;

  /** Error message if invalid */
  error?: string;
}

/**
 * CAS statistics
 */
export interface CASStats {
  /** Total blobs stored */
  totalBlobs: number;

  /** Total bytes stored */
  totalBytes: number;

  /** Bytes saved by deduplication */
  deduplicationSavings: number;

  /** Number of duplicate writes prevented */
  duplicatesAvoided: number;

  /** Integrity checks performed */
  integrityChecks: number;

  /** Integrity failures detected */
  integrityFailures: number;
}

// ============================================================================
// CONTENT-ADDRESSABLE STORAGE ENGINE
// ============================================================================

/**
 * ContentAddressableStorage — SHA-256 based blob storage
 * 
 * Key properties:
 * - **Deterministic IDs**: Same content always produces same ID
 * - **Deduplication**: Identical blobs stored once
 * - **Integrity**: Read-time verification catches corruption
 * - **Immutable**: Content never changes after creation
 * 
 * @example
 * ```ts
 * const cas = new ContentAddressableStorage();
 * 
 * // Store blob - ID is derived from content
 * const id = await cas.put(Buffer.from('hello world'));
 * // id = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
 * 
 * // Same content = same ID (deduplication)
 * const id2 = await cas.put(Buffer.from('hello world'));
 * assert(id === id2); // true!
 * 
 * // Retrieve with integrity verification
 * const blob = await cas.get(id, { verify: true });
 * ```
 */
export class ContentAddressableStorage {
  /** In-memory blob store (production would use database) */
  private readonly blobs = new Map<string, ContentAddressableBlob>();

  /** Statistics */
  private stats: CASStats = {
    totalBlobs: 0,
    totalBytes: 0,
    deduplicationSavings: 0,
    duplicatesAvoided: 0,
    integrityChecks: 0,
    integrityFailures: 0,
  };

  // ==========================================================================
  // CORE OPERATIONS
  // ==========================================================================

  /**
   * Compute SHA-256 hash of content
   * 
   * @param data - Content to hash
   * @returns 64-character hex string
   */
  computeHash(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Store blob with content-derived ID
   * 
   * If blob with same content exists, increments reference count.
   * 
   * @param data - Blob content
   * @param metadata - Optional metadata
   * @returns SHA-256 blob ID
   */
  async put(data: Buffer, metadata?: BlobMetadata): Promise<string> {
    const id = this.computeHash(data);

    const existing = this.blobs.get(id);
    if (existing) {
      // Deduplicate - increment refcount only
      existing.refCount++;
      this.stats.duplicatesAvoided++;
      this.stats.deduplicationSavings += data.length;

      log.debug('put', 'Deduplicated blob', { 
        id: id.slice(0, 12), 
        size: data.length,
        refCount: existing.refCount 
      });

      return id;
    }

    // Store new blob
    this.blobs.set(id, {
      id,
      data: Buffer.from(data), // Defensive copy
      metadata,
      size: data.length,
      createdAt: new Date(),
      refCount: 1,
    });

    this.stats.totalBlobs++;
    this.stats.totalBytes += data.length;

    log.info('put', 'Stored blob', { id: id.slice(0, 12), size: data.length });

    return id;
  }

  /**
   * Retrieve blob by ID with optional integrity verification
   * 
   * @param id - SHA-256 blob ID
   * @param options - Retrieval options
   * @returns Blob data or null if not found
   * @throws If verify=true and integrity check fails
   */
  async get(id: string, options: { verify?: boolean } = {}): Promise<Buffer | null> {
    const blob = this.blobs.get(id);
    if (!blob) {
      log.debug('get', 'Blob not found', { id: id.slice(0, 12) });
      return null;
    }

    if (options.verify) {
      const integrity = this.verifyIntegrity(blob);
      this.stats.integrityChecks++;

      if (!integrity.valid) {
        this.stats.integrityFailures++;
        log.error('get', 'Integrity check failed', {
          id: id.slice(0, 12),
          expected: integrity.expectedHash.slice(0, 12),
          computed: integrity.computedHash.slice(0, 12),
        });
        throw new Error(`CAS integrity failure: ${integrity.error}`);
      }
    }

    // Return defensive copy
    return Buffer.from(blob.data);
  }

  /**
   * Check if blob exists
   * 
   * @param id - SHA-256 blob ID
   * @returns Whether blob exists
   */
  has(id: string): boolean {
    return this.blobs.has(id);
  }

  /**
   * Delete blob (decrements refcount, actually deletes at 0)
   * 
   * @param id - SHA-256 blob ID
   * @returns Whether blob was deleted (vs refcount decremented)
   */
  async delete(id: string): Promise<boolean> {
    const blob = this.blobs.get(id);
    if (!blob) {
      return false;
    }

    blob.refCount--;

    if (blob.refCount <= 0) {
      this.blobs.delete(id);
      this.stats.totalBlobs--;
      this.stats.totalBytes -= blob.size;

      log.info('delete', 'Deleted blob', { id: id.slice(0, 12), size: blob.size });
      return true;
    }

    log.debug('delete', 'Decremented refcount', { 
      id: id.slice(0, 12), 
      refCount: blob.refCount 
    });
    return false;
  }

  // ==========================================================================
  // INTEGRITY VERIFICATION
  // ==========================================================================

  /**
   * Verify blob integrity
   * 
   * @param blob - Blob to verify
   * @returns Verification result
   */
  verifyIntegrity(blob: ContentAddressableBlob): IntegrityResult {
    const computedHash = this.computeHash(blob.data);

    if (computedHash === blob.id) {
      return {
        valid: true,
        expectedHash: blob.id,
        computedHash,
      };
    }

    return {
      valid: false,
      expectedHash: blob.id,
      computedHash,
      error: `Hash mismatch: expected ${blob.id.slice(0, 12)}..., got ${computedHash.slice(0, 12)}...`,
    };
  }

  /**
   * Verify all stored blobs
   * 
   * @returns Array of corrupted blob IDs
   */
  async verifyAll(): Promise<string[]> {
    const corrupted: string[] = [];

    for (const [id, blob] of this.blobs) {
      const result = this.verifyIntegrity(blob);
      this.stats.integrityChecks++;

      if (!result.valid) {
        this.stats.integrityFailures++;
        corrupted.push(id);
        log.error('verifyAll', 'Corruption detected', { id: id.slice(0, 12) });
      }
    }

    log.info('verifyAll', 'Verification complete', {
      total: this.blobs.size,
      corrupted: corrupted.length,
    });

    return corrupted;
  }

  // ==========================================================================
  // METADATA & STATS
  // ==========================================================================

  /**
   * Get blob metadata without retrieving data
   * 
   * @param id - SHA-256 blob ID
   * @returns Metadata or null
   */
  getMetadata(id: string): { metadata?: BlobMetadata; size: number; createdAt: Date; refCount: number } | null {
    const blob = this.blobs.get(id);
    if (!blob) return null;

    return {
      metadata: blob.metadata,
      size: blob.size,
      createdAt: blob.createdAt,
      refCount: blob.refCount,
    };
  }

  /**
   * Get storage statistics
   */
  getStats(): CASStats {
    return { ...this.stats };
  }

  /**
   * List all blob IDs
   */
  listIds(): string[] {
    return Array.from(this.blobs.keys());
  }

  /**
   * Clear all storage (for testing)
   */
  clear(): void {
    this.blobs.clear();
    this.stats = {
      totalBlobs: 0,
      totalBytes: 0,
      deduplicationSavings: 0,
      duplicatesAvoided: 0,
      integrityChecks: 0,
      integrityFailures: 0,
    };
    log.debug('clear', 'Storage cleared');
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/** Default CAS instance */
let casInstance: ContentAddressableStorage | null = null;

/**
 * Get the singleton CAS instance
 */
export function getContentAddressableStorage(): ContentAddressableStorage {
  if (!casInstance) {
    casInstance = new ContentAddressableStorage();
    log.info('init', 'Content-addressable storage initialized');
  }
  return casInstance;
}

/**
 * Shutdown CAS (for testing/cleanup)
 */
export function shutdownContentAddressableStorage(): void {
  if (casInstance) {
    casInstance.clear();
    casInstance = null;
    log.info('shutdown', 'Content-addressable storage shutdown');
  }
}
