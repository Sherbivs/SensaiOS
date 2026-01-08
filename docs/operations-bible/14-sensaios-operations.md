# 14 — SensaiOS Operations Guide

**Status:** AUTHORITATIVE  
**Created:** January 5, 2026  
**Purpose:** Guide operators on managing SensaiOS apps, capabilities, and responding to security alerts

---

## Table of Contents

1. [Quick Reference](#1-quick-reference)
2. [App Management](#2-app-management)
3. [Capability Administration](#3-capability-administration)
4. [Security Monitoring](#4-security-monitoring)
5. [Incident Response](#5-incident-response)
6. [Maintenance Operations](#6-maintenance-operations)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Quick Reference

### CLI Commands

**Implementation:** `scripts/sensaios-cli.ts`  
**Usage:** `npm run sensaios <command> [args]`

```bash
# App management (IMPLEMENTED ✅)
sensaios list                      # List installed apps
sensaios install <manifest>        # Install an app
sensaios uninstall <app-id>        # Remove an app
sensaios enable <app-id>           # Enable disabled app
sensaios disable <app-id>          # Disable without removing
sensaios status <app-id>           # Show app details

# Capability management (IMPLEMENTED ✅)
sensaios grant <app> <cap>         # Grant capability
sensaios revoke <app> <cap>        # Revoke capability

# NOT YET IMPLEMENTED ⏳
sensaios caps <app-id>             # TODO: List app capabilities
sensaios approve <app> <cap>       # TODO: Approve dangerous capability
sensaios pending                   # TODO: List pending approvals
sensaios audit                     # TODO: Recent security events
sensaios audit --violations        # TODO: Only violations
sensaios audit --app <app-id>      # TODO: Filter by app
sensaios health                    # TODO: Component health check
sensaios dashboard                 # TODO: Live security dashboard
sensaios metrics                   # TODO: Performance metrics
```

> **Note:** Commands marked "TODO" are planned but not yet implemented. See [Tasklist.md](../../Tasklist.md) for progress tracking.

### Discord Commands

```
/ops security audit      — View recent security events
/ops security violations — View security violations
/ops security apps       — List installed apps and capabilities
/ops security approve    — Approve pending capability requests
```

### Important Paths

| Path | Purpose |
|------|---------|
| `manifests/*.manifest.json` | App manifests |
| `src/sensaios/` | SensaiOS core (Ring 1) |
| `src/sensaios/capabilities/` | Capability assertion (Ring 0) |
| `src/sensaios/gameserver/` | GameServerAPI (Ring 3 interface) |
| `src/sensaios/install/` | Installation primitives |
| `src/sensaios/security/` | Secure import hooks |
| `src/sensaios/loader/` | Module loader hooks |
| `src/kernel/` | Kernel (Ring 0) |
| `scripts/sensaios-cli.ts` | CLI tool |
| `tests/sensaios/security/` | Security tests (202 tests) |
| `.github/workflows/security-tests.yml` | CI enforcement |

---

## 2. App Management

### Installing an App

```bash
# Install from manifest file
sensaios install ./manifests/my-app.manifest.json

# Example output:
# ✓ Validating manifest... OK
# ✓ Checking dependencies... OK (2/2 satisfied)
# ✓ Granting capabilities... 3 safe capabilities granted
# ⚠ Pending approval: db.migrate (dangerous capability)
# ✓ Registering app... OK
# 
# App game.myapp@1.0.0 installed successfully.
# 
# PENDING APPROVALS:
# - db.migrate: Run `sensaios approve game.myapp db.migrate`
```

### Uninstalling an App

```bash
# Uninstall app
sensaios uninstall game.myapp

# If app has dependents:
# ✗ Cannot uninstall game.myapp: 2 apps depend on it
#   - game.battles
#   - game.encounters
# 
# Uninstall dependents first or use --force

# Force uninstall (dangerous)
sensaios uninstall game.myapp --force
```

### Updating an App

```bash
# Update to new version
sensaios update game.myapp ./manifests/my-app-v2.manifest.json

# Update checks:
# - Version must be greater than current
# - Capabilities can be added (require approval) or removed
# - Dependencies must still be satisfied
```

### Listing Apps

```bash
sensaios list

# Example output:
# ┌───────────────────┬─────────┬──────────┬────────────┐
# │ App ID            │ Version │ Status   │ Caps       │
# ├───────────────────┼─────────┼──────────┼────────────┤
# │ discord.bot       │ 1.2.0   │ enabled  │ 5 granted  │
# │ game.battles      │ 1.0.0   │ enabled  │ 3 granted  │
# │ game.encounters   │ 1.0.0   │ enabled  │ 2 granted  │
# │ game.myapp        │ 1.0.0   │ pending  │ 2 pending  │
# └───────────────────┴─────────┴──────────┴────────────┘
```

---

## 3. Capability Administration

### Granting Capabilities

```bash
# Grant a safe capability
sensaios grant game.myapp db.write

# Grant with scope restriction
sensaios grant game.myapp db.write --tables=trainers,items

# Grant multiple
sensaios grant game.myapp db.write discord.send
```

### Approving Dangerous Capabilities

Dangerous capabilities require explicit approval:

```bash
# View pending approvals
sensaios pending

# Example output:
# Pending Capability Approvals:
# ┌───────────────────┬────────────────┬─────────────────────────────────┐
# │ App               │ Capability     │ Requested At                    │
# ├───────────────────┼────────────────┼─────────────────────────────────┤
# │ game.myapp        │ db.migrate     │ 2026-01-05T10:30:00Z            │
# │ game.admin        │ kernel.observe │ 2026-01-05T09:15:00Z            │
# └───────────────────┴────────────────┴─────────────────────────────────┘

# Approve after review
sensaios approve game.myapp db.migrate --reason "Required for schema update v1.2"

# Reject
sensaios reject game.myapp db.migrate --reason "Not justified"
```

### Revoking Capabilities

```bash
# Revoke specific capability
sensaios revoke game.myapp db.write

# Revoke all capabilities (effectively disables app)
sensaios revoke game.myapp --all

# Revoke with reason (logged)
sensaios revoke game.myapp kernel.observe --reason "Security incident #123"
```

### Viewing Capabilities

```bash
sensaios caps game.myapp

# Example output:
# Capabilities for game.myapp:
# ┌──────────────────┬──────────┬─────────────────────┬─────────────────────┐
# │ Capability       │ Status   │ Granted At          │ Expires             │
# ├──────────────────┼──────────┼─────────────────────┼─────────────────────┤
# │ db.read          │ active   │ 2026-01-05T10:00:00 │ never               │
# │ db.write         │ active   │ 2026-01-05T10:00:00 │ never               │
# │ discord.send     │ active   │ 2026-01-05T10:00:00 │ never               │
# │ db.migrate       │ revoked  │ 2026-01-05T10:30:00 │ -                   │
# └──────────────────┴──────────┴─────────────────────┴─────────────────────┘
```

---

## 4. Security Monitoring

### Audit Log Queries

```bash
# Recent security events (last 1h)
sensaios audit

# Filter by event type
sensaios audit --type capability.denied
sensaios audit --type import.blocked
sensaios audit --type app.installed

# Filter by app
sensaios audit --app game.myapp

# Filter by time range
sensaios audit --since "2h ago"
sensaios audit --since "2026-01-05T00:00:00Z"
```

### Security Dashboard

```bash
sensaios dashboard

# Live dashboard showing:
# - Active apps and their status
# - Recent capability assertions
# - Security violations
# - Rate limit status
```

### Violation Alerts

Security violations are logged and can trigger alerts:

```bash
# View recent violations
sensaios audit --violations

# Example output:
# Security Violations (last 24h):
# ┌─────────────────────┬────────────┬────────────────────────────────────────┐
# │ Time                │ App        │ Violation                              │
# ├─────────────────────┼────────────┼────────────────────────────────────────┤
# │ 2026-01-05T14:30:00 │ game.myapp │ CAPABILITY_DENIED: db.migrate          │
# │ 2026-01-05T13:15:00 │ game.admin │ IMPORT_BLOCKED: ../kernel/primitives   │
# │ 2026-01-05T12:00:00 │ game.test  │ RATE_LIMIT_EXCEEDED: trainers.get      │
# └─────────────────────┴────────────┴────────────────────────────────────────┘
```

---

## 5. Incident Response

### Security Incident Playbook

**Location:** [playbooks/sensaios-security-incident.md](../../playbooks/sensaios-security-incident.md)

### Immediate Response: Disable App

```bash
# Disable app immediately (stops all handlers)
sensaios disable game.compromised --reason "Security incident"

# Revoke all capabilities
sensaios revoke game.compromised --all --reason "Security incident"
```

### Investigate Capability Abuse

```bash
# Get detailed audit trail for app
sensaios audit --app game.compromised --detailed --since "24h ago"

# Export for investigation
sensaios audit --app game.compromised --format json > incident-log.json
```

### Common Incident Patterns

#### Capability Abuse

**Symptoms:** App accessing data outside its declared scope

**Response:**
1. `sensaios disable <app>` — Stop immediately
2. `sensaios audit --app <app>` — Review all actions
3. Revoke capabilities: `sensaios revoke <app> --all`
4. Contact app developer

#### Ring Boundary Breach Attempt

**Symptoms:** Import violations in logs (code 3xxx)

**Response:**
1. These are blocked at runtime, but investigate why attempted
2. Review app source for unauthorized imports
3. Consider uninstalling: `sensaios uninstall <app>`

#### Rate Limit Abuse

**Symptoms:** Excessive rate limit errors from app

**Response:**
1. Review why app is making so many calls
2. Add stricter rate limits: `sensaios rate-limit <app> --strict`
3. Consider temporary disable if attack

---

## 6. Maintenance Operations

### Health Check

```bash
sensaios health

# Example output:
# SensaiOS Health Check:
# ┌───────────────────────────┬────────────┐
# │ Component                 │ Status     │
# ├───────────────────────────┼────────────┤
# │ Kernel Primitives         │ ✓ healthy  │
# │ Capability Service        │ ✓ healthy  │
# │ Module Loader             │ ✓ healthy  │
# │ Game Server API           │ ✓ healthy  │
# │ Rate Limiter              │ ✓ healthy  │
# │ Audit Logger              │ ✓ healthy  │
# └───────────────────────────┴────────────┘
# 
# Apps: 5 installed, 5 enabled, 0 pending
# Pending Approvals: 1
```

### Database Maintenance

```bash
# Cleanup expired capabilities
sensaios cleanup --expired-caps

# Prune old audit logs (keep 30 days)
sensaios cleanup --audit-logs --retention 30d

# Vacuum component tables
sensaios vacuum
```

### Backup & Restore

```bash
# Export app configuration
sensaios export --apps > sensaios-apps.json
sensaios export --capabilities > sensaios-caps.json

# Restore
sensaios import --apps < sensaios-apps.json
sensaios import --capabilities < sensaios-caps.json
```

---

## 7. Troubleshooting

### App Won't Start

```bash
# Check status
sensaios status game.myapp

# Common issues:
# - Missing dependencies: Install required apps first
# - Missing capabilities: Grant required capabilities
# - Lifecycle hook error: Check logs for onLoad/onEnable failures

# View detailed error
sensaios logs game.myapp --errors
```

### Capability Denied Errors

```bash
# Check what capabilities app has
sensaios caps game.myapp

# Common causes:
# - Capability never granted
# - Capability expired (check expiresAt)
# - Capability revoked (check revokedAt)
# - Scope restriction doesn't match request
```

### Import Blocked Errors

```bash
# Check import attempt in logs
sensaios audit --app game.myapp --type import.blocked

# Common causes:
# - App trying to import kernel directly (Ring 3 → Ring 0)
# - App trying to import sensaios internals (Ring 3 → Ring 1)
# - Fix: Use ComponentContext primitives, not direct imports
```

### Rate Limit Issues

```bash
# Check current rate limit status
sensaios rate-limits game.myapp

# Adjust if needed
sensaios rate-limit game.myapp --method trainers.get --limit 200/min
```

---

## Cross-References

- **Security Model:** [28-sensaios-security-model.md](../architecture-bible/28-sensaios-security-model.md)
- **Development Guide:** [11-sensaios-development.md](../development-bible/11-sensaios-development.md)
- **Security Incident Playbook:** [playbooks/sensaios-security-incident.md](../../playbooks/sensaios-security-incident.md)
- **Instruction File:** [.github/instructions/sensai.instructions.md](../../.github/instructions/sensai.instructions.md)

---

**Document Version:** 1.0.0  
**Status:** AUTHORITATIVE  
**Created:** January 5, 2026  
**Authority:** Canonical operations guide for SensaiOS administration
