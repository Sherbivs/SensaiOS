/**
 * @file Threat Detection Engine
 * @description Detects security threats by comparing current activity to baselines
 * @module bot/state/threatDetector
 * 
 * IMPLEMENTATION: Archive Intelligence System - Phase 2
 * TEAM: Security Specialist
 * REFERENCE: docs/SECURITY-ARCHIVE-INTELLIGENCE.md
 * 
 * THREAT PATTERNS DETECTED:
 * 1. Rapid Role Changes (Privilege Escalation)
 * 2. Unusual Origin (Compromised Access)
 * 3. Mass Role Removal (Sabotage/Impact)
 * 4. Off-Hours Activity (Unauthorized Access)
 * 5. Single Member Anomaly (Compromised Account)
 * 
 * MITRE ATT&CK MAPPING:
 * - T1098.003: Add Office 365 Global Administrator Role
 * - T1078: Valid Accounts (Compromised)
 * - T1531: Account Access Removal
 * - T1098: Account Manipulation
 * - T1078.001: Default Accounts
 */

import { log } from '../../utils/logger.js';

/**
 * Detect security threats by comparing current activity to baselines
 * 
 * @param {Object} currentActivity - Current activity metrics
 * @param {number} currentActivity.changesInLast5Minutes - Recent change count
 * @param {number} currentActivity.removalsInLastHour - Recent removal count
 * @param {number} currentActivity.changesInLastHour - Hourly change count
 * @param {string} currentActivity.origin - Source of changes
 * @param {number} currentActivity.maxChangesPerMemberInLastHour - Max per member
 * @param {string} currentActivity.suspectMemberId - Member with max changes
 * 
 * @param {Object} baselines - Security baselines from generateSecurityBaselines()
 * @returns {Object} Threat assessment with detected threats
 */
export function detectSecurityThreats(currentActivity, baselines) {
  const threats = [];
  const currentHour = new Date().getHours();
  
  // Skip detection if baseline confidence too low
  if (baselines.confidenceLevel < 0.5) {
    log('detail', '[ThreatDetector] Low baseline confidence, skipping detection', {
      confidence: baselines.confidenceLevel
    });
    return {
      hasThreats: false,
      threatCount: 0,
      maxSeverity: 0,
      threats: [],
      assessmentTime: new Date().toISOString(),
      baselineConfidence: baselines.confidenceLevel,
      reason: 'LOW_CONFIDENCE_BASELINE'
    };
  }
  
  // THREAT 1: Rapid Role Changes (Privilege Escalation Attempt)
  if (currentActivity.changesInLast5Minutes > baselines.rapidChangeThreshold) {
    threats.push({
      type: 'rapid_role_changes',
      severity: 'CRITICAL',
      confidence: 0.95,
      description: `${currentActivity.changesInLast5Minutes} role changes in 5 minutes (baseline: ${baselines.rapidChangeThreshold})`,
      evidence: {
        currentRate: currentActivity.changesInLast5Minutes,
        baselineThreshold: baselines.rapidChangeThreshold,
        deviation: currentActivity.changesInLast5Minutes - baselines.rapidChangeThreshold,
        deviationPercent: Math.round(((currentActivity.changesInLast5Minutes - baselines.rapidChangeThreshold) / baselines.rapidChangeThreshold) * 100)
      },
      recommendedAction: 'AUTO_REVERT + DRIP_ALERT + FORENSIC_LOG',
      mitreAttack: 'T1098.003 - Add Office 365 Global Administrator Role',
      detectedAt: new Date().toISOString()
    });
  }
  
  // THREAT 2: Unusual Origin (Unauthorized Access Method)
  if (currentActivity.origin && 
      baselines.expectedOrigins.length > 0 && 
      !baselines.expectedOrigins.includes(currentActivity.origin)) {
    threats.push({
      type: 'unknown_change_origin',
      severity: 'HIGH',
      confidence: 0.80,
      description: `Role change from unexpected origin: ${currentActivity.origin}`,
      evidence: {
        origin: currentActivity.origin,
        expectedOrigins: baselines.expectedOrigins,
        isNewOrigin: true
      },
      recommendedAction: 'ALERT_ADMINS + LOG_FOR_REVIEW',
      mitreAttack: 'T1078 - Valid Accounts (Compromised)',
      detectedAt: new Date().toISOString()
    });
  }
  
  // THREAT 3: Mass Role Removal (Impact/Sabotage)
  const expectedRemovalsPerHour = baselines.trainerRoleRemovalsPerDay / 24;
  if (expectedRemovalsPerHour > 0 && 
      currentActivity.removalsInLastHour > (expectedRemovalsPerHour * 10)) {
    threats.push({
      type: 'mass_role_removal',
      severity: 'CRITICAL',
      confidence: 0.90,
      description: `${currentActivity.removalsInLastHour} role removals in 1 hour (baseline: ${expectedRemovalsPerHour.toFixed(1)})`,
      evidence: {
        currentRemovalRate: currentActivity.removalsInLastHour,
        baselineRate: expectedRemovalsPerHour,
        deviationMultiplier: (currentActivity.removalsInLastHour / expectedRemovalsPerHour).toFixed(1)
      },
      recommendedAction: 'EMERGENCY_ALERT + AUTO_REVERT_ALL + FREEZE_PERMISSIONS',
      mitreAttack: 'T1531 - Account Access Removal',
      detectedAt: new Date().toISOString()
    });
  }
  
  // THREAT 4: Off-Hours Activity (Unauthorized Access)
  if (baselines.peakActivityHours.length > 0 &&
      !baselines.peakActivityHours.includes(currentHour) && 
      currentActivity.changesInLastHour > (baselines.averageChangesPerHour * 3)) {
    threats.push({
      type: 'off_hours_activity',
      severity: 'MEDIUM',
      confidence: 0.70,
      description: `High activity at ${currentHour}:00 (off-peak hours)`,
      evidence: {
        currentHour,
        peakHours: baselines.peakActivityHours,
        activityLevel: currentActivity.changesInLastHour,
        baselineActivity: baselines.averageChangesPerHour,
        activityMultiplier: (currentActivity.changesInLastHour / baselines.averageChangesPerHour).toFixed(1)
      },
      recommendedAction: 'MONITOR_CLOSELY + LOG_FOR_REVIEW',
      mitreAttack: 'T1098 - Account Manipulation (Outside Business Hours)',
      detectedAt: new Date().toISOString()
    });
  }
  
  // THREAT 5: Single Member Mass Changes (Compromised Account)
  if (currentActivity.maxChangesPerMemberInLastHour > baselines.maxChangesPerMember &&
      baselines.maxChangesPerMember > 0) {
    threats.push({
      type: 'single_member_anomaly',
      severity: 'HIGH',
      confidence: 0.85,
      description: `Member ${currentActivity.suspectMemberId} had ${currentActivity.maxChangesPerMemberInLastHour} role changes (historical max: ${baselines.maxChangesPerMember})`,
      evidence: {
        memberId: currentActivity.suspectMemberId,
        currentChanges: currentActivity.maxChangesPerMemberInLastHour,
        historicalMax: baselines.maxChangesPerMember,
        deviation: currentActivity.maxChangesPerMemberInLastHour - baselines.maxChangesPerMember
      },
      recommendedAction: 'VERIFY_MEMBER_IDENTITY + LOG_FOR_REVIEW',
      mitreAttack: 'T1078.001 - Default Accounts',
      detectedAt: new Date().toISOString()
    });
  }
  
  // Calculate max severity level
  const maxSeverity = Math.max(
    ...threats.map(t => 
      t.severity === 'CRITICAL' ? 3 : 
      t.severity === 'HIGH' ? 2 : 
      t.severity === 'MEDIUM' ? 1 : 0
    ),
    0  // Default if no threats
  );
  
  if (threats.length > 0) {
    log('warn', '[ThreatDetector] ⚠️ Security threats detected', {
      threatCount: threats.length,
      maxSeverity: ['NONE', 'MEDIUM', 'HIGH', 'CRITICAL'][maxSeverity],
      types: threats.map(t => t.type)
    });
  }
  
  return {
    hasThreats: threats.length > 0,
    threatCount: threats.length,
    maxSeverity,
    threats,
    assessmentTime: new Date().toISOString(),
    baselineConfidence: baselines.confidenceLevel
  };
}

/**
 * Calculate current activity metrics from recent changes
 * Used to feed into detectSecurityThreats()
 * 
 * @param {Array} recentChanges - Recent role changes (last hour)
 * @param {Object} _roleArchive - Full role archive for context (reserved for future use)
 * @returns {Object} Current activity metrics
 */
export function calculateCurrentActivity(recentChanges, _roleArchive) {
  const now = Date.now();
  const fiveMinutesAgo = now - (5 * 60 * 1000);
  const oneHourAgo = now - (60 * 60 * 1000);
  
  // Filter changes by time windows
  const last5Minutes = recentChanges.filter(c => 
    new Date(c.timestamp).getTime() > fiveMinutesAgo
  );
  
  const lastHour = recentChanges.filter(c => 
    new Date(c.timestamp).getTime() > oneHourAgo
  );
  
  // Count removals
  const removalsInLastHour = lastHour.filter(c => c.type === 'removal').length;
  
  // Find member with most changes in last hour
  const memberChangeCounts = new Map();
  for (const change of lastHour) {
    memberChangeCounts.set(change.memberId, 
      (memberChangeCounts.get(change.memberId) || 0) + 1
    );
  }
  
  let maxChangesPerMemberInLastHour = 0;
  let suspectMemberId = null;
  
  for (const [memberId, count] of memberChangeCounts.entries()) {
    if (count > maxChangesPerMemberInLastHour) {
      maxChangesPerMemberInLastHour = count;
      suspectMemberId = memberId;
    }
  }
  
  // Get most recent origin (assume all recent changes from same origin)
  const origin = last5Minutes.length > 0 
    ? last5Minutes[last5Minutes.length - 1].origin 
    : (lastHour.length > 0 ? lastHour[lastHour.length - 1].origin : 'unknown');
  
  return {
    changesInLast5Minutes: last5Minutes.length,
    changesInLastHour: lastHour.length,
    removalsInLastHour,
    maxChangesPerMemberInLastHour,
    suspectMemberId,
    origin,
    timestamp: new Date().toISOString()
  };
}

/**
 * Get severity color for display
 * @param {string} severity - Threat severity level
 * @returns {string} Emoji/color indicator
 */
export function getSeverityIndicator(severity) {
  switch (severity) {
    case 'CRITICAL': return '🔴';
    case 'HIGH': return '🟠';
    case 'MEDIUM': return '🟡';
    case 'LOW': return '🔵';
    default: return '⚪';
  }
}
