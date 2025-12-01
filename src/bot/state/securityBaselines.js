/**
 * @file Security Baselines Module
 * @description Generates behavioral baselines from role archive for threat detection
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
 * SECURITY:
 * - HMAC-SHA256 signatures on baseline files
 * - Tamper detection via signature verification
 * - Confidence scoring based on data volume
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { log } from '../../utils/logger.js';

// Storage configuration
const BASELINE_DIR = process.env.RENDER 
  ? '/Store/security-bot-state'
  : './Store/security-bot-state';
const BASELINE_FILE = path.join(BASELINE_DIR, 'baselines.json');

// HMAC security
const HMAC_ALGORITHM = 'sha256';
const HMAC_SECRET = process.env.ARCHIVE_HMAC_SECRET || 'default-dev-secret-CHANGE-IN-PRODUCTION';

// Baseline configuration
const MIN_DATA_POINTS = 200;  // Minimum changes for high confidence
const CONFIDENCE_THRESHOLD = 0.7;  // Minimum confidence for threat detection

/**
 * Generate HMAC-SHA256 signature for baseline data
 * @param {string} data - JSON stringified baseline data
 * @returns {string} Hex-encoded signature
 */
function generateSignature(data) {
  return crypto.createHmac(HMAC_ALGORITHM, HMAC_SECRET)
    .update(data)
    .digest('hex');
}

/**
 * Verify baseline signature
 * @param {string} data - JSON stringified baseline data
 * @param {string} signature - Expected signature
 * @returns {boolean} True if valid
 */
function verifySignature(data, signature) {
  try {
    const expectedSignature = generateSignature(data);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (err) {
    log('warn', '[SecurityBaselines] Signature verification failed', { error: err.message });
    return false;
  }
}

/**
 * Generate security baselines from role archive
 * Analyzes last 500 role changes to establish normal patterns
 * 
 * @param {Object} roleArchive - Role archive data from roleArchive.js
 * @returns {Object} Security baselines with confidence scoring
 */
export function generateSecurityBaselines(roleArchive) {
  const startTime = Date.now();
  
  if (!roleArchive || !roleArchive.changes || roleArchive.changes.length === 0) {
    log('warn', '[SecurityBaselines] No archive data available for baseline generation');
    return createEmptyBaselines();
  }
  
  const baselines = {
    // Temporal patterns
    averageChangesPerHour: 0,
    averageChangesPerDay: 0,
    peakActivityHours: [],  // Top 3 hours by activity
    
    // Role-specific patterns
    trainerRoleAdditionsPerDay: 0,
    trainerRoleRemovalsPerDay: 0,
    mostActiveRoles: [],  // Top 5 roles by change frequency
    
    // Member-specific patterns
    averageChangesPerMember: 0,
    maxChangesPerMember: 0,
    rapidChangeThreshold: 0,  // 95th percentile
    
    // Origin patterns
    changesByOrigin: {},  // { 'member-join': 120, 'sweep': 30, ... }
    expectedOrigins: [],  // Whitelist of normal sources
    
    // Metadata
    computedAt: new Date().toISOString(),
    dataPointCount: roleArchive.changes.length,
    confidenceLevel: 0,  // 0-1 scale
    computationTimeMs: 0
  };
  
  // Calculate confidence level (need 200+ data points for high confidence)
  baselines.confidenceLevel = Math.min(roleArchive.changes.length / MIN_DATA_POINTS, 1.0);
  
  // === TEMPORAL ANALYSIS ===
  const hourlyBuckets = new Map();  // hour -> count
  const dailyBuckets = new Map();   // date -> count
  
  for (const change of roleArchive.changes) {
    const timestamp = new Date(change.timestamp);
    const hour = timestamp.getHours();
    const day = timestamp.toISOString().split('T')[0];
    
    hourlyBuckets.set(hour, (hourlyBuckets.get(hour) || 0) + 1);
    dailyBuckets.set(day, (dailyBuckets.get(day) || 0) + 1);
  }
  
  // Average changes per hour (across all 24 hours)
  if (hourlyBuckets.size > 0) {
    baselines.averageChangesPerHour = 
      Array.from(hourlyBuckets.values()).reduce((a, b) => a + b, 0) / hourlyBuckets.size;
  }
  
  // Average changes per day
  if (dailyBuckets.size > 0) {
    baselines.averageChangesPerDay = 
      Array.from(dailyBuckets.values()).reduce((a, b) => a + b, 0) / dailyBuckets.size;
  }
  
  // Peak activity hours (top 3 hours)
  baselines.peakActivityHours = Array.from(hourlyBuckets.entries())
    .sort((a, b) => b[1] - a[1])  // Sort by count descending
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
  
  // Most active roles (top 5 by change count)
  const roleFrequency = new Map();
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
  const memberChangeCounts = new Map();  // memberId -> count
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
    baselines.rapidChangeThreshold = changeCounts[p95Index] || 5;  // Default to 5
  }
  
  // === ORIGIN PATTERNS ===
  for (const change of roleArchive.changes) {
    const origin = change.origin || 'unknown';
    baselines.changesByOrigin[origin] = (baselines.changesByOrigin[origin] || 0) + 1;
  }
  
  baselines.expectedOrigins = Object.keys(baselines.changesByOrigin);
  
  // Record computation time
  baselines.computationTimeMs = Date.now() - startTime;
  
  log('info', '[SecurityBaselines] Generated baselines', {
    dataPoints: baselines.dataPointCount,
    confidence: baselines.confidenceLevel.toFixed(2),
    computationTimeMs: baselines.computationTimeMs,
    peakHours: baselines.peakActivityHours,
    avgChangesPerDay: baselines.averageChangesPerDay.toFixed(1)
  });
  
  return baselines;
}

/**
 * Load baselines from disk with signature verification
 * @returns {Promise<Object|null>} Baselines or null if not found/invalid
 */
export async function loadSecurityBaselines() {
  try {
    const fileContent = await fs.readFile(BASELINE_FILE, 'utf8');
    const data = JSON.parse(fileContent);
    
    // Verify HMAC signature
    if (data.signature) {
      const { signature, ...baselineData } = data;
      const dataString = JSON.stringify(baselineData);
      
      if (!verifySignature(dataString, signature)) {
        log('error', '[SecurityBaselines] 🚨 SECURITY ALERT: Baseline signature verification FAILED!', {
          file: BASELINE_FILE
        });
        return null;
      }
      
      log('detail', '[SecurityBaselines] ✅ Loaded baselines with valid signature', {
        computedAt: baselineData.baselines?.computedAt,
        confidence: baselineData.baselines?.confidenceLevel
      });
      
      return baselineData.baselines;
    } else {
      log('warn', '[SecurityBaselines] Baseline file has no signature (legacy format)');
      return data.baselines || null;
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      log('detail', '[SecurityBaselines] No baseline file found (first run)');
      return null;
    }
    
    log('error', '[SecurityBaselines] Failed to load baselines', { error: err.message });
    return null;
  }
}

/**
 * Save baselines to disk with HMAC signature
 * @param {Object} baselines - Baseline data to save
 * @returns {Promise<boolean>} Success status
 */
export async function saveSecurityBaselines(baselines) {
  try {
    // Ensure directory exists
    await fs.mkdir(BASELINE_DIR, { recursive: true });
    
    const data = {
      baselines,
      metadata: {
        savedAt: new Date().toISOString(),
        schemaVersion: '1.0.0'
      }
    };
    
    // Generate HMAC signature
    const dataString = JSON.stringify(data);
    const signature = generateSignature(dataString);
    
    const signedData = {
      ...data,
      signature
    };
    
    // Write to disk
    await fs.writeFile(BASELINE_FILE, JSON.stringify(signedData, null, 2), 'utf8');
    
    log('info', '[SecurityBaselines] ✅ Saved baselines with signature', {
      file: BASELINE_FILE,
      confidence: baselines.confidenceLevel.toFixed(2),
      dataPoints: baselines.dataPointCount
    });
    
    return true;
  } catch (err) {
    log('error', '[SecurityBaselines] Failed to save baselines', { error: err.message });
    return false;
  }
}

/**
 * Check if baselines need refresh
 * @param {Object|null} baselines - Current baselines
 * @returns {boolean} True if refresh needed
 */
export function shouldRefreshBaselines(baselines) {
  if (!baselines) return true;
  
  // Refresh if older than 24 hours
  const ageMs = Date.now() - new Date(baselines.computedAt).getTime();
  const maxAgeMs = 24 * 60 * 60 * 1000;  // 24 hours
  
  if (ageMs > maxAgeMs) {
    log('detail', '[SecurityBaselines] Baselines expired (>24h), refresh needed');
    return true;
  }
  
  // Refresh if confidence too low
  if (baselines.confidenceLevel < CONFIDENCE_THRESHOLD) {
    log('detail', '[SecurityBaselines] Low confidence baseline, refresh needed');
    return true;
  }
  
  return false;
}

/**
 * Create empty baseline structure
 * @private
 */
function createEmptyBaselines() {
  return {
    averageChangesPerHour: 0,
    averageChangesPerDay: 0,
    peakActivityHours: [],
    trainerRoleAdditionsPerDay: 0,
    trainerRoleRemovalsPerDay: 0,
    mostActiveRoles: [],
    averageChangesPerMember: 0,
    maxChangesPerMember: 0,
    rapidChangeThreshold: 5,  // Safe default
    changesByOrigin: {},
    expectedOrigins: [],
    computedAt: new Date().toISOString(),
    dataPointCount: 0,
    confidenceLevel: 0,
    computationTimeMs: 0
  };
}
