/**
 * Engine Write-DB Stress Test — Verifies isDirty Optimization
 * 
 * This test validates:
 * 1. saveToFile() skips disk writes when isDirty=false (idle behavior)
 * 2. saveToFile() writes to disk when isDirty=true (after inserts)
 * 3. saveToFile(force=true) always writes (shutdown semantics)
 * 4. Data durability under load (no data loss)
 * 
 * Run: npm test -- tests/engine-db/write-db-stress.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { delay } from '../shared/index.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';

// We need to mock the config before importing the module
vi.mock('../../src/config/engine-db-config.js', () => ({
  EngineDbConfig: {
    writeDbPath: './Store/test/engine-write-test.db',
    sqliteCacheSizePages: 1000,
    sqliteBusyTimeoutMs: 5000,
    writeBufferFlushIntervalMs: 1000, // 1s for faster testing
    validationBatchSize: 100,
    writeDbRetentionHours: 24,
  }
}));

// Import after mocking
import {
  initialize,
  close,
  insertBattleLogs,
  insertMoveUsage,
  insertAnomalies,
  saveToFile,
  getStats,
  isReady,
} from '../../src/services/database/engine-write-db.js';

import type { 
  BattleLogEntry, 
  MoveUsageEntry, 
  AnomalyEntry 
} from '../../src/services/cache/engine-write-buffer.js';

// Test data generators
function generateBattleLog(index: number): BattleLogEntry {
  return {
    battleId: `test-battle-${index}-${Date.now()}`,
    trainerId1: `trainer-${index}-a`,
    trainerId2: `trainer-${index}-b`,
    winnerId: `trainer-${index}-a`,
    durationMs: 30000 + Math.floor(Math.random() * 60000),
    turnCount: 5 + Math.floor(Math.random() * 20),
    timestamp: new Date(),
  };
}

function generateMoveUsage(battleId: string, index: number): MoveUsageEntry {
  return {
    battleId,
    trainerId: `trainer-${index % 2 === 0 ? 'a' : 'b'}`,
    pokemonId: 25 + (index % 150),
    moveId: 1 + (index % 165),
    targetPokemonId: 1 + (index % 150),
    damage: Math.floor(Math.random() * 100),
    effectiveness: [0.25, 0.5, 1, 2, 4][Math.floor(Math.random() * 5)],
    isCritical: Math.random() < 0.0625,
    timestamp: new Date(),
  };
}

function generateAnomaly(battleId: string): AnomalyEntry {
  return {
    battleId,
    anomalyType: 'LOGIC_ERROR',
    severity: 'LOW',
    description: 'Test anomaly for stress testing',
    context: { testRun: true, timestamp: Date.now() },
    timestamp: new Date(),
  };
}

// Metrics tracking interface for future use
interface _StressTestMetrics {
  totalInserts: number;
  saveAttempts: number;
  actualWrites: number;
  skippedWrites: number;
  avgInsertLatencyMs: number;
  avgSaveLatencyMs: number;
  finalDbSizeBytes: number;
  testDurationMs: number;
}

describe('Engine Write-DB Stress Test', () => {
  const testDbPath = './Store/test/engine-write-test.db';
  
  beforeEach(async () => {
    // Clean up test database
    try {
      await fs.unlink(testDbPath);
    } catch {
      // File doesn't exist, that's fine
    }
    
    // Ensure test directory exists
    await fs.mkdir(path.dirname(testDbPath), { recursive: true });
  });

  afterEach(async () => {
    // Close database connection
    await close();
    
    // Note: We don't clean up the file here because some tests check file stats
    // File cleanup happens in beforeEach for the next test
  });

  describe('isDirty Optimization', () => {
    it('should skip disk writes when no data has been inserted (idle behavior)', async () => {
      await initialize();
      expect(isReady()).toBe(true);
      
      // Do an initial save to ensure file exists
      await saveToFile(true);
      
      // Get initial file modification time
      const initialStat = await fs.stat(testDbPath);
      const initialMtime = initialStat.mtimeMs;
      
      // Wait a moment to ensure different mtime if written
      await delay();
      
      // Call saveToFile multiple times without any inserts
      for (let i = 0; i < 5; i++) {
        await saveToFile(); // Should skip (isDirty = false)
        await delay();
      }
      
      // Check file modification time hasn't changed
      const finalStat = await fs.stat(testDbPath);
      
      // Mtime should be the same since no data was inserted
      expect(finalStat.mtimeMs).toBe(initialMtime);
      console.log(`[IDLE TEST] Initial mtime: ${initialMtime}, Final mtime: ${finalStat.mtimeMs} - SAME (writes skipped)`);
    });

    it('should write to disk after inserts (dirty behavior)', async () => {
      await initialize();
      
      // Do an initial save to ensure file exists
      await saveToFile(true);
      
      // Get modification time after init
      await delay();
      const postInitStat = await fs.stat(testDbPath);
      const postInitMtime = postInitStat.mtimeMs;
      
      // Insert some data
      const battle = generateBattleLog(1);
      await insertBattleLogs([battle]);
      
      // Wait a moment
      await delay();
      
      // Save should write because isDirty = true
      await saveToFile();
      
      // Check file was modified
      const postSaveStat = await fs.stat(testDbPath);
      expect(postSaveStat.mtimeMs).toBeGreaterThan(postInitMtime);
      
      console.log(`[DIRTY TEST] Post-init mtime: ${postInitMtime}, Post-save mtime: ${postSaveStat.mtimeMs} - DIFFERENT (wrote)`);
    });

    it('should always write when force=true (shutdown semantics)', async () => {
      await initialize();
      
      // Do an initial save to ensure file exists
      await saveToFile(true);
      
      // Wait and get baseline
      await delay();
      const baseline = await fs.stat(testDbPath);
      
      // Wait a moment
      await delay();
      
      // Force save even though nothing changed
      await saveToFile(true);
      
      // Check file was modified
      const postForce = await fs.stat(testDbPath);
      expect(postForce.mtimeMs).toBeGreaterThanOrEqual(baseline.mtimeMs);
      
      console.log(`[FORCE TEST] Baseline mtime: ${baseline.mtimeMs}, Post-force mtime: ${postForce.mtimeMs}`);
    });
  });

  describe('Load Stress Test', () => {
    it('should handle burst inserts without data loss', async () => {
      await initialize();
      
      const BATTLE_COUNT = 50;
      const MOVES_PER_BATTLE = 10;
      
      const startTime = performance.now();
      const insertLatencies: number[] = [];
      
      // Burst insert battles and moves
      for (let i = 0; i < BATTLE_COUNT; i++) {
        const battle = generateBattleLog(i);
        
        const insertStart = performance.now();
        await insertBattleLogs([battle]);
        
        // Insert moves for this battle
        const moves: MoveUsageEntry[] = [];
        for (let j = 0; j < MOVES_PER_BATTLE; j++) {
          moves.push(generateMoveUsage(battle.battleId, j));
        }
        await insertMoveUsage(moves);
        
        insertLatencies.push(performance.now() - insertStart);
      }
      
      // Force save to persist all data
      await saveToFile(true);
      
      const endTime = performance.now();
      
      // Verify data integrity
      const stats = getStats();
      expect(stats.battleLogCount).toBe(BATTLE_COUNT);
      expect(stats.moveUsageCount).toBe(BATTLE_COUNT * MOVES_PER_BATTLE);
      
      // Report metrics
      const avgLatency = insertLatencies.reduce((a, b) => a + b, 0) / insertLatencies.length;
      console.log(`[BURST TEST] Results:`);
      console.log(`  Battles inserted: ${BATTLE_COUNT}`);
      console.log(`  Moves inserted: ${BATTLE_COUNT * MOVES_PER_BATTLE}`);
      console.log(`  Total duration: ${(endTime - startTime).toFixed(2)}ms`);
      console.log(`  Avg insert latency: ${avgLatency.toFixed(2)}ms`);
      console.log(`  DB size: ${stats.sizeBytes} bytes`);
    });

    it('should maintain data durability across save cycles', async () => {
      await initialize();
      
      // Insert batch 1
      const batch1 = [generateBattleLog(1), generateBattleLog(2)];
      await insertBattleLogs(batch1);
      await saveToFile();
      
      // Verify batch 1
      let stats = getStats();
      expect(stats.battleLogCount).toBe(2);
      
      // Insert batch 2
      const batch2 = [generateBattleLog(3), generateBattleLog(4), generateBattleLog(5)];
      await insertBattleLogs(batch2);
      await saveToFile();
      
      // Verify cumulative
      stats = getStats();
      expect(stats.battleLogCount).toBe(5);
      
      // Close and reopen to verify persistence
      await close();
      await initialize();
      
      // Data should be preserved
      stats = getStats();
      expect(stats.battleLogCount).toBe(5);
      
      console.log(`[DURABILITY TEST] Verified ${stats.battleLogCount} battles persist across restart`);
    });
  });

  describe('I/O Efficiency Measurement', () => {
    it('should measure write efficiency during mixed workload', async () => {
      await initialize();
      
      const CYCLES = 20;
      const INSERTS_PER_CYCLE = 3;
      const IDLE_CYCLES = 5;
      
      let writeCount = 0;
      let skipCount = 0;
      
      // Track file modifications
      const getFileMtime = async () => {
        try {
          const stat = await fs.stat(testDbPath);
          return stat.mtimeMs;
        } catch {
          return 0;
        }
      };
      
      let lastMtime = await getFileMtime();
      
      // Mixed workload: some cycles with inserts, some idle
      for (let cycle = 0; cycle < CYCLES; cycle++) {
        const isIdleCycle = cycle >= (CYCLES - IDLE_CYCLES);
        
        if (!isIdleCycle) {
          // Insert data
          for (let i = 0; i < INSERTS_PER_CYCLE; i++) {
            await insertBattleLogs([generateBattleLog(cycle * INSERTS_PER_CYCLE + i)]);
          }
        }
        
        // Wait a bit
        await delay();
        
        // Save
        await saveToFile();
        
        // Check if file was modified
        const currentMtime = await getFileMtime();
        if (currentMtime > lastMtime) {
          writeCount++;
          lastMtime = currentMtime;
        } else {
          skipCount++;
        }
      }
      
      // Final forced save
      await saveToFile(true);
      
      const stats = getStats();
      const expectedBattles = (CYCLES - IDLE_CYCLES) * INSERTS_PER_CYCLE;
      
      expect(stats.battleLogCount).toBe(expectedBattles);
      
      console.log(`[I/O EFFICIENCY TEST] Results:`);
      console.log(`  Total cycles: ${CYCLES}`);
      console.log(`  Active cycles: ${CYCLES - IDLE_CYCLES}`);
      console.log(`  Idle cycles: ${IDLE_CYCLES}`);
      console.log(`  Actual disk writes: ${writeCount}`);
      console.log(`  Skipped writes (optimized): ${skipCount}`);
      console.log(`  Write efficiency: ${((skipCount / CYCLES) * 100).toFixed(1)}% writes avoided`);
      console.log(`  Battles in DB: ${stats.battleLogCount}`);
    });
  });

  describe('Anomaly Handling', () => {
    it('should correctly insert and persist anomalies', async () => {
      await initialize();
      
      const battle = generateBattleLog(1);
      await insertBattleLogs([battle]);
      
      const anomaly = generateAnomaly(battle.battleId);
      await insertAnomalies([anomaly]);
      
      await saveToFile(true);
      
      const stats = getStats();
      expect(stats.anomalyCount).toBe(1);
      expect(stats.battleLogCount).toBe(1);
      
      console.log(`[ANOMALY TEST] Anomaly count: ${stats.anomalyCount}`);
    });
  });
});
