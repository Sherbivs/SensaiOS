# ROUTER
Title: Data Pool Services
Purpose: Central data ingestion layer for Discord entity capture and persistence
Owned Globs: src/services/data-pool/**
Last Updated (UTC): 2025-12-06T12:00:00Z

## Overview

The Data Pool services provide the critical bridge between Discord.js events and database persistence. Created during Sprint 5.0 to address the critical gap where security services were built but never wired into production.

## Architecture

```
Discord.js Client
       │
       ▼
DataPoolService
       │
       ├── syncGuild() ───► discord_guilds table
       ├── syncMembers() ──► discord_members table
       ├── syncRoles() ────► discord_roles table
       └── trackRoleChange() ► member_role_history table
       │
       ▼
Security Analysis & Forensics
```

## Files

| File | Purpose |
|------|---------|
| `data-pool-service.ts` | Central data ingestion coordinator (700+ lines) |
| `index.ts` | Module exports |
| `ROUTER.md` | This documentation |

## Key APIs

### DataPoolService

```typescript
import { getDataPoolService } from './services/data-pool';
import { prisma } from './shared/prisma';

const dataPool = getDataPoolService(prisma);

// Full sync on startup
await dataPool.fullSync(client);

// Incremental sync during sweeps
await dataPool.syncGuild(guild);
await dataPool.syncMembers(guild);
await dataPool.syncRoles(guild);

// Track role changes
await dataPool.trackRoleChanges(oldMember, newMember, 'guildMemberUpdate');

// Get statistics
const stats = await dataPool.getStats();
// { guildCount, totalMembers, totalRoles, adminMembers, dangerousRoles }
```

## Database Tables

| Table | Description |
|-------|-------------|
| `discord_guilds` | Guild metadata and sweep tracking |
| `discord_members` | Member profiles with security flags |
| `discord_roles` | Role permissions and danger classification |
| `member_role_history` | Historical role assignment tracking |
| `data_pool_sync_status` | Sync operation metrics |

## Integration Points

- **main.js ClientReady**: Call `fullSync()` on startup
- **Security sweeps**: Call `syncGuild()`, `syncMembers()`, `syncRoles()` during periodic sweeps
- **guildMemberUpdate**: Call `trackRoleChanges()` to record role modifications
- **EventBus**: Subscribe to security events for database persistence

## Created

Sprint 5.0 (2025-12-06) — Critical gap remediation for security database pipeline
