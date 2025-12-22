# State Persistence System Overhaul Project

**Project ID:** STATE-OVERHAUL  
**Status:** 🟡 PLANNING  
**Created:** 2025-12-21  
**Last Verified:** 2025-12-21  
**Owner:** Cleanup Agent + Architecture Team

---

## Executive Summary

The Security Bot state persistence system has grown organically to **~4,792 lines** across 10 TypeScript files. An architectural review revealed **unused exports**, **1 security vulnerability**, and **significant expansion opportunities**. This project will tune up the existing system, then expand its capabilities.

---

## Current Architecture (VERIFIED)

```
src/bot/state/
├── threatResponse.ts     — Automated response actions (720 lines)
├── roleArchive.ts        — Role change history, HMAC signed (699 lines)
├── persistence.ts        — Core save/load/snapshot lifecycle (697 lines)
├── securityMetrics.ts    — Dashboard metrics & health (664 lines)
├── stats.ts              — Cumulative statistics recording (463 lines)
├── securityBaselines.ts  — Baseline generation for threat detection (403 lines)
├── timeline.ts           — Activity timeline formatting (319 lines)
├── threatDetector.ts     — Pattern matching engine (315 lines)
├── types.ts              — Shared TypeScript types (287 lines)
├── context.ts            — Guild state restoration (225 lines)
└── ROUTER.md             — Domain documentation

Store/security-bot-state/
├── current.json        — Active runtime state
├── previous.json       — Backup from last restart
├── snapshots/          — Hourly backups (7-day retention)
├── baselines.json      — Security baselines
└── role-archive/       — HMAC-signed role change history

Total: ~4,792 lines
```

---

## Problem Statement

### Critical Issues
| ID | Issue | Severity | Impact |
|----|-------|----------|--------|
| **S-001** | Hardcoded HMAC fallback secret in `roleArchive.ts` | 🔴 Critical | Tamper protection bypassed if env var not set |

### Unused Exports (Query/Analysis functions never called)
| Module | Unused Functions | Lines |
|--------|------------------|-------|
| `timeline.ts` | `getEventsByType`, `getEventsByGuild`, `getEventsByTimeRange` | ~60 |
| `threatResponse.ts` | `respondToThreats`, `verifyGuildIntegrity`, `healMissingAssignments`, `escalateCriticalThreat` | ~400 (built but not wired) |
| **Total** | **7 functions** | **~460 lines** |

### Features Built But Not Wired
These exist and work but aren't called from the main sweep workflow:
- `respondToThreats()` — Automated threat response (recommended in securityMetrics.ts)
- `verifyGuildIntegrity()` — Integrity checking
- `healMissingAssignments()` — Self-healing capability
- `escalateCriticalThreat()` — Critical escalation

### Documentation Issues
- ROUTER.md references `.js` extensions but files are `.ts`
- No schema.md file exists (should be created)

---

## Project Phases

### Phase 1: Dead Code Removal 🧹
**Goal:** Remove 3 unused query functions (~60 lines)  
**Risk:** Low — No behavior change  
**Verification:** Build + test pass

| Task | File | Functions to Remove |
|------|------|---------------------|
| 1.1 | `timeline.ts` | `getEventsByType`, `getEventsByGuild`, `getEventsByTimeRange` |

**Note:** `threatResponse.ts` functions are NOT dead — they're built for Phase 2 wiring.

**Acceptance Criteria:**
- [ ] Unused query functions removed
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] No new lint warnings

---

### Phase 2: Feature Wiring 🔧
**Goal:** Wire existing threat response functions into sweep workflow  
**Risk:** Medium — New runtime behavior  
**Verification:** Integration tests, manual threat simulation

| Task | Description |
|------|-------------|
| 2.1 | Wire `respondToThreats()` into sweep workflow in `main.js` |
| 2.2 | Wire `verifyGuildIntegrity()` for periodic checks |
| 2.3 | Add `/ops threats` command to view detected patterns |
| 2.4 | Add threat response configuration (enable/disable auto-response) |
| 2.5 | Create threat detection tests |

**Integration Point:**
```typescript
// In sweep workflow after role change detection
import { respondToThreats } from './state/threatResponse.js';

// After sweep completes with changes
if (changes.length > 0 && config.threatResponse.enabled) {
  await respondToThreats(threats, guild, { 
    dryRun: config.threatResponse.dryRun,
    enableAlerts: true 
  });
}
```

**Acceptance Criteria:**
- [ ] Threat detection runs on every sweep
- [ ] High-confidence threats trigger configurable response
- [ ] `/ops threats` shows recent detections
- [ ] No false positives in production (monitor for 1 week)

---

### Phase 3: Security Hardening 🔒
**Goal:** Eliminate hardcoded HMAC fallback  
**Risk:** Medium — Affects production if env var missing  
**Verification:** Manual test with/without env var

| Task | Description |
|------|-------------|
| 3.1 | Create `src/bot/state/config.ts` — Centralized secret loading |
| 3.2 | Update `roleArchive.ts` to import from config |
| 3.3 | Add startup validation — Fail-fast if `ARCHIVE_HMAC_SECRET` not set in production |
| 3.4 | Document required env var in `Agents.md` |

**Config Module Design:**
```typescript
// src/bot/state/config.ts
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.RENDER;

export function getHmacSecret(): string {
  const secret = process.env.ARCHIVE_HMAC_SECRET;
  
  if (!secret && IS_PRODUCTION) {
    throw new Error('ARCHIVE_HMAC_SECRET required in production');
  }
  
  if (!secret) {
    console.warn('[SecurityBot] Using development HMAC secret — NOT FOR PRODUCTION');
    return 'dev-only-insecure-secret-do-not-use-in-prod';
  }
  
  return secret;
}
```

**Acceptance Criteria:**
- [ ] Single source of truth for HMAC secret
- [ ] Production fails fast without env var
- [ ] Development has clear warning

---

### Phase 4: Documentation & Cleanup 📚
**Goal:** Fix documentation drift  
**Risk:** None  
**Verification:** Manual review

| Task | Description |
|------|-------------|
| 4.1 | Update `src/bot/state/ROUTER.md` — Fix `.js` → `.ts` extensions |
| 4.2 | Create `Store/security-bot-state/schema.md` — Document state structure |
| 4.3 | Update `Agents.md` — Document `ARCHIVE_HMAC_SECRET` requirement |

**Acceptance Criteria:**
- [ ] ROUTER.md has correct file extensions
- [ ] schema.md documents current state structure
- [ ] Env var documented in Agents.md

---

### Phase 5: Expansion Opportunities 🚀
**Goal:** New capabilities after tune-up  
**Risk:** Varies — New features  
**Timeline:** Post-Phase 4

| Opportunity | Description | Priority |
|-------------|-------------|----------|
| **5.1 Multi-Guild Dashboard** | Aggregate state across all monitored guilds | Medium |
| **5.2 State Export/Import** | Backup/restore state for migrations | Low |
| **5.3 Real-time Websocket Feed** | Stream state changes to admin dashboard | Low |
| **5.4 Predictive Threat Scoring** | ML-based anomaly detection | Future |
| **5.5 Audit Log Integration** | Correlate Discord audit logs with state | Medium |
| **5.6 Rate Limit Tracking** | Track API rate limits in state | High |

---

## Documentation Updates

| Document | Update Required |
|----------|-----------------|
| `src/bot/state/ROUTER.md` | Fix `.js` → `.ts` extensions |
| `Store/security-bot-state/schema.md` | Create — document state structure |
| `Agents.md` | Document `ARCHIVE_HMAC_SECRET` requirement |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Lines of code | ~4,792 | ~4,730 (-1%) |
| Unused exports | 3 | 0 |
| Security vulnerabilities | 1 | 0 |
| Feature completion | 70% | 95% |
| Documentation accuracy | 60% | 100% |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing state files | Low | High | Schema versioning, backward compat |
| False positive threat detection | Medium | Medium | Conservative thresholds, manual review period |
| Production HMAC env var missing | Low | Critical | Startup validation, deployment checklist |

---

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Dead Code | 30 min | None |
| Phase 2: Feature Wiring | 2-3 hours | Phase 1 |
| Phase 3: Security | 1 hour | None |
| Phase 4: Documentation | 30 min | Phases 1-3 |
| Phase 5: Expansion | Ongoing | Phase 4 |

**Total Tune-Up:** ~4-5 hours  
**Full Project:** Ongoing expansion after tune-up

---

## Changelog

| Date | Change |
|------|--------|
| 2025-12-21 | **VERIFIED** — Corrected line counts, function names, reduced scope |
| 2025-12-21 | Project created after architecture investigation |

---

*This project document lives at `docs/projects/state-persistence-overhaul.md`*
