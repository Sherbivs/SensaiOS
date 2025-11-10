# Northstar Schema State — Current vs. Planned

**Created:** 2025-11-08  
**Purpose:** Document the delta between current production schema and Northstar target schema

**Cross-References:**
- See `docs/northstar-methodology.md` for comprehensive methodology and standards
- See `docs/northstar-qa-checklist.md` for standardized QA validation
- See `docs/schema-northstar-optimization.md` for overall optimization plan design
- See `prisma/migrations/202511061630_northstar_phase1_additions/` for Phase 1 migration (PENDING)
- See `prisma/migrations/20251108183000_northstar_phase2_consolidation/` for Phase 2 migration (BLOCKED)
- See `prisma/schema.prisma` for current production schema definition
- See `Tasklist.md` Phase 15 for task tracking

**Referenced By:** northstar-methodology.md, northstar-qa-checklist.md, northstar-solidification-summary.md, Tasklist.md

---

## Current Production Schema State

**As of 2025-11-08**, the production database schema reflects:
- ✅ Phase 0: Base schema (Dex reference spine, User, Trainer, PokemonInstance, Battle, Encounter)
- ✅ Scaling indexes (202510280500_scaling_indexes)
- ✅ Schema constraints (202511010900_schema_constraints)
- ✅ Trainer profile (202511030830_trainer_profile_option_c)
- ✅ Pack registry signature (202511050900_pack_registry_signature)

**NOT YET APPLIED:**
- ❌ Northstar Phase 1 (202511061630_northstar_phase1_additions) — Migration created but NOT deployed
- ❌ Northstar Phase 2 (20251108183000_northstar_phase2_consolidation) — Migration created but NOT deployed

---

## Current User Table Schema

```prisma
model User {
  id                      String            @id @default(cuid())
  discordId               String            @unique
  platformId              String?           @unique
  createdAt               DateTime          @default(now())
  updatedAt               DateTime          @updatedAt
  coins                   Int               @default(0)
  settingsJson            Json?
  
  // Relations
  parties                 Party[]
  pokemon                 PokemonInstance[]
  encounters              Encounter[]
  battlesP1               Battle[]          @relation("BattlesAsP1")
  battlesP2               Battle[]          @relation("BattlesAsP2")
  cooldowns               Cooldown[]
  trainers                Trainer[]
  profile                 TrainerProfile?   // 1:1 with TrainerProfile table
  
  // Quest tracking
  dailyQuestStreak        Int               @default(0)
  dailyQuestLastCompleted DateTime?
  dailyQuestLastReset     DateTime?
}
```

**Current Columns:** 12 columns (id, discordId, platformId, createdAt, updatedAt, coins, settingsJson, dailyQuestStreak, dailyQuestLastCompleted, dailyQuestLastReset, + relations)

---

## Northstar Phase 1 Target Schema

**After Phase 1 migration applied**, User table will have **31 total columns:**

### New Profile Fields (4 columns)
```prisma
nickname                String?           // Display name
tagline                 String?           // Short bio/motto
bio                     String?           // Full profile description
avatarUrl               String?           // Profile picture URL
```

### New Economy Fields (1 column)
```prisma
premiumCoins            Int               @default(0)  // Premium currency
```

### New Statistics (4 columns)
```prisma
totalBattles            Int               @default(0)  // Denormalized for leaderboards
totalWins               Int               @default(0)  // Fast win rate calculation
totalCatches            Int               @default(0)  // Pokémon caught count
totalEncounters         Int               @default(0)  // Total wild encounters
```

### New Activity Tracking (2 columns)
```prisma
lastLoginAt             DateTime?         // Last login timestamp
lastActivityAt          DateTime?         // Last action timestamp
```

### New Privacy Controls (3 columns)
```prisma
profileVisibility       String            @default("public")  // public|friends|private
showStats               Boolean           @default(true)      // Show statistics on profile
showAchievements        Boolean           @default(true)      // Show achievement badges
```

### New Reference (1 column)
```prisma
favoriteSpeciesId       Int?              @db.SmallInt  // FK to Species.id
favoriteSpecies         Species?          @relation(...)
```

**Total New Columns:** 15 (all nullable or with defaults for backward compatibility)

---

## Northstar Phase 1 New Tables

### UserProfile (Extended Profile Data)
```prisma
model UserProfile {
  userId          String    @id
  timezone        String?
  language        String    @default("en")
  favoriteColor   String?
  displayBadges   Json?     // Array of badge IDs to show
  friendCode      String?   @unique
  discord         String?   // Discord tag
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  user            User      @relation(...)
  
  @@index([friendCode])
}
```

### UserEvent (Event Tracking)
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
  id              String         @id @default(cuid())
  userId          String
  category        EventCategory
  eventType       String
  severity        EventSeverity  @default(info)
  metadata        Json?
  occurredAt      DateTime       @default(now())
  retainUntil     DateTime?      // Auto-cleanup timestamp
  
  user            User           @relation(...)
  
  @@index([userId, occurredAt(sort: Desc)])
  @@index([category, occurredAt(sort: Desc)])
  @@index([retainUntil])  // Cleanup automation
}
```

### Achievement System
```prisma
model Achievement {
  id              String              @id @default(cuid())
  slug            String              @unique
  name            String
  description     String
  category        String
  tier            String              // bronze, silver, gold, platinum
  points          Int
  iconUrl         String?
  requirement     Json                // Unlock criteria
  createdAt       DateTime            @default(now())
  
  userAchievements UserAchievement[]
  
  @@index([slug])
  @@index([category, tier])
}

model UserAchievement {
  userId          String
  achievementId   String
  progress        Int               @default(0)
  completed       Boolean           @default(false)
  unlockedAt      DateTime?
  
  user            User              @relation(...)
  achievement     Achievement       @relation(...)
  
  @@id([userId, achievementId])
  @@index([userId, unlockedAt(sort: Desc)])
}
```

### Analytics Tables
```prisma
model DailyStats {
  date            DateTime          @unique @db.Date
  activeUsers     Int               @default(0)
  newUsers        Int               @default(0)
  totalBattles    Int               @default(0)
  totalCatches    Int               @default(0)
  aggregatedAt    DateTime          @default(now())
  
  @@index([date(sort: Desc)])
}

model Leaderboard {
  type            String            // battles, wins, catches, coins
  userId          String
  rank            Int
  value           Int
  updatedAt       DateTime          @default(now())
  
  user            User              @relation(...)
  
  @@id([type, userId])
  @@index([type, rank])
}
```

---

## Northstar Phase 2 Target Schema

**After Phase 2 migration applied:**

### TrainerProfile Table → DROPPED
- Data migrated to User table columns (tagline, bio, favoriteSpeciesId)
- Table no longer exists
- User.profile relation removed from schema

### Current TrainerProfile Schema (TO BE REMOVED)
```prisma
model TrainerProfile {
  userId            String   @id
  tagline           String?
  bio               String?
  favoriteSpeciesId Int?     @db.SmallInt
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  user             User     @relation(...)
  favoriteSpecies  Species? @relation(...)
  
  @@index([favoriteSpeciesId])
}
```

**Phase 2 Changes:**
1. Migrate TrainerProfile.tagline → User.tagline (added in Phase 1)
2. Migrate TrainerProfile.bio → User.bio (added in Phase 1)
3. Migrate TrainerProfile.favoriteSpeciesId → User.favoriteSpeciesId (added in Phase 1)
4. DROP TABLE TrainerProfile CASCADE
5. Remove User.profile relation from Prisma schema

**Rationale:** Eliminate redundancy, reduce JOIN complexity, simplify data model

---

## Migration Deployment Status

### Completed Migrations
- [x] 202510280500_scaling_indexes
- [x] 202510290930_dex_reference_spine
- [x] 202511010900_schema_constraints
- [x] 202511021024_db_v0_bootstrap
- [x] 202511030830_trainer_profile_option_c
- [x] 202511050900_pack_registry_signature
- [x] 20251106115259_add_db_version_tables

### Pending Migrations (Created but NOT Applied)
- [ ] **202511061630_northstar_phase1_additions** (READY for deployment)
  - Risk: Low (additive only, no data manipulation)
  - Downtime: Zero (backward compatible)
  - Files: migration.sql, rollback.sql, README.md
  - Testing: EXPERIMENTAL ✅, PRIMARY LOCAL ✅, DEV Master ⏳, PROD ⏳

- [ ] **20251108183000_northstar_phase2_consolidation** (Blocked by Phase 1)
  - Risk: Medium (data manipulation, table drops)
  - Downtime: ~30 seconds
  - Files: migration.sql, rollback.sql, README.md (9,800+ lines)
  - Testing: EXPERIMENTAL ✅, PRIMARY LOCAL ⏳, DEV Master ⏳, PROD ⏳

---

## Prisma Schema Update Strategy

**Current State:** Prisma schema reflects production database (pre-Phase 1)

**Update Strategy:**
1. **After Phase 1 applied to DEV:**
   - Update `prisma/schema.prisma` with Phase 1 additions
   - Run `npx prisma generate` to regenerate client
   - Commit schema changes with migration reference

2. **After Phase 2 applied to DEV:**
   - Remove `TrainerProfile` model from schema
   - Remove `User.profile` relation
   - Run `npx prisma generate`
   - Update ProfileService to use User columns directly
   - Commit schema changes + service updates

**Why wait?** 
- Schema should reflect actual deployed state
- Avoids type errors when services reference non-existent columns
- Enables gradual rollout with backward compatibility

---

## Documentation References

All Northstar methodology documents reference the **target schema** (after Phase 1 + Phase 2), not the current production schema. This is intentional to:
- Define the end goal clearly
- Provide examples with final schema structure
- Enable forward-looking service development

**When reading methodology docs:**
- Assume Phase 1 + Phase 2 completed
- Use migration READMEs for deployment-specific guidance
- Check this document for current vs. planned state

---

## Schema Evolution Timeline

```
Current Production State (2025-11-08)
│
├─ User: 12 columns (id, discordId, platformId, coins, quest tracking)
├─ TrainerProfile: 6 columns (tagline, bio, favoriteSpeciesId)
└─ No event tracking, achievements, or analytics tables
    │
    ▼
Phase 1 Deployment (PENDING)
│
├─ User: 27 columns (+15: profile, economy, stats, activity, privacy)
├─ TrainerProfile: Still exists (6 columns, unchanged)
├─ NEW: UserProfile, UserEvent, Achievement, UserAchievement, DailyStats, Leaderboard
└─ NEW: EventCategory, EventSeverity enums
    │
    ▼
Phase 2 Deployment (BLOCKED, after Phase 1)
│
├─ User: 27 columns (no change from Phase 1)
├─ TrainerProfile: DROPPED (data migrated to User)
└─ Simplified 1-table profile model
    │
    ▼
Phase 3 Deployment (PROPOSED, after Phase 2)
│
├─ User: 27 columns + NOT NULL constraints on backfilled fields
├─ Deprecated columns removed
└─ Final Northstar schema complete
```

---

## Verification Commands

### Check Current Production Schema
```bash
# List User columns
npm run db:cli -- query "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'User' ORDER BY ordinal_position;"

# Check if Phase 1 columns exist
npm run db:cli -- query "SELECT column_name FROM information_schema.columns WHERE table_name = 'User' AND column_name IN ('nickname', 'tagline', 'bio', 'totalBattles');"

# Check if Phase 1 tables exist
npm run db:cli -- query "SELECT table_name FROM information_schema.tables WHERE table_name IN ('UserProfile', 'UserEvent', 'Achievement');"

# Check if TrainerProfile exists
npm run db:cli -- query "SELECT table_name FROM information_schema.tables WHERE table_name = 'TrainerProfile';"
```

### After Phase 1 Deployment
```bash
# Verify Phase 1 columns added
npm run db:cli -- count User
npm run db:cli -- query "SELECT COUNT(*) FROM \"User\" WHERE \"nickname\" IS NOT NULL OR \"tagline\" IS NOT NULL;"

# Verify Phase 1 tables created
npm run db:cli -- count UserProfile
npm run db:cli -- count UserEvent
npm run db:cli -- count Achievement
```

### After Phase 2 Deployment
```bash
# Verify TrainerProfile data migrated
npm run db:cli -- query "SELECT COUNT(*) FROM \"User\" WHERE \"tagline\" IS NOT NULL OR \"bio\" IS NOT NULL OR \"favoriteSpeciesId\" IS NOT NULL;"

# Verify TrainerProfile table dropped
npm run db:cli -- query "SELECT table_name FROM information_schema.tables WHERE table_name = 'TrainerProfile';"
```

---

## Summary

**Current State:** Production schema has basic User table with 12 columns, separate TrainerProfile table

**Northstar Target:** Enhanced User table with 27 columns, 6 new tables, TrainerProfile removed

**Methodology Documents:** Reference target state (after Phase 1 + Phase 2)

**Action Required:** Deploy Phase 1 migration to DEV, update Prisma schema, then proceed with Phase 2

---

**Revision History:**
- 2025-11-08T22:15:00Z — Initial schema state documentation (Rev 1.0)

---

**Related Documents:**
- `prisma/schema.prisma` — Current production schema
- `prisma/migrations/202511061630_northstar_phase1_additions/` — Phase 1 migration (PENDING)
- `prisma/migrations/20251108183000_northstar_phase2_consolidation/` — Phase 2 migration (BLOCKED)
- `docs/northstar-methodology.md` — References target schema
- `docs/northstar-qa-checklist.md` — References target schema
- `docs/schema-northstar-optimization.md` — Target schema design

