/**
 * Security Baselines Module
 * Generates behavioral baselines from role archive for threat detection
 * @module bot/state/securityBaselines
 * 
 * IMPLEMENTATION: Archive Intelligence System - Phase 1
 * TEAM: Security Specialist
 * REFERENCE: docs/SECURITY-ARCHIVE-INTELLIGENCE.md
 * 
 * PURPOSE:
 * - Establish "normal" operational patterns from historical data
 * - Provide baseline thresholds for anomaly detection
 * - Support adaptive learning (baselines evolve over time)
 * - Enable high-confidence threat detection
 * 
 * DATABASE-FIRST ARCHITECTURE (2025-12-27):
 * Migrated from file storage to PostgreSQL via Prisma CacheEntry table.
 * All persistence now goes through database, eliminating /Store file writes.
 * 
 * SECURITY:
 * - HMAC-SHA256 signatures on baseline data
 * - Tamper detection via signature verification
 * - Confidence scoring based on data volume
 */

// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from '../../shared/logging/index.js';
const logger = getLogger();

import crypto from 'crypto';
import { prisma } from '../../shared/prisma.js';
import { ensureError } from '../../shared/utils/error-utils.js';
import { HMAC_ALGORITHM, getHmacSecret } from './config.js';
import type { SecurityBaselines, RoleChange } from './threatDetector.js';

// ─────────────────────────────────────────────────────────────────────────────
// Database Keys (Database-First Architecture)
// ─────────────────────────────────────────────────────────────────────────────

const BASELINES_NAMESPACE = 'security-bot-state';
const BASELINES_KEY = 'security-bot-state:baselines';

const MIN_DATA_POINTS = 200;
const CONFIDENCE_THRESHOLD = 0.7;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ActiveRole {
  roleId: string;
  roleName: string;
  changeCount: number;
}

export interface FullSecurityBaselines extends SecurityBaselines {
  averageChangesPerDay: number;
  trainerRoleAdditionsPerDay: number;
  mostActiveRoles: ActiveRole[];
  averageChangesPerMember: number;
  changesByOrigin: Record<string, number>;
  computedAt: string;
  dataPointCount: number;
  computationTimeMs: number;
}

interface RoleArchiveChange extends RoleChange {
  roleId?: string;
  roleName?: string;
}

interface RoleArchive {
  changes: RoleArchiveChange[];
}

interface BaselineFileData {
  baselines: FullSecurityBaselines;
  metadata: {
    savedAt: string;
    schemaVersion: string;
  };
  signature?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HMAC Security
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate HMAC-SHA256 signature for baseline data
 * Uses getHmacSecret() for production fail-fast safety
 */
function generateSignature(data: string): string {
  return crypto.createHmac(HMAC_ALGORITHM, getHmacSecret())
    .update(data)
    .digest('hex');
}

/**
 * Verify baseline signature
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
    logger.warn('security-state', 'verify', '[SecurityBaselines] Signature verification failed', { metadata: { errorMsg: error.message } });
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty Baselines
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create empty baseline structure
 */
function createEmptyBaselines(): FullSecurityBaselines {
  return {
    averageChangesPerHour: 0,
    averageChangesPerDay: 0,
    peakActivityHours: [],
    trainerRoleAdditionsPerDay: 0,
    trainerRoleRemovalsPerDay: 0,
    mostActiveRoles: [],
    averageChangesPerMember: 0,
    maxChangesPerMember: 0,
    rapidChangeThreshold: 5,
    changesByOrigin: {},
    expectedOrigins: [],
    computedAt: new Date().toISOString(),
    dataPointCount: 0,
    confidenceLevel: 0,
    computationTimeMs: 0
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Baseline Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate security baselines from role archive
 * Analyzes last 500 role changes to establish normal patterns
 */
export function generateSecurityBaselines(roleArchive: RoleArchive): FullSecurityBaselines {
  const startTime = Date.now();
  
  if (!roleArchive || !roleArchive.changes || roleArchive.changes.length === 0) {
    logger.warn('security-state', 'warning', '[SecurityBaselines] No archive data available for baseline generation');
    return createEmptyBaselines();
  }
  
  const baselines: FullSecurityBaselines = {
    // Temporal patterns
    averageChangesPerHour: 0,
    averageChangesPerDay: 0,
    peakActivityHours: [],
    
    // Role-specific patterns
    trainerRoleAdditionsPerDay: 0,
    trainerRoleRemovalsPerDay: 0,
    mostActiveRoles: [],
    
    // Member-specific patterns
    averageChangesPerMember: 0,
    maxChangesPerMember: 0,
    rapidChangeThreshold: 0,
    
    // Origin patterns
    changesByOrigin: {},
    expectedOrigins: [],
    
    // Metadata
    computedAt: new Date().toISOString(),
    dataPointCount: roleArchive.changes.length,
    confidenceLevel: 0,
    computationTimeMs: 0
  };
  
  // Calculate confidence level
  baselines.confidenceLevel = Math.min(roleArchive.changes.length / MIN_DATA_POINTS, 1.0);
  
  // === TEMPORAL ANALYSIS ===
  const hourlyBuckets = new Map<number, number>();
  const dailyBuckets = new Map<string, number>();
  
  for (const change of roleArchive.changes) {
    const timestamp = new Date(change.timestamp);
    const hour = timestamp.getHours();
    const day = timestamp.toISOString().split('T')[0];
    
    hourlyBuckets.set(hour, (hourlyBuckets.get(hour) || 0) + 1);
    dailyBuckets.set(day, (dailyBuckets.get(day) || 0) + 1);
  }
  
  // Average changes per hour
  if (hourlyBuckets.size > 0) {
    baselines.averageChangesPerHour = 
      Array.from(hourlyBuckets.values()).reduce((a, b) => a + b, 0) / hourlyBuckets.size;
  }
  
  // Average changes per day
  if (dailyBuckets.size > 0) {
    baselines.averageChangesPerDay = 
      Array.from(dailyBuckets.values()).reduce((a, b) => a + b, 0) / dailyBuckets.size;
  }
  
  // Peak activity hours (top 3)
  baselines.peakActivityHours = Array.from(hourlyBuckets.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => hour);
  
  // === ROLE-SPECIFIC PATTERNS ===
  const trainerChanges = roleArchive.changes.filter(c => 
    c.roleName && c.roleName.toLowerCase() === 'trainer'
  );
  
  if (dailyBuckets.size > 0) {
    baselines.trainerRoleAdditionsPerDay = 
      trainerChanges.filter(c => c.type === 'addition').length / dailyBuckets.size;
    
    baselines.trainerRoleRemovalsPerDay = 
      trainerChanges.filter(c => c.type === 'removal').length / dailyBuckets.size;
  }
  
  // Most active roles (top 5)
  const roleFrequency = new Map<string, number>();
  for (const change of roleArchive.changes) {
    const key = `${change.roleId}:${change.roleName}`;
    roleFrequency.set(key, (roleFrequency.get(key) || 0) + 1);
  }
  
  baselines.mostActiveRoles = Array.from(roleFrequency.entries())
    .map(([key, count]) => {
      const [roleId, roleName] = key.split(':');
      return { roleId, roleName, changeCount: count };
    })
    .sort((a, b) => b.changeCount - a.changeCount)
    .slice(0, 5);
  
  // === MEMBER-SPECIFIC PATTERNS ===
  const memberChangeCounts = new Map<string, number>();
  for (const change of roleArchive.changes) {
    memberChangeCounts.set(change.memberId, 
      (memberChangeCounts.get(change.memberId) || 0) + 1
    );
  }
  
  const changeCounts = Array.from(memberChangeCounts.values());
  if (changeCounts.length > 0) {
    baselines.averageChangesPerMember = 
      changeCounts.reduce((a, b) => a + b, 0) / changeCounts.length;
    
    baselines.maxChangesPerMember = Math.max(...changeCounts);
    
    // Rapid change threshold (95th percentile)
    changeCounts.sort((a, b) => a - b);
    const p95Index = Math.floor(changeCounts.length * 0.95);
    baselines.rapidChangeThreshold = changeCounts[p95Index] || 5;
  }
  
  // === ORIGIN PATTERNS ===
  for (const change of roleArchive.changes) {
    const origin = change.origin || 'unknown';
    baselines.changesByOrigin[origin] = (baselines.changesByOrigin[origin] || 0) + 1;
  }
  
  // Filter expected origins: ≥2% of changes
  const totalChanges = roleArchive.changes.length;
  const minOccurrences = Math.max(1, Math.ceil(totalChanges * 0.02));
  baselines.expectedOrigins = Object.entries(baselines.changesByOrigin)
    .filter(([, count]) => count >= minOccurrences)
    .map(([origin]) => origin);
  
  // Record computation time
  baselines.computationTimeMs = Date.now() - startTime;
  
  logger.info('security-state', 'init', '[SecurityBaselines] Generated baselines', {
    durationMs: baselines.computationTimeMs,
    metadata: {
      dataPoints: baselines.dataPointCount,
      confidence: baselines.confidenceLevel.toFixed(2),
      peakHours: baselines.peakActivityHours,
      avgChangesPerDay: baselines.averageChangesPerDay.toFixed(1)
    }
  });
  
  return baselines;
}

// ─────────────────────────────────────────────────────────────────────────────
// Database Persistence (Database-First Architecture 2025-12-27)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load baselines from database with signature verification
 */
export async function loadSecurityBaselines(): Promise<FullSecurityBaselines | null> {
  try {
    const entry = await prisma.cacheEntry.findUnique({
      where: { key: BASELINES_KEY },
    });
    
    if (!entry) {
      logger.debug('security-state', 'load', '[SecurityBaselines] No baselines found in database (first run)');
      return null;
    }
    
    const data = entry.value as unknown as BaselineFileData;
    
    // Verify HMAC signature
    if (data.signature) {
      const { signature, ...baselineData } = data;
      const dataString = JSON.stringify(baselineData);
      
      if (!verifySignature(dataString, signature)) {
        logger.error('security-state', 'security', '[SecurityBaselines] 🚨 SECURITY ALERT: Baseline signature verification FAILED!', {
          metadata: { key: BASELINES_KEY }
        });
        return null;
      }
      
      logger.debug('security-state', 'load', '[SecurityBaselines] ✅ Loaded baselines with valid signature', {
        metadata: {
          computedAt: baselineData.baselines?.computedAt,
          confidence: baselineData.baselines?.confidenceLevel
        }
      });
      
      return baselineData.baselines;
    } else {
      logger.warn('security-state', 'warning', '[SecurityBaselines] Baseline data has no signature (legacy format)');
      return data.baselines || null;
    }
  } catch (err) {
    const error = ensureError(err);
    logger.error('security-state', 'load', '[SecurityBaselines] Failed to load baselines', { metadata: { errorMsg: error.message } });
    return null;
  }
}

/**
 * Save baselines to database with HMAC signature
 */
export async function saveSecurityBaselines(baselines: FullSecurityBaselines): Promise<boolean> {
  try {
    const data: Omit<BaselineFileData, 'signature'> = {
      baselines,
      metadata: {
        savedAt: new Date().toISOString(),
        schemaVersion: '1.0.0'
      }
    };
    
    // Generate HMAC signature
    const dataString = JSON.stringify(data);
    const signature = generateSignature(dataString);
    
    const signedData: BaselineFileData = {
      ...data,
      signature
    };
    
    const jsonSize = JSON.stringify(signedData).length;
    
    // Save to database
    await prisma.cacheEntry.upsert({
      where: { key: BASELINES_KEY },
      update: {
        value: signedData as object,
        sizeBytes: jsonSize,
        updatedAt: new Date(),
      },
      create: {
        key: BASELINES_KEY,
        namespace: BASELINES_NAMESPACE,
        value: signedData as object,
        sizeBytes: jsonSize,
      },
    });
    
    logger.info('security-state', 'save', '[SecurityBaselines] ✅ Saved baselines with signature', {
      metadata: {
        key: BASELINES_KEY,
        confidence: baselines.confidenceLevel.toFixed(2),
        dataPoints: baselines.dataPointCount
      }
    });
    
    return true;
  } catch (err) {
    const error = ensureError(err);
    logger.error('security-state', 'save', '[SecurityBaselines] Failed to save baselines', { metadata: { errorMsg: error.message } });
    return false;
  }
}

/**
 * Check if baselines need refresh
 */
export function shouldRefreshBaselines(baselines: FullSecurityBaselines | null): boolean {
  if (!baselines) return true;
  
  // Refresh if older than 24 hours
  const ageMs = Date.now() - new Date(baselines.computedAt).getTime();
  const maxAgeMs = 24 * 60 * 60 * 1000;
  
  if (ageMs > maxAgeMs) {
    logger.debug('security-state', 'verify', '[SecurityBaselines] Baselines expired (>24h), refresh needed');
    return true;
  }
  
  // Refresh if confidence too low
  if (baselines.confidenceLevel < CONFIDENCE_THRESHOLD) {
    logger.debug('security-state', 'verify', '[SecurityBaselines] Low confidence baseline, refresh needed');
    return true;
  }
  
  return false;
}
