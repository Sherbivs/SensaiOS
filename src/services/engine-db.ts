/**
 * Engine Database - Read-optimized SQLite database for static game data.
 * 
 * Uses sql.js (pure JavaScript SQLite) for cross-platform compatibility.
 * Stores Pokemon stats, moves, abilities, type effectiveness, and precomputed
 * battle calculations on persistent disk at /Store/engine.db (production) or
 * Store/engine.db (local development).
 * 
 * Why sql.js?
 * - Pure JavaScript: No Python/build tools needed, works on Windows/Linux/Mac
 * - File-based: Perfect for Render persistent disk (/Store/)
 * - Zero-config: No separate database server needed
 * - ACID guarantees: Safe for critical game data
 * - Better than JSON: Structured queries, indexes, no full-file parsing
 * 
 * Data Flow:
 * 1. Seed from data/pokemon.json on first startup
 * 2. Query at runtime for battle calculations
 * 3. Persist changes back to disk after writes
 */

import initSqlJs, { type Database } from 'sql.js';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '../shared/log.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment-aware database path (matches other /Store/ services)
const ENGINE_DB_PATH = process.env.RENDER 
  ? '/Store/engine.db'
  : path.join(process.cwd(), 'Store', 'engine.db');

const ENGINE_DB_VERSION = 1;
const POKEMON_DATA_PATH = path.join(process.cwd(), 'data', 'pokemon.json');

interface PokemonRecord {
  id: number;
  name: string;
  types: string; // JSON array
  abilities: string; // JSON array
  base_stats: string; // JSON object
  sprites: string; // JSON object
  indexed_at: number; // Unix timestamp
}

interface PokemonStats {
  hp: number;
  attack: number;
  defense: number;
  special_attack: number;
  special_defense: number;
  speed: number;
}

interface PokemonData {
  id: number;
  name: string;
  types: string[];
  abilities: Array<{ name: string; is_hidden: boolean; slot: number }>;
  base_stats: PokemonStats;
  sprites: {
    default: string | null;
    shiny: string | null;
    official_artwork: string | null;
    home: string | null;
  };
}

interface EngineMetadata {
  version: number;
  pokemon_count: number;
  seeded_at: number;
  source_file: string;
}

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;
let db: Database | null = null;
let initializationPromise: Promise<void> | null = null;
let isInitialized = false;

/**
 * Save database to disk (sql.js operates in-memory, must explicitly persist).
 */
async function saveToFile(): Promise<void> {
  if (!db) {
    return;
  }

  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    await fsPromises.writeFile(ENGINE_DB_PATH, buffer);
  } catch (error) {
    log.error('engine-db: Failed to save database to disk', error);
    throw error;
  }
}

/**
 * Initialize the engine database (idempotent, safe to call multiple times).
 * Creates tables, indexes, and seeds data from pokemon.json if empty.
 */
async function initialize(): Promise<void> {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      log.info('engine-db: Initializing engine database...', { path: ENGINE_DB_PATH });

      // Initialize sql.js
      SQL = await initSqlJs({
        // Use the bundled WASM file from node_modules
        locateFile: (file: string) => path.join(__dirname, '../../node_modules/sql.js/dist/', file)
      });

      // Ensure Store directory exists
      const storeDir = path.dirname(ENGINE_DB_PATH);
      await fsPromises.mkdir(storeDir, { recursive: true });

      // Load existing database or create new one
      let dbData: Uint8Array | undefined;
      try {
        const buffer = await fsPromises.readFile(ENGINE_DB_PATH);
        dbData = new Uint8Array(buffer);
        log.info('engine-db: Loaded existing database from disk');
      } catch {
        // File doesn't exist, will create new database
        log.info('engine-db: No existing database found, creating new');
      }

      db = new SQL.Database(dbData);

      // Create schema
      db.run(`
        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS pokemon (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          types TEXT NOT NULL,
          abilities TEXT NOT NULL,
          base_stats TEXT NOT NULL,
          sprites TEXT NOT NULL,
          indexed_at INTEGER NOT NULL
        )
      `);

      db.run('CREATE INDEX IF NOT EXISTS idx_pokemon_name ON pokemon(name)');
      db.run('CREATE INDEX IF NOT EXISTS idx_pokemon_indexed_at ON pokemon(indexed_at)');

      // Check if database needs seeding
      const countResult = db.exec('SELECT COUNT(*) as count FROM pokemon');
      const count = countResult[0]?.values[0]?.[0] as number ?? 0;
      
      if (count === 0) {
        log.info('engine-db: Database empty, seeding from pokemon.json...', { 
          source: POKEMON_DATA_PATH 
        });
        await seedFromPokemonJson();
      } else {
        log.info('engine-db: Database already seeded', { pokemon_count: count });
      }

      isInitialized = true;
      log.info('engine-db: Engine database initialized', { 
        path: ENGINE_DB_PATH,
        pokemon_count: count
      });
    } catch (error) {
      log.error('engine-db: Failed to initialize engine database', error);
      throw error;
    }
  })();

  return initializationPromise;
}

/**
 * Seed database from data/pokemon.json.
 * Reads JSON file and bulk inserts all Pokemon records.
 */
async function seedFromPokemonJson(): Promise<void> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const startTime = Date.now();

  // Read and parse pokemon.json
  const jsonData = await fsPromises.readFile(POKEMON_DATA_PATH, 'utf-8');
  const parsed = JSON.parse(jsonData) as {
    version: number;
    lastFetchedAt: string;
    total: number;
    pokemon: PokemonData[];
  };

  log.info('engine-db: Seeding database...', { 
    pokemon_count: parsed.pokemon.length,
    source_version: parsed.version 
  });

  // Bulk insert (sql.js doesn't have transactions API like better-sqlite3)
  const insertStmt = db.prepare(`
    INSERT INTO pokemon (id, name, types, abilities, base_stats, sprites, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const now = Date.now();
  for (const p of parsed.pokemon) {
    insertStmt.run([
      p.id,
      p.name,
      JSON.stringify(p.types),
      JSON.stringify(p.abilities),
      JSON.stringify(p.base_stats),
      JSON.stringify(p.sprites),
      now
    ]);
  }
  insertStmt.free();

  // Store metadata
  const metadataStmt = db.prepare(`
    INSERT OR REPLACE INTO metadata (key, value, updated_at)
    VALUES (?, ?, ?)
  `);

  const metadata: EngineMetadata = {
    version: ENGINE_DB_VERSION,
    pokemon_count: parsed.pokemon.length,
    seeded_at: Date.now(),
    source_file: POKEMON_DATA_PATH
  };

  metadataStmt.run(['engine_version', String(metadata.version), metadata.seeded_at]);
  metadataStmt.run(['pokemon_count', String(metadata.pokemon_count), metadata.seeded_at]);
  metadataStmt.run(['seeded_at', String(metadata.seeded_at), metadata.seeded_at]);
  metadataStmt.free();

  // Persist to disk
  await saveToFile();

  const durationMs = Date.now() - startTime;
  log.info('engine-db: Database seeded successfully', { 
    pokemon_count: parsed.pokemon.length,
    duration_ms: durationMs
  });
}

/**
 * Get Pokemon by ID (fast indexed lookup).
 * Returns null if not found.
 */
export async function getPokemonById(id: number): Promise<PokemonData | null> {
  await initialize();
  
  if (!db) {
    return null;
  }

  const result = db.exec(`
    SELECT id, name, types, abilities, base_stats, sprites
    FROM pokemon
    WHERE id = $id
  `, { $id: id });

  if (!result.length || !result[0].values.length) {
    return null;
  }

  const row = result[0].values[0];
  return {
    id: row[0] as number,
    name: row[1] as string,
    types: JSON.parse(row[2] as string),
    abilities: JSON.parse(row[3] as string),
    base_stats: JSON.parse(row[4] as string),
    sprites: JSON.parse(row[5] as string)
  };
}

/**
 * Get Pokemon by name (fast indexed lookup, case-insensitive).
 * Returns null if not found.
 */
export async function getPokemonByName(name: string): Promise<PokemonData | null> {
  await initialize();
  
  if (!db) {
    return null;
  }

  const result = db.exec(`
    SELECT id, name, types, abilities, base_stats, sprites
    FROM pokemon
    WHERE name = $name
  `, { $name: name.toLowerCase() });

  if (!result.length || !result[0].values.length) {
    return null;
  }

  const row = result[0].values[0];
  return {
    id: row[0] as number,
    name: row[1] as string,
    types: JSON.parse(row[2] as string),
    abilities: JSON.parse(row[3] as string),
    base_stats: JSON.parse(row[4] as string),
    sprites: JSON.parse(row[5] as string)
  };
}

/**
 * Get all Pokemon IDs (fast, returns only IDs for pagination/filtering).
 */
export async function getAllPokemonIds(): Promise<number[]> {
  await initialize();
  
  if (!db) {
    return [];
  }

  const result = db.exec('SELECT id FROM pokemon ORDER BY id');
  
  if (!result.length) {
    return [];
  }

  return result[0].values.map((row: unknown[]) => row[0] as number);
}

/**
 * Get Pokemon count (fast, uses COUNT aggregate).
 */
export async function getPokemonCount(): Promise<number> {
  await initialize();
  
  if (!db) {
    return 0;
  }

  const result = db.exec('SELECT COUNT(*) as count FROM pokemon');
  return result[0]?.values[0]?.[0] as number ?? 0;
}

/**
 * Search Pokemon by name prefix (case-insensitive, returns up to 20 results).
 * Useful for autocomplete/search features.
 */
export async function searchPokemonByName(prefix: string, limit = 20): Promise<PokemonData[]> {
  await initialize();
  
  if (!db) {
    return [];
  }

  const result = db.exec(`
    SELECT id, name, types, abilities, base_stats, sprites
    FROM pokemon
    WHERE name LIKE $prefix || '%'
    ORDER BY name
    LIMIT $limit
  `, { $prefix: prefix.toLowerCase(), $limit: limit });

  if (!result.length) {
    return [];
  }

  return result[0].values.map((row: unknown[]) => ({
    id: row[0] as number,
    name: row[1] as string,
    types: JSON.parse(row[2] as string),
    abilities: JSON.parse(row[3] as string),
    base_stats: JSON.parse(row[4] as string),
    sprites: JSON.parse(row[5] as string)
  }));
}

/**
 * Get database statistics for observability.
 */
export async function getEngineStats(): Promise<{
  initialized: boolean;
  path: string;
  pokemon_count: number;
  db_size_bytes: number;
}> {
  await initialize();

  const stats = {
    initialized: isInitialized,
    path: ENGINE_DB_PATH,
    pokemon_count: 0,
    db_size_bytes: 0
  };

  if (db) {
    const result = db.exec('SELECT COUNT(*) as count FROM pokemon');
    stats.pokemon_count = result[0]?.values[0]?.[0] as number ?? 0;
  }

  try {
    const fileStats = await fsPromises.stat(ENGINE_DB_PATH);
    stats.db_size_bytes = fileStats.size;
  } catch {
    stats.db_size_bytes = 0;
  }

  return stats;
}

/**
 * Close database connection (for graceful shutdown).
 */
export function close(): void {
  if (db) {
    db.close();
    db = null;
    isInitialized = false;
    initializationPromise = null;
    log.info('engine-db: Database connection closed');
  }
}

// Export for testing
export { ENGINE_DB_PATH, initialize };
