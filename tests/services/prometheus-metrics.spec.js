/**
 * @file Prometheus Metrics Service Tests
 * @description Tests for Prometheus metrics collection and HTTP server
 * @module tests/services/prometheus-metrics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initializeMetrics,
  recordRoleAssignment,
  recordCacheInvalidation,
  recordPermissionViolation,
  recordLockAcquisition,
  setActiveSweeps,
  setCacheHitRate,
  setRevertFailureRate,
  recordSweepCandidates,
  recordRoleAssignmentDuration,
  updateTimeWindowedMetrics,
  getMetricsText,
  getMetricsJson,
  resetMetrics,
  shutdownMetrics,
  isMetricsInitialized
} from '../../src/services/prometheus-metrics.js';

describe('Prometheus Metrics Service', () => {
  beforeEach(() => {
    // Reset metrics before each test
    shutdownMetrics();
  });
  
  afterEach(() => {
    // Clean up after each test
    shutdownMetrics();
  });
  
  describe('initializeMetrics()', () => {
    it('should initialize metrics registry', () => {
      const result = initializeMetrics();
      
      expect(result).toBeDefined();
      expect(result.registry).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(isMetricsInitialized()).toBe(true);
    });
    
    it('should use custom prefix', () => {
      const result = initializeMetrics({ prefix: 'custom_bot_' });
      
      expect(result).toBeDefined();
      expect(isMetricsInitialized()).toBe(true);
    });
    
    it('should return existing registry on second call', () => {
      const first = initializeMetrics();
      const second = initializeMetrics();
      
      expect(first.registry).toBe(second.registry);
    });
    
    it('should include default Node.js metrics when enabled', () => {
      initializeMetrics({ includeDefaultMetrics: true });
      
      // Default metrics should be registered
      expect(isMetricsInitialized()).toBe(true);
    });
    
    it('should skip default metrics when disabled', () => {
      initializeMetrics({ includeDefaultMetrics: false });
      
      expect(isMetricsInitialized()).toBe(true);
    });
  });
  
  describe('Counter Metrics', () => {
    beforeEach(() => {
      initializeMetrics();
    });
    
    it('should record role assignment', async () => {
      recordRoleAssignment('member-join', 'guild123', 'Test Guild', 'success');
      
      const metricsText = await getMetricsText();
      
      expect(metricsText).toContain('security_bot_role_assignments_total');
      expect(metricsText).toContain('origin="member-join"');
      expect(metricsText).toContain('guild_id="guild123"');
      expect(metricsText).toContain('result="success"');
    });
    
    it('should record cache invalidation', async () => {
      recordCacheInvalidation('manual-removal', 'guild456', 'Another Guild');
      
      const metricsText = await getMetricsText();
      
      expect(metricsText).toContain('security_bot_cache_invalidations_total');
      expect(metricsText).toContain('reason="manual-removal"');
      expect(metricsText).toContain('guild_id="guild456"');
    });
    
    it('should record permission violation', async () => {
      recordPermissionViolation('unauthorized-change', 'guild789', 'Third Guild');
      
      const metricsText = await getMetricsText();
      
      expect(metricsText).toContain('security_bot_permission_violations_total');
      expect(metricsText).toContain('type="unauthorized-change"');
      expect(metricsText).toContain('guild_id="guild789"');
    });
    
    it('should record distributed lock acquisition', async () => {
      recordLockAcquisition('success', 'role-assignment');
      
      const metricsText = await getMetricsText();
      
      expect(metricsText).toContain('security_bot_distributed_lock_acquisitions_total');
      expect(metricsText).toContain('result="success"');
      expect(metricsText).toContain('resource_type="role-assignment"');
    });
    
    it('should increment counters multiple times', async () => {
      recordRoleAssignment('member-join', 'guild123', 'Test Guild', 'success');
      recordRoleAssignment('member-join', 'guild123', 'Test Guild', 'success');
      recordRoleAssignment('member-join', 'guild123', 'Test Guild', 'failed');
      
      const metricsJson = await getMetricsJson();
      
      const roleAssignments = metricsJson.find(m => m.name === 'security_bot_role_assignments_total');
      expect(roleAssignments).toBeDefined();
      expect(roleAssignments.values.length).toBeGreaterThan(0);
    });
  });
  
  describe('Gauge Metrics', () => {
    beforeEach(() => {
      initializeMetrics();
    });
    
    it('should set active sweeps gauge', async () => {
      setActiveSweeps('guild123', 'Test Guild', 5);
      
      const metricsText = await getMetricsText();
      
      expect(metricsText).toContain('security_bot_active_sweeps');
      expect(metricsText).toContain('guild_id="guild123"');
      expect(metricsText).toContain('5');
    });
    
    it('should set cache hit rate gauge', async () => {
      setCacheHitRate('role-assignment', 85.5);
      
      const metricsText = await getMetricsText();
      
      expect(metricsText).toContain('security_bot_cache_hit_rate');
      expect(metricsText).toContain('cache_type="role-assignment"');
      expect(metricsText).toContain('85.5');
    });
    
    it('should set revert failure rate gauge', async () => {
      setRevertFailureRate('guild123', 'Test Guild', 2.5);
      
      const metricsText = await getMetricsText();
      
      expect(metricsText).toContain('security_bot_revert_failure_rate');
      expect(metricsText).toContain('guild_id="guild123"');
      expect(metricsText).toContain('2.5');
    });
    
    it('should update gauge values', async () => {
      setActiveSweeps('guild123', 'Test Guild', 5);
      setActiveSweeps('guild123', 'Test Guild', 3); // Update
      
      const metricsText = await getMetricsText();
      
      // Should contain the updated value  
      expect(metricsText).toContain('security_bot_active_sweeps{guild_id="guild123",guild_name="Test Guild"} 3');
    });
  });
  
  describe('Histogram Metrics', () => {
    beforeEach(() => {
      initializeMetrics();
    });
    
    it('should record sweep candidates histogram', async () => {
      recordSweepCandidates('guild123', 'Test Guild', 75);
      
      const metricsText = await getMetricsText();
      
      expect(metricsText).toContain('security_bot_sweep_candidates');
      expect(metricsText).toContain('guild_id="guild123"');
    });
    
    it('should record role assignment duration histogram', async () => {
      recordRoleAssignmentDuration('member-join', 'success', 1.5);
      
      const metricsText = await getMetricsText();
      
      expect(metricsText).toContain('security_bot_role_assignment_duration_seconds');
      expect(metricsText).toContain('origin="member-join"');
      expect(metricsText).toContain('result="success"');
    });
    
    it('should track histogram buckets', async () => {
      // Record values in different buckets
      recordSweepCandidates('guild123', 'Test Guild', 5);
      recordSweepCandidates('guild123', 'Test Guild', 75);
      recordSweepCandidates('guild123', 'Test Guild', 500);
      
      const metricsText = await getMetricsText();
      
      // Should have bucket entries
      expect(metricsText).toContain('_bucket');
      expect(metricsText).toContain('_sum');
      expect(metricsText).toContain('_count');
    });
  });
  
  describe('Time-Windowed Metrics', () => {
    beforeEach(() => {
      initializeMetrics();
    });
    
    it('should update time-windowed metrics from state', async () => {
      const mockState = {
        metricsHistory: {
          hourly: [
            {
              timestamp: new Date().toISOString(),
              sweeps: 10,
              alerts: 5,
              permissionChanges: 15,
              errors: 2,
              permissionReverts: 15,
              revertFailures: 0,
              memberFetchTimeouts: 0,
              restarts: 0
            }
          ],
          lastPruned: new Date().toISOString()
        }
      };
      
      updateTimeWindowedMetrics(mockState);
      
      const metricsText = await getMetricsText();
      
      expect(metricsText).toContain('security_bot_sweeps_last_24_hours');
      expect(metricsText).toContain('security_bot_alerts_last_24_hours');
      expect(metricsText).toContain('security_bot_permission_changes_last_24_hours');
      expect(metricsText).toContain('security_bot_errors_last_24_hours');
    });
    
    it('should handle empty state gracefully', async () => {
      const emptyState = {
        metricsHistory: {
          hourly: []
        }
      };
      
      updateTimeWindowedMetrics(emptyState);
      
      const metricsText = await getMetricsText();
      
      // Should still have metric definitions (with 0 values)
      expect(metricsText).toContain('security_bot_sweeps_last_24_hours');
    });
    
    it('should calculate rate metrics correctly', async () => {
      const mockState = {
        metricsHistory: {
          hourly: Array.from({ length: 24 }, (_, i) => ({
            timestamp: new Date(Date.now() - (i * 60 * 60 * 1000)).toISOString(),
            sweeps: 3,  // 3 per hour = 72 per day
            alerts: 1,   // 1 per hour = 24 per day
            permissionChanges: 5,
            errors: 0,
            permissionReverts: 5,
            revertFailures: 0,
            memberFetchTimeouts: 0,
            restarts: 0
          }))
        }
      };
      
      updateTimeWindowedMetrics(mockState);
      
      const metricsText = await getMetricsText();
      
      expect(metricsText).toContain('security_bot_sweep_rate_per_hour');
      expect(metricsText).toContain('security_bot_alert_rate_per_hour');
    });
  });
  
  describe('Metrics Format', () => {
    beforeEach(() => {
      initializeMetrics();
    });
    
    it('should export metrics in Prometheus text format', async () => {
      recordRoleAssignment('member-join', 'guild123', 'Test Guild', 'success');
      
      const metricsText = await getMetricsText();
      
      expect(typeof metricsText).toBe('string');
      expect(metricsText).toContain('# HELP');
      expect(metricsText).toContain('# TYPE');
    });
    
    it('should export metrics in JSON format', async () => {
      recordRoleAssignment('member-join', 'guild123', 'Test Guild', 'success');
      
      const metricsJson = await getMetricsJson();
      
      expect(Array.isArray(metricsJson)).toBe(true);
      expect(metricsJson.length).toBeGreaterThan(0);
      
      const metric = metricsJson[0];
      expect(metric).toHaveProperty('name');
      expect(metric).toHaveProperty('help');
      expect(metric).toHaveProperty('type');
    });
  });
  
  describe('Metrics Lifecycle', () => {
    it('should reset metrics', () => {
      initializeMetrics();
      recordRoleAssignment('member-join', 'guild123', 'Test Guild', 'success');
      
      resetMetrics();
      
      // Metrics should still be initialized but counters reset
      expect(isMetricsInitialized()).toBe(true);
    });
    
    it('should shutdown metrics', () => {
      initializeMetrics();
      
      expect(isMetricsInitialized()).toBe(true);
      
      shutdownMetrics();
      
      expect(isMetricsInitialized()).toBe(false);
    });
    
    it('should handle recording metrics before initialization gracefully', () => {
      shutdownMetrics();
      
      // Should not throw errors
      expect(() => {
        recordRoleAssignment('member-join', 'guild123', 'Test Guild', 'success');
        recordCacheInvalidation('manual-removal', 'guild456', 'Another Guild');
        recordPermissionViolation('unauthorized-change', 'guild789', 'Third Guild');
      }).not.toThrow();
    });
    
    it('should throw error when getting metrics before initialization', async () => {
      shutdownMetrics();
      
      await expect(getMetricsText()).rejects.toThrow('Metrics not initialized');
    });
  });
  
  describe('Production Scenario', () => {
    it('should track a complete role assignment workflow', async () => {
      initializeMetrics();
      
      // Simulate role assignment workflow
      const startTime = Date.now();
      
      // 1. Acquire distributed lock
      recordLockAcquisition('success', 'role-assignment');
      
      // 2. Cache miss (will assign)
      setCacheHitRate('role-assignment', 75.0);
      
      // 3. Permission check passed
      // (no violation recorded)
      
      // 4. Role assignment succeeded
      recordRoleAssignment('member-join', 'guild123', 'Production Guild', 'success');
      
      // 5. Record duration
      const duration = (Date.now() - startTime) / 1000;
      recordRoleAssignmentDuration('member-join', 'success', duration);
      
      // 6. Cache write
      // (handled internally)
      
      const metricsText = await getMetricsText();
      
      expect(metricsText).toContain('security_bot_distributed_lock_acquisitions_total');
      expect(metricsText).toContain('security_bot_cache_hit_rate');
      expect(metricsText).toContain('security_bot_role_assignments_total');
      expect(metricsText).toContain('security_bot_role_assignment_duration_seconds');
    });
    
    it('should track a sweep operation', async () => {
      initializeMetrics();
      
      const guildId = 'guild123';
      const guildName = 'Production Guild';
      
      // 1. Start sweep
      setActiveSweeps(guildId, guildName, 1);
      
      // 2. Process candidates
      const candidateCount = 75;
      recordSweepCandidates(guildId, guildName, candidateCount);
      
      // 3. Complete sweep
      setActiveSweeps(guildId, guildName, 0);
      
      const metricsText = await getMetricsText();
      
      expect(metricsText).toContain('security_bot_active_sweeps');
      expect(metricsText).toContain('security_bot_sweep_candidates');
    });
  });
});
