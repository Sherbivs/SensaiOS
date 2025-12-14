/**
 * Engine Read-DB Service — Read-Only SQLite Database for Static Pokemon Data
 *
 * Provides read-only access to static game data (Pokemon, Moves, Type Effectiveness).
 * Used by L1 Cache (engineCache) to load data at startup and during background refresh.
 *
 * Architecture:
 * - PROD (PostgreSQL) → Read-DB (SQLite) sync happens daily via Worker 3 (Render cron)
 * - Read-DB → L1 Cache (in-memory Map) sync happens hourly via Worker 1
 * - Battle engine reads from L1 Cache (synchronous), never touches Read-DB directly
 *
 * Key Features:
 * - Read-only operations (no inserts/updates exposed)
 * - sql.js backend (pure JavaScript SQLite, no build tools)
 * - Persistent disk storage (/Store/engine-read.db)
 * - Version tracking (SHA-256 fingerprint for integrity checks)
 * - Graceful initialization (auto-creates schema if missing)
 *
 * Referenced By: src/services/engine-cache.ts (loadFromReadDb method),
 *                src/workers/engine-workers.ts (ReadDbSyncWorker),
 *                docs/engine-db-replication.md (Read-DB section)
 *
 * @module services/engine-read-db
 */
import initSqlJs from 'sql.js';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { EngineDbConfig } from '../../config/engine-db-config.js';
import { log } from '../../utils/logger.js';
import { getTableCount } from './sql-utils.js';
// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ============================================================================
// Database State
// ============================================================================
let SQL = null;
let db = null;
let isInitialized = false;
// ============================================================================
// Initialization
// ============================================================================
/**
 * Initialize Read-DB (idempotent, safe to call multiple times).
 *
 * Creates schema if database file doesn't exist, otherwise loads existing.
 * Does NOT seed data - data comes from PROD sync (Worker 3).
 *
 * @throws {Error} If sql.js initialization fails or schema creation fails
 */
export async function initialize() {
    if (isInitialized) {
        return; // Already initialized
    }
    try {
        log('info', 'engine-read-db: Initializing Read-DB...', {
            path: EngineDbConfig.readDbPath
        });
        // Initialize sql.js - locate WASM file from project root
        // In production: /opt/render/project/src/node_modules/sql.js/dist/
        // In development: <project-root>/node_modules/sql.js/dist/
        const projectRoot = process.cwd();
        SQL = await initSqlJs({
            locateFile: (file) => path.join(projectRoot, 'node_modules/sql.js/dist/', file)
        });
        // Ensure Store directory exists
        const storeDir = path.dirname(EngineDbConfig.readDbPath);
        await fsPromises.mkdir(storeDir, { recursive: true });
        // Load existing database or create new one
        let dbData;
        try {
            const buffer = await fsPromises.readFile(EngineDbConfig.readDbPath);
            dbData = new Uint8Array(buffer);
            log('info', 'engine-read-db: Loaded existing Read-DB from disk');
        }
        catch {
            log('info', 'engine-read-db: No existing Read-DB found, creating new');
        }
        db = new SQL.Database(dbData);
        // Configure SQLite for performance (read-optimized)
        db.run(`PRAGMA journal_mode = WAL`);
        db.run(`PRAGMA synchronous = NORMAL`);
        db.run(`PRAGMA cache_size = ${EngineDbConfig.sqliteCacheSizePages}`);
        db.run(`PRAGMA busy_timeout = ${EngineDbConfig.sqliteBusyTimeoutMs}`);
        // Create schema (idempotent)
        await createSchema();
        isInitialized = true;
        const stats = getStats();
        log('info', 'engine-read-db: Initialization complete', {
            pokemonCount: stats.pokemonCount,
            moveCount: stats.moveCount,
            typeEffectivenessCount: stats.typeEffectivenessCount
        });
    }
    catch (error) {
        log('error', 'engine-read-db: Initialization failed', error);
        throw error;
    }
}
/**
 * Create Read-DB schema (tables, indexes, version tracking).
 */
async function createSchema() {
    if (!db) {
        throw new Error('Database not initialized');
    }
    // Version metadata table
    db.run(`
    CREATE TABLE IF NOT EXISTS engine_read_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      sha256_fingerprint TEXT NOT NULL,
      last_sync_time INTEGER NOT NULL,
      pokemon_count INTEGER NOT NULL,
      move_count INTEGER NOT NULL,
      type_effectiveness_count INTEGER NOT NULL
    )
  `);
    // Pokemon table (static data)
    db.run(`
    CREATE TABLE IF NOT EXISTS pokemon (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type1_id INTEGER NOT NULL,
      type2_id INTEGER,
      hp INTEGER NOT NULL,
      attack INTEGER NOT NULL,
      defense INTEGER NOT NULL,
      special_attack INTEGER NOT NULL,
      special_defense INTEGER NOT NULL,
      speed INTEGER NOT NULL,
      abilities TEXT NOT NULL,
      moves TEXT NOT NULL
    )
  `);
    // Moves table (static data)
    db.run(`
    CREATE TABLE IF NOT EXISTS moves (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type_id INTEGER NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('physical', 'special', 'status')),
      power INTEGER,
      accuracy INTEGER,
      pp INTEGER NOT NULL,
      priority INTEGER NOT NULL,
      effect_id INTEGER
    )
  `);
    // Type effectiveness table (precomputed type chart)
    db.run(`
    CREATE TABLE IF NOT EXISTS type_effectiveness (
      attack_type_id INTEGER NOT NULL,
      defense_type_id INTEGER NOT NULL,
      multiplier REAL NOT NULL,
      PRIMARY KEY (attack_type_id, defense_type_id)
    )
  `);
    // Create indexes for fast lookups
    db.run('CREATE INDEX IF NOT EXISTS idx_pokemon_name ON pokemon(name)');
    db.run('CREATE INDEX IF NOT EXISTS idx_moves_name ON moves(name)');
    db.run('CREATE INDEX IF NOT EXISTS idx_type_effectiveness ON type_effectiveness(attack_type_id, defense_type_id)');
    log('info', 'engine-read-db: Schema created/verified');
}
// ============================================================================
// Read Operations (Used by L1 Cache)
// ============================================================================
/**
 * Get all Pokemon records (for L1 cache initialization).
 *
 * @returns Array of all Pokemon (empty if database not seeded)
 */
export function getAllPokemon() {
    if (!db) {
        throw new Error('Read-DB not initialized');
    }
    try {
        const result = db.exec(`
      SELECT id, name, type1_id, type2_id, hp, attack, defense, 
             special_attack, special_defense, speed, abilities, moves
      FROM pokemon
      ORDER BY id
    `);
        if (!result || result.length === 0 || !result[0].values) {
            return []; // No Pokemon yet (PROD sync pending)
        }
        const records = result[0].values.map((row) => ({
            id: row[0],
            name: row[1],
            type1_id: row[2],
            type2_id: row[3],
            hp: row[4],
            attack: row[5],
            defense: row[6],
            special_attack: row[7],
            special_defense: row[8],
            speed: row[9],
            abilities: row[10],
            moves: row[11]
        }));
        return records;
    }
    catch (error) {
        log('error', 'engine-read-db: getAllPokemon failed', error);
        throw error;
    }
}
/**
 * Get all Move records (for L1 cache initialization).
 *
 * @returns Array of all Moves (empty if database not seeded)
 */
export function getAllMoves() {
    if (!db) {
        throw new Error('Read-DB not initialized');
    }
    try {
        const result = db.exec(`
      SELECT id, name, type_id, category, power, accuracy, pp, priority, effect_id
      FROM moves
      ORDER BY id
    `);
        if (!result || result.length === 0 || !result[0].values) {
            return []; // No moves yet (PROD sync pending)
        }
        const records = result[0].values.map((row) => ({
            id: row[0],
            name: row[1],
            type_id: row[2],
            category: row[3],
            power: row[4],
            accuracy: row[5],
            pp: row[6],
            priority: row[7],
            effect_id: row[8]
        }));
        return records;
    }
    catch (error) {
        log('error', 'engine-read-db: getAllMoves failed', error);
        throw error;
    }
}
/**
 * Get single Pokemon by ID (for L1 cache miss fallback).
 *
 * OPTIMIZATION: This supports LRU cache misses - when L1 cache evicts
 * a Pokemon, we can fetch it individually from Read-DB (<5ms penalty).
 *
 * @param id Pokemon ID
 * @returns Pokemon record or null if not found
 */
export function getPokemonById(id) {
    if (!db) {
        throw new Error('Read-DB not initialized');
    }
    try {
        const result = db.exec(`
      SELECT id, name, type1_id, type2_id, hp, attack, defense, 
             special_attack, special_defense, speed, abilities, moves
      FROM pokemon
      WHERE id = ?
    `, [id]);
        if (!result || result.length === 0 || !result[0].values || result[0].values.length === 0) {
            return null; // Pokemon not found
        }
        const row = result[0].values[0];
        const record = {
            id: row[0],
            name: row[1],
            type1_id: row[2],
            type2_id: row[3],
            hp: row[4],
            attack: row[5],
            defense: row[6],
            special_attack: row[7],
            special_defense: row[8],
            speed: row[9],
            abilities: row[10],
            moves: row[11]
        };
        return record;
    }
    catch (error) {
        log('error', 'engine-read-db: getPokemonById failed', { pokemonId: id, error });
        return null; // Graceful degradation
    }
}
/**
 * Get single Move by ID (for L1 cache miss fallback).
 *
 * OPTIMIZATION: This supports LRU cache misses - when L1 cache evicts
 * a Move, we can fetch it individually from Read-DB (<5ms penalty).
 *
 * @param id Move ID
 * @returns Move record or null if not found
 */
export function getMoveById(id) {
    if (!db) {
        throw new Error('Read-DB not initialized');
    }
    try {
        const result = db.exec(`
      SELECT id, name, type_id, category, power, accuracy, pp, priority, effect_id
      FROM moves
      WHERE id = ?
    `, [id]);
        if (!result || result.length === 0 || !result[0].values || result[0].values.length === 0) {
            return null; // Move not found
        }
        const row = result[0].values[0];
        const record = {
            id: row[0],
            name: row[1],
            type_id: row[2],
            category: row[3],
            power: row[4],
            accuracy: row[5],
            pp: row[6],
            priority: row[7],
            effect_id: row[8]
        };
        return record;
    }
    catch (error) {
        log('error', 'engine-read-db: getMoveById failed', { moveId: id, error });
        return null; // Graceful degradation
    }
}
/**
 * Get all Type Effectiveness records (for L1 cache type chart).
 *
 * @returns Array of type matchups (empty if database not seeded)
 */
export function getAllTypeEffectiveness() {
    if (!db) {
        throw new Error('Read-DB not initialized');
    }
    try {
        const result = db.exec(`
      SELECT attack_type_id, defense_type_id, multiplier
      FROM type_effectiveness
      ORDER BY attack_type_id, defense_type_id
    `);
        if (!result || result.length === 0 || !result[0].values) {
            return []; // No type chart yet (PROD sync pending)
        }
        const records = result[0].values.map((row) => ({
            attack_type_id: row[0],
            defense_type_id: row[1],
            multiplier: row[2]
        }));
        return records;
    }
    catch (error) {
        log('error', 'engine-read-db: getAllTypeEffectiveness failed', error);
        throw error;
    }
}
// ============================================================================
// Version & Stats (For Observability)
// ============================================================================
/**
 * Get Read-DB version metadata (for integrity checks).
 *
 * @returns Version info or null if not seeded yet
 */
export function getVersion() {
    if (!db) {
        throw new Error('Read-DB not initialized');
    }
    try {
        const result = db.exec(`
      SELECT version, sha256_fingerprint, last_sync_time, 
             pokemon_count, move_count, type_effectiveness_count
      FROM engine_read_version
      WHERE id = 1
    `);
        if (!result || result.length === 0 || !result[0].values || result[0].values.length === 0) {
            return null; // Not seeded yet
        }
        const row = result[0].values[0];
        return {
            version: row[0],
            sha256_fingerprint: row[1],
            last_sync_time: new Date(row[2] * 1000), // Unix timestamp to Date
            pokemon_count: row[3],
            move_count: row[4],
            type_effectiveness_count: row[5]
        };
    }
    catch (error) {
        log('error', 'engine-read-db: getVersion failed', error);
        throw error;
    }
}
/**
 * Get Read-DB statistics (for /ops engine command).
 */
export function getStats() {
    if (!db || !isInitialized) {
        return {
            pokemonCount: 0,
            moveCount: 0,
            typeEffectivenessCount: 0,
            sizeBytes: 0,
            isInitialized: false,
            status: 'offline',
            latency: null,
        };
    }
    try {
        // Measure query latency
        const start = performance.now();
        // Count Pokemon
        const pokemonCount = getTableCount(db, 'pokemon');
        // Count Moves
        const moveCount = getTableCount(db, 'moves');
        // Count Type Effectiveness
        const typeEffectivenessCount = getTableCount(db, 'type_effectiveness');
        // Calculate query latency
        const latency = performance.now() - start;
        // Estimate database size (sql.js in-memory size)
        const data = db.export();
        const sizeBytes = data.byteLength;
        return {
            pokemonCount,
            moveCount,
            typeEffectivenessCount,
            sizeBytes,
            isInitialized: true,
            status: 'healthy',
            latency,
        };
    }
    catch (error) {
        log('error', 'engine-read-db: getStats failed', error);
        return {
            pokemonCount: 0,
            moveCount: 0,
            typeEffectivenessCount: 0,
            sizeBytes: 0,
            isInitialized: false,
            status: 'error',
            latency: null,
        };
    }
}
// ============================================================================
// Lifecycle Management
// ============================================================================
/**
 * Close Read-DB connection gracefully.
 */
export async function close() {
    if (db) {
        db.close();
        db = null;
    }
    SQL = null;
    isInitialized = false;
    log('info', 'engine-read-db: Connection closed');
}
/**
 * Check if Read-DB is ready for queries.
 */
export function isReady() {
    return isInitialized && db !== null;
}
/**
 * Rebuild Read-DB from scratch by dropping the on-disk file and re-running initialization.
 * Designed for scheduled maintenance cycles that require a fresh snapshot from PROD.
 */
export async function rebuild(options = {}) {
    const backupExisting = options.backupExisting ?? true;
    const reason = options.reason ?? 'scheduled-maintenance';
    const readDbPath = EngineDbConfig.readDbPath;
    log('info', 'engine-read-db: Rebuild requested', { reason, backupExisting, path: readDbPath });
    // Close current connection before touching the file
    await close();
    if (backupExisting) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = `${readDbPath}.${timestamp}.bak`;
            await fsPromises.copyFile(readDbPath, backupPath);
            log('info', 'engine-read-db: Backup created before rebuild', { backupPath });
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                log('warn', 'engine-read-db: Failed to create backup before rebuild', { error });
            }
            else {
                log('info', 'engine-read-db: No existing Read-DB file to back up');
            }
        }
    }
    try {
        await fsPromises.rm(readDbPath, { force: true });
        log('info', 'engine-read-db: Existing Read-DB removed');
    }
    catch (error) {
        log('warn', 'engine-read-db: Failed to remove existing Read-DB (continuing)', { error });
    }
    await initialize();
    log('info', 'engine-read-db: Rebuild complete', { reason });
}
