/**
 * Database Services Barrel Export
 *
 * Centralized exports for all database-related services:
 * - engine-read-db: Read-only SQLite database for static Pokemon data
 * - engine-write-db: Append-only SQLite database for battle logs, move usage, anomalies
 *
 * Architecture:
 * - PROD (PostgreSQL) → Read-DB (SQLite) sync happens daily via Worker 3
 * - Read-DB → L1 Cache sync happens hourly via Worker 1
 * - Write-DB → PROD sync happens via Worker 4 after validation
 *
 * Usage:
 * ```typescript
 * import * as engineReadDb from '../services/database';
 * import * as engineWriteDb from '../services/database';
 *
 * await engineReadDb.initialize();
 * await engineWriteDb.initialize();
 * ```
 */
// Engine Read-DB (Read-Only SQLite)
export * as engineReadDb from './engine-read-db.js';
// Engine Write-DB (Append-Only SQLite)
export * as engineWriteDb from './engine-write-db.js';
