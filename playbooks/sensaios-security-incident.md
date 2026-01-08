# SensaiOS Security Incident Response Playbook

**Status:** AUTHORITATIVE  
**Created:** January 5, 2026  
**Purpose:** Guide operators through responding to security incidents in the SensaiOS environment

---

## Table of Contents

1. [Incident Classification](#1-incident-classification)
2. [Immediate Response Procedures](#2-immediate-response-procedures)
3. [Capability Abuse Response](#3-capability-abuse-response)
4. [Ring Boundary Breach Response](#4-ring-boundary-breach-response)
5. [Malicious App Response](#5-malicious-app-response)
6. [Rate Limit Attack Response](#6-rate-limit-attack-response)
7. [Post-Incident Procedures](#7-post-incident-procedures)
8. [Prevention Measures](#8-prevention-measures)

---

## 1. Incident Classification

### Severity Levels

| Level | Description | Response Time | Escalation |
|-------|-------------|---------------|------------|
| **SEV-1** | Active exploitation, data breach | Immediate | Project leadership |
| **SEV-2** | Repeated violations from single app | < 15 min | Operations team |
| **SEV-3** | Isolated violation, blocked by system | < 1 hour | Document only |
| **SEV-4** | Suspicious pattern, no violation | < 24 hours | Monitor |

### Incident Types

| Type | Description | Typical Severity |
|------|-------------|------------------|
| Capability Abuse | App using capabilities outside intended scope | SEV-2 to SEV-1 |
| Ring Breach Attempt | Code attempting unauthorized imports | SEV-3 to SEV-2 |
| Malicious App | App designed to attack system | SEV-1 |
| Rate Limit Attack | Intentional exhaustion of rate limits | SEV-2 |
| Data Exfiltration | Unauthorized data access | SEV-1 |
| Privilege Escalation | App attempting to gain unauthorized caps | SEV-2 |

---

## 2. Immediate Response Procedures

### Step 1: Containment (< 2 minutes)

**GOAL: Stop the bleeding**

```bash
# Identify the offending app (if not known)
sensaios audit --violations --since "5m ago"

# DISABLE IMMEDIATELY
sensaios disable <app-id> --reason "Security incident - investigating"

# Verify disabled
sensaios status <app-id>
# Should show: Status: disabled
```

### Step 2: Preserve Evidence (< 5 minutes)

```bash
# Export full audit trail for app
sensaios audit --app <app-id> --since "24h ago" --format json > incident-$(date +%Y%m%d-%H%M%S).json

# Export app manifest and capabilities
sensaios inspect <app-id> --full > app-state-$(date +%Y%m%d-%H%M%S).json

# Note current database state
npm run db:cli -- counts > db-counts-$(date +%Y%m%d-%H%M%S).txt
```

### Step 3: Assess Impact (< 10 minutes)

Answer these questions:
- [ ] What data was accessed?
- [ ] What actions were performed?
- [ ] Are other apps/users affected?
- [ ] Is there ongoing risk?

```bash
# Check for data modifications
sensaios audit --app <app-id> --type db.write --since "24h ago"

# Check for external communications
sensaios audit --app <app-id> --type discord.send --since "24h ago"
sensaios audit --app <app-id> --type http.request --since "24h ago"
```

### Step 4: Notify (< 15 minutes)

**SEV-1/SEV-2:**
- Contact Project Leadership (DRIPTVDD)
- Log in incident tracker
- Prepare brief summary

**SEV-3/SEV-4:**
- Document in security log
- Continue with investigation

---

## 3. Capability Abuse Response

### Symptoms
- App accessing data outside declared scope
- App calling APIs more than business logic requires
- App storing data not related to declared purpose

### Investigation

```bash
# View all capabilities granted
sensaios caps <app-id>

# Compare with manifest declaration
sensaios inspect <app-id> --manifest

# View actual usage
sensaios audit --app <app-id> --type capability.assert --since "7d ago"

# Look for scope violations
sensaios audit --app <app-id> --type capability.denied --since "7d ago"
```

### Response Actions

**If abuse confirmed:**

```bash
# 1. Revoke abused capabilities
sensaios revoke <app-id> <capability> --reason "Capability abuse - incident #XXX"

# 2. If app can't function safely, keep disabled
# OR if app can function with reduced caps:
sensaios enable <app-id>

# 3. Add to watchlist
sensaios monitor <app-id> --level high --duration 30d
```

**If malicious:**
- Proceed to [Malicious App Response](#5-malicious-app-response)

---

## 4. Ring Boundary Breach Response

### Symptoms
- `IMPORT_BLOCKED` errors in audit log
- `SecurityError` with code 3xxx
- Stack traces showing kernel/sensaios paths from app context

### Investigation

```bash
# View all import violations
sensaios audit --type import.blocked --since "24h ago"

# Filter by app
sensaios audit --app <app-id> --type import.blocked --since "7d ago"

# Example output:
# 2026-01-05T10:30:00Z import.blocked app=game.myapp
#   attempted: ../kernel/primitives/db
#   from: src/apps/game.myapp/handler.ts:45
#   action: blocked
```

### Response Actions

**Single occurrence (likely developer mistake):**
```bash
# Document the attempt
echo "Ring breach attempt from <app-id> at <timestamp>" >> security.log

# Contact developer
# Provide correct pattern:
# BAD:  import { db } from '../kernel/primitives/db'
# GOOD: const db = ctx.db // Use ComponentContext
```

**Multiple/Persistent attempts:**
```bash
# Disable app
sensaios disable <app-id> --reason "Persistent ring boundary violations"

# Require code review before re-enabling
# Add note to app status
sensaios annotate <app-id> "Requires security review before re-enable"
```

**Note:** Ring boundary breaches are ALWAYS blocked by ESLint at compile time and by the module loader at runtime. The system is protected—this response is about understanding intent and preventing future attempts.

---

## 5. Malicious App Response

### Symptoms
- Clear pattern of exploitation attempts
- Data exfiltration detected
- Attempts to affect other apps
- Developer unresponsive or evasive

### Immediate Actions (SEV-1)

```bash
# 1. DISABLE IMMEDIATELY
sensaios disable <app-id> --reason "Malicious app - SEV-1"

# 2. Revoke ALL capabilities
sensaios revoke <app-id> --all --reason "Malicious app - SEV-1"

# 3. Export complete evidence
mkdir incident-$(date +%Y%m%d-%H%M%S)
cd incident-*
sensaios audit --app <app-id> --since "30d ago" --format json > audit.json
sensaios inspect <app-id> --full > app-state.json
sensaios caps <app-id> --history > cap-history.json

# 4. Uninstall (remove from system entirely)
sensaios uninstall <app-id> --force

# 5. Add to blacklist
sensaios blacklist add <app-id> --reason "Malicious behavior confirmed"
```

### Post-Containment

1. **Analyze Impact**
   - Review all data accessed by app
   - Check for data modification or deletion
   - Check for credentials or secrets access

2. **Notify Affected Users** (if applicable)
   - Identify users whose data was accessed
   - Prepare notification

3. **Harden Defenses**
   - Review capability grant process
   - Add new detection rules if needed

---

## 6. Rate Limit Attack Response

### Symptoms
- `RATE_LIMIT_EXCEEDED` errors in high volume
- App calling same endpoint repeatedly
- Appears intentional (not buggy retry logic)

### Investigation

```bash
# View rate limit violations
sensaios audit --type rate_limit --app <app-id> --since "1h ago"

# Check rate limit configuration
sensaios rate-limits <app-id>

# Look for patterns
sensaios audit --type rate_limit --app <app-id> --since "1h ago" --group method
```

### Response Actions

**If clearly attack:**
```bash
# Disable app
sensaios disable <app-id> --reason "Rate limit attack"
```

**If possibly bug:**
```bash
# Apply strict rate limits
sensaios rate-limit <app-id> --strict

# Contact developer
# Monitor
sensaios monitor <app-id> --level high --duration 7d
```

---

## 7. Post-Incident Procedures

### Documentation

Create incident report with:
- [ ] Incident ID and timestamp
- [ ] Severity level
- [ ] Affected app(s)
- [ ] Timeline of events
- [ ] Actions taken
- [ ] Root cause (if known)
- [ ] Lessons learned
- [ ] Prevention recommendations

### Follow-Up Actions

```bash
# Review incident for patterns
# Update monitoring rules
# Schedule post-mortem if SEV-1/SEV-2

# Clear watchlist after quiet period
sensaios monitor <app-id> --clear  # After 30 days no issues
```

### Metrics to Track

- Time to detection
- Time to containment
- False positive rate
- Recurrence rate

---

## 8. Prevention Measures

### Proactive Monitoring

```bash
# Daily security audit review
sensaios audit --violations --since "24h ago"

# Weekly capability review
sensaios audit --type capability.grant --since "7d ago"

# Monthly app review
sensaios list --detailed
```

### Capability Hygiene

- **Principle of Least Privilege:** Grant only required capabilities
- **Scope Restrictions:** Use table/method restrictions when possible
- **Expiring Capabilities:** Set expiration for sensitive caps
- **Regular Review:** Audit capabilities quarterly

### Code Review Requirements

For new apps requesting dangerous capabilities:
- [ ] Manifest reviewed
- [ ] Source code reviewed
- [ ] Purpose documented
- [ ] Capability justification documented
- [ ] Test coverage adequate

---

## Quick Reference Card

### Emergency Commands

```bash
# STOP APP NOW
sensaios disable <app-id>

# REMOVE ALL ACCESS
sensaios revoke <app-id> --all

# GET EVIDENCE
sensaios audit --app <app-id> --since "24h ago" --format json > evidence.json

# CHECK VIOLATIONS
sensaios audit --violations

# REMOVE ENTIRELY
sensaios uninstall <app-id> --force
```

### Escalation Contacts

| Role | Contact | When |
|------|---------|------|
| Project Leadership | DRIPTVDD | SEV-1/SEV-2 |
| Operations | On-call | Any incident |
| Security Review | Security team | Post-incident |

---

## Cross-References

- **Security Model:** [architecture-bible/28-sensaios-security-model.md](../docs/architecture-bible/28-sensaios-security-model.md)
- **Operations Guide:** [operations-bible/14-sensaios-operations.md](../docs/operations-bible/14-sensaios-operations.md)
- **Development Guide:** [development-bible/11-sensaios-development.md](../docs/development-bible/11-sensaios-development.md)
- **General Recovery:** [playbooks/recovery.md](recovery.md)

---

**Document Version:** 1.0.0  
**Status:** AUTHORITATIVE  
**Created:** January 5, 2026  
**Authority:** Canonical incident response procedures for SensaiOS security events
