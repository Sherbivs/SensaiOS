# 🔍 Singularity Audit Report — December 15, 2025

**Audit Type:** Comprehensive Code Duplication Analysis  
**Scope:** Full Application (`src/`, `tests/`, `tools/`)  
**Lead:** Architectural Specialist + DevOps Sr. Lead  
**Status:** Phase 1 Complete (Ongoing Project)

---

## Executive Summary

| Category | Status | Instances | Location(s) | Priority |
|----------|--------|-----------|-------------|----------|
| **ButtonBuilder** | ✅ **SINGULARITY** | 8 | `button-utils.ts` | DONE |
| **HomesteadChannel Queries** | ✅ **BOUNDED** | 25 | 4 services + tests | DONE |
| **EmbedBuilder** | ⚠️ **DISTRIBUTED** | 16 | 10 files | Medium |
| **Embed Colors** | ✅ **CENTRALIZED** | 1 exception | `home.js` hardcoded | Low |
| **Date.now() Patterns** | ⚠️ **DISTRIBUTED** | 100+ | Widespread | Medium |
| **Environment Config** | ✅ **CENTRALIZED** | 100+ refs | `env.js` canonical | DONE |
| **interaction.reply()** | ⚠️ **DISTRIBUTED** | 100+ | Commands/handlers | Low |
| **Error Handling (catch)** | ⚠️ **DISTRIBUTED** | 150+ | Widespread | Medium |

---

## Category 1: ButtonBuilder — ✅ SINGULARITY ACHIEVED

### Final State
```
src/bot/shared/button-utils.ts: 8 instances (CANONICAL)
docs/ (examples): 5 instances (acceptable)
```

### Migration Completed (This Session)
- ✅ `src/commands/home.js` → uses `homeMenuButtons()`
- ✅ `src/bot/battle/challenge.ts` → uses `challengeResponseButtons()`
- ✅ `src/bot/homestead/starters.ts` → uses `starterChoiceButtons()`
- ✅ `src/bot/homestead/open-starter-selection.ts` → uses `homeMenuButtonsEnhanced()`

### Available Factory Functions
| Function | Purpose | Usage |
|----------|---------|-------|
| `primaryButton()` | Blue primary action | Heal, Confirm, Move |
| `secondaryButton()` | Gray secondary | Box, Party, Settings |
| `dangerButton()` | Red destructive | Run, Forfeit, Cancel |
| `successButton()` | Green positive | Accept, Choose |
| `activeButton()` | Green disabled | Nav current view |
| `navButton()` | Context-aware nav | Auto style switching |
| `homeMenuButtons()` | Legacy home menu | JS pattern |
| `homeMenuButtonsEnhanced()` | Two-row emoji menu | TS pattern |
| `challengeResponseButtons()` | Accept/Decline | Battle challenges |
| `starterChoiceButtons()` | Labeled choices | Starter selection |
| `encounterButtons()` | Throw/Swap/Run | Wild encounters |
| `battleActionButtons()` | Move/Switch/Forfeit | Active battles |

---

## Category 2: HomesteadChannel Queries — ✅ BOUNDED

### Current Distribution
| Service | Count | Justification |
|---------|-------|---------------|
| `homestead-manager.ts` | 11 | Complex orchestration (Discord + DB transactions) |
| `homestead-verification.ts` | 9 | Security verification chains |
| `player-checkpoint.ts` | 3 | Checkpoint logic with complex includes |
| `homestead-player-monitor.ts` | 2 | Monitoring with specialized queries |
| **Tests** | ~40 | Test isolation (acceptable) |

### Repository Pattern Available
```typescript
// src/services/homestead-repository.ts
HomesteadRepository.findByUserId(userId, guildId)
HomesteadRepository.findByChannelId(channelId)
HomesteadRepository.create({ userId, guildId, channelId, channelName })
HomesteadRepository.updateLastActivity(id)
HomesteadRepository.softDelete(id)
HomesteadRepository.hardDelete(id)
HomesteadRepository.findStaleChannels(maxAgeHours)
```

### DevOps Recommendation
**NO IMMEDIATE ACTION** — Current distribution is intentional. Complex transaction/verification logic benefits from direct Prisma access. Monitor for new files adding queries.

---

## Category 3: EmbedBuilder — ⚠️ DISTRIBUTED

### Current Distribution (16 instances in src/)
```
src/bot/homestead/open-starter-selection.ts: 4
src/bot/homestead/home.ts: 3
src/services/monitoring/error-alerting-service.ts: 2
src/bot/wilds/controls.ts: 1
src/bot/homestead/starters.ts: 1
src/bot/battle/actions.ts: 1
src/bot/battle/challenge.ts: 1
src/commands/home.js: 1
src/services/player-checkpoint.ts: 1
src/bot/profile/embed.ts: 1
```

### Recommendation: Phase 2 Migration
Create domain-specific embed builders in `src/bot/shared/embed-builders.ts`:

```typescript
// Proposed API
export function homeEmbed(trainer: TrainerData): EmbedBuilder;
export function starterEmbed(starters: StarterOption[]): EmbedBuilder;
export function battleEmbed(battle: BattleState): EmbedBuilder;
export function encounterEmbed(encounter: EncounterData): EmbedBuilder;
export function profileEmbed(profile: ProfileData): EmbedBuilder;
export function errorEmbed(message: string): EmbedBuilder;
```

**Priority:** Medium  
**Effort:** 4-6 hours  
**Dependencies:** None

---

## Category 4: Embed Colors — ✅ CENTRALIZED (1 exception)

### Centralized System
```typescript
// src/bot/shared/embed-colors.ts
export const EMBED_COLORS = {
  SUCCESS: 0x4caf50,
  ERROR: 0xFF0000,
  WARNING: 0xffb74d,
  INFO: 0x2196F3,
  BATTLE: 0xff9800,
  STARTER: 0x00C853,
  PROFILE: 0xffb74d,
  // ...
};
```

### Exception Found
```javascript
// src/commands/home.js:360
.setColor(0x35a7ff);  // Should use EMBED_COLORS constant
```

### Fix Required
```javascript
// Before
.setColor(0x35a7ff);

// After
import { EMBED_COLORS } from '../bot/shared/embed-colors.js';
.setColor(EMBED_COLORS.HOME ?? 0x35a7ff);
```

**Priority:** Low  
**Effort:** 5 minutes

---

## Category 5: Date.now() Patterns — ⚠️ DISTRIBUTED

### Current State
**100+ instances** across the codebase, including:
- Performance timing (`const startTime = Date.now()`)
- Relative date calculations (`new Date(Date.now() - X * 24 * 60 * 60 * 1000)`)
- ID generation (`${Date.now()}_${randomId}`)
- Cache timestamps

### Utilities Already Created (ops/DUPLICATION-REPORT.md)
```typescript
// src/shared/utils/time.ts (proposed)
export const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
export const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);
export const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000);
export const formatDuration = (ms: number) => { /* ... */ };
export const measure = <T>(fn: () => T): { result: T; durationMs: number };
```

### DevOps Recommendation
**Phase 3 Project:** Create centralized time utilities and migrate progressively:
1. Week 1: Create `src/shared/utils/time.ts` with comprehensive API
2. Week 2: Migrate services (`homestead-*`, `resource-monitor`, `health-server`)
3. Week 3: Migrate tests
4. Week 4: Migrate tools

**Priority:** Medium  
**Effort:** 8-12 hours (incremental)

---

## Category 6: Environment Config — ✅ CENTRALIZED

### Architecture
```
src/config/env.js (CANONICAL)
├── 60+ environment variable definitions
├── Type coercion helpers (toBool, toNumber, toList)
├── Validation and defaults
└── Single export point for all config

src/services/*, src/bot/*
└── Import from env.js only (no direct process.env)
```

### Exceptions (Acceptable)
- `tests/*.ts` — Test setup modifying process.env
- `src/services/homestead-verification.ts` — Runtime security checks
- `src/services/lifecycle-notifier.ts` — Webhook URL direct access

### DevOps Recommendation
**NO ACTION NEEDED** — Well-centralized. Continue enforcing import pattern.

---

## Category 7: interaction.reply() Patterns — ⚠️ DISTRIBUTED

### Current State
**100+ instances** of `interaction.reply()`, `interaction.editReply()`, `interaction.followUp()`

### Pattern Observed
```typescript
// Common patterns (scattered across commands)
await interaction.reply({ content: "Message", ephemeral: true });
await interaction.editReply({ content: "Updated" });
await interaction.followUp({ content: "Additional" });
```

### Recommendation: Phase 4 Abstraction
Consider creating response helpers:

```typescript
// src/bot/shared/response-utils.ts (proposed)
export function ephemeralReply(interaction: RepliableInteraction, content: string);
export function publicReply(interaction: RepliableInteraction, content: string);
export function embedReply(interaction: RepliableInteraction, embed: EmbedBuilder);
export function safeReply(interaction: RepliableInteraction, options: ReplyOptions);
```

**Priority:** Low (functional as-is)  
**Effort:** 6-8 hours

---

## Category 8: Error Handling — ⚠️ DISTRIBUTED

### Current State
**150+ catch blocks** with varying error handling patterns:

```typescript
// Pattern 1: Silent logging
} catch (err) {
  log.error('Operation failed', err);
}

// Pattern 2: Re-throw
} catch (err) {
  throw new OperationError('Failed', err);
}

// Pattern 3: Graceful fallback
} catch (err) {
  return defaultValue;
}
```

### Existing Centralization
- `src/bot/error-handler.ts` — Discord interaction errors
- `src/services/monitoring/error-alerting-service.ts` — Alert routing

### Recommendation: Phase 5 Enhancement
1. Create error classification utilities
2. Standardize error logging format
3. Add error telemetry hooks

**Priority:** Medium  
**Effort:** 10-15 hours

---

## Project Roadmap

### ✅ Phase 1 (Complete)
- [x] ButtonBuilder singularity achieved
- [x] HomesteadChannel bounded
- [x] Initial audit complete

### 📋 Phase 2 (Next Sprint)
- [ ] EmbedBuilder abstraction
- [ ] Embed color exception fix
- [ ] Update DUPLICATION-REPORT.md

### 📋 Phase 3 (Future)
- [ ] Date/time utility creation
- [ ] Progressive migration

### 📋 Phase 4 (Future)
- [ ] Response helper abstraction
- [ ] Command pattern standardization

### 📋 Phase 5 (Future)
- [ ] Error handling standardization
- [ ] Telemetry integration

---

## Monitoring Checklist (DevOps Sr. Lead)

### Weekly Review
- [ ] Check for new ButtonBuilder instances outside `button-utils.ts`
- [ ] Check for new HomesteadChannel queries in unexpected files
- [ ] Review new files for pattern compliance

### Monthly Audit
- [ ] Run full singularity scan
- [ ] Update this report
- [ ] Prioritize next phase

### Scan Commands
```powershell
# ButtonBuilder singularity check
Get-ChildItem -Recurse -Include "*.ts","*.js" src | Select-String "new ButtonBuilder\(\)" | Group-Object Path

# HomesteadChannel distribution check
Get-ChildItem -Recurse -Include "*.ts" src/services | Select-String "prisma\.homesteadChannel\." | Group-Object Path

# EmbedBuilder distribution check
Get-ChildItem -Recurse -Include "*.ts","*.js" src | Select-String "new EmbedBuilder\(\)" | Group-Object Path

# Hardcoded colors check
Get-ChildItem -Recurse -Include "*.ts","*.js" src | Select-String "\.setColor\(0x[0-9a-fA-F]+\)" | Group-Object Path
```

---

## Appendix: Files Requiring Attention

### High Priority
| File | Issue | Fix |
|------|-------|-----|
| `src/commands/home.js:360` | Hardcoded color `0x35a7ff` | Use `EMBED_COLORS` constant |

### Medium Priority
| File | Issue | Recommendation |
|------|-------|----------------|
| `src/bot/homestead/open-starter-selection.ts` | 4 EmbedBuilder instances | Create starter embed factory |
| `src/bot/homestead/home.ts` | 3 EmbedBuilder instances | Create home embed factory |
| `tools/ai-report-generator.ts` | 8 Date.now() patterns | Use time utilities when available |

### Low Priority (Tests)
Tests with process.env manipulation are acceptable for test isolation.

---

**Report Generated:** 2025-12-15T12:00:00Z  
**Next Scheduled Audit:** 2025-12-22  
**Maintainer:** Architectural Specialist / DevOps Sr. Lead
