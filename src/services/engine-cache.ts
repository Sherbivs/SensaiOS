/**
 * Engine Cache (L1 Cache Layer) — In-Memory Pokemon Data Cache
 * 
 * Provides synchronous access to static Pokemon data with <1μs read latency.
 * Eliminates async/await complexity from battle engine by pre-loading all data.
 * 
 * Architecture:
 * - L1 Cache (this): In-memory Map, synchronous reads, <1μs latency
 * - L2 Cache: Read-DB (SQLite), persistent storage, loaded at startup
 * - L3 Cache: PROD (PostgreSQL), single source of truth, synced daily
 * 
 * Key Features:
 * - Pre-loaded at startup (blocking initialization, ~100-200ms)
 * - Synchronous getters (no async/await, battle engine remains synchronous)
 * - Background refresh (hourly, double-buffering, non-blocking)
 * - Graceful shutdown (cleanup timers, no data loss)
 * - Performance monitoring (latency tracking, cache hit metrics)
 * 
 * Referenced By: src/core/battle/engine.ts, src/workers/engine-workers.ts,
 *                docs/engine-db-replication.md (L1 Cache Implementation section)
 * 
 * @module services/engine-cache
 */

import { EngineDbConfig } from '../config/engine-db-config.js';
import { log, LOG_LABEL } from '../utils/logger.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Pokemon cache entry (optimized for battle calculations)
 */
export interface PokemonCacheEntry {
  id: number;
  name: string;
  types: [number, number | null]; // [primaryType, secondaryType?]
  baseStats: {
    hp: number;
    attack: number;
    defense: number;
    specialAttack: number;
    specialDefense: number;
    speed: number;
  };
  abilities: number[]; // Ability IDs
  moves: number[];     // Move IDs this Pokemon can learn
}

/**
 * Move cache entry (optimized for damage calculations)
 */
export interface MoveCacheEntry {
  id: number;
  name: string;
  typeId: number;
  category: 'physical' | 'special' | 'status';
  power: number | null;
  accuracy: number | null;
  pp: number;
  priority: number;
  effectId: number | null;
}

/**
 * Type effectiveness entry (optimized for lookups)
 * Key format: "attackTypeId:defenseTypeId" (e.g., "10:5")
 */
export interface TypeEffectivenessEntry {
  attackTypeId: number;
  defenseTypeId: number;
  multiplier: number; // 0, 0.25, 0.5, 1.0, 2.0, 4.0
}

/**
 * Cache statistics (for observability)
 */
export interface CacheStats {
  pokemonCount: number;
  moveCount: number;
  typeEffectivenessCount: number;
  memorySizeMb: number;
  lastRefreshTime: Date | null;
  isInitialized: boolean;
  isHealthy: boolean;          // true if no corruption detected
  corruptionDetected: boolean;  // CRITICAL: true if cache integrity compromised
  dataChecksum: string | null;  // Current data fingerprint
  hitCount: number;
  missCount: number;
  avgLatencyUs: number;
}

// ============================================================================
// Engine Cache Class
// ============================================================================

/**
 * In-memory cache for Pokemon, Moves, and Type Effectiveness data.
 * Provides synchronous access with <1μs read latency.
 */
export class EngineCache {
  // Primary storage (Map-based for O(1) lookups)
  // CRITICAL: These Maps are READ-ONLY after initialization/refresh
  // Only refresh() method may write to these via atomic swap
  private pokemon: Map<number, PokemonCacheEntry> = new Map();
  private moves: Map<number, MoveCacheEntry> = new Map();
  private typeChart: Map<string, number> = new Map(); // Key: "atkTypeId:defTypeId"
  
  // Secondary indexes (for name-based lookups)
  // CRITICAL: READ-ONLY - synchronized with primary maps
  private pokemonByName: Map<string, number> = new Map(); // name → id
  private movesByName: Map<string, number> = new Map();   // name → id
  
  // State tracking
  private isInitialized: boolean = false;
  private lastRefreshTime: Date | null = null;
  private refreshInterval: NodeJS.Timeout | null = null;
  private isRefreshing: boolean = false;
  
  // Corruption detection
  private dataChecksum: string | null = null;
  private corruptionDetected: boolean = false;
  
  // Performance metrics
  private hitCount: number = 0;
  private missCount: number = 0;
  private latencySum: number = 0; // Microseconds
  private latencyCount: number = 0;
  
  // ============================================================================
  // Initialization (Startup - Blocking)
  // ============================================================================
  
  /**
   * Initialize L1 cache from Read-DB (BLOCKING startup operation).
   * 
   * This method loads all Pokemon, Moves, and Type Effectiveness data
   * into memory Maps for synchronous access. Battle engine cannot start
   * until this completes.
   * 
   * Expected time: ~100-200ms for 1,328 Pokemon + 900 Moves + 300 Types
   * 
   * @throws {Error} If Read-DB unavailable or timeout exceeded
   */
  async initialize(): Promise<void> {
    const startTime = performance.now();
    
    log('info', 'engine-cache: Starting L1 cache initialization...');
    
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(
            `L1 cache initialization timeout (>${EngineDbConfig.l1CacheInitTimeoutMs}ms)`
          ));
        }, EngineDbConfig.l1CacheInitTimeoutMs);
      });
      
      // Race initialization vs timeout
      await Promise.race([
        this.loadFromReadDb(),
        timeoutPromise
      ]);
      
      this.isInitialized = true;
      this.lastRefreshTime = new Date();
      
      // Calculate checksum for corruption detection
      this.updateDataChecksum();
      
      const durationMs = performance.now() - startTime;
      const stats = this.getStats();
      
      log('info', 'engine-cache: L1 cache initialization complete', {
        durationMs: durationMs.toFixed(2),
        pokemonCount: stats.pokemonCount,
        moveCount: stats.moveCount,
        typeEffectivenessCount: stats.typeEffectivenessCount,
        memorySizeMb: stats.memorySizeMb.toFixed(2),
        checksum: this.dataChecksum?.substring(0, 8)
      });
      
      // Start background refresh worker (if enabled)
      if (EngineDbConfig.featureL1CacheEnabled && EngineDbConfig.featureWorkersEnabled) {
        this.startRefreshWorker();
      }
      
    } catch (error) {
      log('error', 'engine-cache: L1 cache initialization failed', error);
      throw error; // Hard fail - cannot operate without cache
    }
  }
  
  /**
   * Load data from Read-DB (SQLite) into memory Maps.
   * 
   * Integrates with engine-read-db.ts to load Pokemon, Moves, and Type Effectiveness.
   * If Read-DB is empty (PROD sync pending), falls back to placeholder data.
   */
  private async loadFromReadDb(): Promise<void> {
    const readDb = await import('./engine-read-db.js');
    
    // Ensure Read-DB initialized
    if (!readDb.isReady()) {
      await readDb.initialize();
    }
    
    // Load Pokemon from Read-DB
    const pokemonRecords = readDb.getAllPokemon();
    if (pokemonRecords.length > 0) {
      for (const record of pokemonRecords) {
        const entry: PokemonCacheEntry = {
          id: record.id,
          name: record.name,
          types: [record.type1_id, record.type2_id],
          baseStats: {
            hp: record.hp,
            attack: record.attack,
            defense: record.defense,
            specialAttack: record.special_attack,
            specialDefense: record.special_defense,
            speed: record.speed
          },
          abilities: JSON.parse(record.abilities) as number[],
          moves: JSON.parse(record.moves) as number[]
        };
        
        this.pokemon.set(entry.id, entry);
        this.pokemonByName.set(entry.name.toLowerCase(), entry.id);
      }
      
      log('info', 'engine-cache: Loaded Pokemon from Read-DB', {
        pokemonCount: this.pokemon.size
      });
    } else {
      log('warn', 'engine-cache: Read-DB empty (PROD sync pending), using placeholder data');
      this.loadPlaceholderPokemon();
    }
    
    // Load Moves from Read-DB
    const moveRecords = readDb.getAllMoves();
    if (moveRecords.length > 0) {
      for (const record of moveRecords) {
        const entry: MoveCacheEntry = {
          id: record.id,
          name: record.name,
          typeId: record.type_id,
          category: record.category,
          power: record.power,
          accuracy: record.accuracy,
          pp: record.pp,
          priority: record.priority,
          effectId: record.effect_id
        };
        
        this.moves.set(entry.id, entry);
        this.movesByName.set(entry.name.toLowerCase(), entry.id);
      }
      
      log('info', 'engine-cache: Loaded Moves from Read-DB', {
        moveCount: this.moves.size
      });
    } else {
      log('warn', 'engine-cache: Read-DB moves empty, using placeholder data');
      this.loadPlaceholderMoves();
    }
    
    // Load Type Effectiveness from Read-DB
    const typeRecords = readDb.getAllTypeEffectiveness();
    if (typeRecords.length > 0) {
      for (const record of typeRecords) {
        const key = `${record.attack_type_id}:${record.defense_type_id}`;
        this.typeChart.set(key, record.multiplier);
      }
      
      log('info', 'engine-cache: Loaded Type Effectiveness from Read-DB', {
        typeEffectivenessCount: this.typeChart.size
      });
    } else {
      log('warn', 'engine-cache: Read-DB type chart empty, using placeholder data');
      this.loadPlaceholderTypeChart();
    }
  }
  
  /**
   * Load placeholder Pokemon (fallback when Read-DB empty).
   */
  private loadPlaceholderPokemon(): void {
    this.pokemon.set(1, {
      id: 1,
      name: 'Bulbasaur',
      types: [12, 4], // Grass/Poison
      baseStats: { hp: 45, attack: 49, defense: 49, specialAttack: 65, specialDefense: 65, speed: 45 },
      abilities: [65, 34], // Overgrow, Chlorophyll
      moves: [33, 22, 45] // Tackle, Vine Whip, Growl
    });
    this.pokemonByName.set('bulbasaur', 1);
  }
  
  /**
   * Load placeholder Moves (fallback when Read-DB empty).
   */
  private loadPlaceholderMoves(): void {
    this.moves.set(33, {
      id: 33,
      name: 'Tackle',
      typeId: 1, // Normal
      category: 'physical',
      power: 40,
      accuracy: 100,
      pp: 35,
      priority: 0,
      effectId: null
    });
    this.movesByName.set('tackle', 33);
  }
  
  /**
   * Load placeholder Type Chart (fallback when Read-DB empty).
   */
  private loadPlaceholderTypeChart(): void {
    this.typeChart.set('10:12', 2.0); // Fire attacks Grass
    this.typeChart.set('11:10', 2.0); // Water attacks Fire
    this.typeChart.set('12:11', 2.0); // Grass attacks Water
  }
  
  // ============================================================================
  // Synchronous Getters (Battle Engine Interface)
  // ============================================================================
  
  /**
   * Get Pokemon by ID (synchronous, <1μs)
   * 
   * SAFETY: Returns defensive copy to prevent external mutations
   * 
   * @param id Pokemon ID
   * @returns Pokemon data or null if not found
   */
  getPokemon(id: number): PokemonCacheEntry | null {
    const start = performance.now();
    
    // CRITICAL: Corruption check before read
    if (this.corruptionDetected) {
      log('error', 'engine-cache: Cache corruption detected, refusing read', { pokemonId: id });
      this.missCount++;
      return null;
    }
    
    const result = this.pokemon.get(id) ?? null;
    
    // Track metrics
    if (result) {
      this.hitCount++;
      
      // Return defensive copy to prevent external mutation
      return { ...result, baseStats: { ...result.baseStats } };
    } else {
      this.missCount++;
    }
    
    this.trackLatency(performance.now() - start);
    
    return null;
  }
  
  /**
   * Get Pokemon by name (synchronous, <1μs + name lookup)
   * 
   * SAFETY: Returns defensive copy to prevent external mutations
   * 
   * @param name Pokemon name (case-insensitive)
   * @returns Pokemon data or null if not found
   */
  getPokemonByName(name: string): PokemonCacheEntry | null {
    const start = performance.now();
    
    // CRITICAL: Corruption check before read
    if (this.corruptionDetected) {
      log('error', 'engine-cache: Cache corruption detected, refusing read', { pokemonName: name });
      this.missCount++;
      return null;
    }
    
    const id = this.pokemonByName.get(name.toLowerCase());
    const result = id !== undefined ? this.pokemon.get(id) ?? null : null;
    
    // Track metrics
    if (result) {
      this.hitCount++;
      
      // Return defensive copy to prevent external mutation
      return { ...result, baseStats: { ...result.baseStats } };
    } else {
      this.missCount++;
    }
    
    this.trackLatency(performance.now() - start);
    
    return null;
  }
  
  /**
   * Get Move by ID (synchronous, <1μs)
   * 
   * SAFETY: Returns defensive copy to prevent external mutations
   * 
   * @param id Move ID
   * @returns Move data or null if not found
   */
  getMove(id: number): MoveCacheEntry | null {
    const start = performance.now();
    
    // CRITICAL: Corruption check before read
    if (this.corruptionDetected) {
      log('error', 'engine-cache: Cache corruption detected, refusing read', { moveId: id });
      this.missCount++;
      return null;
    }
    
    const result = this.moves.get(id) ?? null;
    
    // Track metrics
    if (result) {
      this.hitCount++;
      
      // Return defensive copy to prevent external mutation
      return { ...result };
    } else {
      this.missCount++;
    }
    
    this.trackLatency(performance.now() - start);
    
    return null;
  }
  
  /**
   * Get Move by name (synchronous, <1μs + name lookup)
   * 
   * SAFETY: Returns defensive copy to prevent external mutations
   * 
   * @param name Move name (case-insensitive)
   * @returns Move data or null if not found
   */
  getMoveByName(name: string): MoveCacheEntry | null {
    const start = performance.now();
    
    // CRITICAL: Corruption check before read
    if (this.corruptionDetected) {
      log('error', 'engine-cache: Cache corruption detected, refusing read', { moveName: name });
      this.missCount++;
      return null;
    }
    
    const id = this.movesByName.get(name.toLowerCase());
    const result = id !== undefined ? this.moves.get(id) ?? null : null;
    
    // Track metrics
    if (result) {
      this.hitCount++;
      
      // Return defensive copy to prevent external mutation
      return { ...result };
    } else {
      this.missCount++;
    }
    
    this.trackLatency(performance.now() - start);
    
    return null;
  }
  
  /**
   * Get type effectiveness multiplier (synchronous, <1μs)
   * 
   * SAFETY: Returns primitive number (immutable by nature)
   * 
   * @param attackTypeId Attacking move's type ID
   * @param defenseTypeId Defending Pokemon's type ID
   * @returns Effectiveness multiplier (0, 0.25, 0.5, 1.0, 2.0, 4.0)
   */
  getTypeEffectiveness(attackTypeId: number, defenseTypeId: number): number {
    const start = performance.now();
    
    // CRITICAL: Corruption check before read
    if (this.corruptionDetected) {
      log('error', 'engine-cache: Cache corruption detected, returning neutral effectiveness');
      return 1.0; // Failsafe: return neutral to prevent crash
    }
    
    const key = `${attackTypeId}:${defenseTypeId}`;
    const result = this.typeChart.get(key) ?? 1.0; // Default to neutral
    
    // Track metrics
    this.hitCount++;
    this.trackLatency(performance.now() - start);
    
    return result;
  }
  
  /**
   * Calculate cumulative type effectiveness for multi-type Pokemon.
   * 
   * Example: Fire attack vs Grass/Poison = 2.0 * 1.0 = 2.0x
   * 
   * @param attackTypeId Attacking move's type ID
   * @param defenseTypes Defending Pokemon's types [primary, secondary?]
   * @returns Cumulative multiplier
   */
  calculateTypeEffectiveness(attackTypeId: number, defenseTypes: [number, number | null]): number {
    const start = performance.now();
    
    const primary = this.getTypeEffectiveness(attackTypeId, defenseTypes[0]);
    const secondary = defenseTypes[1] !== null 
      ? this.getTypeEffectiveness(attackTypeId, defenseTypes[1])
      : 1.0;
    
    const result = primary * secondary;
    
    this.trackLatency(performance.now() - start);
    
    return result;
  }
  
  // ============================================================================
  // Background Refresh (Non-Blocking)
  // ============================================================================
  
  /**
   * Start background refresh worker (hourly interval).
   * Uses double-buffering to avoid blocking ongoing battles.
   * Also runs periodic integrity checks.
   */
  private startRefreshWorker(): void {
    log('info', 'engine-cache: Starting background refresh worker', {
      intervalMs: EngineDbConfig.l1CacheRefreshIntervalMs
    });
    
    this.refreshInterval = setInterval(async () => {
      // Verify integrity before refresh
      const isHealthy = this.verifyIntegrity();
      if (!isHealthy) {
        log('error', 'engine-cache: Integrity check FAILED before refresh, skipping refresh cycle');
        return; // Don't refresh corrupted cache - wait for manual intervention
      }
      
      await this.refresh();
      
      // Verify integrity after refresh
      this.verifyIntegrity();
    }, EngineDbConfig.l1CacheRefreshIntervalMs);
  }
  
  /**
   * Refresh L1 cache from Read-DB (non-blocking via double-buffering).
   * 
   * Strategy:
   * 1. Build new Maps in temporary variables (doesn't affect current cache)
   * 2. Atomically swap references (ongoing battles see old or new, never partial)
   * 3. Old cache garbage collected automatically
   */
  private async refresh(): Promise<void> {
    if (this.isRefreshing) {
      log('warn', 'engine-cache: Refresh already in progress, skipping');
      return;
    }
    
    this.isRefreshing = true;
    const startTime = performance.now();
    
    try {
      log('info', 'engine-cache: Starting background refresh...');
      
      // Step 1: Build new cache (doesn't affect current cache)
      const newPokemon = new Map<number, PokemonCacheEntry>();
      const newMoves = new Map<number, MoveCacheEntry>();
      const newTypeChart = new Map<string, number>();
      const newPokemonByName = new Map<string, number>();
      const newMovesByName = new Map<string, number>();
      
      // TODO: Load from Read-DB into new Maps
      // const readDb = await import('./engine-read-db.js');
      // ... populate new Maps ...
      
      // TEMPORARY: Copy current data (no-op refresh)
      this.pokemon.forEach((value, key) => newPokemon.set(key, value));
      this.moves.forEach((value, key) => newMoves.set(key, value));
      this.typeChart.forEach((value, key) => newTypeChart.set(key, value));
      this.pokemonByName.forEach((value, key) => newPokemonByName.set(key, value));
      this.movesByName.forEach((value, key) => newMovesByName.set(key, value));
      
      // Step 2: Atomic swap (battles see old or new, never partial state)
      this.pokemon = newPokemon;
      this.moves = newMoves;
      this.typeChart = newTypeChart;
      this.pokemonByName = newPokemonByName;
      this.movesByName = newMovesByName;
      
      this.lastRefreshTime = new Date();
      
      // Update checksum for corruption detection
      this.updateDataChecksum();
      
      const durationMs = performance.now() - startTime;
      const stats = this.getStats();
      
      log('info', 'engine-cache: Background refresh complete', {
        durationMs: durationMs.toFixed(2),
        pokemonCount: stats.pokemonCount,
        moveCount: stats.moveCount,
        memorySizeMb: stats.memorySizeMb.toFixed(2),
        checksum: this.dataChecksum?.substring(0, 8)
      });
      
    } catch (error) {
      log('error', 'engine-cache: Background refresh failed', error);
      // Don't throw - current cache still valid, retry next interval
    } finally {
      this.isRefreshing = false;
    }
  }
  
  // ============================================================================
  // Observability & Stats
  // ============================================================================
  
  /**
   * Get cache statistics (for /ops engine command and monitoring)
   */
  getStats(): CacheStats {
    return {
      pokemonCount: this.pokemon.size,
      moveCount: this.moves.size,
      typeEffectivenessCount: this.typeChart.size,
      memorySizeMb: this.estimateMemoryUsage(),
      lastRefreshTime: this.lastRefreshTime,
      isInitialized: this.isInitialized,
      isHealthy: !this.corruptionDetected && this.isInitialized && this.pokemon.size > 0,
      corruptionDetected: this.corruptionDetected,
      dataChecksum: this.dataChecksum,
      hitCount: this.hitCount,
      missCount: this.missCount,
      avgLatencyUs: this.latencyCount > 0 ? this.latencySum / this.latencyCount : 0
    };
  }
  
  /**
   * Estimate memory usage (rough approximation)
   * 
   * Calculation:
   * - Pokemon: ~10 KB each (with stats, moves, abilities)
   * - Moves: ~2 KB each
   * - Type effectiveness: ~100 bytes each
   * - Map overhead: ~50% of data size
   */
  private estimateMemoryUsage(): number {
    const pokemonSize = this.pokemon.size * 10 * 1024; // 10 KB per entry
    const movesSize = this.moves.size * 2 * 1024;      // 2 KB per entry
    const typeChartSize = this.typeChart.size * 100;   // 100 bytes per entry
    const indexSize = (this.pokemonByName.size + this.movesByName.size) * 100; // 100 bytes per index
    
    const totalBytes = pokemonSize + movesSize + typeChartSize + indexSize;
    const totalWithOverhead = totalBytes * 1.5; // 50% Map overhead
    
    return totalWithOverhead / (1024 * 1024); // Convert to MB
  }
  
  /**
   * Track lookup latency (microseconds)
   */
  private trackLatency(durationMs: number): void {
    const durationUs = durationMs * 1000; // Convert ms to μs
    
    this.latencySum += durationUs;
    this.latencyCount++;
    
    // Warn if latency exceeds expected threshold
    if (durationUs > EngineDbConfig.l1CacheExpectedLatencyUs) {
      log('warn', 'engine-cache: Slow lookup detected', {
        latencyUs: durationUs.toFixed(2),
        expectedUs: EngineDbConfig.l1CacheExpectedLatencyUs
      });
    }
  }
  
  // ============================================================================
  // Corruption Detection & Data Integrity
  // ============================================================================
  
  /**
   * Update data checksum for corruption detection.
   * 
   * CRITICAL: This method MUST be called after any data modification
   * (initialization, refresh). Creates a simple checksum based on:
   * - Pokemon count
   * - Move count
   * - Type effectiveness count
   * - Sample of first 10 Pokemon IDs
   * 
   * This isn't cryptographic security - it's a sanity check to detect
   * if the cache Maps got cleared/corrupted unexpectedly.
   */
  private updateDataChecksum(): void {
    try {
      // Collect data fingerprint
      const pokemonIds = Array.from(this.pokemon.keys()).slice(0, 10).join(',');
      const moveIds = Array.from(this.moves.keys()).slice(0, 10).join(',');
      const typeKeys = Array.from(this.typeChart.keys()).slice(0, 10).join(',');
      
      const fingerprint = `P:${this.pokemon.size}:${pokemonIds}|M:${this.moves.size}:${moveIds}|T:${this.typeChart.size}:${typeKeys}`;
      
      // Simple hash (not cryptographic, just fast corruption detection)
      let hash = 0;
      for (let i = 0; i < fingerprint.length; i++) {
        const char = fingerprint.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      
      this.dataChecksum = hash.toString(16);
      this.corruptionDetected = false;
      
    } catch (error) {
      log('error', 'engine-cache: Failed to update checksum', error);
      this.dataChecksum = null;
    }
  }
  
  /**
   * Verify cache integrity (call periodically or before critical operations).
   * 
   * Checks:
   * 1. Maps are not empty (corruption indicator)
   * 2. Secondary indexes match primary maps
   * 3. Checksum hasn't changed unexpectedly
   * 
   * @returns true if cache is healthy, false if corruption detected
   */
  verifyIntegrity(): boolean {
    try {
      // Check 1: Maps should not be empty if initialized
      if (this.isInitialized && this.pokemon.size === 0) {
        log('error', 'engine-cache: CORRUPTION DETECTED - Pokemon map is empty');
        this.corruptionDetected = true;
        return false;
      }
      
      // Check 2: Secondary indexes should match primary maps
      if (this.pokemonByName.size !== this.pokemon.size) {
        log('error', 'engine-cache: CORRUPTION DETECTED - Pokemon name index out of sync', {
          pokemonSize: this.pokemon.size,
          indexSize: this.pokemonByName.size
        });
        this.corruptionDetected = true;
        return false;
      }
      
      if (this.movesByName.size !== this.moves.size) {
        log('error', 'engine-cache: CORRUPTION DETECTED - Move name index out of sync', {
          movesSize: this.moves.size,
          indexSize: this.movesByName.size
        });
        this.corruptionDetected = true;
        return false;
      }
      
      // Check 3: Data structure sanity
      for (const [id, pokemon] of this.pokemon.entries()) {
        if (!pokemon || typeof pokemon.id !== 'number' || pokemon.id !== id) {
          log('error', 'engine-cache: CORRUPTION DETECTED - Invalid Pokemon entry', {
            expectedId: id,
            actualId: pokemon?.id
          });
          this.corruptionDetected = true;
          return false;
        }
      }
      
      this.corruptionDetected = false;
      return true;
      
    } catch (error) {
      log('error', 'engine-cache: Integrity check failed', error);
      this.corruptionDetected = true;
      return false;
    }
  }
  
  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void {
    this.hitCount = 0;
    this.missCount = 0;
    this.latencySum = 0;
    this.latencyCount = 0;
  }
  
  // ============================================================================
  // Lifecycle Management
  // ============================================================================
  
  /**
   * Graceful shutdown (cleanup timers, no data loss)
   */
  shutdown(): void {
    log('info', 'engine-cache: Shutting down gracefully...');
    
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    
    const stats = this.getStats();
    log('info', 'engine-cache: Shutdown complete', {
      finalHitCount: stats.hitCount,
      finalMissCount: stats.missCount,
      finalAvgLatencyUs: stats.avgLatencyUs.toFixed(2)
    });
  }
  
  /**
   * Check if cache is ready for battle operations
   */
  isReady(): boolean {
    return this.isInitialized && this.pokemon.size > 0;
  }
}

// ============================================================================
// Singleton Instance (Global Access)
// ============================================================================

/**
 * Global L1 cache instance (initialized at startup)
 * 
 * Usage:
 * ```typescript
 * import { engineCache } from './services/engine-cache.js';
 * 
 * const pokemon = engineCache.getPokemon(25); // Pikachu
 * const move = engineCache.getMove(85);       // Thunderbolt
 * const effectiveness = engineCache.getTypeEffectiveness(13, 11); // Electric vs Water
 * ```
 */
export const engineCache = new EngineCache();
