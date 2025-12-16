# ROUTER — src/errors/

**Title:** Application Error Hierarchy  
**Purpose:** Centralized error types with codes, contexts, and serialization  
**Owned Globs:** `src/errors/**`  
**Last Updated (UTC):** 2025-12-16T12:00:00Z

## Overview

This module provides a unified error hierarchy for the Infinity Gauntlet application. All errors extend `AppError` and include:

- **Error codes** — Unique identifiers for categorization and logging
- **Error domains** — DATABASE, GAME, DISCORD, VALIDATION, etc.
- **Error context** — Rich metadata for debugging
- **Serialization** — `toJSON()` for transport and logging
- **Type guards** — Runtime type checking

## Files

| File | Purpose |
|------|---------|
| `base.ts` | Base `AppError` class, common types, utilities |
| `database.ts` | Database errors: connection, query, transaction, records |
| `game-engine.ts` | Game errors: battles, encounters, parties, Pokemon |
| `discord.ts` | Discord errors: commands, interactions, channels, homesteads |
| `validation.ts` | Validation errors: fields, formats, ranges, business rules |
| `index.ts` | Barrel export for all error types |

## Error Code Format

```
{DOMAIN}_{CATEGORY}_{NUMBER}

Examples:
- DB_CONN_001 — Database connection failed
- GAME_BTL_003 — Battle invalid move
- DISC_CMD_002 — Command permission denied
- VAL_002 — Required field missing
```

## Domain Prefixes

| Domain | Prefix | Description |
|--------|--------|-------------|
| APP | `APP` | Application-level errors |
| DATABASE | `DB` | Database operations |
| GAME | `GAME` | Game engine |
| DISCORD | `DISC` | Discord bot |
| VALIDATION | `VAL` | Input validation |
| CONFIG | `CFG` | Configuration |
| WORKER | `WRK` | Background workers |
| EXTERNAL | `EXT` | External services |
| CACHE | `CACHE` | Cache operations |

## Usage

```typescript
import {
  // Database errors
  RecordNotFoundError,
  QueryError,
  
  // Game errors
  BattleError,
  PartyFullError,
  
  // Discord errors
  CommandPermissionError,
  HomesteadNotFoundError,
  
  // Validation errors
  RequiredFieldError,
  
  // Type guards
  isAppError,
  isDatabaseError,
} from '../errors/index.js';

// Throw specific error
throw new RecordNotFoundError('Party', partyId);

// Check error type
if (isAppError(error)) {
  logger.error(error.toJSON());
}

// Check if retryable
if (error.isRetryable()) {
  await retry(operation);
}
```

## Integration with Existing Errors

The security module has its own error hierarchy at `src/bot/security/errors/security-errors.ts`. These follow a similar pattern but are domain-specific to security operations. Consider migrating to this unified system in the future.

## Dependencies

- **Consumes:** Node.js `crypto` module for error IDs
- **Consumed by:** All application modules

## Notes

- All errors capture stack traces for debugging
- Errors support cause chaining via ES2022 `cause` option
- Serialization excludes sensitive data
- Type guards enable safe error handling without `instanceof` across module boundaries
