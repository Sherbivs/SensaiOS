# Discord Testing Readiness Audit

> **Date:** 2025-12-03  
> **Purpose:** Assess what's needed to consider the game ready for Discord testing  
> **Scope:** Outside existing tasklist items (Phase 17-18)

---

## Executive Summary

The **Pokémon Infinity Gauntlet** has solid infrastructure but needs several steps before it's ready for Discord playtesting. The core systems are in place, but there are gaps in data seeding, command registration, and user onboarding flow.

### Overall Readiness: 🟡 **65% Ready**

| Category | Status | Score |
|----------|--------|-------|
| Infrastructure | ✅ Deployed on Render | 90% |
| Database Schema | ✅ Complete (689 lines) | 95% |
| Reference Data | ✅ Loaded (1025 species, 919 moves) | 90% |
| Discord Commands | ⚠️ Need registration | 60% |
| User Onboarding | ⚠️ Need testing | 50% |
| Game Loop | ⚠️ Homestead migration pending | 40% |
| Build Process | ⚠️ Environment issues | 70% |
| Tests | ⚠️ 88 failing tests | 72% |

---

## 🟢 What's Ready

### 1. Infrastructure (Render Deployment)
```
✅ 6 Workers + 1 Cron job deployed
✅ PostgreSQL database (infinity-gauntlet-db)
✅ Persistent storage (/Store volumes)
✅ Auto-deploy on git push
✅ Health check endpoints
```

### 2. Database & Data
```
✅ Species:     1,025 records (all Gen 1-9)
✅ Moves:         919 records
✅ Types:          18 records
✅ Abilities:     367 records
✅ Users:           0 (ready for players)
✅ Trainers:        0 (ready for players)
✅ Battles:         0 (ready for gameplay)
✅ Encounters:      0 (ready for gameplay)
```

### 3. Bot Architecture
```
✅ Discord.js 14.14 client
✅ Slash command infrastructure
✅ Button interaction handlers
✅ Memory optimization (cache sweeping)
✅ Error handling framework
```

### 4. Core Game Systems
```
✅ Battle engine (deterministic)
✅ Wild encounter spawning
✅ Catch mechanics
✅ Party management
✅ Box storage system
✅ Cooldown system
```

---

## 🟡 Needs Work (Pre-Testing Checklist)

### 1. **Register Slash Commands with Discord** 🔴 CRITICAL
**Current State:** Commands exist in `src/commands/` but may not be registered with Discord API.

**Action Required:**
```powershell
# Set environment and register commands
$env:IG_ENV_FILE = "secrets/Infinity-Gauntlet.env"
$env:DISCORD_CLIENT_ID = "<your-bot-client-id>"
$env:DISCORD_GUILD_ID = "<your-test-guild-id>"  # Optional: for guild-specific commands
npx @dotenvx/dotenvx run --env-file=secrets/Infinity-Gauntlet.env -- node scripts/register-commands.js
```

**Available Commands to Register:**
| Command | File | Description |
|---------|------|-------------|
| `/ping` | ping.js | Health check |
| `/help` | help.js | Command list |
| `/starter` | starter.js | Choose starter Pokémon |
| `/home` | home.js | Open homestead view |
| `/walk` | walk.js | Encounter wild Pokémon |
| `/heal` | heal.js | Heal party at Pokémon Center |
| `/battle` | battle.js | Challenge another trainer |
| `/dex` | dex.js | Pokédex lookup |
| `/profile` | profile.js | View trainer profile |
| `/party` | party.js | View/manage party |
| `/box` | box.js | View/manage PC box |
| `/daily` | daily.js | Daily rewards |
| `/calc` | calc.js | Damage calculator |
| `/weak` | weak.js | Type weakness lookup |
| `/version` | version.js | Bot version info |
| `/ops` | ops.js | Admin commands |

**Verification:**
- After registration, commands should appear when typing `/` in Discord
- Guild commands appear instantly; global commands take up to 1 hour

---

### 2. **Environment Variables on Render** 🔴 CRITICAL
**Verify these are set in Render dashboard:**

```
POKEMON_BOT_TOKEN=<discord-bot-token>  # Required for bot login
DISCORD_CLIENT_ID=<application-id>      # Required for command registration
DISCORD_GUILD_ID=<test-guild-id>        # Optional: test server
```

**Check on Render:**
1. Go to https://dashboard.render.com/
2. Select `infinity-gauntlet` service
3. Environment tab → verify tokens are set

---

### 3. **Fix Build Process for Local Development** 🟡 HIGH
**Current Issue:** `npm run build` fails without environment loaded.

**Workaround:**
```powershell
# Always use dotenvx for builds locally
npx @dotenvx/dotenvx run --env-file=secrets/Infinity-Gauntlet.env -- npm run build:ts
```

**Permanent Fix Needed:**
- Update `prisma.config.ts` to handle missing env gracefully
- Or update build scripts to source from IG_ENV_FILE

---

### 4. **Homestead Channel System** 🟡 HIGH (In Tasklist)
**Current State:** Architecture spec complete, implementation pending (Phase 18).

**For Testing Without Homestead:**
- Game can work with existing DM-based code
- Homestead migration is ENHANCEMENT, not blocker for basic testing

**Temporary Workaround:**
- Use existing `src/bot/dm/` modules for DM gameplay
- Enable `ENABLE_DM_GAMEPLAY=true` if flag exists

---

### 5. **User Onboarding Flow Test** 🟡 MEDIUM
**Critical Path for New Player:**

```
1. User joins Discord server
2. User types /starter
3. Bot sends starter selection (Bulbasaur/Charmander/Squirtle)
4. User clicks selection button
5. Bot creates User + Trainer + PokemonInstance records
6. Bot sends home view with new Pokémon
7. User types /walk to find wild Pokémon
8. User can catch, battle, heal, etc.
```

**Action Required:**
- Manual test this flow end-to-end
- Verify database records are created
- Check for error messages

---

### 6. **Test Suite Stabilization** 🟡 MEDIUM
**Current State:** 647 passing, 88 failing, 166 skipped

**Categories of Failures:**
- Event Bus integration tests (timing issues)
- Database connection mocks
- Some feature tests need update

**Action:** Not blocking for Discord testing, but should fix before production.

---

### 7. **DexPack Verification** 🟢 LOW
**Current State:** Species loaded but DexPack record may be missing.

**Check:**
```powershell
npm run db:cli -- count DexPack
```

**If 0:** Need to seed a DexPack record for trainer settings.

---

## 🚀 Quick Start Testing Checklist

### Phase A: Pre-Flight (15 mins)
```
[ ] 1. Verify Render services running (check dashboard)
[ ] 2. Verify POKEMON_BOT_TOKEN set in Render
[ ] 3. Verify DISCORD_CLIENT_ID set (or in secrets file)
[ ] 4. Run command registration script
[ ] 5. Invite bot to test Discord server
```

### Phase B: Basic Verification (15 mins)
```
[ ] 1. Bot shows online in Discord server
[ ] 2. /ping returns response
[ ] 3. /version shows correct version
[ ] 4. /help lists available commands
```

### Phase C: Gameplay Test (30 mins)
```
[ ] 1. /starter - Select a starter Pokémon
[ ] 2. /home - View your homestead/party
[ ] 3. /walk - Encounter a wild Pokémon
[ ] 4. Catch the Pokémon (click Poké Ball button)
[ ] 5. /party - Verify Pokémon appears
[ ] 6. /heal - Heal party
[ ] 7. /profile - View trainer stats
[ ] 8. /dex bulbasaur - Lookup Pokédex entry
```

### Phase D: Battle Test (30 mins)
```
[ ] 1. Two users in server
[ ] 2. User A: /battle @UserB
[ ] 3. User B: Accept challenge
[ ] 4. Both users make move selections
[ ] 5. Battle resolves turn-by-turn
[ ] 6. Winner declared, stats updated
```

---

## Action Items Summary

| Priority | Task | Est. Time | Owner |
|----------|------|-----------|-------|
| 🔴 P0 | Register slash commands | 5 min | Sherbivs |
| 🔴 P0 | Verify Render env vars | 5 min | Sherbivs |
| 🔴 P0 | Test bot online status | 5 min | Sherbivs |
| 🟡 P1 | Test starter selection flow | 15 min | Sherbivs |
| 🟡 P1 | Test wild encounter flow | 15 min | Sherbivs |
| 🟡 P2 | Test battle system | 30 min | Sherbivs |
| 🟢 P3 | Fix build environment issue | 30 min | Sherbivs |
| 🟢 P3 | Stabilize test suite | 2 hrs | Sherbivs |

---

## Commands Quick Reference

### Player Commands
```
/starter          - Choose your first Pokémon
/home             - Open homestead view
/party            - View current party
/box              - Access PC box storage
/walk             - Encounter wild Pokémon
/heal             - Heal at Pokémon Center
/battle @user     - Challenge another trainer
/profile          - View trainer profile
/dex <pokemon>    - Pokédex lookup
/daily            - Claim daily rewards
```

### Utility Commands
```
/ping             - Check bot latency
/help             - List all commands
/version          - Bot version info
/calc             - Damage calculator
/weak <type>      - Type effectiveness
```

### Admin Commands (Ops)
```
/ops status       - System status
/ops cache        - Cache statistics
/ops db           - Database info
/ops workers      - Worker health
```

---

## Next Steps After Testing

1. **Document bugs** found during testing
2. **Prioritize fixes** based on game-breaking vs cosmetic
3. **Complete Phase 18** (Homestead channels) for production
4. **Invite beta testers** once stable
5. **Monitor Render logs** for errors during playtesting

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-03T23:50:00Z
