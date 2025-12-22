/**
 * Role Archive Module
 * Tracks all role changes with 500-entry cold storage archive
 * @module bot/state/roleArchive
 * 
 * FEATURES:
 * - Records every role addition/removal
 * - Maintains last 500 changes in cold storage
 * - Integrates with Drip alerts for anomaly detection
 * - Provides statistical analysis for learning
 * - Fast lookups with indexed cache
 * - CRITICAL SECURITY: HMAC-SHA256 integrity verification (prevents tampering)
 * 
 * SECURITY FIX (Week 1 Day 6-7):
 * Added cryptographic signatures to prevent archive file tampering
 * - HMAC-SHA256 signature on every persist
 * - Verification on load with automatic backup restoration
 * - Drip alerts on integrity violations
 * - Prevents social engineering attacks via fake role removals
 * 
 * TEAM: Security Specialist
 * FIXES: Critical Issue #2 - Archive Tampering Vulnerability
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import { getLogger } from '../../shared/logging/index.js';
import { ensureError } from '../../shared/utils/error-utils.js';

const logger = getLogger();
import { emitAlert } from '../eventbus-integration.js';
import { 
  generateSecurityBaselines, 
  loadSecurityBaselines, 
  saveSecurityBaselines,
  shouldRefreshBaselines,
  type FullSecurityBaselines
} from './securityBaselines.js';
import { detectSecurityThreats, calculateCurrentActivity, type RoleChange } from './threatDetector.js';
import { 
  ARCHIVE_DIR, 
  ARCHIVE_FILE, 
  BACKUP_FILE, 
  MAX_ARCHIVE_SIZE, 
  HMAC_ALGORITHM, 
  getHmacSecret 
} from './config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RoleChangeEvent {
  memberId: string;
  memberTag: string;
  guildId: string;
  guildName: string;
  type: 'addition' | 'removal';
  roleId: string;
  roleName: string;
  origin: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface RoleChangeRecord extends RoleChangeEvent {
  id: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

interface RoleStatisticsEntry {
  roleId: string;
  roleName: string;
  changeCount: number;
}

export interface RoleStatistics {
  totalChanges: number;
  additionCount: number;
  removalCount: number;
  uniqueMemberCount: number;
  rolesModified: RoleStatisticsEntry[];
  lastUpdate: string | null;
  archiveSize: number;
  archiveCapacity: number;
}

// SerializedArchiveStatistics: What gets stored in JSON files
interface SerializedArchiveStatistics {
  totalChanges: number;
  additionCount: number;
  removalCount: number;
  uniqueMembers: string[];
  rolesModified: Array<[string, number]>;
  lastUpdate: string | null;
}

// Note: RoleArchiveCache and ArchiveStatistics removed in P2-M2 refactor.
// Internal cache now uses RoleArchiveCacheInternal with BoundedSet.

interface ArchivedData {
  changes?: RoleChangeRecord[];
  statistics?: SerializedArchiveStatistics;
  signature?: string;
  metadata?: {
    lastPersisted: string;
    schemaVersion: string;
  };
}

export interface ExportedArchive {
  changes: RoleChangeRecord[];
  statistics: RoleStatistics | null;
  exportedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bounded Set (P2-M2: Memory Safety)
// ─────────────────────────────────────────────────────────────────────────────

const UNIQUE_MEMBERS_CAP = 10000;  // Max unique members to track

/**
 * LRU-style bounded Set that evicts oldest entries when capacity reached.
 * Prevents unbounded memory growth over months of operation.
 */
class BoundedSet<T> {
  private items: T[] = [];
  private set: Set<T> = new Set();
  
  constructor(private maxSize: number = UNIQUE_MEMBERS_CAP) {}
  
  add(item: T): void {
    if (this.set.has(item)) return;
    
    // Evict oldest if at capacity
    if (this.items.length >= this.maxSize) {
      const oldest = this.items.shift()!;
      this.set.delete(oldest);
    }
    
    this.items.push(item);
    this.set.add(item);
  }
  
  has(item: T): boolean {
    return this.set.has(item);
  }
  
  get size(): number {
    return this.set.size;
  }
  
  /** Convert to array for serialization */
  toArray(): T[] {
    return [...this.items];
  }
  
  /** Restore from array (after deserialization) */
  static fromArray<T>(items: T[], maxSize?: number): BoundedSet<T> {
    const bounded = new BoundedSet<T>(maxSize);
    // Only load the most recent items up to capacity
    const start = Math.max(0, items.length - (maxSize ?? UNIQUE_MEMBERS_CAP));
    for (let i = start; i < items.length; i++) {
      bounded.add(items[i]);
    }
    return bounded;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// In-Memory Cache
// ─────────────────────────────────────────────────────────────────────────────

interface RoleArchiveCacheInternal {
  changes: RoleChangeRecord[];
  statistics: {
    totalChanges: number;
    additionCount: number;
    removalCount: number;
    uniqueMembers: BoundedSet<string>;  // P2-M2: Bounded set
    rolesModified: Map<string, number>;
    lastUpdate: string | null;
  };
  securityBaselines: FullSecurityBaselines | null;
  initialized: boolean;
}

let roleArchiveCache: RoleArchiveCacheInternal = {
  changes: [],
  statistics: {
    totalChanges: 0,
    additionCount: 0,
    removalCount: 0,
    uniqueMembers: new BoundedSet<string>(),  // P2-M2: Bounded
    rolesModified: new Map(),
    lastUpdate: null
  },
  securityBaselines: null,
  initialized: false
};

// ─────────────────────────────────────────────────────────────────────────────
// Debounce State (P1: Reduce disk thrashing)
// ─────────────────────────────────────────────────────────────────────────────

const PERSIST_DEBOUNCE_MS = 5000;  // Max 1 persist per 5 seconds
let persistPending = false;
let persistTimer: NodeJS.Timeout | null = null;
let lastPersistTime = 0;

// ─────────────────────────────────────────────────────────────────────────────
// HMAC Security
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate HMAC-SHA256 signature for data integrity
 * @throws Error in production if ARCHIVE_HMAC_SECRET not configured
 */
function generateSignature(data: string): string {
  return crypto.createHmac(HMAC_ALGORITHM, getHmacSecret())
    .update(data)
    .digest('hex');
}

/**
 * Verify HMAC-SHA256 signature
 */
function verifySignature(data: string, signature: string): boolean {
  try {
    const expectedSignature = generateSignature(data);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (err) {
    const error = ensureError(err);
    logger.warn('security-state', 'verify', '[RoleArchive] Signature verification failed', { metadata: { errorMsg: error.message } });
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist archive to disk with HMAC signature for integrity
 */
async function persistArchive(): Promise<void> {
  try {
    try {
      await fs.copyFile(ARCHIVE_FILE, BACKUP_FILE);
    } catch (backupErr) {
      const error = backupErr as NodeJS.ErrnoException;
      if (error.code !== 'ENOENT') {
        logger.warn('security-state', 'warning', '[RoleArchive] Failed to create backup', { metadata: { errorMsg: error.message } });
      }
    }
    
    const data = {
      changes: roleArchiveCache.changes,
      statistics: {
        ...roleArchiveCache.statistics,
        uniqueMembers: roleArchiveCache.statistics.uniqueMembers.toArray(),  // P2-M2: BoundedSet serialization
        rolesModified: Array.from(roleArchiveCache.statistics.rolesModified.entries())
      },
      metadata: {
        lastPersisted: new Date().toISOString(),
        schemaVersion: '1.0.0'
      }
    };
    
    const dataString = JSON.stringify(data);
    const signature = generateSignature(dataString);
    
    const signedData = {
      ...data,
      signature
    };
    
    await fs.writeFile(ARCHIVE_FILE, JSON.stringify(signedData, null, 2), 'utf8');
    
    lastPersistTime = Date.now();
    
    logger.debug('security-state', 'save', '[RoleArchive] ✅ Persisted to disk with signature', {
      metadata: {
        changeCount: roleArchiveCache.changes.length,
        signatureLength: signature.length,
        file: ARCHIVE_FILE
      }
    });
  } catch (err) {
    const error = ensureError(err);
    logger.error('security-state', 'save', '[RoleArchive] Failed to persist', { metadata: { errorMsg: error.message } });
    throw err;
  }
}

/**
 * Debounced persist wrapper (P1: Reduce disk thrashing)
 * 
 * Batches rapid role changes to max 1 disk write per 5 seconds.
 * During high-activity periods (mass role changes, raids), this
 * reduces I/O from potentially hundreds of writes to a handful.
 */
function debouncedPersist(): void {
  const now = Date.now();
  const timeSinceLastPersist = now - lastPersistTime;
  
  if (timeSinceLastPersist >= PERSIST_DEBOUNCE_MS) {
    // Enough time has passed, persist immediately
    persistArchive().catch(err => {
      logger.warn('security-state', 'warning', '[RoleArchive] Debounced persist failed', { metadata: { errorMsg: String(err) } });
    });
    return;
  }
  
  // Schedule a delayed persist if not already pending
  if (!persistPending) {
    persistPending = true;
    const delay = PERSIST_DEBOUNCE_MS - timeSinceLastPersist;
    
    persistTimer = setTimeout(() => {
      persistPending = false;
      persistTimer = null;
      persistArchive().catch(err => {
        logger.warn('security-state', 'warning', '[RoleArchive] Delayed persist failed', { metadata: { errorMsg: String(err) } });
      });
    }, delay);
    
    logger.debug('security-state', 'save', '[RoleArchive] Persist scheduled in', { metadata: { delayMs: delay } });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize the role archive system with integrity verification
 */
export async function initializeRoleArchive(): Promise<boolean> {
  try {
    await fs.mkdir(ARCHIVE_DIR, { recursive: true });
    
    try {
      const fileContent = await fs.readFile(ARCHIVE_FILE, 'utf8');
      const archived = JSON.parse(fileContent) as ArchivedData;
      
      if (archived.signature) {
        const { signature, ...dataToVerify } = archived;
        const dataString = JSON.stringify(dataToVerify);
        
        const isValid = verifySignature(dataString, signature);
        
        if (!isValid) {
          logger.error('security-state', 'security', '[RoleArchive] 🚨 SECURITY ALERT: Archive signature verification FAILED! File may be tampered.', {
            metadata: {
              file: ARCHIVE_FILE,
              signatureProvided: signature.substring(0, 16) + '...'
            }
          });
          
          try {
            logger.warn('security-state', 'warning', '[RoleArchive] Attempting to restore from backup...');
            const backupContent = await fs.readFile(BACKUP_FILE, 'utf8');
            const backup = JSON.parse(backupContent) as ArchivedData;
            
            if (backup.signature) {
              const { signature: backupSig, ...backupData } = backup;
              const backupDataString = JSON.stringify(backupData);
              
              if (verifySignature(backupDataString, backupSig)) {
                await fs.writeFile(ARCHIVE_FILE, backupContent);
                logger.info('security-state', 'load', '[RoleArchive] ✅ Successfully restored from backup');
                
                if (Array.isArray(backup.changes)) {
                  roleArchiveCache.changes = backup.changes;
                }
                if (backup.statistics) {
                  roleArchiveCache.statistics = {
                    ...backup.statistics,
                    uniqueMembers: BoundedSet.fromArray(backup.statistics.uniqueMembers || []),  // P2-M2
                    rolesModified: new Map(backup.statistics.rolesModified || [])
                  };
                }
              } else {
                logger.error('security-state', 'security', '[RoleArchive] 🚨 Backup signature also invalid! Starting fresh.');
              }
            } else {
              logger.warn('security-state', 'warning', '[RoleArchive] Backup has no signature (legacy format). Cannot verify integrity.');
            }
          } catch (backupErr) {
            const error = ensureError(backupErr);
            logger.error('security-state', 'load', '[RoleArchive] Failed to restore from backup', { metadata: { errorMsg: error.message } });
          }
          
          try {
            emitAlert('critical', 'Role archive tampering detected', {
              file: ARCHIVE_FILE,
              signatureExpected: archived.signature,
              action: 'Restored from backup',
            });
          } catch (alertError) {
            const error = ensureError(alertError);
            logger.warn('security-state', 'warning', '[EventBus] Failed to emit archive tampering alert', {
              metadata: { errorMsg: error.message }
            });
          }
          
        } else {
          if (Array.isArray(archived.changes)) {
            roleArchiveCache.changes = archived.changes;
          }
          
          if (archived.statistics) {
            roleArchiveCache.statistics = {
              ...archived.statistics,
              uniqueMembers: BoundedSet.fromArray(archived.statistics.uniqueMembers || []),  // P2-M2
              rolesModified: new Map(archived.statistics.rolesModified || [])
            };
          }
          
          logger.info('security-state', 'load', '[RoleArchive] ✅ Loaded from disk with valid signature', {
            metadata: {
              changeCount: roleArchiveCache.changes.length,
              totalChanges: roleArchiveCache.statistics.totalChanges,
              file: ARCHIVE_FILE
            }
          });
        }
      } else {
        logger.warn('security-state', 'warning', '[RoleArchive] Archive has no signature (legacy format). Migrating to signed format on next persist.');
        
        if (Array.isArray(archived.changes)) {
          roleArchiveCache.changes = archived.changes;
        }
        
        if (archived.statistics) {
          roleArchiveCache.statistics = {
            ...archived.statistics,
            uniqueMembers: BoundedSet.fromArray(archived.statistics.uniqueMembers || []),  // P2-M2
            rolesModified: new Map(archived.statistics.rolesModified || [])
          };
        }
      }
      
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'ENOENT') {
        logger.warn('security-state', 'warning', '[RoleArchive] Failed to load existing archive', { metadata: { errorMsg: error.message } });
      }
    }
    
    roleArchiveCache.initialized = true;
    
    try {
      let baselines = await loadSecurityBaselines();
      
      if (!baselines || shouldRefreshBaselines(baselines)) {
        if (roleArchiveCache.changes.length > 0) {
          logger.info('security-state', 'init', '[RoleArchive] Generating security baselines from archive history', {
            metadata: { changeCount: roleArchiveCache.changes.length }
          });
          
          baselines = generateSecurityBaselines({ changes: roleArchiveCache.changes as RoleChange[] });
          
          const saved = await saveSecurityBaselines(baselines);
          
          if (saved) {
            logger.info('security-state', 'init', '[RoleArchive] ✅ Security baselines generated and saved', {
              metadata: {
                confidence: baselines.confidenceLevel.toFixed(2),
                dataPoints: baselines.dataPointCount,
                peakHours: baselines.peakActivityHours.join(', ')
              }
            });
          }
        } else {
          logger.warn('security-state', 'warning', '[RoleArchive] Cannot generate baselines yet - no archive data available');
        }
      } else {
        logger.info('security-state', 'load', '[RoleArchive] ✅ Loaded existing security baselines', {
          metadata: {
            confidence: baselines.confidenceLevel.toFixed(2),
            age: Math.round((Date.now() - new Date(baselines.computedAt).getTime()) / (1000 * 60 * 60)) + 'h',
            peakHours: baselines.peakActivityHours.join(', ')
          }
        });
      }
      
      roleArchiveCache.securityBaselines = baselines;
      
    } catch (baselineErr) {
      const error = ensureError(baselineErr);
      logger.error('security-state', 'init', '[RoleArchive] Failed to initialize security baselines', { 
        metadata: { errorMsg: error.message, stack: error.stack }
      });
    }
    
    return true;
  } catch (err) {
    const error = ensureError(err);
    logger.error('security-state', 'init', '[RoleArchive] Initialization failed', { metadata: { errorMsg: error.message, stack: error.stack } });
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Record Role Changes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a role change event
 */
export async function recordRoleChange(event: RoleChangeEvent): Promise<RoleChangeRecord> {
  if (!roleArchiveCache.initialized) {
    await initializeRoleArchive();
  }
  
  const timestamp = new Date().toISOString();
  const changeId = `${event.memberId}-${event.roleId}-${Date.now()}`;
  
  const changeRecord: RoleChangeRecord = {
    id: changeId,
    timestamp,
    memberId: event.memberId,
    memberTag: event.memberTag,
    guildId: event.guildId,
    guildName: event.guildName,
    type: event.type,
    roleId: event.roleId,
    roleName: event.roleName,
    origin: event.origin,
    metadata: event.metadata || {}
  };
  
  roleArchiveCache.changes.push(changeRecord);
  if (roleArchiveCache.changes.length > MAX_ARCHIVE_SIZE) {
    roleArchiveCache.changes.shift();
  }
  
  roleArchiveCache.statistics.totalChanges++;
  if (event.type === 'addition') {
    roleArchiveCache.statistics.additionCount++;
  } else if (event.type === 'removal') {
    roleArchiveCache.statistics.removalCount++;
  }
  
  roleArchiveCache.statistics.uniqueMembers.add(event.memberId);
  
  const roleKey = `${event.roleId}:${event.roleName}`;
  const currentCount = roleArchiveCache.statistics.rolesModified.get(roleKey) || 0;
  roleArchiveCache.statistics.rolesModified.set(roleKey, currentCount + 1);
  
  roleArchiveCache.statistics.lastUpdate = timestamp;
  
  // Use debounced persist to batch rapid changes (P1: reduce disk thrashing)
  debouncedPersist();
  
  logger.debug('security-state', 'save', '[RoleArchive] Recorded role change', {
    metadata: {
      type: event.type,
      member: event.memberTag,
      role: event.roleName,
      origin: event.origin,
      archiveSize: roleArchiveCache.changes.length
    }
  });
  
  if (roleArchiveCache.securityBaselines) {
    setImmediate(async () => {
      try {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        const recentChanges = roleArchiveCache.changes.filter(change => {
          const changeTime = new Date(change.timestamp).getTime();
          return changeTime > oneHourAgo;
        });
        
        const currentActivity = calculateCurrentActivity(recentChanges as RoleChange[], roleArchiveCache);
        
        const assessment = detectSecurityThreats(
          currentActivity, 
          roleArchiveCache.securityBaselines!
        );
        
        if (assessment.hasThreats) {
          logger.warn('security-state', 'security', `[RoleArchive] 🚨 ${assessment.threatCount} security threat(s) detected`, {
            metadata: {
              maxSeverity: assessment.maxSeverity,
              baselineConfidence: assessment.baselineConfidence.toFixed(2)
            }
          });
          
          for (const threat of assessment.threats) {
            const severityEmoji = threat.severity === 'CRITICAL' ? '🔴' : 
                                  threat.severity === 'HIGH' ? '🟠' : '🟡';
            
            logger.warn('security-state', 'security', `[RoleArchive] ${severityEmoji} ${threat.type}: ${threat.description}`, {
              metadata: {
                severity: threat.severity,
                confidence: threat.confidence.toFixed(2),
                evidence: threat.evidence,
                mitreAttack: threat.mitreAttack,
                recommendedAction: threat.recommendedAction
              }
            });
          }
        }
      } catch (threatErr) {
        const error = ensureError(threatErr);
        logger.error('security-state', 'error', '[RoleArchive] Failed to detect threats', {
          metadata: { errorMsg: error.message, stack: error.stack }
        });
      }
    });
  }
  
  return changeRecord;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get role change statistics
 */
export function getRoleStatistics(): RoleStatistics | null {
  if (!roleArchiveCache.initialized) {
    return null;
  }
  
  return {
    totalChanges: roleArchiveCache.statistics.totalChanges,
    additionCount: roleArchiveCache.statistics.additionCount,
    removalCount: roleArchiveCache.statistics.removalCount,
    uniqueMemberCount: roleArchiveCache.statistics.uniqueMembers.size,
    rolesModified: Array.from(roleArchiveCache.statistics.rolesModified.entries())
      .map(([key, count]) => {
        const [roleId, roleName] = key.split(':');
        return { roleId, roleName, changeCount: count };
      })
      .sort((a, b) => b.changeCount - a.changeCount),
    lastUpdate: roleArchiveCache.statistics.lastUpdate,
    archiveSize: roleArchiveCache.changes.length,
    archiveCapacity: MAX_ARCHIVE_SIZE
  };
}

/**
 * Get recent role changes for a member
 */
export function getMemberRoleHistory(memberId: string, limit: number = 10): RoleChangeRecord[] {
  if (!roleArchiveCache.initialized) {
    return [];
  }
  
  return roleArchiveCache.changes
    .filter(change => change.memberId === memberId)
    .slice(-limit)
    .reverse();
}

/**
 * Get recent changes for a specific role
 */
export function getRoleChangeHistory(roleId: string, limit: number = 50): RoleChangeRecord[] {
  if (!roleArchiveCache.initialized) {
    return [];
  }
  
  return roleArchiveCache.changes
    .filter(change => change.roleId === roleId)
    .slice(-limit)
    .reverse();
}

/**
 * Detect anomalous role changes (for Drip alert integration)
 */
export function isAnomalousChange(event: RoleChangeEvent): boolean {
  if (!roleArchiveCache.initialized || roleArchiveCache.changes.length < 50) {
    return false;
  }
  
  const recentMemberChanges = roleArchiveCache.changes
    .filter(c => c.memberId === event.memberId)
    .slice(-10);
  
  if (recentMemberChanges.length >= 5) {
    const eventTimestamp = event.timestamp ? new Date(event.timestamp).getTime() : Date.now();
    const timeSpan = eventTimestamp - new Date(recentMemberChanges[0].timestamp).getTime();
    if (timeSpan < 5 * 60 * 1000) {
      logger.warn('security-state', 'security', '[RoleArchive] Anomaly detected: Rapid role changes', {
        metadata: {
          member: event.memberTag,
          changeCount: recentMemberChanges.length,
          timeSpanMinutes: Math.round(timeSpan / 60000)
        }
      });
      return true;
    }
  }
  
  if (event.type === 'removal' && (event.metadata as Record<string, unknown>)?.isUnauthorized) {
    logger.warn('security-state', 'security', '[RoleArchive] Anomaly detected: Unauthorized role removal', {
      metadata: {
        member: event.memberTag,
        role: event.roleName,
        origin: event.origin
      }
    });
    return true;
  }
  
  return false;
}

/**
 * Export archive for analysis (last 500 entries)
 */
export function exportArchive(): ExportedArchive {
  if (!roleArchiveCache.initialized) {
    return { changes: [], statistics: null, exportedAt: new Date().toISOString() };
  }
  
  return {
    changes: roleArchiveCache.changes,
    statistics: getRoleStatistics(),
    exportedAt: new Date().toISOString()
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Baseline Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Refresh security baselines (called by daily cron job)
 */
export async function refreshSecurityBaselines(): Promise<boolean> {
  try {
    if (!roleArchiveCache.initialized) {
      logger.warn('security-state', 'warning', '[RoleArchive] Cannot refresh baselines - archive not initialized');
      return false;
    }
    
    if (roleArchiveCache.changes.length === 0) {
      logger.warn('security-state', 'warning', '[RoleArchive] Cannot refresh baselines - no archive data available');
      return false;
    }
    
    logger.info('security-state', 'init', '[RoleArchive] Refreshing security baselines', {
      metadata: { changeCount: roleArchiveCache.changes.length }
    });
    
    const baselines = generateSecurityBaselines({ changes: roleArchiveCache.changes as RoleChange[] });
    
    const saved = await saveSecurityBaselines(baselines);
    
    if (saved) {
      roleArchiveCache.securityBaselines = baselines;
      
      logger.info('security-state', 'init', '[RoleArchive] ✅ Security baselines refreshed successfully', {
        durationMs: baselines.computationTimeMs,
        metadata: {
          confidence: baselines.confidenceLevel.toFixed(2),
          dataPoints: baselines.dataPointCount,
          peakHours: baselines.peakActivityHours.join(', ')
        }
      });
      
      return true;
    }
    
    return false;
  } catch (err) {
    const error = ensureError(err);
    logger.error('security-state', 'error', '[RoleArchive] Failed to refresh security baselines', {
      metadata: { errorMsg: error.message, stack: error.stack }
    });
    return false;
  }
}

/**
 * Get current security baselines (for /ops security command)
 */
export function getSecurityBaselines(): FullSecurityBaselines | null {
  return roleArchiveCache.securityBaselines;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shutdown
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shutdown - final persist
 */
export async function shutdownRoleArchive(): Promise<void> {
  if (roleArchiveCache.initialized) {
    // Clear any pending debounced persist
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
      persistPending = false;
    }
    
    // Final sync persist (not debounced)
    await persistArchive();
    logger.info('security-state', 'save', '[RoleArchive] Shutdown complete', {
      metadata: { finalChangeCount: roleArchiveCache.changes.length }
    });
  }
}
