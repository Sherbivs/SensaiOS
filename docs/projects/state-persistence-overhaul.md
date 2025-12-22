# State Persistence System Overhaul Project

**Project ID:** STATE-OVERHAUL  
**Status:** 🟡 PLANNING  
**Created:** 2025-12-21  
**Owner:** Cleanup Agent + Architecture Team

---

## Executive Summary

The Security Bot state persistence system has grown organically to ~3,700 lines across 11 files. An architectural review revealed **30% dead code**, **2 security vulnerabilities**, and **significant expansion opportunities**. This project will tune up the existing system, then expand its capabilities.

---

## Current Architecture

```
src/bot/state/
├── persistence.ts      — Core save/load/snapshot lifecycle (280 lines)
├── stats.ts            — Cumulative statistics recording (180 lines)
├── timeline.ts         — Activity timeline formatting (320 lines)
├── context.ts          — Guild state restoration (220 lines)
├── types.ts            — Shared TypeScript types (150 lines)
├── roleArchive.ts      — Role change history, HMAC signed (650 lines)
├── securityBaselines.ts — Baseline generation for threat detection (400 lines)
├── threatDetector.ts   — Pattern matching engine (380 lines)
├── threatResponse.ts   — Automated response actions (550 lines)
├── securityMetrics.ts  — Dashboard metrics & health (520 lines)
└── ROUTER.md           — Domain documentation

Store/security-bot-state/
├── current.json        — Active runtime state
├── previous.json       — Backup from last restart
├── snapshots/          — Hourly backups (7-day retention)
├── baselines.json      — Security baselines
└── role-archive/       — HMAC-signed role change history
```

---

## Problem Statement

### Critical Issues
| ID | Issue | Severity | Impact |
|----|-------|----------|--------|
| **S-001** | Hardcoded HMAC fallback secret | 🔴 Critical | Tamper protection is theater if env var not set |
| **S-002** | Synchronous file I/O in metrics | 🟠 Medium | Blocks event loop during dashboard generation |

### Dead Code (30% of exports unused)
| Module | Dead Functions | Lines |
|--------|----------------|-------|
| `timeline.ts` | 6 functions | ~120 |
| `context.ts` | 3 functions | ~80 |
| `threatResponse.ts` | 2 functions | ~100 |
| `threatDetector.ts` | 1 function | ~50 |
| `securityMetrics.ts` | 1 function | ~40 |
| `roleArchive.ts` | 1 function | ~30 |
| **Total** | **14 functions** | **~420 lines** |

### Incomplete Features
- `freezePermissions()` — Stubbed with TODO, never implemented
- `handleThreat()` / `logThreatOnly()` — Built but not wired to sweep workflow
- `analyzeRoleChange()` — Pattern matching exists but not integrated

### Documentation Drift
- `schema.md` says version 1.0.0, code uses 1.1.0
- `metricsHistory` field undocumented
- ROUTER.md references `.js` extensions (files are `.ts`)

---

## Project Phases

### Phase 1: Dead Code Removal 🧹
**Goal:** Remove 14 unused functions (~420 lines)  
**Risk:** Low — No behavior change  
**Verification:** Build + test pass

| Task | File | Functions to Remove |
|------|------|---------------------|
| 1.1 | `timeline.ts` | `getEventsByType`, `getEventsByGuild`, `filterEventsByDate`, `getEventCountByType`, `getEventDensity`, `formatEventDensity` |
| 1.2 | `context.ts` | `serializeGuildState`, `deserializeGuildState`, `clearGuildState` |
| 1.3 | `threatResponse.ts` | `handleThreat`, `logThreatOnly` (move to Phase 4 if wiring) |
| 1.4 | `threatDetector.ts` | `analyzeRoleChange` (move to Phase 4 if wiring) |
| 1.5 | `securityMetrics.ts` | `getSecurityDashboard` |
| 1.6 | `roleArchive.ts` | `compactArchive` |
| 1.7 | Remove `freezePermissions()` stub or implement |

**Acceptance Criteria:**
- [ ] All dead functions removed or marked `@internal`
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] No new lint warnings

---

### Phase 2: Security Hardening 🔒
**Goal:** Eliminate hardcoded HMAC fallback  
**Risk:** Medium — Affects production if env var missing  
**Verification:** Manual test with/without env var

| Task | Description |
|------|-------------|
| 2.1 | Create `src/bot/state/config.ts` — Centralized secret loading |
| 2.2 | Update `roleArchive.ts` to import from config |
| 2.3 | Update `securityMetrics.ts` to import from config |
| 2.4 | Add startup validation — Fail-fast if `SECURITY_HMAC_SECRET` not set in production |
| 2.5 | Document required env var in `Agents.md` and `.env.example` |

**Config Module Design:**
```typescript
// src/bot/state/config.ts
const REQUIRED_IN_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.RENDER;

export function getHmacSecret(): string {
  const secret = process.env.SECURITY_HMAC_SECRET;
  
  if (!secret && REQUIRED_IN_PRODUCTION) {
    throw new Error('SECURITY_HMAC_SECRET required in production');
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
- [ ] No hardcoded secrets in module files

---

### Phase 3: Performance Optimization ⚡
**Goal:** Eliminate blocking I/O, improve startup time  
**Risk:** Low — Refactoring internal implementation  
**Verification:** Startup time measurement, no event loop blocking

| Task | Description | Expected Impact |
|------|-------------|-----------------|
| 3.1 | Convert `securityMetrics.ts` sync reads to async | Unblock event loop |
| 3.2 | Add result caching for archive health checks | Reduce repeated I/O |
| 3.3 | Lazy-load security baselines | Faster startup |
| 3.4 | Batch timeline event writes (write-behind buffer) | Reduce disk I/O on sweeps |
| 3.5 | Add memory metrics to state size tracking | Observability |

**Measurement Plan:**
```bash
# Before optimization
npm run measure:startup  # Record baseline

# After optimization
npm run measure:startup  # Compare
```

**Acceptance Criteria:**
- [ ] No `readFileSync` in hot paths
- [ ] Baseline generation deferred until first use
- [ ] Timeline writes batched (max 1 write per 5 seconds)
- [ ] Startup time ≤ baseline or improved

---

### Phase 4: Feature Completion 🔧
**Goal:** Wire existing but unused threat detection/response  
**Risk:** Medium — New runtime behavior  
**Verification:** Integration tests, manual threat simulation

| Task | Description |
|------|-------------|
| 4.1 | Wire `analyzeRoleChange()` into sweep workflow in `main.js` |
| 4.2 | Wire `handleThreat()` for high-confidence detections |
| 4.3 | Add `/ops threats` command to view detected patterns |
| 4.4 | Add threat response configuration (enable/disable auto-response) |
| 4.5 | Create threat detection tests |

**Integration Point:**
```typescript
// In sweep workflow after role change detection
const analysis = analyzeRoleChange(change, baselines);
if (analysis.confidence > 0.8) {
  if (config.autoResponse) {
    await handleThreat(analysis, client);
  } else {
    await logThreatOnly(analysis);
  }
  recordAlert(state, analysis);
}
```

**Acceptance Criteria:**
- [ ] Threat detection runs on every sweep
- [ ] High-confidence threats trigger configurable response
- [ ] `/ops threats` shows recent detections
- [ ] No false positives in production (monitor for 1 week)

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
| `Store/security-bot-state/schema.md` | Bump to 1.1.0, document `metricsHistory` |
| `src/bot/state/ROUTER.md` | Fix `.js` → `.ts` extensions |
| `Agents.md` | Document `SECURITY_HMAC_SECRET` requirement |
| `.env.example` | Add `SECURITY_HMAC_SECRET` placeholder |
| `docs/architecture-bible/` | Add state persistence section |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Lines of code | ~3,700 | ~3,200 (-15%) |
| Dead exports | 14 | 0 |
| Security vulnerabilities | 2 | 0 |
| Blocking I/O calls | 3 | 0 |
| Test coverage | ~40% | 80% |
| Feature completion | 60% | 95% |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing state files | Low | High | Schema versioning, backward compat |
| False positive threat detection | Medium | Medium | Conservative thresholds, manual review period |
| Production HMAC env var missing | Low | Critical | Startup validation, deployment checklist |
| Performance regression | Low | Medium | Measurement before/after each phase |

---

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Dead Code | 1-2 hours | None |
| Phase 2: Security | 1 hour | Phase 1 |
| Phase 3: Performance | 2-3 hours | Phase 1 |
| Phase 4: Features | 3-4 hours | Phase 2, 3 |
| Phase 5: Expansion | Ongoing | Phase 4 |

**Total Tune-Up:** ~8-10 hours  
**Full Project:** Ongoing expansion after tune-up

---

## Changelog

| Date | Change |
|------|--------|
| 2025-12-21 | Project created after architecture investigation |

---

*This project document lives at `docs/projects/state-persistence-overhaul.md`*
