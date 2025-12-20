/**
 * Centralized Query Pattern Library
 * 
 * Re-exports all query patterns for easy imports.
 * 
 * NOTE: Prisma-based query files (user-queries.ts, party-queries.ts) 
 * were removed in the 2025-12-19 dead code cleanup. All active query
 * implementations use raw PostgreSQL (*-queries-pg.ts files).
 * 
 * Usage:
 *   import { getPartyWithSlots } from "../shared/models/party-queries-pg.js";
 *   import { getUserBasic } from "../shared/models/user-queries-pg.js";
 */

// Raw PG implementations are the canonical imports
// Import directly from *-queries-pg.ts files
