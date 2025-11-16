/**
 * Cache Services Barrel Export
 * 
 * Centralized exports for all cache-related services:
 * - facade: Runtime cache with memory + disk tiers
 * - engine-cache: L1 in-memory cache for game engine (Pokemon, Moves, Type Effectiveness)
 * - engine-write-buffer: Write buffer for battle logs (in-memory queues)
 * - recipes: Cache recipe definitions
 * 
 * Usage:
 * ```typescript
 * import { getOrHydrate, engineCache, engineWriteBuffer } from '../services/cache';
 * ```
 */

// Cache Facade (Runtime Cache)
export * from './facade.js';

// Engine L1 Cache
export * from './engine-cache.js';

// Engine Write Buffer
export * from './engine-write-buffer.js';

// Cache Recipes
export * from './recipes.js';
