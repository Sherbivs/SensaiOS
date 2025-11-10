# Schema Northstar Optimization Plan

_Created: 2025-11-06T16:15:00Z (UTC) — Status: DRAFT_

## Executive Summary

This document outlines the comprehensive database optimization and user profile enhancement strategy for Infinity Gauntlet. The goal is to rebuild the schema according to Northstar principles: clean architecture, fast queries, comprehensive user profiles with event tracking, and production-ready performance.

## Current State Analysis

### Schema Assessment (as of 2025-11-06)

**Strengths:**
- ✅ Clean dex reference spine (Species, Move, Ability, Type) with proper normalization
- ✅ Composite indexes on junctions (SpeciesType, SpeciesAbility, SpeciesLearnset)
- ✅ Scaling indexes added in 202510280500 migration
- ✅ Materialized view `SpeciesSheet` for fast battle UI hydration
- ✅ Tenant isolation architecture ready (multi-tenant support)
- ✅ Dual database architecture (DEV + PROD simultaneous)

**Gaps & Opportunities:**
- ⚠️ User/Trainer relationship could be simplified (currently split across two tables)
- ⚠️ Limited user profile features (only tagline, bio, favoriteSpecies)
- ⚠️ No comprehensive event tracking system for user activities
- ⚠️ No analytics/metrics tables for fast dashboard queries
- ⚠️ Missing indexes for common query patterns (leaderboards, activity feeds)
- ⚠️ No PII handling or privacy controls documented
- ⚠️ BusMessage table growing unbounded (needs retention policy)
- ⚠️ No query performance monitoring beyond basic telemetry

**Storage Metrics:**
- Render Production: 0.5 GB quota, usage TBD
- Render Dev: 1.0 GB quota, usage TBD
- Alert thresholds: 60% (warning), 80% (critical)

## Northstar Schema Design

### 1. Enhanced User Profile System

**Goal:** Comprehensive user profiles with achievements, preferences, statistics, and activity tracking.

**New/Modified Tables:**

```prisma
model User {
  id                      String   @id @default(cuid())
  discordId               String   @unique
  platformId              String?  @unique
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  
  // Consolidated from multiple sources
  nickname                String?
  tagline                 String?
  bio                     String?
  avatarUrl               String?
  
  // Game economy
  coins                   Int      @default(0)
  premiumCoins            Int      @default(0)
  
  // Preferences
  settingsJson            Json?    // UI prefs, notifications, privacy
  
  // Statistics (denormalized for fast access)
  totalBattles            Int      @default(0)
  totalWins               Int      @default(0)
  totalCatches            Int      @default(0)
  totalEncounters         Int      @default(0)
  favoriteSpeciesId       Int?     @db.SmallInt
  
  // Streaks & engagement
  dailyQuestStreak        Int      @default(0)
  dailyQuestLastCompleted DateTime?
  dailyQuestLastReset     DateTime?
  lastLoginAt             DateTime?
  lastActivityAt          DateTime?
  
  // Privacy controls
  profileVisibility       String   @default("public") // public|friends|private
  showStats               Boolean  @default(true)
  showAchievements        Boolean  @default(true)
  
  // Relations
  profile                 UserProfile?
  events                  UserEvent[]
  achievements            UserAchievement[]
  parties                 Party[]
  pokemon                 PokemonInstance[]
  encounters              Encounter[]
  battlesP1               Battle[]  @relation("BattlesAsP1")
  battlesP2               Battle[]  @relation("BattlesAsP2")
  cooldowns               Cooldown[]
  trainers                Trainer[]
  favoriteSpecies         Species?  @relation(fields: [favoriteSpeciesId], references: [id], onDelete: SetNull)
  
  @@index([discordId])
  @@index([lastActivityAt])
  @@index([totalBattles, totalWins]) // Leaderboard queries
  @@index([dailyQuestStreak])
}

model UserProfile {
  userId            String   @id
  
  // Extended profile fields
  timezone          String?
  language          String   @default("en")
  favoriteColor     String?
  
  // Achievement display
  displayBadges     Json?    // Array of badge IDs to show on profile
  
  // Social
  friendCode        String?  @unique
  discord           String?
  
  // Metadata
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([friendCode])
}
```

### 2. Comprehensive Event Tracking

**Goal:** Track all user activities for analytics, auditing, and personalization.

**Event Categories:**
- **Gameplay:** battles, catches, encounters, evolutions, trades
- **Engagement:** logins, daily quests, achievements unlocked
- **Economy:** coin transactions, item usage, purchases
- **Social:** friend adds, profile updates, chat messages
- **System:** errors, performance metrics, feature usage

```prisma
enum EventCategory {
  gameplay
  engagement
  economy
  social
  system
  admin
}

enum EventSeverity {
  info
  warning
  error
  critical
}

model UserEvent {
  id            String        @id @default(cuid())
  userId        String
  category      EventCategory
  eventType     String        // "battle.won", "pokemon.caught", "login", etc.
  severity      EventSeverity @default(info)
  
  // Event payload (structured JSON)
  data          Json?
  
  // Context
  sessionId     String?
  ipAddress     String?       // Hashed for privacy
  userAgent     String?
  
  // Associations
  relatedEntityType String?   // "Battle", "PokemonInstance", etc.
  relatedEntityId   String?
  
  // Timestamps
  occurredAt    DateTime      @default(now())
  processedAt   DateTime?
  
  // Privacy
  isPII         Boolean       @default(false)
  retainUntil   DateTime?     // Auto-delete after retention period
  
  user          User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId, occurredAt(sort: Desc)])
  @@index([category, eventType, occurredAt])
  @@index([sessionId])
  @@index([retainUntil]) // Cleanup queries
  @@index([userId, category, occurredAt(sort: Desc)]) // User timeline by category
}
```

### 3. Achievement System

**Goal:** Gamify user engagement with unlockable achievements and badges.

```prisma
model Achievement {
  id            Int      @id @db.SmallInt
  slug          String   @unique
  name          String
  description   String
  category      String   // "battles", "catching", "exploration", etc.
  
  // Requirements (flexible JSON)
  criteria      Json     // {type: "battle_wins", count: 100}
  
  // Rewards
  coinReward    Int      @default(0)
  badgeIcon     String?
  
  // Metadata
  rarity        String   @default("common") // common|rare|epic|legendary
  isSecret      Boolean  @default(false)
  sortOrder     Int      @default(0)
  
  userAchievements UserAchievement[]
  
  @@index([category, sortOrder])
}

model UserAchievement {
  userId        String
  achievementId Int      @db.SmallInt
  
  // Progress tracking
  progress      Int      @default(0)
  isCompleted   Boolean  @default(false)
  completedAt   DateTime?
  
  // Metadata
  firstSeenAt   DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  user          User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  achievement   Achievement @relation(fields: [achievementId], references: [id], onDelete: Cascade)
  
  @@id([userId, achievementId])
  @@index([userId, isCompleted])
  @@index([achievementId, isCompleted])
}
```

### 4. Analytics & Reporting Tables

**Goal:** Fast queries for dashboards and leaderboards without impacting transactional workload.

```prisma
model DailyStats {
  date          DateTime @id @db.Date
  
  // User metrics
  activeUsers   Int      @default(0)
  newUsers      Int      @default(0)
  
  // Gameplay metrics
  battlesTotal  Int      @default(0)
  catchesTotal  Int      @default(0)
  encountersTotal Int    @default(0)
  
  // Economy metrics
  coinsEarned   Int      @default(0)
  coinsSpent    Int      @default(0)
  
  // Engagement
  dailyQuestsCompleted Int @default(0)
  achievementsUnlocked Int @default(0)
  
  // Performance
  avgLatencyMs  Float?
  errorCount    Int      @default(0)
  
  // Metadata
  computedAt    DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@index([date(sort: Desc)])
}

model Leaderboard {
  id            String   @id @default(cuid())
  category      String   // "battles_won", "pokemon_caught", "daily_streak", etc.
  period        String   // "alltime", "monthly", "weekly"
  
  // Rankings (JSON array for fast reads)
  rankings      Json     // [{userId, rank, value, username}, ...]
  
  // Metadata
  generatedAt   DateTime @default(now())
  expiresAt     DateTime
  
  @@unique([category, period])
  @@index([category, expiresAt])
}
```

### 5. Schema Cleanup & Consolidation

**Removals:**
- ~~`TrainerProfile`~~ → Merge into `User` table
- Consider consolidating `Trainer` into `User` if tenant isolation isn't actively used

**Normalization:**
- Ensure all JSON fields have documented schemas
- Add CHECK constraints for enums stored as strings
- Standardize timestamp field names (`createdAt`, `updatedAt`, `occurredAt`)

**Type Optimization:**
- Use `@db.SmallInt` for all bounded integers (levels, counts < 32k)
- Use `@db.Date` for date-only fields
- Use `Text` for unbounded strings instead of `String`

## Performance Optimization Strategy

### Index Strategy

**1. Composite Indexes for Common Queries:**

```sql
-- User leaderboards
CREATE INDEX idx_users_leaderboard_battles ON "User" (total_battles DESC, total_wins DESC, id);
CREATE INDEX idx_users_leaderboard_catches ON "User" (total_catches DESC, id);
CREATE INDEX idx_users_leaderboard_streak ON "User" (daily_quest_streak DESC, id);

-- Activity timeline
CREATE INDEX idx_user_events_timeline ON "UserEvent" (user_id, occurred_at DESC) 
  WHERE severity != 'info'; -- Partial index for important events

-- Battle history with pagination
CREATE INDEX idx_battles_user_history ON "Battle" (p1_id, state, ended_at DESC NULLS LAST);

-- Species popularity
CREATE INDEX idx_pokemon_species_count ON "PokemonInstance" (species_id, created_at DESC);
```

**2. Covering Indexes:**

```sql
-- Profile card (avoid table lookup)
CREATE INDEX idx_users_profile_card ON "User" (id) 
  INCLUDE (nickname, tagline, avatar_url, total_battles, total_wins, total_catches);
```

**3. Partial Indexes:**

```sql
-- Active encounters only
CREATE INDEX idx_encounters_active ON "Encounter" (owner_id, started_at DESC) 
  WHERE state IN ('Spawned', 'Idle');

-- Recent battles
CREATE INDEX idx_battles_recent ON "Battle" (started_at DESC) 
  WHERE ended_at > NOW() - INTERVAL '7 days';
```

### Query Optimization

**Materialized Views for Dashboards:**

```sql
CREATE MATERIALIZED VIEW user_stats_mv AS
SELECT 
  u.id,
  u.nickname,
  u.total_battles,
  u.total_wins,
  u.total_catches,
  u.daily_quest_streak,
  COUNT(DISTINCT p.id) as pokemon_count,
  COUNT(DISTINCT ua.achievement_id) FILTER (WHERE ua.is_completed) as achievements_unlocked
FROM "User" u
LEFT JOIN "PokemonInstance" p ON p.owner_id = u.id
LEFT JOIN "UserAchievement" ua ON ua.user_id = u.id
GROUP BY u.id;

CREATE UNIQUE INDEX ON user_stats_mv (id);
```

**Refresh Strategy:**
- Real-time updates: Trigger-based for critical stats
- Periodic refresh: Scheduled jobs for analytics (hourly/daily)
- Manual refresh: Admin commands for on-demand updates

### Cache Strategy

**Hot Data (In-Memory + Disk):**
- User profiles (30-minute TTL)
- Leaderboards (5-minute TTL)
- Species metadata (infinite TTL, invalidate on dex updates)

**Warm Data (Disk Only):**
- Battle history (1-hour TTL)
- Event timelines (15-minute TTL)

**Cold Data (DB Only):**
- Historical analytics
- Archived events beyond retention

## Privacy & Compliance

### PII Handling

**Identified PII Fields:**
- `User.discordId`, `platformId`
- `UserEvent.ipAddress` (hashed)
- `UserProfile.discord`, `timezone`

**Controls:**
1. **Encryption at Rest:** Render Postgres uses encrypted volumes
2. **Access Controls:** `prisma_readonly` role excludes PII fields
3. **Retention Policies:** `UserEvent.retainUntil` for auto-deletion
4. **Privacy Settings:** `User.profileVisibility` controls public access

### Data Retention

**Event Retention Periods:**
- Info events: 30 days
- Warning events: 90 days
- Error/Critical events: 1 year
- Gameplay events (battles, catches): Indefinite (anonymized after 1 year)

**Cleanup Job:**
```sql
DELETE FROM "UserEvent" 
WHERE retain_until IS NOT NULL 
  AND retain_until < NOW();
```

## Migration Strategy

### Phase 1: Additive Changes (Low Risk)

**Migration:** `20251106_northstar_phase1_additions`

- Add new columns to `User` table (nullable)
- Create `UserEvent`, `Achievement`, `UserAchievement`, `DailyStats`, `Leaderboard` tables
- Create new indexes (online, non-blocking)
- No data removal yet

**Rollback:** Drop new tables/columns

### Phase 2: Data Migration (Medium Risk)

**Migration:** `20251106_northstar_phase2_consolidation`

- Migrate `TrainerProfile` data into `User`
- Backfill `User` statistics from existing records
- Populate initial achievements
- Create baseline analytics

**Rollback:** Restore from snapshot

### Phase 3: Cleanup (Higher Risk)

**Migration:** `20251106_northstar_phase3_cleanup`

- Drop `TrainerProfile` table
- Remove redundant columns
- Add NOT NULL constraints after backfill
- Finalize schema

**Rollback:** Full restore required

### Deployment Sequence

1. **DEV Environment:**
   - Apply Phase 1 migration
   - Validate event tracking service
   - Run performance benchmarks
   - Capture metrics and query plans

2. **PROD Environment:**
   - Schedule maintenance window (low-traffic period)
   - Create snapshot before migration
   - Apply Phase 1 migration
   - Monitor for 24 hours
   - Proceed with Phase 2/3 after validation

## Performance Targets

### Query Performance

| Query Type | Target | Current | Notes |
| --- | --- | --- | --- |
| User profile load | < 50ms | TBD | Single query with covering index |
| Battle history (paginated) | < 100ms | TBD | 20 results per page |
| Leaderboard top 100 | < 200ms | TBD | From materialized view |
| Event timeline (recent 50) | < 75ms | TBD | Partial index on hot events |
| Species lookup | < 10ms | TBD | Cached + SpeciesSheet view |

### Storage Targets

| Component | Target | Notes |
| --- | --- | --- |
| User table growth | < 100 MB/10k users | Denormalized stats acceptable |
| Event table growth | < 500 MB/month | With 30-day retention |
| Index overhead | < 30% of table size | Monitor bloat weekly |
| Total DB size | < 400 MB (80% of quota) | Maintain 20% headroom |

### Availability Targets

| Metric | Target | Notes |
| --- | --- | --- |
| Migration downtime | < 5 minutes | Phase 1 is online |
| Query availability | 99.9% | Excluding planned maintenance |
| Heartbeat latency | < 100ms | Dual DB monitoring |

## Implementation Checklist

### Service Layer

- [ ] `src/services/events/` — Event tracking service with batching
- [ ] `src/services/profiles/` — Profile service with caching
- [ ] `src/services/achievements/` — Achievement tracking and progress
- [ ] `src/services/analytics/` — Dashboard and reporting queries
- [ ] `src/services/leaderboards/` — Leaderboard generation and caching

### Database Tooling

- [ ] `scripts/migrations/northstar_phase1.ts` — Migration generator
- [ ] `scripts/analytics/generate_daily_stats.ts` — Analytics job
- [ ] `scripts/analytics/refresh_leaderboards.ts` — Leaderboard refresh
- [ ] `scripts/maintenance/cleanup_events.ts` — Retention cleanup
- [ ] Extend `db:cli` with performance commands

### Monitoring & Guards

- [ ] Table bloat monitoring (weekly alerts)
- [ ] Index usage tracking (identify unused indexes)
- [ ] Slow query log analysis (> 1 second queries)
- [ ] Schema validation guard (prevent drift)
- [ ] Event schema validation (runtime checks)

### Documentation

- [ ] Update `DATA-SCHEMA.md` with new tables
- [ ] Document event schemas in `docs/event-tracking.md`
- [ ] Add performance tuning guide to `database-systems.md`
- [ ] Update API docs for profile endpoints
- [ ] Create runbook for analytics jobs

## Success Criteria

### Functional Requirements

- ✅ User profiles support achievements, preferences, and statistics
- ✅ Comprehensive event tracking for all user activities
- ✅ Fast leaderboard queries (< 200ms for top 100)
- ✅ Privacy controls for profile visibility
- ✅ Analytics dashboards with real-time metrics

### Performance Requirements

- ✅ All queries meet target latencies (see table above)
- ✅ Storage usage < 80% of quota
- ✅ Index usage > 90% (no unused indexes)
- ✅ Event retention cleanup runs successfully

### Operational Requirements

- ✅ Migration rollback tested in DEV
- ✅ Monitoring alerts configured
- ✅ Documentation updated
- ✅ Guards passing in CI
- ✅ Performance benchmarks captured

## Next Steps

1. **Review and approve this plan** with stakeholders
2. **Create Phase 1 migration** with new tables and indexes
3. **Implement event tracking service** with typed schemas
4. **Build profile API** with caching layer
5. **Run performance benchmarks** in DEV
6. **Execute migration** following deployment sequence
7. **Monitor and optimize** based on real-world usage

---

**Related Documents:**
- `prisma/schema.prisma` — Current schema
- `DATA-SCHEMA.md` — Entity documentation
- `docs/database-systems.md` — Database operations guide
- `docs/perfect-system-roadmap.md` — Long-term vision
- `ops/DB_BOOTSTRAP.md` — Migration runbook

**Revision History:**
- 2025-11-06T16:15:00Z — Initial draft (Rev 0.1)
