/**
 * Unit tests for Error Brain DB verification module.
 *
 * Tests ensure the Error Brain SQLite database path is distinct from:
 * - Engine Read-DB (game data cache)
 * - Engine Write-DB (battle logs)
 * - Security/alerts directory
 *
 * @module tests/services/error-brain/db-verify
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';

// Mock the config modules BEFORE importing db-verify
vi.mock('../../../src/config/error-brain-config.js', () => ({
  ErrorBrainConfig: {
    brainDbPath: path.join(process.cwd(), 'Store', 'error-brain.db'),
  },
}));

vi.mock('../../../src/config/engine-db-config.js', () => ({
  ENGINE_READ_DB_PATH: path.join(process.cwd(), 'Store', 'engine-read.db'),
  ENGINE_WRITE_DB_PATH: path.join(process.cwd(), 'Store', 'engine-write.db'),
  ENGINE_WAL_PATH: path.join(process.cwd(), 'Store', 'engine-write.wal'),
}));

vi.mock('../../../src/config/env.js', () => ({
  ALERT_PERSIST_DIR: path.join(process.cwd(), 'Store', 'alerts'),
}));

vi.mock('../../../src/shared/logging/index.js', () => ({
  log: vi.fn(),
}));

describe('Error Brain DB Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('verifyDistinctDatabases', () => {
    it('should return empty array when paths are distinct', async () => {
      const { verifyDistinctDatabases } = await import(
        '../../../src/services/error-brain/db-verify.js'
      );

      const conflicts = verifyDistinctDatabases();
      expect(conflicts).toEqual([]);
    });

    it('should detect collision with Engine Read-DB', async () => {
      // Re-mock with collision
      vi.doMock('../../../src/config/error-brain-config.js', () => ({
        ErrorBrainConfig: {
          brainDbPath: path.join(process.cwd(), 'Store', 'engine-read.db'), // Same as read-db
        },
      }));

      vi.resetModules();

      const { verifyDistinctDatabases } = await import(
        '../../../src/services/error-brain/db-verify.js'
      );

      const conflicts = verifyDistinctDatabases();
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts.some((c) => c.includes('Engine Read-DB'))).toBe(true);
    });

    it('should detect collision with Engine Write-DB', async () => {
      vi.doMock('../../../src/config/error-brain-config.js', () => ({
        ErrorBrainConfig: {
          brainDbPath: path.join(process.cwd(), 'Store', 'engine-write.db'),
        },
      }));

      vi.resetModules();

      const { verifyDistinctDatabases } = await import(
        '../../../src/services/error-brain/db-verify.js'
      );

      const conflicts = verifyDistinctDatabases();
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts.some((c) => c.includes('Engine Write-DB'))).toBe(true);
    });

    it('should detect identical filename collision', async () => {
      // Same filename but different directory is okay; same filename in SAME dir triggers this
      vi.doMock('../../../src/config/error-brain-config.js', () => ({
        ErrorBrainConfig: {
          brainDbPath: path.join(process.cwd(), 'Store', 'other', 'engine-read.db'),
        },
      }));

      vi.resetModules();

      const { verifyDistinctDatabases } = await import(
        '../../../src/services/error-brain/db-verify.js'
      );

      const conflicts = verifyDistinctDatabases();
      // Should detect filename collision
      expect(conflicts.some((c) => c.includes('filename matches'))).toBe(true);
    });
  });

  describe('ensureDistinctOrThrow', () => {
    it('should not throw when paths are distinct', async () => {
      // Reset modules and re-mock with distinct paths
      vi.resetModules();

      vi.doMock('../../../src/config/error-brain-config.js', () => ({
        ErrorBrainConfig: {
          brainDbPath: path.join(process.cwd(), 'Store', 'error-brain.db'),
        },
      }));

      vi.doMock('../../../src/config/engine-db-config.js', () => ({
        ENGINE_READ_DB_PATH: path.join(process.cwd(), 'Store', 'engine-read.db'),
        ENGINE_WRITE_DB_PATH: path.join(process.cwd(), 'Store', 'engine-write.db'),
        ENGINE_WAL_PATH: path.join(process.cwd(), 'Store', 'engine-write.wal'),
      }));

      vi.doMock('../../../src/config/env.js', () => ({
        ALERT_PERSIST_DIR: path.join(process.cwd(), 'Store', 'alerts'),
      }));

      const { ensureDistinctOrThrow } = await import(
        '../../../src/services/error-brain/db-verify.js'
      );

      expect(() => ensureDistinctOrThrow()).not.toThrow();
    });

    it('should throw when collision detected', async () => {
      vi.doMock('../../../src/config/error-brain-config.js', () => ({
        ErrorBrainConfig: {
          brainDbPath: path.join(process.cwd(), 'Store', 'engine-read.db'),
        },
      }));

      vi.resetModules();

      const { ensureDistinctOrThrow } = await import(
        '../../../src/services/error-brain/db-verify.js'
      );

      expect(() => ensureDistinctOrThrow()).toThrow(/conflicts detected/i);
    });
  });
});
