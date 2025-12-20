# 🛠️ Singularity Remediation Plan — Distributed Patterns

**Document Type:** Technical Remediation Plan  
**Created:** December 15, 2025  
**Team:** Architectural Specialist + DevOps Sr. Lead  
**Derived From:** `SINGULARITY-AUDIT-2025-12-15.md`

---

## 📊 Executive Summary

Four distributed patterns require remediation to achieve full code singularity:

| Pattern | Instances | Effort | Sprint | Owner |
|---------|-----------|--------|--------|-------|
| **EmbedBuilder** | 16 | 4-6 hours | Sprint 1 | Arch Specialist |
| **Date/Time Utils** | 100+ | 8-12 hours | Sprint 2 | DevOps |
| **Response Helpers** | 100+ | 6-8 hours | Sprint 3 | Arch Specialist |
| **Error Handling** | 150+ | 10-15 hours | Sprint 4 | DevOps |

**Total Estimated Effort:** 28-41 hours over 4 sprints

---

## 🚀 Sprint 1: EmbedBuilder Abstraction (4-6 hours)

### Goal
Reduce 16 EmbedBuilder instances across 10 files → 1 canonical file with domain factories

### Target Files (By Priority)

| File | Instances | Domain | Factory Needed |
|------|-----------|--------|----------------|
| `src/bot/homestead/open-starter-selection.ts` | 4 | Starters | `starterSelectEmbed()` |
| `src/bot/homestead/home.ts` | 3 | Home | `homeEmbed()` |
| `src/services/monitoring/error-alerting-service.ts` | 2 | Errors | `alertEmbed()` |
| `src/bot/wilds/controls.ts` | 1 | Encounter | `encounterEmbed()` |
| `src/bot/homestead/starters.ts` | 1 | Starters | `starterChoiceEmbed()` |
| `src/bot/battle/actions.ts` | 1 | Battle | `battleActionEmbed()` |
| `src/bot/battle/challenge.ts` | 1 | Battle | `challengeEmbed()` |
| `src/commands/home.js` | 1 | Home | `homeMenuEmbed()` |
| `src/services/player-checkpoint.ts` | 1 | System | `checkpointEmbed()` |
| `src/bot/profile/embed.ts` | 1 | Profile | Already abstracted ✅ |

### Implementation Plan

#### Task 1.1: Create Canonical File (1 hour)
```typescript
// CREATE: src/bot/shared/embed-builders.ts

import { EmbedBuilder } from "discord.js";
import { EMBED_COLORS } from "./embed-colors.js";

// ============ HOME DOMAIN ============

export interface HomeEmbedData {
  username: string;
  trainerLevel?: number;
  pokemonCount?: number;
  lastLocation?: string;
}

export function homeEmbed(data: HomeEmbedData): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.HOME ?? 0x35a7ff)
    .setTitle(`🏠 ${data.username}'s Homestead`)
    .setDescription("Welcome home, Trainer!")
    .addFields(
      { name: "Level", value: `${data.trainerLevel ?? 1}`, inline: true },
      { name: "Pokémon", value: `${data.pokemonCount ?? 0}`, inline: true }
    );
}

export function homeMenuEmbed(username: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.HOME ?? 0x35a7ff)
    .setTitle(`🏠 ${username}'s Home`)
    .setDescription("What would you like to do?");
}

// ============ STARTER DOMAIN ============

export interface StarterOption {
  name: string;
  type: string;
  sprite?: string;
  description?: string;
}

export function starterSelectEmbed(starters: StarterOption[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.STARTER)
    .setTitle("🎮 Choose Your Starter!")
    .setDescription("Select your first partner Pokémon:");
  
  for (const starter of starters) {
    embed.addFields({
      name: `${starter.name} (${starter.type})`,
      value: starter.description ?? "A reliable partner!",
      inline: true
    });
  }
  
  return embed;
}

export function starterChoiceEmbed(starter: StarterOption): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.STARTER)
    .setTitle(`You chose ${starter.name}!`)
    .setDescription(`${starter.name} will be your partner on this adventure!`);
}

// ============ BATTLE DOMAIN ============

export interface BattleEmbedData {
  challenger: string;
  defender: string;
  turnNumber?: number;
  status?: string;
}

export function challengeEmbed(challenger: string, defender: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.BATTLE)
    .setTitle("⚔️ Battle Challenge!")
    .setDescription(`**${challenger}** has challenged **${defender}** to a battle!`);
}

export function battleActionEmbed(data: BattleEmbedData): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.BATTLE)
    .setTitle(`⚔️ Battle: ${data.challenger} vs ${data.defender}`)
    .setDescription(data.status ?? "Choose your action!");
}

// ============ ENCOUNTER DOMAIN ============

export interface EncounterEmbedData {
  pokemonName: string;
  pokemonLevel: number;
  sprite?: string;
  isShiny?: boolean;
}

export function encounterEmbed(data: EncounterEmbedData): EmbedBuilder {
  const shinyIndicator = data.isShiny ? "✨ " : "";
  return new EmbedBuilder()
    .setColor(data.isShiny ? EMBED_COLORS.SHINY : EMBED_COLORS.ENCOUNTER)
    .setTitle(`${shinyIndicator}A wild ${data.pokemonName} appeared!`)
    .setDescription(`Level ${data.pokemonLevel}`)
    .setThumbnail(data.sprite ?? null);
}

// ============ SYSTEM/ALERTS DOMAIN ============

export function errorEmbed(title: string, message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.ERROR)
    .setTitle(`❌ ${title}`)
    .setDescription(message)
    .setTimestamp();
}

export function alertEmbed(
  level: "info" | "warning" | "error" | "critical",
  title: string,
  message: string
): EmbedBuilder {
  const colors = {
    info: EMBED_COLORS.INFO,
    warning: EMBED_COLORS.WARNING,
    error: EMBED_COLORS.ERROR,
    critical: EMBED_COLORS.ERROR
  };
  const icons = {
    info: "ℹ️",
    warning: "⚠️",
    error: "❌",
    critical: "🚨"
  };
  
  return new EmbedBuilder()
    .setColor(colors[level])
    .setTitle(`${icons[level]} ${title}`)
    .setDescription(message)
    .setTimestamp();
}

export function checkpointEmbed(status: string, details?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.SUCCESS)
    .setTitle("💾 Checkpoint")
    .setDescription(status)
    .addFields(details ? [{ name: "Details", value: details }] : []);
}
```

#### Task 1.2: Migrate High-Instance Files (2-3 hours)

**File 1: `open-starter-selection.ts` (4 instances)**
```typescript
// BEFORE: Direct EmbedBuilder construction
const embed = new EmbedBuilder()
  .setColor(EMBED_COLORS.STARTER)
  .setTitle("Choose Your Starter!")
  // ...

// AFTER: Use factory
import { starterSelectEmbed } from "../shared/embed-builders.js";
const embed = starterSelectEmbed(starters);
```

**File 2: `home.ts` (3 instances)**
```typescript
// AFTER: Use factories
import { homeEmbed, homeMenuEmbed } from "../shared/embed-builders.js";
const embed = homeEmbed({ username, trainerLevel, pokemonCount });
```

**File 3: `error-alerting-service.ts` (2 instances)**
```typescript
// AFTER: Use alertEmbed factory
import { alertEmbed } from "../../bot/shared/embed-builders.js";
const embed = alertEmbed("error", "Service Alert", message);
```

#### Task 1.3: Migrate Remaining Files (1-2 hours)
- `controls.ts` → `encounterEmbed()`
- `starters.ts` → `starterChoiceEmbed()`
- `actions.ts` → `battleActionEmbed()`
- `challenge.ts` → `challengeEmbed()`
- `home.js` → `homeMenuEmbed()` + fix hardcoded color
- `player-checkpoint.ts` → `checkpointEmbed()`

#### Task 1.4: Update Embed Colors (15 min)
```typescript
// ADD to src/bot/shared/embed-colors.ts
export const EMBED_COLORS = {
  // Existing...
  HOME: 0x35a7ff,        // NEW: Home/menu embeds
  ENCOUNTER: 0x4CAF50,   // NEW: Wild encounters
  SHINY: 0xFFD700,       // NEW: Shiny encounters
  CHECKPOINT: 0x2196F3,  // NEW: System checkpoints
};
```

### Acceptance Criteria
- [ ] `embed-builders.ts` created with 10+ factory functions
- [ ] All 16 EmbedBuilder instances migrated
- [ ] `home.js:360` hardcoded color fixed
- [ ] Build passes (`npm run build`)
- [ ] No new EmbedBuilder instances outside canonical file

---

## 🚀 Sprint 2: Date/Time Utilities (8-12 hours)

### Goal
Create centralized time utilities and progressively migrate 100+ `Date.now()` patterns

### Implementation Plan

#### Task 2.1: Create Time Utilities (2 hours)
```typescript
// CREATE: src/shared/utils/time.ts

/**
 * Centralized time utilities for consistent date handling
 */

// ============ RELATIVE DATE HELPERS ============

export const daysAgo = (days: number): Date => 
  new Date(Date.now() - days * 24 * 60 * 60 * 1000);

export const hoursAgo = (hours: number): Date => 
  new Date(Date.now() - hours * 60 * 60 * 1000);

export const minutesAgo = (minutes: number): Date => 
  new Date(Date.now() - minutes * 60 * 1000);

export const secondsAgo = (seconds: number): Date => 
  new Date(Date.now() - seconds * 1000);

export const daysFromNow = (days: number): Date => 
  new Date(Date.now() + days * 24 * 60 * 60 * 1000);

export const hoursFromNow = (hours: number): Date => 
  new Date(Date.now() + hours * 60 * 60 * 1000);

// ============ DURATION FORMATTING ============

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

export function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

// ============ PERFORMANCE MEASUREMENT ============

export interface MeasureResult<T> {
  result: T;
  durationMs: number;
}

export function measure<T>(fn: () => T): MeasureResult<T> {
  const start = Date.now();
  const result = fn();
  return { result, durationMs: Date.now() - start };
}

export async function measureAsync<T>(fn: () => Promise<T>): Promise<MeasureResult<T>> {
  const start = Date.now();
  const result = await fn();
  return { result, durationMs: Date.now() - start };
}

// ============ TIMESTAMP HELPERS ============

export const nowMs = (): number => Date.now();

export const nowISO = (): string => new Date().toISOString();

export const nowUnix = (): number => Math.floor(Date.now() / 1000);

export function generateTimestampId(prefix: string = ""): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============ DATE COMPARISON ============

export function isWithinLast(date: Date, ms: number): boolean {
  return Date.now() - date.getTime() <= ms;
}

export function isOlderThan(date: Date, ms: number): boolean {
  return Date.now() - date.getTime() > ms;
}

export function isBetween(date: Date, start: Date, end: Date): boolean {
  const ts = date.getTime();
  return ts >= start.getTime() && ts <= end.getTime();
}

// ============ CONSTANTS ============

export const MS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;
```

#### Task 2.2: Create Unit Tests (1 hour)
```typescript
// CREATE: tests/shared/time.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  daysAgo, hoursAgo, minutesAgo,
  formatDuration, formatRelativeTime,
  measure, measureAsync,
  MS, isWithinLast, isOlderThan
} from "../../src/shared/utils/time.js";

describe("Time Utilities", () => {
  describe("Relative Date Helpers", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-12-15T12:00:00Z"));
    });
    afterEach(() => vi.useRealTimers());

    it("daysAgo returns correct date", () => {
      expect(daysAgo(1).toISOString()).toBe("2025-12-14T12:00:00.000Z");
      expect(daysAgo(7).toISOString()).toBe("2025-12-08T12:00:00.000Z");
    });

    it("hoursAgo returns correct date", () => {
      expect(hoursAgo(2).toISOString()).toBe("2025-12-15T10:00:00.000Z");
    });

    it("minutesAgo returns correct date", () => {
      expect(minutesAgo(30).toISOString()).toBe("2025-12-15T11:30:00.000Z");
    });
  });

  describe("Duration Formatting", () => {
    it("formats milliseconds", () => {
      expect(formatDuration(500)).toBe("500ms");
    });
    it("formats seconds", () => {
      expect(formatDuration(5000)).toBe("5.0s");
    });
    it("formats minutes", () => {
      expect(formatDuration(125000)).toBe("2m 5s");
    });
    it("formats hours", () => {
      expect(formatDuration(7320000)).toBe("2h 2m");
    });
  });

  describe("Measurement", () => {
    it("measures sync function", () => {
      const result = measure(() => 42);
      expect(result.result).toBe(42);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("measures async function", async () => {
      const result = await measureAsync(async () => {
        await new Promise(r => setTimeout(r, 10));
        return "done";
      });
      expect(result.result).toBe("done");
      expect(result.durationMs).toBeGreaterThanOrEqual(10);
    });
  });
});
```

#### Task 2.3: Progressive Migration (5-9 hours)

**Week 2A: Services (3-4 hours)**
Priority files with most Date.now() usage:
- `src/services/homestead-manager.ts`
- `src/services/resource-monitor.ts`
- `src/services/health-server.ts`
- `src/services/lifecycle-notifier.ts`

**Week 2B: Workers & Tools (2-3 hours)**
- `src/workers/security-worker.ts`
- `tools/ai-report-generator.ts` (8 instances)
- `scripts/` files with timing

**Week 2C: Remaining (2 hours)**
- `src/bot/` files
- Low-priority services

### Acceptance Criteria
- [ ] `src/shared/utils/time.ts` created with 15+ utilities
- [ ] Unit tests with >90% coverage
- [ ] High-priority services migrated
- [ ] No regression in existing functionality

---

## 🚀 Sprint 3: Response Helpers (6-8 hours)

### Goal
Standardize 100+ `interaction.reply()` patterns into reusable helpers

### Implementation Plan

#### Task 3.1: Create Response Utilities (2 hours)
```typescript
// CREATE: src/bot/shared/response-utils.ts

import { 
  ChatInputCommandInteraction,
  ButtonInteraction,
  EmbedBuilder,
  InteractionReplyOptions,
  InteractionEditReplyOptions
} from "discord.js";

type RepliableInteraction = ChatInputCommandInteraction | ButtonInteraction;

// ============ EPHEMERAL RESPONSES ============

export async function ephemeralReply(
  interaction: RepliableInteraction,
  content: string
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content, ephemeral: true });
  } else {
    await interaction.reply({ content, ephemeral: true });
  }
}

export async function ephemeralEmbed(
  interaction: RepliableInteraction,
  embed: EmbedBuilder
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ embeds: [embed], ephemeral: true });
  } else {
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

// ============ PUBLIC RESPONSES ============

export async function publicReply(
  interaction: RepliableInteraction,
  content: string
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content });
  } else {
    await interaction.reply({ content });
  }
}

export async function publicEmbed(
  interaction: RepliableInteraction,
  embed: EmbedBuilder
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ embeds: [embed] });
  } else {
    await interaction.reply({ embeds: [embed] });
  }
}

// ============ SAFE RESPONSE (handles edge cases) ============

export async function safeReply(
  interaction: RepliableInteraction,
  options: InteractionReplyOptions
): Promise<boolean> {
  try {
    if (interaction.replied) {
      await interaction.followUp(options);
    } else if (interaction.deferred) {
      await interaction.editReply(options as InteractionEditReplyOptions);
    } else {
      await interaction.reply(options);
    }
    return true;
  } catch (error) {
    console.error("[safeReply] Failed:", error);
    return false;
  }
}

// ============ ERROR RESPONSES ============

import { errorEmbed } from "./embed-builders.js";

export async function errorReply(
  interaction: RepliableInteraction,
  title: string,
  message: string
): Promise<void> {
  await ephemeralEmbed(interaction, errorEmbed(title, message));
}

export async function validationError(
  interaction: RepliableInteraction,
  message: string
): Promise<void> {
  await ephemeralReply(interaction, `❌ ${message}`);
}

// ============ SUCCESS RESPONSES ============

export async function successReply(
  interaction: RepliableInteraction,
  message: string
): Promise<void> {
  await ephemeralReply(interaction, `✅ ${message}`);
}

// ============ DEFERRED RESPONSES ============

export async function deferEphemeral(
  interaction: RepliableInteraction
): Promise<void> {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }
}

export async function deferPublic(
  interaction: RepliableInteraction
): Promise<void> {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }
}
```

#### Task 3.2: Migration by Command Type (4-6 hours)
- Slash commands (`src/commands/`)
- Button handlers (`src/bot/`)
- Admin commands (`src/bot/ops/`)

### Acceptance Criteria
- [ ] `response-utils.ts` created with 10+ helpers
- [ ] High-traffic commands migrated
- [ ] Error handling consistent across responses

---

## 🚀 Sprint 4: Error Handling Standardization (10-15 hours)

### Goal
Standardize 150+ catch blocks with consistent error classification and telemetry

### Implementation Plan

#### Task 4.1: Create Error Classification System (3 hours)
```typescript
// CREATE: src/shared/errors/error-classifier.ts

export enum ErrorCategory {
  NETWORK = "NETWORK",
  DATABASE = "DATABASE",
  DISCORD_API = "DISCORD_API",
  VALIDATION = "VALIDATION",
  BUSINESS_LOGIC = "BUSINESS_LOGIC",
  SYSTEM = "SYSTEM",
  UNKNOWN = "UNKNOWN"
}

export interface ClassifiedError {
  category: ErrorCategory;
  code: string;
  message: string;
  originalError: unknown;
  isRetryable: boolean;
  severity: "low" | "medium" | "high" | "critical";
}

export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof PrismaClientKnownRequestError) {
    return {
      category: ErrorCategory.DATABASE,
      code: error.code,
      message: error.message,
      originalError: error,
      isRetryable: ["P1001", "P1002", "P2024"].includes(error.code),
      severity: "high"
    };
  }
  
  if (error instanceof DiscordAPIError) {
    return {
      category: ErrorCategory.DISCORD_API,
      code: String(error.code),
      message: error.message,
      originalError: error,
      isRetryable: [50001, 50013, 10008].includes(error.code as number),
      severity: error.code === 50007 ? "low" : "medium"
    };
  }
  
  // ... more classifications
  
  return {
    category: ErrorCategory.UNKNOWN,
    code: "UNKNOWN",
    message: error instanceof Error ? error.message : String(error),
    originalError: error,
    isRetryable: false,
    severity: "medium"
  };
}
```

#### Task 4.2: Create Error Handling Patterns (2 hours)
```typescript
// CREATE: src/shared/errors/error-handler.ts

import { classifyError, ClassifiedError } from "./error-classifier.js";
import { log } from "../logger.js";

export async function handleError(
  error: unknown,
  context: string,
  options?: {
    silent?: boolean;
    rethrow?: boolean;
    alertThreshold?: "low" | "medium" | "high" | "critical";
  }
): Promise<ClassifiedError> {
  const classified = classifyError(error);
  
  // Log based on severity
  if (!options?.silent) {
    const logFn = classified.severity === "critical" ? log.error :
                  classified.severity === "high" ? log.warn : log.info;
    logFn(`[${context}] ${classified.category}: ${classified.message}`, {
      code: classified.code,
      isRetryable: classified.isRetryable
    });
  }
  
  // Alert if above threshold
  if (shouldAlert(classified.severity, options?.alertThreshold)) {
    await sendAlert(classified, context);
  }
  
  // Rethrow if requested
  if (options?.rethrow) {
    throw error;
  }
  
  return classified;
}

export function withErrorHandling<T>(
  fn: () => T,
  context: string,
  fallback?: T
): T | typeof fallback {
  try {
    return fn();
  } catch (error) {
    handleError(error, context);
    return fallback;
  }
}

export async function withErrorHandlingAsync<T>(
  fn: () => Promise<T>,
  context: string,
  fallback?: T
): Promise<T | typeof fallback> {
  try {
    return await fn();
  } catch (error) {
    await handleError(error, context);
    return fallback;
  }
}
```

#### Task 4.3: Progressive Migration (5-10 hours)
Replace scattered catch blocks with standardized patterns.

### Acceptance Criteria
- [ ] Error classifier handles 10+ error types
- [ ] Consistent logging format across codebase
- [ ] Alert routing for critical errors
- [ ] High-traffic error paths migrated

---

## 📋 Sprint Schedule

| Sprint | Start | End | Focus |
|--------|-------|-----|-------|
| Sprint 1 | Week 1 | Week 1 | EmbedBuilder abstraction |
| Sprint 2 | Week 2 | Week 3 | Date/Time utilities |
| Sprint 3 | Week 4 | Week 4 | Response helpers |
| Sprint 4 | Week 5 | Week 6 | Error handling |

---

## 🎯 Success Metrics

### Quantitative
- [ ] EmbedBuilder: 16 → 1 canonical file
- [ ] Date.now(): 100+ → <20 direct calls (rest use utilities)
- [ ] interaction.reply: 100+ → <30 direct calls (rest use helpers)
- [ ] catch blocks: Consistent logging format in >80%

### Qualitative
- [ ] New devs can find utilities in predictable locations
- [ ] Error messages follow consistent format
- [ ] Code reviews catch pattern violations

---

## 🔍 Review Checkpoints

### After Each Sprint
1. Run singularity scan commands (see Audit Report)
2. Update `SINGULARITY-AUDIT-2025-12-15.md`
3. Update `DUPLICATION-REPORT.md`
4. Team retrospective on pattern adoption

### Monthly
1. Full codebase audit
2. Update this remediation plan
3. Prioritize next patterns for singularity

---

**Document Owner:** Architectural Specialist  
**Reviewers:** DevOps Sr. Lead  
**Last Updated:** 2025-12-15
