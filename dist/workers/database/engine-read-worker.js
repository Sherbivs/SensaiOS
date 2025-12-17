/**
 * Engine Read-DB Worker — SQLite Read-Only Worker with L1 Cache
 *
 * Purpose:
 * - Provide ultra-fast read access to Pokémon reference data (~2000 species)
 * - L1 in-memory cache (Map-based) for <1μs lookup latency
 * - SQLite backend (sql.js) for ~50ms fallback when L1 misses
 * - Powers game engine lookups (battle calculations, move selection, type effectiveness)
 *
 * Architecture:
 * - L1 Cache: Map<pokemonId, Pokemon> (primary), Map<pokemonName, Pokemon> (secondary index)
 * - SQLite Read-DB: engine-read-db.sqlite (2.5 MB, read-only, loaded into memory)
 * - Refresh Strategy: Hourly background refresh from SQLite
 * - No write operations: Read-only worker (QueryableWorker only)
 *
 * Performance Targets:
 * - L1 hit: <1μs (Map lookup)
 * - L1 miss: ~50ms (SQLite prepared statement)
 * - Cache size: ~20 MB (bounded by max 2000 species)
 * - Query throughput: 10,000+ reads/sec
 *
 * Integration:
 * - Replace src/data/dexpack.js filesystem access
 * - Used by: BattleEngine, EncounterSystem, StatsCalculator
 * - Fallback: dexpack.v2.json if worker unavailable
 *
 * @module workers/database/engine-read-worker
 */
import { BaseDatabaseWorker } from './base-worker.js';
// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Parse a raw SQLite row into a typed Pokemon object.
 * Handles JSON field parsing with safe defaults.
 */
function parsePokemonRow(row) {
    return {
        id: row.id,
        name: row.name,
        types: JSON.parse(row.types || '[]'),
        baseStats: JSON.parse(row.baseStats || '{}'),
        abilities: JSON.parse(row.abilities || '[]'),
        moves: row.moves ? JSON.parse(row.moves) : undefined,
        evolutions: row.evolutions ? JSON.parse(row.evolutions) : undefined,
    };
}
// ═══════════════════════════════════════════════════════════════════════════
// Engine Read-DB Worker Implementation
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Engine Read-DB Worker
 *
 * Read-only worker for ultra-fast Pokémon data access with L1 caching.
 *
 * Features:
 * - L1 Map cache (~20 MB, <1μs lookups)
 * - SQLite fallback (~50ms prepared statements)
 * - Hourly background refresh
 * - No write operations
 *
 * Usage:
 * ```typescript
 * const worker = getEngineReadWorker();
 * const pikachu = await worker.getPokemon(25);
 * const fireballType = await worker.getTypeEffectiveness('fire', 'water');
 * ```
 */
export class EngineReadWorker extends BaseDatabaseWorker {
    db = null;
    cache = {
        pokemon: new Map(),
        pokemonByName: new Map(),
        moves: new Map(),
        typeChart: new Map(),
        lastRefresh: new Date(0),
        hitCount: 0,
        missCount: 0,
    };
    constructor(config, eventEmitter) {
        super(config, eventEmitter);
    }
    // ═══════════════════════════════════════════════════════════════════════
    // Worker Identity (Abstract Implementation)
    // ═══════════════════════════════════════════════════════════════════════
    get id() {
        return 'engine-read';
    }
    get name() {
        return 'Engine Read-DB Worker';
    }
    get type() {
        return 'sqlite-read';
    }
    // ═══════════════════════════════════════════════════════════════════════
    // Lifecycle Methods (BaseDatabaseWorker Implementation)
    // ═══════════════════════════════════════════════════════════════════════
    async doInitialize() {
        this.log('[EngineReadWorker] Initializing SQLite database...', 'info');
        try {
            // Dynamic import of sql.js with timeout protection
            const initSqlJs = await Promise.race([
                import('sql.js'),
                new Promise((_, reject) => setTimeout(() => reject(new Error('sql.js import timeout')), 3000)),
            ]);
            this.log('[EngineReadWorker] sql.js imported, initializing...', 'info');
            const SQL = await Promise.race([
                initSqlJs.default(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('sql.js initialization timeout')), 3000)),
            ]);
            // Load engine-read-db.sqlite from Store/
            const fs = await import('node:fs/promises');
            const path = await import('node:path');
            const dbPath = path.join(process.cwd(), 'Store', 'engine-read-db.sqlite');
            this.log(`[EngineReadWorker] Checking for SQLite file at ${dbPath}`, 'info');
            try {
                const buffer = await fs.readFile(dbPath);
                this.db = new SQL.Database(buffer);
                this.log(`[EngineReadWorker] SQLite loaded: ${dbPath} (${buffer.length} bytes)`, 'info');
            }
            catch {
                this.log('[EngineReadWorker] SQLite file not found, creating empty database', 'info');
                this.db = new SQL.Database();
            }
            // Initial L1 cache population
            await this.refreshCache();
            this.log('[EngineReadWorker] Initialization complete', 'info');
        }
        catch (error) {
            this.log(`[EngineReadWorker] Initialization failed: ${error.message}`, 'error');
            // Create empty database as fallback
            const initSqlJs = await import('sql.js');
            const SQL = await initSqlJs.default();
            this.db = new SQL.Database();
            this.log('[EngineReadWorker] Fallback to empty database', 'info');
        }
    }
    async doStart() {
        this.log('[EngineReadWorker] Starting background refresh timer...', 'info');
        // Hourly refresh handled by WorkerManager
    }
    async doStop() {
        this.log('[EngineReadWorker] Stopping worker...', 'info');
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        // Clear cache
        this.cache.pokemon.clear();
        this.cache.pokemonByName.clear();
        this.cache.moves.clear();
        this.cache.typeChart.clear();
    }
    async doHealthCheck() {
        if (!this.db) {
            return { status: 'no-database' };
        }
        try {
            // Quick count query
            const result = this.db.exec('SELECT COUNT(*) as count FROM pokemon');
            const count = result[0]?.values[0]?.[0];
            return {
                pokemonCount: count,
                cacheSize: this.cache.pokemon.size,
                cacheHitRate: this.calculateHitRate(),
                lastRefresh: this.cache.lastRefresh.toISOString(),
            };
        }
        catch (error) {
            return {
                status: 'query-failed',
                error: error.message,
            };
        }
    }
    // ═══════════════════════════════════════════════════════════════════════
    // QueryableWorker Implementation
    // ═══════════════════════════════════════════════════════════════════════
    async query(sql, params = []) {
        return this.executeOperation('query', async () => {
            if (!this.db) {
                throw new Error('SQLite database not initialized');
            }
            const stmt = this.db.prepare(sql);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            stmt.bind(params);
            const results = [];
            while (stmt.step()) {
                const row = stmt.getAsObject();
                results.push(row);
            }
            stmt.free();
            return results;
        });
    }
    async queryOne(sql, params = []) {
        const results = await this.query(sql, params);
        return results[0] ?? null;
    }
    getCacheStats() {
        const hitRate = this.calculateHitRate();
        return {
            hitCount: this.cache.hitCount,
            missCount: this.cache.missCount,
            hitRate,
            sizeBytes: this.estimateCacheSize(),
            entryCount: this.cache.pokemon.size + this.cache.moves.size + this.cache.typeChart.size,
            evictionCount: 0, // No eviction in L1 cache (bounded dataset)
            utilizationPercent: this.calculateUtilization(),
        };
    }
    async clearCache() {
        this.cache.pokemon.clear();
        this.cache.pokemonByName.clear();
        this.cache.moves.clear();
        this.cache.typeChart.clear();
        this.cache.hitCount = 0;
        this.cache.missCount = 0;
        this.cache.lastRefresh = new Date(0);
        this.log('[EngineReadWorker] Cache cleared', 'info');
    }
    // ═══════════════════════════════════════════════════════════════════════
    // Engine-Specific Read Operations
    // ═══════════════════════════════════════════════════════════════════════
    /**
     * Get Pokémon by ID (L1 cache first, SQLite fallback)
     */
    async getPokemon(id) {
        return this.executeOperation('getPokemon', async () => {
            // L1 cache hit
            const cached = this.cache.pokemon.get(id);
            if (cached) {
                this.cache.hitCount++;
                return cached;
            }
            // L1 miss - query SQLite
            this.cache.missCount++;
            const sql = 'SELECT * FROM pokemon WHERE id = ?';
            const row = await this.queryOne(sql, [id]);
            if (row) {
                const pokemon = parsePokemonRow(row);
                // Update L1 cache
                this.cache.pokemon.set(id, pokemon);
                this.cache.pokemonByName.set(pokemon.name.toLowerCase(), pokemon);
                return pokemon;
            }
            return null;
        });
    }
    /**
     * Get Pokémon by name (case-insensitive, L1 cache first)
     */
    async getPokemonByName(name) {
        return this.executeOperation('getPokemonByName', async () => {
            const normalizedName = name.toLowerCase();
            // L1 cache hit
            const cached = this.cache.pokemonByName.get(normalizedName);
            if (cached) {
                this.cache.hitCount++;
                return cached;
            }
            // L1 miss - query SQLite
            this.cache.missCount++;
            const sql = 'SELECT * FROM pokemon WHERE LOWER(name) = ?';
            const row = await this.queryOne(sql, [normalizedName]);
            if (row) {
                const pokemon = parsePokemonRow(row);
                // Update L1 cache
                this.cache.pokemon.set(pokemon.id, pokemon);
                this.cache.pokemonByName.set(normalizedName, pokemon);
                return pokemon;
            }
            return null;
        });
    }
    /**
     * Get move by ID
     */
    async getMove(id) {
        return this.executeOperation('getMove', async () => {
            // L1 cache hit
            const cached = this.cache.moves.get(id);
            if (cached) {
                this.cache.hitCount++;
                return cached;
            }
            // L1 miss - query SQLite
            this.cache.missCount++;
            const sql = 'SELECT * FROM moves WHERE id = ?';
            const row = await this.queryOne(sql, [id]);
            if (row) {
                this.cache.moves.set(id, row);
                return row;
            }
            return null;
        });
    }
    /**
     * Get type effectiveness multiplier
     */
    async getTypeEffectiveness(attackType, defenseType) {
        return this.executeOperation('getTypeEffectiveness', async () => {
            const key = `${attackType.toLowerCase()}-${defenseType.toLowerCase()}`;
            // L1 cache hit
            const cached = this.cache.typeChart.get(key);
            if (cached !== undefined) {
                this.cache.hitCount++;
                return cached;
            }
            // L1 miss - query SQLite
            this.cache.missCount++;
            const sql = 'SELECT multiplier FROM type_effectiveness WHERE LOWER(attackType) = ? AND LOWER(defenseType) = ?';
            const row = await this.queryOne(sql, [attackType.toLowerCase(), defenseType.toLowerCase()]);
            const multiplier = row?.multiplier ?? 1.0; // Default to neutral
            this.cache.typeChart.set(key, multiplier);
            return multiplier;
        });
    }
    /**
     * Refresh L1 cache from SQLite (called hourly)
     */
    async refreshCache() {
        return this.executeOperation('refreshCache', async () => {
            this.log('[EngineReadWorker] Refreshing L1 cache...', 'info');
            if (!this.db) {
                throw new Error('SQLite database not initialized');
            }
            // Check if tables exist before querying
            try {
                const tableCheck = this.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='pokemon'");
                if (!tableCheck || tableCheck.length === 0 || !tableCheck[0]?.values.length) {
                    this.log('[EngineReadWorker] Pokemon table not found, skipping cache refresh (empty database)', 'info');
                    return;
                }
            }
            catch {
                this.log('[EngineReadWorker] Cannot check table existence, skipping cache refresh', 'info');
                return;
            }
            // Load all Pokémon
            const pokemonRows = await this.query('SELECT * FROM pokemon');
            for (const row of pokemonRows) {
                const pokemon = parsePokemonRow(row);
                this.cache.pokemon.set(pokemon.id, pokemon);
                this.cache.pokemonByName.set(pokemon.name.toLowerCase(), pokemon);
            }
            // Load all moves
            const moveRows = await this.query('SELECT * FROM moves');
            for (const move of moveRows) {
                this.cache.moves.set(move.id, move);
            }
            // Load type chart
            const typeRows = await this.query('SELECT * FROM type_effectiveness');
            for (const { attackType, defenseType, multiplier } of typeRows) {
                const key = `${attackType.toLowerCase()}-${defenseType.toLowerCase()}`;
                this.cache.typeChart.set(key, multiplier);
            }
            this.cache.lastRefresh = new Date();
            this.log('[EngineReadWorker] Cache refresh complete', 'info');
        });
    }
    // ═══════════════════════════════════════════════════════════════════════
    // Private Helper Methods
    // ═══════════════════════════════════════════════════════════════════════
    calculateHitRate() {
        const total = this.cache.hitCount + this.cache.missCount;
        return total > 0 ? this.cache.hitCount / total : 0;
    }
    estimateCacheSize() {
        // Rough estimate: 10KB per Pokémon, 1KB per move, 100 bytes per type chart entry
        return (this.cache.pokemon.size * 10240 +
            this.cache.moves.size * 1024 +
            this.cache.typeChart.size * 100);
    }
    calculateUtilization() {
        const maxSize = 20 * 1024 * 1024; // 20 MB max
        const currentSize = this.estimateCacheSize();
        return (currentSize / maxSize) * 100;
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// Factory Function
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Create Engine Read-DB Worker with default configuration
 *
 * Configuration:
 * - No write buffer (read-only worker)
 * - Circuit breaker for SQLite failures
 * - Hourly cache refresh
 * - Health checks every 15s
 *
 * @param eventEmitter Optional event emitter for worker events
 * @returns Configured EngineReadWorker instance
 */
export function createEngineReadWorker(eventEmitter) {
    const config = {
        id: 'engine-read',
        name: 'Engine Read-DB Worker',
        enabled: true,
        errorRecovery: {
            policy: 'circuit-breaker',
            maxRetries: 3,
            initialRetryDelayMs: 1000,
            maxRetryDelayMs: 30000,
            backoffMultiplier: 2,
            circuitBreakerThreshold: 5,
            circuitBreakerResetMs: 30000,
        },
        healthCheckIntervalMs: 15000, // 15s
        metricsIntervalMs: 5000, // 5s
    };
    return new EngineReadWorker(config, eventEmitter);
}
