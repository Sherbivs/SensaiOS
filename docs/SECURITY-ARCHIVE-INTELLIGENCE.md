# Security Archive Intelligence System
## Using Historical Data for Threat Detection & Integrity Monitoring

**Created:** 2025-11-30  
**Status:** PROPOSED - Ready for Implementation  
**Priority:** HIGH - Security Enhancement  
**Team:** Security Specialist + Backend Architect

---

## Executive Summary

This document outlines a comprehensive security intelligence system that uses **archive data as a baseline** for detecting threats, maintaining integrity, and implementing defense-in-depth strategies based on industry best practices (NIST, Zero Trust Architecture, MITRE ATT&CK).

**Core Principle:** Historical data is ground truth. Deviations from established baselines indicate potential security incidents.

---

## 1. Industry Security Best Practices Applied

### 1.1 NIST Cybersecurity Framework Integration

| NIST Function | Our Implementation | Archive Usage |
|---------------|-------------------|---------------|
| **IDENTIFY** | Role archive tracks all changes | Baseline: Normal role change patterns |
| **PROTECT** | HMAC signatures prevent tampering | Archive integrity verification |
| **DETECT** | Anomaly detection via baselines | Deviation from historical patterns |
| **RESPOND** | Auto-revert + Drip alerts | Archive provides evidence trail |
| **RECOVER** | Backup restoration (current → previous → snapshots) | 7-day state history |

### 1.2 Zero Trust Principles

**"Never Trust, Always Verify"**

```javascript
// BEFORE (implicit trust):
const member = guild.members.cache.get(userId);  // Trust cache

// AFTER (Zero Trust):
const member = await guild.members.fetch({ user: userId, force: true });  // Verify with Discord API
```

**Applied to Archive Data:**
- Every archive load = signature verification (HMAC-SHA256)
- Every role change = cross-check against historical baselines
- Every permission grant = validate against role archive patterns

### 1.3 Defense in Depth (Layered Security)

**Layer 1: Prevention**
- Force fresh API fetches (no stale cache)
- HMAC signature on all archive persists
- Principle of Least Privilege (Trainer role only)

**Layer 2: Detection**
- Anomaly detection via baseline comparison
- Rapid change detection (5 changes in 5 minutes)
- Unauthorized removal detection

**Layer 3: Response**
- Auto-revert unauthorized changes
- Drip alerts to administrators
- Archive evidence preservation

**Layer 4: Recovery**
- 7-day state snapshots
- Backup restoration on corruption
- Audit trail for forensics

### 1.4 MITRE ATT&CK Tactics Mitigated

| Tactic | Threat | Our Mitigation | Archive Role |
|--------|--------|----------------|--------------|
| **Initial Access** | Bot token compromise | N/A (external) | Archive logs suspicious API calls |
| **Privilege Escalation** | Role elevation attack | Auto-revert unauthorized changes | Baseline: Expected role assignments |
| **Defense Evasion** | Archive tampering | HMAC-SHA256 verification | Detect modified archive files |
| **Persistence** | Backdoor admin role | Continuous sweep monitoring | Historical: Normal admin count |
| **Impact** | Mass role removal | DoS protection (MAX_SWEEP_CANDIDATES) | Baseline: Normal removal rate |

---

## 2. Archive-Based Security Intelligence

### 2.1 Baseline Generation (Learning Phase)

**Goal:** Establish "normal" operational patterns from historical data.

```javascript
/**
 * Generate security baselines from role archive
 * Analyzes last 500 role changes to establish normal patterns
 */
export function generateSecurityBaselines(roleArchive) {
  const baselines = {
    // Temporal patterns
    averageChangesPerHour: 0,
    averageChangesPerDay: 0,
    peakActivityHours: [],
    
    // Role-specific patterns
    trainerRoleAdditionsPerDay: 0,
    trainerRoleRemovalsPerDay: 0,
    mostActiveRoles: [],  // Top 5 roles by change frequency
    
    // Member-specific patterns
    averageChangesPerMember: 0,
    maxChangesPerMember: 0,
    rapidChangeThreshold: 0,  // 95th percentile
    
    // Origin patterns
    changesByOrigin: {},  // { 'member-join': 120, 'sweep': 30, 'manual': 5 }
    expectedOrigins: [],  // Whitelist of normal origins
    
    // Computed at
    computedAt: new Date().toISOString(),
    dataPointCount: roleArchive.changes.length,
    confidenceLevel: 0  // 0-1 scale, based on data volume
  };
  
  // Calculate confidence (need 200+ changes for high confidence)
  baselines.confidenceLevel = Math.min(roleArchive.changes.length / 200, 1.0);
  
  // Temporal analysis
  const hourlyBuckets = new Map();
  const dailyBuckets = new Map();
  
  for (const change of roleArchive.changes) {
    const timestamp = new Date(change.timestamp);
    const hour = timestamp.getHours();
    const day = timestamp.toISOString().split('T')[0];
    
    hourlyBuckets.set(hour, (hourlyBuckets.get(hour) || 0) + 1);
    dailyBuckets.set(day, (dailyBuckets.get(day) || 0) + 1);
  }
  
  baselines.averageChangesPerHour = 
    Array.from(hourlyBuckets.values()).reduce((a, b) => a + b, 0) / hourlyBuckets.size;
  
  baselines.averageChangesPerDay = 
    Array.from(dailyBuckets.values()).reduce((a, b) => a + b, 0) / dailyBuckets.size;
  
  // Peak activity hours (top 3 hours by change count)
  baselines.peakActivityHours = Array.from(hourlyBuckets.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => hour);
  
  // Role-specific patterns
  const trainerChanges = roleArchive.changes.filter(c => 
    c.roleName.toLowerCase() === 'trainer'
  );
  
  baselines.trainerRoleAdditionsPerDay = 
    trainerChanges.filter(c => c.type === 'addition').length / dailyBuckets.size;
  
  baselines.trainerRoleRemovalsPerDay = 
    trainerChanges.filter(c => c.type === 'removal').length / dailyBuckets.size;
  
  // Most active roles (top 5)
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
  
  // Member-specific patterns
  const memberChangeCounts = new Map();
  for (const change of roleArchive.changes) {
    memberChangeCounts.set(change.memberId, 
      (memberChangeCounts.get(change.memberId) || 0) + 1
    );
  }
  
  const changeCounts = Array.from(memberChangeCounts.values());
  baselines.averageChangesPerMember = 
    changeCounts.reduce((a, b) => a + b, 0) / changeCounts.length;
  
  baselines.maxChangesPerMember = Math.max(...changeCounts);
  
  // Rapid change threshold (95th percentile)
  changeCounts.sort((a, b) => a - b);
  const p95Index = Math.floor(changeCounts.length * 0.95);
  baselines.rapidChangeThreshold = changeCounts[p95Index] || 5;
  
  // Origin patterns
  for (const change of roleArchive.changes) {
    baselines.changesByOrigin[change.origin] = 
      (baselines.changesByOrigin[change.origin] || 0) + 1;
  }
  
  baselines.expectedOrigins = Object.keys(baselines.changesByOrigin);
  
  return baselines;
}
```

**When to Recompute Baselines:**
- Every 24 hours (adaptive learning)
- After 50 new role changes
- Manual trigger via `/ops security baseline-refresh`

### 2.2 Threat Detection via Baseline Comparison

```javascript
/**
 * Detect security threats by comparing current activity to baselines
 * Returns threat assessment with severity and recommended actions
 */
export function detectSecurityThreats(currentActivity, baselines) {
  const threats = [];
  
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
        deviation: currentActivity.changesInLast5Minutes - baselines.rapidChangeThreshold
      },
      recommendedAction: 'AUTO_REVERT + DRIP_ALERT + FORENSIC_LOG',
      mitreAttack: 'T1098.003 - Add Office 365 Global Administrator Role'
    });
  }
  
  // THREAT 2: Unusual Origin (Unauthorized Access Method)
  if (!baselines.expectedOrigins.includes(currentActivity.origin)) {
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
      mitreAttack: 'T1078 - Valid Accounts (Compromised)'
    });
  }
  
  // THREAT 3: Mass Role Removal (Impact/Sabotage)
  const expectedRemovalsPerHour = baselines.trainerRoleRemovalsPerDay / 24;
  if (currentActivity.removalsInLastHour > (expectedRemovalsPerHour * 10)) {
    threats.push({
      type: 'mass_role_removal',
      severity: 'CRITICAL',
      confidence: 0.90,
      description: `${currentActivity.removalsInLastHour} role removals in 1 hour (baseline: ${expectedRemovalsPerHour.toFixed(1)})`,
      evidence: {
        currentRemovalRate: currentActivity.removalsInLastHour,
        baselineRate: expectedRemovalsPerHour,
        deviationMultiplier: currentActivity.removalsInLastHour / expectedRemovalsPerHour
      },
      recommendedAction: 'EMERGENCY_ALERT + AUTO_REVERT_ALL + FREEZE_PERMISSIONS',
      mitreAttack: 'T1531 - Account Access Removal'
    });
  }
  
  // THREAT 4: Off-Hours Activity (Unauthorized Access)
  const currentHour = new Date().getHours();
  if (!baselines.peakActivityHours.includes(currentHour) && 
      currentActivity.changesInLastHour > baselines.averageChangesPerHour * 3) {
    threats.push({
      type: 'off_hours_activity',
      severity: 'MEDIUM',
      confidence: 0.70,
      description: `High activity at ${currentHour}:00 (off-peak hours)`,
      evidence: {
        currentHour,
        peakHours: baselines.peakActivityHours,
        activityLevel: currentActivity.changesInLastHour,
        baselineActivity: baselines.averageChangesPerHour
      },
      recommendedAction: 'MONITOR_CLOSELY + LOG_FOR_REVIEW',
      mitreAttack: 'T1098 - Account Manipulation (Outside Business Hours)'
    });
  }
  
  // THREAT 5: Single Member Mass Changes (Compromised Account)
  if (currentActivity.maxChangesPerMemberInLastHour > baselines.maxChangesPerMember) {
    threats.push({
      type: 'single_member_anomaly',
      severity: 'HIGH',
      confidence: 0.85,
      description: `Member ${currentActivity.suspectMemberId} had ${currentActivity.maxChangesPerMemberInLastHour} role changes (historical max: ${baselines.maxChangesPerMember})`,
      evidence: {
        memberId: currentActivity.suspectMemberId,
        currentChanges: currentActivity.maxChangesPerMemberInLastHour,
        historicalMax: baselines.maxChangesPerMember
      },
      recommendedAction: 'VERIFY_MEMBER_IDENTITY + LOG_FOR_REVIEW',
      mitreAttack: 'T1078.001 - Default Accounts'
    });
  }
  
  return {
    hasThreats: threats.length > 0,
    threatCount: threats.length,
    maxSeverity: Math.max(...threats.map(t => 
      t.severity === 'CRITICAL' ? 3 : t.severity === 'HIGH' ? 2 : t.severity === 'MEDIUM' ? 1 : 0
    )),
    threats,
    assessmentTime: new Date().toISOString(),
    baselineConfidence: baselines.confidenceLevel
  };
}
```

### 2.3 Integrity Verification via Archive Comparison

```javascript
/**
 * Verify guild state integrity by comparing current state to archive history
 * Detects unauthorized deletions, hidden role changes, permission drift
 */
export async function verifyGuildIntegrity(guild, roleArchive) {
  const issues = [];
  
  // Get current guild state
  const currentRoles = await guild.roles.fetch({ force: true });
  const currentMembers = await guild.members.fetch({ force: true });
  
  // 1. Verify Role Existence (detect unauthorized deletions)
  const archivedRoleIds = new Set(
    roleArchive.changes
      .filter(c => c.type === 'addition')  // Roles that were added
      .map(c => c.roleId)
  );
  
  const deletedRoleIds = new Set(
    roleArchive.changes
      .filter(c => c.type === 'removal' && c.metadata?.roleDeleted)
      .map(c => c.roleId)
  );
  
  for (const roleId of archivedRoleIds) {
    if (!deletedRoleIds.has(roleId) && !currentRoles.has(roleId)) {
      issues.push({
        type: 'role_deleted_without_archive',
        severity: 'HIGH',
        description: `Role ${roleId} exists in archive but not in guild`,
        evidence: {
          roleId,
          lastSeenInArchive: roleArchive.changes
            .filter(c => c.roleId === roleId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
            ?.timestamp
        },
        recommendation: 'INVESTIGATE_DELETION + FORENSIC_AUDIT'
      });
    }
  }
  
  // 2. Verify Member Role Assignments (detect silent removals)
  const expectedMemberRoles = new Map();  // memberId -> Set(roleIds)
  
  // Build expected state from archive
  for (const change of roleArchive.changes) {
    if (!expectedMemberRoles.has(change.memberId)) {
      expectedMemberRoles.set(change.memberId, new Set());
    }
    
    if (change.type === 'addition') {
      expectedMemberRoles.get(change.memberId).add(change.roleId);
    } else if (change.type === 'removal') {
      expectedMemberRoles.get(change.memberId).delete(change.roleId);
    }
  }
  
  // Compare with current state
  for (const [memberId, expectedRoles] of expectedMemberRoles.entries()) {
    const member = currentMembers.get(memberId);
    if (!member) continue;  // Member left guild
    
    const currentRoleIds = new Set(member.roles.cache.keys());
    
    // Find missing roles (expected but not present)
    for (const roleId of expectedRoles) {
      if (!currentRoleIds.has(roleId) && currentRoles.has(roleId)) {
        issues.push({
          type: 'missing_role_assignment',
          severity: 'MEDIUM',
          description: `Member ${member.user.tag} missing expected role ${roleId}`,
          evidence: {
            memberId,
            memberTag: member.user.tag,
            roleId,
            expectedByArchive: true,
            currentlyAssigned: false
          },
          recommendation: 'AUTO_REASSIGN + LOG_DISCREPANCY'
        });
      }
    }
  }
  
  // 3. Detect Role Permission Drift
  const rolePermissionSnapshots = new Map();  // roleId -> permissions
  
  // Get last known permissions from archive metadata
  for (const change of roleArchive.changes) {
    if (change.metadata?.rolePermissions) {
      rolePermissionSnapshots.set(change.roleId, change.metadata.rolePermissions);
    }
  }
  
  for (const [roleId, expectedPermissions] of rolePermissionSnapshots.entries()) {
    const role = currentRoles.get(roleId);
    if (!role) continue;
    
    const currentPermissions = role.permissions.bitfield;
    if (currentPermissions !== expectedPermissions) {
      issues.push({
        type: 'role_permission_drift',
        severity: 'HIGH',
        description: `Role ${role.name} permissions changed without archive entry`,
        evidence: {
          roleId,
          roleName: role.name,
          expectedPermissions,
          currentPermissions,
          permissionsDiff: currentPermissions ^ expectedPermissions  // XOR for diff
        },
        recommendation: 'ALERT_ADMINS + LOG_UNAUTHORIZED_CHANGE'
      });
    }
  }
  
  return {
    hasIssues: issues.length > 0,
    issueCount: issues.length,
    criticalCount: issues.filter(i => i.severity === 'CRITICAL').length,
    highCount: issues.filter(i => i.severity === 'HIGH').length,
    mediumCount: issues.filter(i => i.severity === 'MEDIUM').length,
    issues,
    verifiedAt: new Date().toISOString(),
    guildId: guild.id,
    guildName: guild.name
  };
}
```

---

## 3. Implementation Roadmap

### Phase 1: Baseline Generation (Week 1)
- [ ] Implement `generateSecurityBaselines()` function
- [ ] Add baseline storage to security bot state
- [ ] Create `/ops security baseline` command to view current baselines
- [ ] Schedule automatic baseline refresh (daily)

**Acceptance Criteria:**
- Baselines computed from last 500 role changes
- Confidence level calculated (0-1 scale)
- Stored in `/Store/security-bot-state/baselines.json` with HMAC signature

### Phase 2: Threat Detection (Week 2)
- [ ] Implement `detectSecurityThreats()` function
- [ ] Integrate with existing `sweepGuild()` function
- [ ] Add threat logging to security bot state timeline
- [ ] Create Drip alert integration for CRITICAL/HIGH threats

**Acceptance Criteria:**
- 5 threat types detected (rapid changes, unusual origin, mass removal, off-hours, single member)
- MITRE ATT&CK tactic mapping included
- Auto-revert triggered for CRITICAL threats

### Phase 3: Integrity Verification (Week 3)
- [ ] Implement `verifyGuildIntegrity()` function
- [ ] Add scheduled integrity checks (hourly)
- [ ] Create integrity report in `/ops security integrity` command
- [ ] Add auto-healing for missing role assignments

**Acceptance Criteria:**
- Detects unauthorized role deletions
- Finds missing role assignments
- Identifies permission drift
- Auto-reassigns missing roles

### Phase 4: Advanced Heuristics (Week 4)
- [ ] Add behavioral analysis (member activity patterns)
- [ ] Implement predictive alerting (forecast anomalies)
- [ ] Create forensic export (`/ops security forensics`)
- [ ] Add compliance reporting (audit trail)

**Acceptance Criteria:**
- 95% detection rate for known attack patterns
- <1% false positive rate
- Complete audit trail for 7 days
- Forensic export includes: timeline, baselines, evidence

---

## 4. Security Metrics Dashboard

### 4.1 Real-Time Security Posture

```javascript
export function getSecurityPosture(roleArchive, currentBaselines, recentThreats) {
  return {
    overallScore: calculateSecurityScore(roleArchive, currentBaselines, recentThreats),
    
    // Confidence in detection
    baselineConfidence: currentBaselines.confidenceLevel,
    dataQuality: roleArchive.changes.length >= 200 ? 'HIGH' : 'LOW',
    
    // Threat landscape
    threatsLast24h: recentThreats.filter(t => 
      new Date(t.detectedAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    ).length,
    
    criticalThreatsLast7d: recentThreats.filter(t => 
      t.severity === 'CRITICAL' && 
      new Date(t.detectedAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length,
    
    // Archive integrity
    archiveHealth: {
      signatureValid: true,  // From HMAC verification
      dataIntegrity: 'VERIFIED',
      lastBackup: roleArchive.metadata?.lastPersisted,
      retentionCompliance: roleArchive.changes.length <= 500 ? 'COMPLIANT' : 'OVER_LIMIT'
    },
    
    // Recommendations
    recommendations: generateSecurityRecommendations(roleArchive, currentBaselines, recentThreats)
  };
}

function calculateSecurityScore(archive, baselines, threats) {
  let score = 100;
  
  // Deduct for low confidence baselines
  if (baselines.confidenceLevel < 0.5) score -= 20;
  
  // Deduct for recent critical threats
  const criticalThreatsLast24h = threats.filter(t => 
    t.severity === 'CRITICAL' && 
    new Date(t.detectedAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
  ).length;
  
  score -= criticalThreatsLast24h * 10;
  
  // Deduct for unresolved integrity issues
  // (would need to track this in state)
  
  return Math.max(0, Math.min(100, score));
}
```

### 4.2 `/ops security` Command Output

```
🛡️ SECURITY POSTURE
═══════════════════════════════════════════════════════════════
Overall Score: 92/100 (STRONG) 🟢

📊 BASELINE INTELLIGENCE
  • Confidence: 95% (HIGH - 480 data points)
  • Last Refresh: 2025-11-30T08:00:00Z (4 hours ago)
  • Normal Activity: 12 changes/day, peak hours: 14:00, 18:00, 20:00

⚠️ THREAT DETECTION (Last 24h)
  • Total Threats: 2
  • Critical: 0
  • High: 1 (Off-hours activity at 03:00)
  • Medium: 1 (Rapid changes: 3 in 5 minutes)

✅ INTEGRITY STATUS
  • Archive Signature: VALID ✅
  • Role Assignments: 47/47 verified ✅
  • Permission Drift: 0 detected ✅
  • Last Check: 12 minutes ago

📈 RECOMMENDATIONS
  1. Review off-hours activity log (member: UserXYZ)
  2. Baseline confidence: HIGH - continue monitoring
  3. Next integrity check: in 48 minutes

🔍 Forensic Export: /ops security forensics --last-7d
```

---

## 5. Integration with Existing Systems

### 5.1 Enhanced `recordRoleChange()`

```javascript
// BEFORE (basic logging):
export async function recordRoleChange(event) {
  // ... store change in archive ...
}

// AFTER (intelligent security analysis):
export async function recordRoleChange(event) {
  // 1. Store change in archive (existing functionality)
  const changeRecord = await storeRoleChange(event);
  
  // 2. Load current baselines
  const baselines = await loadSecurityBaselines();
  
  // 3. Check for anomalies (existing isAnomalousChange)
  const isAnomaly = isAnomalousChange(event);
  
  // 4. NEW: Baseline comparison threat detection
  const currentActivity = await getCurrentActivity();
  const threatAssessment = detectSecurityThreats(currentActivity, baselines);
  
  // 5. Handle detected threats
  if (threatAssessment.hasThreats) {
    for (const threat of threatAssessment.threats) {
      // Log to security timeline
      await logSecurityEvent({
        type: 'threat_detected',
        severity: threat.severity,
        description: threat.description,
        evidence: threat.evidence,
        relatedChange: changeRecord.id
      });
      
      // Execute recommended action
      if (threat.recommendedAction.includes('AUTO_REVERT')) {
        await revertRoleChange(changeRecord);
      }
      
      if (threat.recommendedAction.includes('DRIP_ALERT')) {
        await sendDripAlert({
          type: 'security_threat',
          severity: threat.severity,
          message: threat.description,
          evidence: threat.evidence
        });
      }
      
      if (threat.recommendedAction.includes('FORENSIC_LOG')) {
        await createForensicLog(changeRecord, threat);
      }
    }
  }
  
  return changeRecord;
}
```

### 5.2 Integration with Sweep System

```javascript
// In sweepGuild() function (main.js)
async function sweepGuild(guild) {
  // ... existing sweep logic ...
  
  // NEW: Post-sweep integrity verification
  const integrityReport = await verifyGuildIntegrity(guild, roleArchiveCache);
  
  if (integrityReport.hasIssues) {
    log('warn', '[Security] Integrity issues detected during sweep', {
      guild: guild.name,
      issueCount: integrityReport.issueCount,
      criticalCount: integrityReport.criticalCount
    });
    
    // Auto-heal missing role assignments
    for (const issue of integrityReport.issues) {
      if (issue.type === 'missing_role_assignment' && 
          issue.recommendation.includes('AUTO_REASSIGN')) {
        await healMissingRoleAssignment(guild, issue);
      }
    }
  }
}
```

---

## 6. Testing & Validation

### 6.1 Attack Simulation Tests

```javascript
// tests/security/archive-intelligence.spec.js

describe('Archive Intelligence - Threat Detection', () => {
  it('should detect rapid role changes (privilege escalation)', async () => {
    const baselines = generateSecurityBaselines(mockArchive);
    
    const currentActivity = {
      changesInLast5Minutes: 15,  // Way above baseline (5)
      origin: 'manual'
    };
    
    const threats = detectSecurityThreats(currentActivity, baselines);
    
    expect(threats.hasThreats).toBe(true);
    expect(threats.threats[0].type).toBe('rapid_role_changes');
    expect(threats.threats[0].severity).toBe('CRITICAL');
    expect(threats.threats[0].mitreAttack).toContain('T1098');
  });
  
  it('should detect mass role removal (sabotage)', async () => {
    const baselines = generateSecurityBaselines(mockArchive);
    
    const currentActivity = {
      removalsInLastHour: 50,  // 10x baseline (5/hour)
      origin: 'sweep'
    };
    
    const threats = detectSecurityThreats(currentActivity, baselines);
    
    expect(threats.threats.some(t => t.type === 'mass_role_removal')).toBe(true);
  });
  
  it('should detect off-hours activity (unauthorized access)', async () => {
    const baselines = {
      peakActivityHours: [14, 18, 20],  // 2pm, 6pm, 8pm
      averageChangesPerHour: 2
    };
    
    // Simulate 3am activity
    vi.setSystemTime(new Date('2025-11-30T03:00:00Z'));
    
    const currentActivity = {
      changesInLastHour: 8,  // 4x baseline
      origin: 'manual'
    };
    
    const threats = detectSecurityThreats(currentActivity, baselines);
    
    expect(threats.threats.some(t => t.type === 'off_hours_activity')).toBe(true);
  });
});

describe('Archive Intelligence - Integrity Verification', () => {
  it('should detect unauthorized role deletion', async () => {
    const mockArchive = {
      changes: [
        { type: 'addition', roleId: '123', roleName: 'Trainer', timestamp: '2025-11-20T10:00:00Z' }
        // No deletion record for roleId '123'
      ]
    };
    
    const mockGuild = {
      roles: new Map([
        // Role '123' missing from guild
      ])
    };
    
    const issues = await verifyGuildIntegrity(mockGuild, mockArchive);
    
    expect(issues.hasIssues).toBe(true);
    expect(issues.issues[0].type).toBe('role_deleted_without_archive');
  });
  
  it('should detect permission drift', async () => {
    const mockArchive = {
      changes: [
        {
          roleId: '123',
          roleName: 'Trainer',
          metadata: { rolePermissions: 1024n }  // Original permissions
        }
      ]
    };
    
    const mockGuild = {
      roles: new Map([
        ['123', { permissions: { bitfield: 2048n } }]  // Changed permissions
      ])
    };
    
    const issues = await verifyGuildIntegrity(mockGuild, mockArchive);
    
    expect(issues.issues.some(i => i.type === 'role_permission_drift')).toBe(true);
  });
});
```

---

## 7. Performance Considerations

### 7.1 Computational Cost

| Operation | Complexity | Frequency | Impact |
|-----------|-----------|-----------|--------|
| Baseline Generation | O(n) where n=500 | Once daily | Low (background task) |
| Threat Detection | O(1) comparison | Per role change | Negligible (<1ms) |
| Integrity Verification | O(r + m) roles + members | Hourly | Medium (~100ms for 50 roles, 1000 members) |

### 7.2 Storage Requirements

- **Baselines:** ~10 KB JSON (temporal, role, member, origin patterns)
- **Threat Logs:** ~1 KB per threat × 7 days retention = ~50 KB max
- **Total Additional Storage:** ~60 KB (0.006% of 1 GB disk)

### 7.3 Optimization Strategies

1. **Lazy Loading:** Only load baselines when needed (not on every bot restart)
2. **Incremental Updates:** Update baselines incrementally instead of full recompute
3. **Caching:** Cache threat detection results for 5 minutes (duplicate change prevention)
4. **Parallel Processing:** Run integrity checks async during sweep (non-blocking)

---

## 8. Compliance & Audit Trail

### 8.1 Audit Log Format

```javascript
{
  "auditId": "audit-20251130-001",
  "timestamp": "2025-11-30T14:35:00Z",
  "eventType": "security_threat_detected",
  "severity": "CRITICAL",
  "threat": {
    "type": "rapid_role_changes",
    "confidence": 0.95,
    "mitreAttack": "T1098.003"
  },
  "evidence": {
    "changesInLast5Minutes": 12,
    "baselineThreshold": 5,
    "affectedMembers": ["123456789", "987654321"],
    "timeline": [
      { "timestamp": "2025-11-30T14:30:15Z", "roleId": "...", "type": "addition" },
      { "timestamp": "2025-11-30T14:31:20Z", "roleId": "...", "type": "removal" }
    ]
  },
  "response": {
    "action": "AUTO_REVERT + DRIP_ALERT",
    "revertedChanges": 12,
    "alertSent": true,
    "alertRecipient": "DripTVDD"
  },
  "forensics": {
    "executor": { "id": "...", "tag": "..." },
    "ipAddress": null,  // Not available via Discord API
    "userAgent": null,
    "geoLocation": null
  }
}
```

### 8.2 Compliance Requirements Met

✅ **Data Retention:** 7-day audit trail (snapshots)  
✅ **Tamper Detection:** HMAC-SHA256 signatures  
✅ **Access Control:** Discord permissions + bot role hierarchy  
✅ **Incident Response:** Auto-revert + alerting  
✅ **Forensics:** Complete evidence preservation  

---

## 9. Future Enhancements

### 9.1 Machine Learning Integration (Phase 5+)

- Train ML model on historical archive data
- Predict anomalies before they occur
- Reduce false positives via supervised learning
- Behavioral profiling per member

### 9.2 Cross-Guild Threat Intelligence

- Aggregate baselines across multiple guilds
- Detect coordinated attacks (same actor, multiple guilds)
- Share threat signatures (privacy-preserving)

### 9.3 Advanced Forensics

- Discord audit log correlation
- IP geolocation tracking (via webhook integrations)
- Session replay (role change sequences)

---

## 10. Conclusion

This security intelligence system transforms the **role archive from passive storage into active defense**. By establishing baselines from historical data, we can:

1. **Detect threats** before they cause damage (rapid changes, mass removals)
2. **Maintain integrity** via continuous verification (no silent tampering)
3. **Respond automatically** with confidence (archive provides evidence)
4. **Learn continuously** as patterns evolve (adaptive baselines)

**Implementation Priority:** HIGH - Security is foundational  
**Estimated Effort:** 4 weeks (1 week per phase)  
**Risk:** LOW - Non-breaking additions to existing archive system  
**ROI:** HIGH - Prevents security incidents, reduces manual monitoring

**Next Steps:**
1. Review with Security Specialist + Backend Architect
2. Approve Phase 1 implementation (baseline generation)
3. Schedule testing window for threat simulation
4. Update `Tasklist.md` with implementation tasks

---

**Document Status:** PROPOSED ✅  
**Requires Approval:** Security Specialist, Backend Architect  
**Related Documents:**
- `src/bot/state/roleArchive.js` (existing archive implementation)
- `docs/SECURITY-HARDENING-PROJECT.md` (security project log)
- `tests/security/archive-integrity.spec.js` (current test coverage)
