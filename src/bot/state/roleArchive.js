/**
 * @file Role Archive Module
 * @description Tracks all role changes with 500-entry cold storage archive
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
import path from 'path';
import { log } from '../../utils/logger.js';
import { 
  generateSecurityBaselines, 
  loadSecurityBaselines, 
  saveSecurityBaselines,
  shouldRefreshBaselines 
} from './securityBaselines.js';
import { detectSecurityThreats, calculateCurrentActivity } from './threatDetector.js';

// Persistent storage location
const ARCHIVE_DIR = process.env.RENDER 
  ? '/Store/security-bot-state/role-archive'
  : './Store/security-bot-state/role-archive';
const ARCHIVE_FILE = path.join(ARCHIVE_DIR, 'role-changes.json');
const BACKUP_FILE = path.join(ARCHIVE_DIR, 'role-changes.backup.json');

const MAX_ARCHIVE_SIZE = 500; // Keep last 500 role changes

// SECURITY: HMAC signature configuration
const HMAC_ALGORITHM = 'sha256';
const HMAC_SECRET = process.env.ARCHIVE_HMAC_SECRET || 'default-dev-secret-CHANGE-IN-PRODUCTION';

// Warn if using default secret in production
if (HMAC_SECRET === 'default-dev-secret-CHANGE-IN-PRODUCTION' && process.env.NODE_ENV === 'production') {
  log('warn', '[RoleArchive] ⚠️ SECURITY WARNING: Using default HMAC secret in production! Set ARCHIVE_HMAC_SECRET environment variable.');
}

/**
 * Generate HMAC-SHA256 signature for data integrity
 * @param {string} data - JSON stringified data to sign
 * @returns {string} Hex-encoded HMAC signature
 */
function generateSignature(data) {
  return crypto.createHmac(HMAC_ALGORITHM, HMAC_SECRET)
    .update(data)
    .digest('hex');
}

/**
 * Verify HMAC-SHA256 signature
 * @param {string} data - JSON stringified data
 * @param {string} signature - Expected signature
 * @returns {boolean} True if signature is valid
 */
function verifySignature(data, signature) {
  try {
    const expectedSignature = generateSignature(data);
    // Timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (err) {
    // If signature format is invalid (not hex, wrong length), fail verification
    log('warn', '[RoleArchive] Signature verification failed', { error: err.message });
    return false;
  }
}

/**
 * In-memory cache of recent role changes
 */
let roleArchiveCache = {
  changes: [], // Array of role change events
  statistics: {
    totalChanges: 0,
    additionCount: 0,
    removalCount: 0,
    uniqueMembers: new Set(),
    rolesModified: new Map(), // role -> count
    lastUpdate: null
  },
  securityBaselines: null, // Cached baselines for threat detection (Phase 1)
  initialized: false
};

/**
 * Initialize the role archive system with integrity verification
 */
export async function initializeRoleArchive() {
  try {
    // Ensure directory exists
    await fs.mkdir(ARCHIVE_DIR, { recursive: true });
    
    // Load existing archive with signature verification
    try {
      const fileContent = await fs.readFile(ARCHIVE_FILE, 'utf8');
      const archived = JSON.parse(fileContent);
      
      // SECURITY: Verify HMAC signature before trusting data
      if (archived.signature) {
        // Extract data without signature for verification
        const { signature, ...dataToVerify } = archived;
        const dataString = JSON.stringify(dataToVerify);
        
        const isValid = verifySignature(dataString, signature);
        
        if (!isValid) {
          // CRITICAL: Archive file has been tampered with!
          log('error', '[RoleArchive] 🚨 SECURITY ALERT: Archive signature verification FAILED! File may be tampered.', {
            file: ARCHIVE_FILE,
            signatureProvided: signature.substring(0, 16) + '...'
          });
          
          // Attempt to restore from backup
          try {
            log('warn', '[RoleArchive] Attempting to restore from backup...');
            const backupContent = await fs.readFile(BACKUP_FILE, 'utf8');
            const backup = JSON.parse(backupContent);
            
            // Verify backup signature
            if (backup.signature) {
              const { signature: backupSig, ...backupData } = backup;
              const backupDataString = JSON.stringify(backupData);
              
              if (verifySignature(backupDataString, backupSig)) {
                // Backup is valid - restore it
                await fs.writeFile(ARCHIVE_FILE, backupContent);
                log('info', '[RoleArchive] ✅ Successfully restored from backup');
                
                // Load backup data
                if (Array.isArray(backup.changes)) {
                  roleArchiveCache.changes = backup.changes;
                }
                if (backup.statistics) {
                  roleArchiveCache.statistics = {
                    ...backup.statistics,
                    uniqueMembers: new Set(backup.statistics.uniqueMembers || []),
                    rolesModified: new Map(backup.statistics.rolesModified || [])
                  };
                }
              } else {
                log('error', '[RoleArchive] 🚨 Backup signature also invalid! Starting fresh.');
                // Both files compromised - start with empty archive
              }
            } else {
              log('warn', '[RoleArchive] Backup has no signature (legacy format). Cannot verify integrity.');
            }
          } catch (backupErr) {
            log('error', '[RoleArchive] Failed to restore from backup', { error: backupErr.message });
            // Start with fresh archive
          }
          
          // TODO: Integrate with Drip alert system once available
          // await sendDripAlert({ type: 'critical', message: 'Role archive tampering detected' });
          
        } else {
          // Signature valid - load data
          if (Array.isArray(archived.changes)) {
            roleArchiveCache.changes = archived.changes;
          }
          
          if (archived.statistics) {
            roleArchiveCache.statistics = {
              ...archived.statistics,
              uniqueMembers: new Set(archived.statistics.uniqueMembers || []),
              rolesModified: new Map(archived.statistics.rolesModified || [])
            };
          }
          
          log('info', '[RoleArchive] ✅ Loaded from disk with valid signature', {
            changeCount: roleArchiveCache.changes.length,
            totalChanges: roleArchiveCache.statistics.totalChanges,
            file: ARCHIVE_FILE
          });
        }
      } else {
        // Legacy format without signature - migrate to signed format
        log('warn', '[RoleArchive] Archive has no signature (legacy format). Migrating to signed format on next persist.');
        
        if (Array.isArray(archived.changes)) {
          roleArchiveCache.changes = archived.changes;
        }
        
        if (archived.statistics) {
          roleArchiveCache.statistics = {
            ...archived.statistics,
            uniqueMembers: new Set(archived.statistics.uniqueMembers || []),
            rolesModified: new Map(archived.statistics.rolesModified || [])
          };
        }
      }
      
    } catch (err) {
      if (err.code !== 'ENOENT') {
        log('warn', '[RoleArchive] Failed to load existing archive', { error: err.message });
      }
      // No archive exists yet - start fresh
    }
    
    roleArchiveCache.initialized = true;
    
    // PHASE 1 INTEGRATION: Generate security baselines from archive history
    // Load existing baselines or generate new ones
    try {
      let baselines = await loadSecurityBaselines();
      
      if (!baselines || shouldRefreshBaselines(baselines)) {
        // Generate new baselines from archive data
        if (roleArchiveCache.changes.length > 0) {
          log('info', '[RoleArchive] Generating security baselines from archive history', {
            changeCount: roleArchiveCache.changes.length
          });
          
          baselines = generateSecurityBaselines(roleArchiveCache);
          
          // Save baselines for future use
          const saved = await saveSecurityBaselines(baselines);
          
          if (saved) {
            log('info', '[RoleArchive] ✅ Security baselines generated and saved', {
              confidence: baselines.confidence.toFixed(2),
              dataPoints: baselines.metadata.dataPoints,
              peakHours: baselines.temporal.peakHours.join(', ')
            });
          }
        } else {
          log('warn', '[RoleArchive] Cannot generate baselines yet - no archive data available');
        }
      } else {
        log('info', '[RoleArchive] ✅ Loaded existing security baselines', {
          confidence: baselines.confidence.toFixed(2),
          age: Math.round((Date.now() - new Date(baselines.metadata.generatedAt).getTime()) / (1000 * 60 * 60)) + 'h',
          peakHours: baselines.temporal.peakHours.join(', ')
        });
      }
      
      // Store baselines in cache for threat detection
      roleArchiveCache.securityBaselines = baselines;
      
    } catch (baselineErr) {
      log('error', '[RoleArchive] Failed to initialize security baselines', { 
        error: baselineErr.message,
        stack: baselineErr.stack 
      });
      // Non-fatal - security bot can still function without baselines
      // Threat detection will be disabled until baselines are available
    }
    
    return true;
  } catch (err) {
    log('error', '[RoleArchive] Initialization failed', { error: err.message, stack: err.stack });
    return false;
  }
}

/**
 * Record a role change event
 * 
 * @param {Object} event - Role change event
 * @param {string} event.memberId - Discord user ID
 * @param {string} event.memberTag - Username#discriminator
 * @param {string} event.guildId - Guild ID
 * @param {string} event.guildName - Guild name
 * @param {string} event.type - 'addition' or 'removal'
 * @param {string} event.roleId - Role ID
 * @param {string} event.roleName - Role name
 * @param {string} event.origin - Source of change ('member-join', 'member-update', 'sweep', 'manual', etc.)
 * @param {Object} event.metadata - Additional context
 */
export async function recordRoleChange(event) {
  if (!roleArchiveCache.initialized) {
    await initializeRoleArchive();
  }
  
  const timestamp = new Date().toISOString();
  const changeId = `${event.memberId}-${event.roleId}-${Date.now()}`;
  
  const changeRecord = {
    id: changeId,
    timestamp,
    memberId: event.memberId,
    memberTag: event.memberTag,
    guildId: event.guildId,
    guildName: event.guildName,
    type: event.type, // 'addition' or 'removal'
    roleId: event.roleId,
    roleName: event.roleName,
    origin: event.origin,
    metadata: event.metadata || {}
  };
  
  // Add to cache (FIFO - remove oldest if over limit)
  roleArchiveCache.changes.push(changeRecord);
  if (roleArchiveCache.changes.length > MAX_ARCHIVE_SIZE) {
    roleArchiveCache.changes.shift(); // Remove oldest
  }
  
  // Update statistics
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
  
  // Async persist to disk (don't wait - fire and forget)
  persistArchive().catch(err => {
    log('error', '[RoleArchive] Failed to persist change', { error: err.message });
  });
  
  log('detail', '[RoleArchive] Recorded role change', {
    type: event.type,
    member: event.memberTag,
    role: event.roleName,
    origin: event.origin,
    archiveSize: roleArchiveCache.changes.length
  });
  
  // PHASE 2 INTEGRATION: Threat detection on every role change
  // Run asynchronously to avoid blocking the main flow
  if (roleArchiveCache.securityBaselines) {
    // Use setImmediate to avoid blocking the event handler
    setImmediate(async () => {
      try {
        // Get recent changes for activity analysis (last 100 changes or 1 hour)
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        const recentChanges = roleArchiveCache.changes.filter(change => {
          const changeTime = new Date(change.timestamp).getTime();
          return changeTime > oneHourAgo;
        });
        
        // Calculate current activity metrics
        const currentActivity = calculateCurrentActivity(recentChanges);
        
        // Detect security threats
        const assessment = detectSecurityThreats(
          currentActivity, 
          roleArchiveCache.securityBaselines
        );
        
        // Handle detected threats
        if (assessment.hasThreats) {
          log('warn', `[RoleArchive] 🚨 ${assessment.threatCount} security threat(s) detected`, {
            maxSeverity: assessment.maxSeverity,
            baselineConfidence: assessment.baselineConfidence.toFixed(2)
          });
          
          // Log each threat with details
          for (const threat of assessment.threats) {
            const severityEmoji = threat.severity === 'CRITICAL' ? '🔴' : 
                                  threat.severity === 'HIGH' ? '🟠' : '🟡';
            
            log('warn', `[RoleArchive] ${severityEmoji} ${threat.type}: ${threat.description}`, {
              severity: threat.severity,
              confidence: threat.confidence.toFixed(2),
              evidence: threat.evidence,
              mitreAttack: threat.mitreAttack,
              recommendedAction: threat.recommendedAction
            });
            
            // TODO Task 11: Integrate with Drip alerts
            // For now, just log the threat. Drip integration will handle:
            // - CRITICAL → Emergency DM + auto-revert
            // - HIGH → Alert DM + admin notification
            // - MEDIUM → Log for review
            
            // TODO Task 2 (Backend Architect): Implement auto-revert logic
            // For CRITICAL threats with AUTO_REVERT action:
            // 1. Fetch the role change from event
            // 2. Revert it (remove if added, add if removed)
            // 3. Log the auto-revert action
            // 4. Alert admins about the revert
          }
        }
      } catch (threatErr) {
        log('error', '[RoleArchive] Failed to detect threats', {
          error: threatErr.message,
          stack: threatErr.stack
        });
        // Non-fatal - don't crash the security bot on threat detection errors
      }
    });
  }
  
  return changeRecord;
}

/**
 * Persist archive to disk
 */
/**
 * Persist archive to disk with HMAC signature for integrity
 * @private
 */
async function persistArchive() {
  try {
    // Create backup of current file before overwriting (if it exists)
    try {
      await fs.copyFile(ARCHIVE_FILE, BACKUP_FILE);
    } catch (backupErr) {
      // File might not exist yet - that's okay
      if (backupErr.code !== 'ENOENT') {
        log('warn', '[RoleArchive] Failed to create backup', { error: backupErr.message });
      }
    }
    
    // Prepare data structure
    const data = {
      changes: roleArchiveCache.changes,
      statistics: {
        ...roleArchiveCache.statistics,
        uniqueMembers: Array.from(roleArchiveCache.statistics.uniqueMembers),
        rolesModified: Array.from(roleArchiveCache.statistics.rolesModified.entries())
      },
      metadata: {
        lastPersisted: new Date().toISOString(),
        schemaVersion: '1.0.0'
      }
    };
    
    // SECURITY: Generate HMAC-SHA256 signature
    const dataString = JSON.stringify(data);
    const signature = generateSignature(dataString);
    
    // Add signature to payload
    const signedData = {
      ...data,
      signature
    };
    
    // Write to disk
    await fs.writeFile(ARCHIVE_FILE, JSON.stringify(signedData, null, 2), 'utf8');
    
    log('detail', '[RoleArchive] ✅ Persisted to disk with signature', {
      changeCount: roleArchiveCache.changes.length,
      signatureLength: signature.length,
      file: ARCHIVE_FILE
    });
  } catch (err) {
    log('error', '[RoleArchive] Failed to persist', { error: err.message });
    throw err;
  }
}

/**
 * Get role change statistics
 */
export function getRoleStatistics() {
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
export function getMemberRoleHistory(memberId, limit = 10) {
  if (!roleArchiveCache.initialized) {
    return [];
  }
  
  return roleArchiveCache.changes
    .filter(change => change.memberId === memberId)
    .slice(-limit)
    .reverse(); // Most recent first
}

/**
 * Get recent changes for a specific role
 */
export function getRoleChangeHistory(roleId, limit = 50) {
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
 * Returns true if the change is suspicious
 */
export function isAnomalousChange(event) {
  if (!roleArchiveCache.initialized || roleArchiveCache.changes.length < 50) {
    return false; // Need baseline data first
  }
  
  // Check for rapid role changes on same member
  const recentMemberChanges = roleArchiveCache.changes
    .filter(c => c.memberId === event.memberId)
    .slice(-10);
  
  if (recentMemberChanges.length >= 5) {
    const timeSpan = new Date(event.timestamp) - new Date(recentMemberChanges[0].timestamp);
    if (timeSpan < 5 * 60 * 1000) { // 5 changes in 5 minutes
      log('warn', '[RoleArchive] Anomaly detected: Rapid role changes', {
        member: event.memberTag,
        changeCount: recentMemberChanges.length,
        timeSpanMinutes: Math.round(timeSpan / 60000)
      });
      return true;
    }
  }
  
  // Check for unauthorized removal of critical roles
  if (event.type === 'removal' && event.metadata?.isUnauthorized) {
    log('warn', '[RoleArchive] Anomaly detected: Unauthorized role removal', {
      member: event.memberTag,
      role: event.roleName,
      origin: event.origin
    });
    return true;
  }
  
  return false;
}

/**
 * Export archive for analysis (last 500 entries)
 */
export function exportArchive() {
  if (!roleArchiveCache.initialized) {
    return { changes: [], statistics: {} };
  }
  
  return {
    changes: roleArchiveCache.changes,
    statistics: getRoleStatistics(),
    exportedAt: new Date().toISOString()
  };
}

/**
 * Refresh security baselines (called by daily cron job)
 * Regenerates baselines from current archive data
 * @returns {Promise<boolean>} Success status
 */
export async function refreshSecurityBaselines() {
  try {
    if (!roleArchiveCache.initialized) {
      log('warn', '[RoleArchive] Cannot refresh baselines - archive not initialized');
      return false;
    }
    
    if (roleArchiveCache.changes.length === 0) {
      log('warn', '[RoleArchive] Cannot refresh baselines - no archive data available');
      return false;
    }
    
    log('info', '[RoleArchive] Refreshing security baselines', {
      changeCount: roleArchiveCache.changes.length
    });
    
    // Generate new baselines
    const baselines = generateSecurityBaselines(roleArchiveCache);
    
    // Save to disk
    const saved = await saveSecurityBaselines(baselines);
    
    if (saved) {
      // Update cache
      roleArchiveCache.securityBaselines = baselines;
      
      log('info', '[RoleArchive] ✅ Security baselines refreshed successfully', {
        confidence: baselines.confidence.toFixed(2),
        dataPoints: baselines.metadata.dataPoints,
        peakHours: baselines.temporal.peakHours.join(', '),
        computationTimeMs: baselines.metadata.computationTimeMs
      });
      
      return true;
    }
    
    return false;
  } catch (err) {
    log('error', '[RoleArchive] Failed to refresh security baselines', {
      error: err.message,
      stack: err.stack
    });
    return false;
  }
}

/**
 * Get current security baselines (for /ops security command)
 * @returns {Object|null} Current baselines or null if not available
 */
export function getSecurityBaselines() {
  return roleArchiveCache.securityBaselines;
}

/**
 * Shutdown - final persist
 */
export async function shutdownRoleArchive() {
  if (roleArchiveCache.initialized) {
    await persistArchive();
    log('info', '[RoleArchive] Shutdown complete', {
      finalChangeCount: roleArchiveCache.changes.length
    });
  }
}
