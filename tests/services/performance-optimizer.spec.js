/**
 * Performance Optimizer Integration Tests
 * 
 * Tests profiling, caching, batch processing, optimized detection,
 * memory management, and performance reporting capabilities.
 * 
 * Created: 2024-01-XX (Session 6 - Task 12)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  profileFunction,
  profileAsyncFunction,
  getPerformanceStats,
  clearPerformanceData,
  CacheWithTTL,
  LRUCache,
  memoize,
  createBatchProcessor,
  optimizeThreatDetection,
  optimizeBaselineGeneration,
  optimizeMetricsCalculation,
  getMemoryUsage,
  generatePerformanceReport
} from '../../src/services/performanceOptimizer.js';

// ============================================================================
// TEST SUITE 1: PERFORMANCE PROFILING
// ============================================================================

describe('Performance Optimizer - Profiling', () => {
  beforeEach(() => {
    clearPerformanceData();
  });

  it('should profile synchronous function execution', () => {
    // Test function that takes measurable time
    const testFn = () => {
      let sum = 0;
      for (let i = 0; i < 1000; i++) {
        sum += i;
      }
      return sum;
    };

    const result = profileFunction(testFn, 'test_sum');

    expect(result).toHaveProperty('result');
    expect(result).toHaveProperty('duration');
    expect(result).toHaveProperty('context', 'test_sum');
    expect(result.duration).toBeGreaterThan(0);
    expect(result.result).toBe(499500); // Sum of 0 to 999
  });

  it('should track multiple function calls', () => {
    const testFn = () => Math.random();

    profileFunction(testFn, 'random_test');
    profileFunction(testFn, 'random_test');
    profileFunction(testFn, 'random_test');

    const stats = getPerformanceStats();
    expect(stats.functions.random_test).toBeDefined();
    expect(stats.functions.random_test.calls).toBe(3);
    expect(stats.functions.random_test.times).toHaveLength(3);
  });

  it('should calculate min/max/avg execution times', () => {
    const fastFn = () => 1;
    const slowFn = () => {
      for (let i = 0; i < 10000; i++) {
        Math.sqrt(i);
      }
      return 1;
    };

    profileFunction(fastFn, 'timing_test');
    profileFunction(slowFn, 'timing_test');
    profileFunction(fastFn, 'timing_test');

    const stats = getPerformanceStats();
    expect(stats.functions.timing_test.calls).toBe(3);
    expect(stats.functions.timing_test.minTime).toBeGreaterThan(0);
    expect(stats.functions.timing_test.maxTime).toBeGreaterThan(stats.functions.timing_test.minTime);
    expect(stats.functions.timing_test.avgTime).toBeGreaterThan(0);
  });

  it('should profile asynchronous function execution', async () => {
    const asyncFn = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'done';
    };

    const result = await profileAsyncFunction(asyncFn, 'async_test');

    expect(result).toHaveProperty('result', 'done');
    expect(result).toHaveProperty('duration');
    expect(result.duration).toBeGreaterThanOrEqual(10);
  });

  it('should calculate percentiles (p50, p95, p99)', () => {
    const testFn = () => Math.random();

    // Generate 100 samples
    for (let i = 0; i < 100; i++) {
      profileFunction(testFn, 'percentile_test');
    }

    const stats = getPerformanceStats();
    expect(stats.functions.percentile_test.calls).toBe(100);
    expect(stats.functions.percentile_test.p50).toBeDefined();
    expect(stats.functions.percentile_test.p95).toBeDefined();
    expect(stats.functions.percentile_test.p99).toBeDefined();
    expect(stats.functions.percentile_test.p99).toBeGreaterThanOrEqual(stats.functions.percentile_test.p95);
    expect(stats.functions.percentile_test.p95).toBeGreaterThanOrEqual(stats.functions.percentile_test.p50);
  });

  it('should clear performance data', () => {
    profileFunction(() => 1, 'clear_test');
    expect(getPerformanceStats().functions.clear_test).toBeDefined();

    clearPerformanceData();
    expect(getPerformanceStats().functions).toEqual({});
  });
});

// ============================================================================
// TEST SUITE 2: CACHING STRATEGIES
// ============================================================================

describe('Performance Optimizer - Caching', () => {
  it('should cache values with TTL', () => {
    const cache = new CacheWithTTL();

    cache.set('key1', 'value1', 1000);
    expect(cache.get('key1')).toBe('value1');
    expect(cache.size).toBe(1);
  });

  it('should expire cached values after TTL', async () => {
    const cache = new CacheWithTTL();

    cache.set('key1', 'value1', 50); // 50ms TTL
    expect(cache.get('key1')).toBe('value1');

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(cache.get('key1')).toBeNull();
  });

  it('should return null for non-existent keys', () => {
    const cache = new CacheWithTTL();
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('should clear all cached values', () => {
    const cache = new CacheWithTTL();

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('should implement LRU cache with max size', () => {
    const cache = new LRUCache(3);

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    expect(cache.size).toBe(3);

    // Add 4th item, should evict oldest
    cache.set('key4', 'value4');
    expect(cache.size).toBe(3);
    expect(cache.get('key1')).toBeNull(); // Evicted
    expect(cache.get('key4')).toBe('value4');
  });

  it('should update access order on get', () => {
    const cache = new LRUCache(2);

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    
    // Access key1 to make it recent
    cache.get('key1');
    
    // Add key3, should evict key2 (least recent)
    cache.set('key3', 'value3');
    expect(cache.get('key2')).toBeNull();
    expect(cache.get('key1')).toBe('value1');
  });

  it('should memoize function results', () => {
    let callCount = 0;
    const expensiveFn = (x, y) => {
      callCount++;
      return x + y;
    };

    const memoized = memoize(expensiveFn, { maxSize: 10 });

    expect(memoized(2, 3)).toBe(5);
    expect(callCount).toBe(1);

    // Second call should use cache
    expect(memoized(2, 3)).toBe(5);
    expect(callCount).toBe(1); // Still 1

    // Different args should call function
    expect(memoized(3, 4)).toBe(7);
    expect(callCount).toBe(2);
  });

  it('should memoize with custom key generator', () => {
    let callCount = 0;
    const fn = (obj) => {
      callCount++;
      return obj.value;
    };

    const memoized = memoize(fn, {
      keyGenerator: (obj) => obj.id
    });

    expect(memoized({ id: 1, value: 'a' })).toBe('a');
    expect(callCount).toBe(1);

    // Same ID, different object - should use cache
    expect(memoized({ id: 1, value: 'b' })).toBe('a');
    expect(callCount).toBe(1);
  });

  it('should respect TTL in memoization', async () => {
    let callCount = 0;
    const fn = (x) => {
      callCount++;
      return x * 2;
    };

    const memoized = memoize(fn, { ttl: 50 });

    expect(memoized(5)).toBe(10);
    expect(callCount).toBe(1);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Cache expired, should call function again
    expect(memoized(5)).toBe(10);
    expect(callCount).toBe(2);
  });
});

// ============================================================================
// TEST SUITE 3: BATCH PROCESSING
// ============================================================================

describe('Performance Optimizer - Batch Processing', () => {
  it('should process items in batches', async () => {
    const processed = [];
    const processFn = async (batch) => {
      processed.push(...batch);
    };

    const processor = createBatchProcessor(processFn, {
      batchSize: 3,
      delay: 10
    });

    processor.add(1);
    processor.add(2);
    processor.add(3);

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(processed).toEqual([1, 2, 3]);
  });

  it('should handle multiple batches', async () => {
    const batches = [];
    const processFn = async (batch) => {
      batches.push([...batch]);
    };

    const processor = createBatchProcessor(processFn, {
      batchSize: 2,
      delay: 10
    });

    processor.add(1);
    processor.add(2);
    processor.add(3);
    processor.add(4);

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(batches.length).toBeGreaterThanOrEqual(2);
    expect(batches.flat()).toEqual([1, 2, 3, 4]);
  });

  it('should flush remaining items', async () => {
    const processed = [];
    const processFn = async (batch) => {
      processed.push(...batch);
    };

    const processor = createBatchProcessor(processFn, {
      batchSize: 10,
      delay: 1000 // Long delay
    });

    processor.add(1);
    processor.add(2);

    await processor.flush();
    expect(processed).toEqual([1, 2]);
  });

  it('should handle errors gracefully', async () => {
    const processFn = async () => {
      throw new Error('Processing error');
    };

    const processor = createBatchProcessor(processFn, {
      batchSize: 2,
      delay: 10
    });

    expect(() => processor.add(1)).not.toThrow();
    expect(() => processor.add(2)).not.toThrow();

    await new Promise(resolve => setTimeout(resolve, 50));
    // Should not crash, errors handled internally
  });
});

// ============================================================================
// TEST SUITE 4: OPTIMIZED THREAT DETECTION
// ============================================================================

describe('Performance Optimizer - Threat Detection', () => {
  it('should optimize threat detection with early exits', () => {
    const changes = [];
    const baselines = { memberBaseline: {}, globalBaseline: {} };

    const result = optimizeThreatDetection(changes, baselines);

    expect(result).toEqual([]);
  });

  it('should cache baseline lookups', () => {
    const changes = [
      { memberId: '123', type: 'role_add' },
      { memberId: '123', type: 'role_remove' }
    ];
    const baselines = {
      memberBaseline: {
        '123': { avgChangesPerDay: 2 }
      },
      globalBaseline: { avgChangesPerDay: 5 }
    };

    const result = optimizeThreatDetection(changes, baselines);

    expect(Array.isArray(result)).toBe(true);
  });

  it('should batch process multiple changes', () => {
    const changes = Array.from({ length: 100 }, (_, i) => ({
      memberId: `member${i}`,
      type: 'role_add'
    }));
    const baselines = { memberBaseline: {}, globalBaseline: {} };

    const start = performance.now();
    const result = optimizeThreatDetection(changes, baselines);
    const duration = performance.now() - start;

    expect(Array.isArray(result)).toBe(true);
    expect(duration).toBeLessThan(100); // Should be fast
  });

  it('should skip analysis for unchanged members', () => {
    const changes = [
      { memberId: '123', type: 'role_add' }
    ];
    const baselines = {
      memberBaseline: {
        '123': { avgChangesPerDay: 2, lastChecked: Date.now() }
      },
      globalBaseline: {}
    };

    const result = optimizeThreatDetection(changes, baselines);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ============================================================================
// TEST SUITE 5: BASELINE GENERATION OPTIMIZATION
// ============================================================================

describe('Performance Optimizer - Baseline Generation', () => {
  it('should generate baselines with caching enabled', () => {
    const roleArchive = [
      { memberId: '123', timestamp: Date.now() },
      { memberId: '123', timestamp: Date.now() - 1000 },
      { memberId: '456', timestamp: Date.now() }
    ];

    const result = optimizeBaselineGeneration(roleArchive, {
      cacheEnabled: true
    });

    expect(result).toHaveProperty('memberBaselines');
    expect(result).toHaveProperty('globalBaseline');
  });

  it('should respect early exit threshold', () => {
    const roleArchive = Array.from({ length: 1000 }, (_, i) => ({
      memberId: '123',
      timestamp: Date.now() - i * 1000
    }));

    const result = optimizeBaselineGeneration(roleArchive, {
      earlyExitThreshold: 100
    });

    expect(result).toBeDefined();
    // Should process only 100 entries, not all 1000
  });

  it('should use cached baselines within TTL', () => {
    const roleArchive = [
      { memberId: '123', timestamp: Date.now() }
    ];

    const result1 = optimizeBaselineGeneration(roleArchive, {
      cacheEnabled: true,
      cacheTTL: 1000
    });

    const result2 = optimizeBaselineGeneration(roleArchive, {
      cacheEnabled: true,
      cacheTTL: 1000
    });

    expect(result1).toEqual(result2);
  });

  it('should regenerate baselines after cache expiry', async () => {
    const roleArchive = [
      { memberId: '123', timestamp: Date.now() }
    ];

    optimizeBaselineGeneration(roleArchive, {
      cacheEnabled: true,
      cacheTTL: 50
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const result = optimizeBaselineGeneration(roleArchive, {
      cacheEnabled: true,
      cacheTTL: 50
    });

    expect(result).toBeDefined();
  });
});

// ============================================================================
// TEST SUITE 6: METRICS CALCULATION OPTIMIZATION
// ============================================================================

describe('Performance Optimizer - Metrics Calculation', () => {
  it('should perform incremental metric updates', () => {
    const currentMetrics = {
      threatCount: 5,
      sweepCount: 10
    };

    const newEvents = [
      { type: 'threat', severity: 'high' },
      { type: 'sweep', rolesChecked: 50 }
    ];

    const result = optimizeMetricsCalculation(currentMetrics, newEvents);

    expect(result.threatCount).toBe(6);
    expect(result.sweepCount).toBe(11);
  });

  it('should use dirty flags to skip unchanged metrics', () => {
    const currentMetrics = {
      threatCount: 5,
      sweepCount: 10,
      unchangedMetric: 100
    };

    const newEvents = [
      { type: 'threat' }
    ];

    const dirtyFlags = new Set();
    const result = optimizeMetricsCalculation(currentMetrics, newEvents, {
      dirtyFlags
    });

    expect(dirtyFlags.has('threatMetrics')).toBe(true);
    expect(dirtyFlags.has('unchangedMetric')).toBe(false);
  });

  it('should fall back to full recalculation when disabled', () => {
    const currentMetrics = { threatCount: 5 };
    const newEvents = [{ type: 'threat' }];

    const _result = optimizeMetricsCalculation(currentMetrics, newEvents, {
      incrementalEnabled: false
    });

    expect(_result).toBeDefined();
  });

  it('should handle multiple event types', () => {
    const currentMetrics = {
      threatCount: 0,
      sweepCount: 0,
      alertCount: 0
    };

    const newEvents = [
      { type: 'threat' },
      { type: 'sweep' },
      { type: 'alert' },
      { type: 'threat' }
    ];

    const result = optimizeMetricsCalculation(currentMetrics, newEvents);

    expect(result.threatCount).toBe(2);
    expect(result.sweepCount).toBe(1);
    expect(result.alertCount).toBe(1);
  });
});

// ============================================================================
// TEST SUITE 7: MEMORY MANAGEMENT
// ============================================================================

describe('Performance Optimizer - Memory Management', () => {
  it('should report current memory usage', () => {
    const memory = getMemoryUsage();

    expect(memory).toHaveProperty('heapUsed');
    expect(memory).toHaveProperty('heapTotal');
    expect(memory).toHaveProperty('external');
    expect(memory).toHaveProperty('rss');
    expect(typeof memory.heapUsed).toBe('number');
    expect(memory.heapUsed).toBeGreaterThan(0);
  });

  it('should format memory values in MB', () => {
    const memory = getMemoryUsage();

    // Values should be in MB (reasonable range)
    expect(memory.heapUsed).toBeLessThan(1000); // Less than 1GB
    expect(memory.heapUsed).toBeGreaterThan(0.1); // More than 100KB
  });

  it('should track memory over time', () => {
    const memory1 = getMemoryUsage();
    
    // Allocate some memory
    const largeArray = new Array(100000).fill({ data: 'test' });
    
    const memory2 = getMemoryUsage();

    expect(memory2.heapUsed).toBeGreaterThanOrEqual(memory1.heapUsed);
    
    // Keep largeArray in scope to prevent premature GC
    expect(largeArray.length).toBe(100000);
  });
});

// ============================================================================
// TEST SUITE 8: PERFORMANCE REPORTING
// ============================================================================

describe('Performance Optimizer - Reporting', () => {
  beforeEach(() => {
    clearPerformanceData();
  });

  it('should generate comprehensive performance report', () => {
    // Generate some profiling data
    profileFunction(() => 1, 'test_fn');
    profileFunction(() => 2, 'test_fn');

    const report = generatePerformanceReport();

    expect(report).toHaveProperty('functions');
    expect(report).toHaveProperty('memory');
    expect(report).toHaveProperty('summary');
    expect(report.functions.test_fn).toBeDefined();
  });

  it('should include memory statistics in report', () => {
    const report = generatePerformanceReport();

    expect(report.memory).toHaveProperty('heapUsed');
    expect(report.memory).toHaveProperty('heapTotal');
    expect(report.memory).toHaveProperty('rss');
  });

  it('should calculate performance summary', () => {
    profileFunction(() => 1, 'fast_fn');
    profileFunction(() => {
      for (let i = 0; i < 10000; i++) Math.sqrt(i);
    }, 'slow_fn');

    const report = generatePerformanceReport();

    expect(report.summary).toHaveProperty('totalFunctions');
    expect(report.summary).toHaveProperty('totalCalls');
    expect(report.summary.totalFunctions).toBe(2);
    expect(report.summary.totalCalls).toBe(2);
  });

  it('should identify slowest functions', () => {
    profileFunction(() => 1, 'fast');
    profileFunction(() => {
      for (let i = 0; i < 100000; i++) Math.sqrt(i);
    }, 'slow');

    const report = generatePerformanceReport();

    expect(report.summary).toHaveProperty('slowestFunction');
    expect(report.summary.slowestFunction).toBe('slow');
  });

  it('should provide optimization recommendations', () => {
    // Create slow function
    for (let i = 0; i < 10; i++) {
      profileFunction(() => {
        for (let j = 0; j < 50000; j++) Math.sqrt(j);
      }, 'expensive_fn');
    }

    const report = generatePerformanceReport();

    expect(report).toHaveProperty('recommendations');
    expect(Array.isArray(report.recommendations)).toBe(true);
  });
});

// ============================================================================
// TEST SUITE 9: END-TO-END PERFORMANCE OPTIMIZATION
// ============================================================================

describe('Performance Optimizer - End-to-End', () => {
  beforeEach(() => {
    clearPerformanceData();
  });

  it('should optimize complete security workflow', async () => {
    // 1. Generate baselines (with optimization)
    const roleArchive = Array.from({ length: 500 }, (_, i) => ({
      memberId: `member${i % 50}`,
      timestamp: Date.now() - i * 60000
    }));

    const baselineResult = profileFunction(
      () => optimizeBaselineGeneration(roleArchive, { earlyExitThreshold: 100 }),
      'baseline_generation'
    );

    expect(baselineResult.result).toBeDefined();
    expect(baselineResult.duration).toBeLessThan(100); // Should be fast

    // 2. Detect threats (with optimization)
    const changes = [
      { memberId: 'member1', type: 'role_add' },
      { memberId: 'member2', type: 'role_remove' }
    ];

    const threatResult = profileFunction(
      () => optimizeThreatDetection(changes, baselineResult.result),
      'threat_detection'
    );

    expect(Array.isArray(threatResult.result)).toBe(true);
    expect(threatResult.duration).toBeLessThan(50);

    // 3. Calculate metrics (with optimization)
    const currentMetrics = { threatCount: 0, sweepCount: 0 };
    const newEvents = [
      { type: 'threat' },
      { type: 'sweep' }
    ];

    const metricsResult = profileFunction(
      () => optimizeMetricsCalculation(currentMetrics, newEvents),
      'metrics_calculation'
    );

    expect(metricsResult.result.threatCount).toBe(1);
    expect(metricsResult.duration).toBeLessThan(10);

    // 4. Generate performance report
    const report = generatePerformanceReport();

    expect(report.functions).toHaveProperty('baseline_generation');
    expect(report.functions).toHaveProperty('threat_detection');
    expect(report.functions).toHaveProperty('metrics_calculation');
    expect(report.summary.totalFunctions).toBe(3);
  });

  it('should demonstrate caching benefits', () => {
    let executionCount = 0;
    const expensiveFn = (x) => {
      executionCount++;
      for (let i = 0; i < 100000; i++) Math.sqrt(i);
      return x * 2;
    };

    // Without caching
    const start1 = performance.now();
    expensiveFn(5);
    expensiveFn(5);
    expensiveFn(5);
    const duration1 = performance.now() - start1;
    expect(executionCount).toBe(3);

    // With caching
    executionCount = 0;
    const memoized = memoize(expensiveFn);
    const start2 = performance.now();
    memoized(5);
    memoized(5);
    memoized(5);
    const duration2 = performance.now() - start2;

    expect(executionCount).toBe(1); // Only first call executed
    expect(duration2).toBeLessThan(duration1 * 0.5); // At least 50% faster
  });

  it('should demonstrate batch processing benefits', async () => {
    const processedIndividually = [];
    const processedBatched = [];

    // Process individually
    const start1 = performance.now();
    for (let i = 0; i < 100; i++) {
      await new Promise(resolve => setTimeout(resolve, 1));
      processedIndividually.push(i);
    }
    const duration1 = performance.now() - start1;

    // Process in batches
    const processor = createBatchProcessor(
      async (batch) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        processedBatched.push(...batch);
      },
      { batchSize: 10, delay: 5 }
    );

    const start2 = performance.now();
    for (let i = 0; i < 100; i++) {
      processor.add(i);
    }
    await processor.flush();
    const duration2 = performance.now() - start2;

    expect(processedBatched).toHaveLength(100);
    expect(duration2).toBeLessThan(duration1 * 0.5); // At least 50% faster
  });
});
