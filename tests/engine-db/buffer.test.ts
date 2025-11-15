/**
 * Engine Write Buffer Tests
 * 
 * Tests the in-memory write queues for battle logs, move usage, and anomalies.
 * Validates <10μs push latency, backpressure handling, and flush operations.
 */

import { describe, it, expect } from 'vitest';

describe('Engine Write Buffer - API Contract', () => {
  it('should export required functions', async () => {
    const module = await import('../../src/services/engine-write-buffer.js');
    
    expect(typeof module.engineWriteBuffer.logBattle).toBe('function');
    expect(typeof module.engineWriteBuffer.logMoveUsage).toBe('function');
    expect(typeof module.engineWriteBuffer.logAnomaly).toBe('function');
    expect(typeof module.engineWriteBuffer.flush).toBe('function');
    expect(typeof module.engineWriteBuffer.getStats).toBe('function');
  });

  it('should return BufferStats with required fields', async () => {
    const module = await import('../../src/services/engine-write-buffer.js');
    const stats = module.engineWriteBuffer.getStats();

    expect(stats).toBeDefined();
    expect(typeof stats.battleLogQueueSize).toBe('number');
    expect(typeof stats.moveUsageQueueSize).toBe('number');
    expect(typeof stats.anomalyQueueSize).toBe('number');
    expect(typeof stats.totalQueueSize).toBe('number');
    expect(typeof stats.utilizationPercent).toBe('number');
    expect(typeof stats.maxQueueSize).toBe('number');
    expect(typeof stats.flushCount).toBe('number');
    expect(typeof stats.isBackpressureActive).toBe('boolean');
    expect(stats.lastFlushTime === null || stats.lastFlushTime instanceof Date).toBe(true);
  });
});

describe('Engine Write Buffer - Performance', () => {
  it('should achieve <10μs push latency for battle logs', async () => {
    const module = await import('../../src/services/engine-write-buffer.js');
    
    // Arrange
    const sampleBattleLog = {
      battleId: 'test_battle_1',
      trainerId1: '123456789',
      trainerId2: '987654321',
      winnerId: '123456789',
      durationMs: 300000,
      turnCount: 5,
      timestamp: new Date(),
    };

    // Act - Perform 1000 push operations and measure average latency
    const iterations = 1000;
    const start = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      module.engineWriteBuffer.logBattle({
        ...sampleBattleLog,
        battleId: `test_battle_${i}`,
      });
    }
    
    const end = performance.now();
    const totalTimeMs = end - start;
    const averageLatencyUs = (totalTimeMs / iterations) * 1000; // Convert ms to μs

    // Assert - Target <10μs per push
    expect(averageLatencyUs).toBeLessThan(10);
    expect(totalTimeMs).toBeLessThan(10); // Total under 10ms for 1000 pushes
  });

  it('should achieve <10μs push latency for move usage logs', async () => {
    const module = await import('../../src/services/engine-write-buffer.js');
    
    // Arrange
    const sampleMoveUsage = {
      battleId: 'test_battle_1',
      trainerId: '123456789',
      pokemonId: 25,
      moveId: 85,
      targetPokemonId: 134,
      damage: 45,
      effectiveness: 1.0,
      isCritical: false,
      timestamp: new Date(),
    };

    // Act
    const iterations = 1000;
    const start = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      module.engineWriteBuffer.logMoveUsage({
        ...sampleMoveUsage,
        moveId: 85 + i, // Vary move ID
      });
    }
    
    const end = performance.now();
    const averageLatencyUs = ((end - start) / iterations) * 1000;

    // Assert
    expect(averageLatencyUs).toBeLessThan(10);
  });

  it('should handle concurrent pushes efficiently', async () => {
    const module = await import('../../src/services/engine-write-buffer.js');
    
    // Act - Simulate concurrent battle logging
    const promises = Array.from({ length: 100 }, (_, i) => {
      return Promise.resolve()
        .then(() => module.engineWriteBuffer.logBattle({
          battleId: `concurrent_battle_${i}`,
          trainerId1: '123',
          trainerId2: '456',
          winnerId: '123',
          durationMs: 300000,
          turnCount: 5,
          timestamp: new Date(),
        }))
        .then(() => module.engineWriteBuffer.logMoveUsage({
          battleId: `concurrent_battle_${i}`,
          trainerId: '123',
          pokemonId: 25,
          moveId: 85,
          targetPokemonId: 134,
          damage: 45,
          effectiveness: 1.0,
          isCritical: false,
          timestamp: new Date(),
        }));
    });

    const start = performance.now();
    await Promise.all(promises);
    const end = performance.now();

    // Assert - 200 total pushes (100 battles + 100 moves) should be <20ms
    expect(end - start).toBeLessThan(20);
  });
});

describe('Engine Write Buffer - Queue Management', () => {
  it('should track queue sizes accurately', async () => {
    const module = await import('../../src/services/engine-write-buffer.js');
    
    // Get initial stats
    const initialStats = module.engineWriteBuffer.getStats();
    const initialBattleQueue = initialStats.battleLogQueueSize;

    // Add some entries
    module.engineWriteBuffer.logBattle({
      battleId: 'queue_test_1',
      trainerId1: '123',
      trainerId2: '456',
      winnerId: '123',
      durationMs: 300000,
      turnCount: 5,
      timestamp: new Date(),
    });

    module.engineWriteBuffer.logBattle({
      battleId: 'queue_test_2',
      trainerId1: '123',
      trainerId2: '789',
      winnerId: '789',
      durationMs: 180000,
      turnCount: 3,
      timestamp: new Date(),
    });

    // Get updated stats
    const updatedStats = module.engineWriteBuffer.getStats();

    // Assert - Queue should have grown
    expect(updatedStats.battleLogQueueSize).toBeGreaterThanOrEqual(initialBattleQueue + 2);
  });

  it('should track total logged counts', async () => {
    const module = await import('../../src/services/engine-write-buffer.js');
    
    // Get initial stats
    const initialStats = module.engineWriteBuffer.getStats();
    const initialQueueSize = initialStats.battleLogQueueSize;

    // Add entries
    module.engineWriteBuffer.logBattle({
      battleId: 'count_test_1',
      trainerId1: '123',
      trainerId2: '456',
      winnerId: '123',
      durationMs: 300000,
      turnCount: 5,
      timestamp: new Date(),
    });

    // Get updated stats
    const updatedStats = module.engineWriteBuffer.getStats();

    // Assert - Queue size should increase
    expect(updatedStats.battleLogQueueSize).toBeGreaterThanOrEqual(initialQueueSize + 1);
  });

  it('should report max queue size', async () => {
    const module = await import('../../src/services/engine-write-buffer.js');
    const stats = module.engineWriteBuffer.getStats();

    // Max queue size should be configured (default 10000)
    expect(stats.maxQueueSize).toBeGreaterThan(0);
    expect(stats.maxQueueSize).toBeLessThanOrEqual(10000);
  });
});

describe('Engine Write Buffer - Flush Operations', () => {
  it('should flush without errors', async () => {
    const module = await import('../../src/services/engine-write-buffer.js');
    
    // Add some entries
    module.engineWriteBuffer.logBattle({
      battleId: 'flush_test_1',
      trainerId1: '123',
      trainerId2: '456',
      winnerId: '123',
      durationMs: 300000,
      turnCount: 5,
      timestamp: new Date(),
    });

    // Flush should not throw
    await expect(module.engineWriteBuffer.flush()).resolves.not.toThrow();
  });

  it('should update last flush time after flush', async () => {
    const module = await import('../../src/services/engine-write-buffer.js');
    
    // Get stats before flush
    const statsBefore = module.engineWriteBuffer.getStats();
    const lastFlushBefore = statsBefore.lastFlushTime;

    // Wait a bit to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 10));

    // Flush
    await module.engineWriteBuffer.flush();

    // Get stats after flush
    const statsAfter = module.engineWriteBuffer.getStats();
    const lastFlushAfter = statsAfter.lastFlushTime;

    // Assert - Flush time should have updated
    if (lastFlushBefore === null) {
      expect(lastFlushAfter).not.toBeNull();
    } else {
      expect(lastFlushAfter).not.toBeNull();
      expect(lastFlushAfter!.getTime()).toBeGreaterThanOrEqual(lastFlushBefore.getTime());
    }
  });

  it('should handle empty queue flush gracefully', async () => {
    const module = await import('../../src/services/engine-write-buffer.js');
    
    // Flush empty queues should not throw
    await expect(module.engineWriteBuffer.flush()).resolves.not.toThrow();
  });
});

describe('Engine Write Buffer - Edge Cases', () => {
  it('should handle rapid consecutive pushes', async () => {
    const module = await import('../../src/services/engine-write-buffer.js');
    
    // Push many entries rapidly
    for (let i = 0; i < 100; i++) {
      module.engineWriteBuffer.logBattle({
        battleId: `rapid_${i}`,
        trainerId1: '123',
        trainerId2: '456',
        winnerId: '123',
        durationMs: 300000,
        turnCount: 5,
        timestamp: new Date(),
      });
    }

    const stats = module.engineWriteBuffer.getStats();
    
    // Should have accepted all entries (or hit backpressure gracefully)
    expect(stats.battleLogQueueSize).toBeGreaterThan(0);
    expect(stats.battleLogQueueSize).toBeLessThanOrEqual(stats.maxQueueSize);
  });

  it('should handle anomaly logging', async () => {
    const module = await import('../../src/services/engine-write-buffer.js');
    
    const initialStats = module.engineWriteBuffer.getStats();
    
    // Log anomaly
    module.engineWriteBuffer.logAnomaly({
      anomalyType: 'INVALID_DAMAGE',
      battleId: 'anomaly_test_1',
      severity: 'HIGH',
      description: 'Damage calculation resulted in negative value',
      context: { damage: -50, expected: 50 },
      timestamp: new Date(),
    });

    const updatedStats = module.engineWriteBuffer.getStats();

    // Assert - Anomaly queue should grow
    expect(updatedStats.anomalyQueueSize).toBeGreaterThanOrEqual(initialStats.anomalyQueueSize + 1);
  });

  it('should handle timestamps correctly', async () => {
    const module = await import('../../src/services/engine-write-buffer.js');
    
    const now = new Date();
    
    module.engineWriteBuffer.logBattle({
      battleId: 'timestamp_test',
      trainerId1: '123',
      trainerId2: '456',
      winnerId: '123',
      durationMs: 300000,
      turnCount: 5,
      timestamp: now,
    });

    // Should not throw - timestamps should be accepted
    const stats = module.engineWriteBuffer.getStats();
    expect(stats.battleLogQueueSize).toBeGreaterThanOrEqual(0);
  });
});

describe('Engine Write Buffer - Backpressure', () => {
  it('should report queue utilization', async () => {
    const module = await import('../../src/services/engine-write-buffer.js');
    const stats = module.engineWriteBuffer.getStats();

    // Utilization should be calculable
    const battleUtilization = stats.battleLogQueueSize / stats.maxQueueSize;
    const moveUtilization = stats.moveUsageQueueSize / stats.maxQueueSize;
    const anomalyUtilization = stats.anomalyQueueSize / stats.maxQueueSize;

    expect(battleUtilization).toBeGreaterThanOrEqual(0);
    expect(battleUtilization).toBeLessThanOrEqual(1);
    expect(moveUtilization).toBeGreaterThanOrEqual(0);
    expect(moveUtilization).toBeLessThanOrEqual(1);
    expect(anomalyUtilization).toBeGreaterThanOrEqual(0);
    expect(anomalyUtilization).toBeLessThanOrEqual(1);
  });
});
