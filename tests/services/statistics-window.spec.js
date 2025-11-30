/**
 * @file Statistics Window Calculator Tests
 * @description Tests for rolling time window statistics (24h, 7d, 30d)
 * @module tests/services/statistics-window
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TIME_WINDOWS,
  calculateWindowStats,
  calculateAllWindows,
  calculateRates,
  getComprehensiveStats,
  compareTrends,
  detectAnomalies,
  formatStatsDisplay,
  formatRatesDisplay
} from '../../src/services/statistics-window.js';

describe('Statistics Window Calculator', () => {
  let mockMetricsHistory;
  let mockState;
  
  beforeEach(() => {
    // Create 48 hours of mock metrics (2 days)
    const now = Date.now();
    mockMetricsHistory = [];
    
    for (let i = 0; i < 48; i++) {
      const timestamp = new Date(now - (i * 60 * 60 * 1000)); // i hours ago
      mockMetricsHistory.push({
        timestamp: timestamp.toISOString(),
        sweeps: i % 2 === 0 ? 2 : 1,      // Alternating pattern
        alerts: i < 24 ? 1 : 0,            // Alerts only in last 24 hours
        permissionChanges: Math.floor(i / 6), // Increases with time
        permissionReverts: Math.floor(i / 6),
        revertFailures: i % 12 === 0 ? 1 : 0, // Occasional failures
        errors: i % 8 === 0 ? 1 : 0,          // Occasional errors
        memberFetchTimeouts: 0,
        restarts: i === 0 ? 1 : 0              // One restart at the beginning
      });
    }
    
    mockState = {
      metricsHistory: {
        hourly: mockMetricsHistory,
        lastPruned: new Date().toISOString()
      }
    };
  });
  
  describe('calculateWindowStats()', () => {
    it('should calculate statistics for 24-hour window', () => {
      const stats = calculateWindowStats(mockMetricsHistory, TIME_WINDOWS.HOURS_24);
      
      expect(stats).toBeDefined();
      expect(stats.hoursWithData).toBeGreaterThanOrEqual(24); // May include current partial hour
      expect(stats.hoursWithData).toBeLessThanOrEqual(25);
      expect(stats.sweeps).toBeGreaterThan(0);
      expect(stats.alerts).toBeGreaterThanOrEqual(24); // At least 24 alerts
      expect(stats.windowStart).toBeDefined();
      expect(stats.windowEnd).toBeDefined();
    });
    
    it('should calculate statistics for 7-day window', () => {
      // Add more mock data for 7-day window
      const now = Date.now();
      const extendedHistory = [...mockMetricsHistory];
      
      for (let i = 48; i < 168; i++) { // 7 days = 168 hours
        const timestamp = new Date(now - (i * 60 * 60 * 1000));
        extendedHistory.push({
          timestamp: timestamp.toISOString(),
          sweeps: 1,
          alerts: 0,
          permissionChanges: 1,
          permissionReverts: 1,
          revertFailures: 0,
          errors: 0,
          memberFetchTimeouts: 0,
          restarts: 0
        });
      }
      
      const stats = calculateWindowStats(extendedHistory, TIME_WINDOWS.DAYS_7);
      
      expect(stats).toBeDefined();
      expect(stats.hoursWithData).toBe(168);
      expect(stats.sweeps).toBeGreaterThan(0);
    });
    
    it('should return empty stats for empty metrics history', () => {
      const stats = calculateWindowStats([], TIME_WINDOWS.HOURS_24);
      
      expect(stats.hoursWithData).toBe(0);
      expect(stats.sweeps).toBe(0);
      expect(stats.alerts).toBe(0);
      expect(stats.windowStart).toBeNull();
    });
    
    it('should handle metrics with missing fields gracefully', () => {
      const incompleteMetrics = [
        {
          timestamp: new Date().toISOString(),
          sweeps: 5
          // Missing other fields
        }
      ];
      
      const stats = calculateWindowStats(incompleteMetrics, TIME_WINDOWS.HOUR_1);
      
      expect(stats.sweeps).toBe(5);
      expect(stats.alerts).toBe(0);
      expect(stats.permissionChanges).toBe(0);
    });
    
    it('should filter metrics outside the time window', () => {
      const now = Date.now();
      const oldMetrics = [
        {
          timestamp: new Date(now - (50 * 60 * 60 * 1000)).toISOString(), // 50 hours ago
          sweeps: 10
        },
        {
          timestamp: new Date(now - (10 * 60 * 60 * 1000)).toISOString(), // 10 hours ago
          sweeps: 5
        }
      ];
      
      const stats = calculateWindowStats(oldMetrics, TIME_WINDOWS.HOURS_24);
      
      expect(stats.sweeps).toBe(5); // Only the recent metric should be included
      expect(stats.hoursWithData).toBe(1);
    });
  });
  
  describe('calculateAllWindows()', () => {
    it('should calculate statistics for all time windows', () => {
      const windows = calculateAllWindows(mockMetricsHistory);
      
      expect(windows).toHaveProperty('last24Hours');
      expect(windows).toHaveProperty('last7Days');
      expect(windows).toHaveProperty('last30Days');
      
      expect(windows.last24Hours.hoursWithData).toBeGreaterThanOrEqual(24);
      expect(windows.last24Hours.hoursWithData).toBeLessThanOrEqual(25);
      expect(windows.last7Days.hoursWithData).toBe(48); // Only 48 hours of mock data
      expect(windows.last30Days.hoursWithData).toBe(48);
    });
    
    it('should show decreasing activity in older windows', () => {
      const windows = calculateAllWindows(mockMetricsHistory);
      
      // Alerts only in last 24 hours
      expect(windows.last24Hours.alerts).toBe(24);
      expect(windows.last7Days.alerts).toBe(24);
      expect(windows.last30Days.alerts).toBe(24);
    });
  });
  
  describe('calculateRates()', () => {
    it('should calculate accurate per-hour and per-day rates', () => {
      const stats = calculateWindowStats(mockMetricsHistory, TIME_WINDOWS.HOURS_24);
      const rates = calculateRates(stats, TIME_WINDOWS.HOURS_24);
      
      expect(rates).toBeDefined();
      expect(rates.sweepsPerHour).toBeGreaterThan(0);
      // sweepsPerDay should be approximately sweepsPerHour * 24 (allow for rounding)
      expect(Math.abs(rates.sweepsPerDay - (rates.sweepsPerHour * 24))).toBeLessThan(0.1);
      expect(rates.alertsPerHour).toBeCloseTo(1, 1); // Approximately 1 alert/hour
      expect(rates.alertsPerDay).toBeCloseTo(24, 0); // Approximately 24 alerts/day
    });
    
    it('should return zero rates for empty statistics', () => {
      const emptyStats = {
        sweeps: 0,
        alerts: 0,
        permissionChanges: 0,
        errors: 0,
        hoursWithData: 0
      };
      
      const rates = calculateRates(emptyStats, TIME_WINDOWS.HOURS_24);
      
      expect(rates.sweepsPerHour).toBe(0);
      expect(rates.alertsPerHour).toBe(0);
    });
    
    it('should round rates to 2 decimal places', () => {
      const stats = {
        sweeps: 7,
        alerts: 3,
        permissionChanges: 15,
        errors: 2,
        hoursWithData: 24
      };
      
      const rates = calculateRates(stats, TIME_WINDOWS.HOURS_24);
      
      expect(rates.sweepsPerHour.toString()).toMatch(/^\d+\.\d{1,2}$/);
      expect(rates.alertsPerHour).toBe(0.13); // 3/24 = 0.125 → 0.13
    });
  });
  
  describe('getComprehensiveStats()', () => {
    it('should return comprehensive statistics report', () => {
      const report = getComprehensiveStats(mockState);
      
      expect(report).toHaveProperty('windows');
      expect(report).toHaveProperty('rates');
      expect(report).toHaveProperty('dataAvailability');
      
      expect(report.windows.last24Hours).toBeDefined();
      expect(report.rates.last24Hours).toBeDefined();
      expect(report.dataAvailability.totalHours).toBe(48);
    });
    
    it('should handle state without metrics history', () => {
      const emptyState = {
        metricsHistory: {
          hourly: []
        }
      };
      
      const report = getComprehensiveStats(emptyState);
      
      expect(report.windows.last24Hours.hoursWithData).toBe(0);
      expect(report.dataAvailability.totalHours).toBe(0);
    });
    
    it('should include oldest and newest metric timestamps', () => {
      const report = getComprehensiveStats(mockState);
      
      expect(report.dataAvailability.oldestMetric).toBeDefined();
      expect(report.dataAvailability.newestMetric).toBeDefined();
      expect(new Date(report.dataAvailability.newestMetric).getTime())
        .toBeGreaterThanOrEqual(new Date(report.dataAvailability.oldestMetric).getTime());
    });
  });
  
  describe('compareTrends()', () => {
    it('should detect increasing trend', () => {
      const olderWindow = { sweeps: 10, alerts: 5, permissionChanges: 3, errors: 2 };
      const newerWindow = { sweeps: 20, alerts: 10, permissionChanges: 6, errors: 4 };
      
      const trends = compareTrends(olderWindow, newerWindow);
      
      expect(trends.sweeps.trend).toBe('increase');
      expect(trends.sweeps.change).toBe(10);
      expect(trends.sweeps.percentChange).toBe(100);
      
      expect(trends.alerts.trend).toBe('increase');
      expect(trends.alerts.change).toBe(5);
      expect(trends.alerts.percentChange).toBe(100);
    });
    
    it('should detect decreasing trend', () => {
      const olderWindow = { sweeps: 20, alerts: 10, permissionChanges: 6, errors: 4 };
      const newerWindow = { sweeps: 10, alerts: 5, permissionChanges: 3, errors: 2 };
      
      const trends = compareTrends(olderWindow, newerWindow);
      
      expect(trends.sweeps.trend).toBe('decrease');
      expect(trends.sweeps.change).toBe(-10);
      expect(trends.sweeps.percentChange).toBe(-50);
    });
    
    it('should detect stable trend', () => {
      const olderWindow = { sweeps: 100, alerts: 50, permissionChanges: 30, errors: 10 };
      const newerWindow = { sweeps: 105, alerts: 52, permissionChanges: 31, errors: 10 };
      
      const trends = compareTrends(olderWindow, newerWindow);
      
      expect(trends.sweeps.trend).toBe('stable'); // 5% change
      expect(trends.alerts.trend).toBe('stable');  // 4% change
    });
    
    it('should handle zero baseline values', () => {
      const olderWindow = { sweeps: 0, alerts: 0, permissionChanges: 0, errors: 0 };
      const newerWindow = { sweeps: 10, alerts: 5, permissionChanges: 3, errors: 2 };
      
      const trends = compareTrends(olderWindow, newerWindow);
      
      expect(trends.sweeps.trend).toBe('increase');
      expect(trends.sweeps.percentChange).toBeNull(); // Cannot calculate percentage from 0
    });
  });
  
  describe('detectAnomalies()', () => {
    it('should detect high alert rate anomaly', () => {
      const stats = {
        alerts: 150,
        errors: 20,
        permissionChanges: 50,
        permissionReverts: 50,
        revertFailures: 2,
        hoursWithData: 24
      };
      
      const result = detectAnomalies(stats);
      
      expect(result.hasAnomalies).toBe(true);
      expect(result.anomalies.length).toBeGreaterThan(0);
      
      const alertAnomaly = result.anomalies.find(a => a.type === 'high_alert_rate');
      expect(alertAnomaly).toBeDefined();
      expect(alertAnomaly.severity).toBe('warning');
    });
    
    it('should detect high error rate anomaly', () => {
      const stats = {
        alerts: 10,
        errors: 300,
        permissionChanges: 50,
        permissionReverts: 50,
        revertFailures: 2,
        hoursWithData: 24
      };
      
      const result = detectAnomalies(stats);
      
      const errorAnomaly = result.anomalies.find(a => a.type === 'high_error_rate');
      expect(errorAnomaly).toBeDefined();
      expect(errorAnomaly.severity).toBe('warning');
    });
    
    it('should detect high revert failure rate anomaly', () => {
      const stats = {
        alerts: 10,
        errors: 20,
        permissionChanges: 50,
        permissionReverts: 50,
        revertFailures: 10, // 20% failure rate
        hoursWithData: 24
      };
      
      const result = detectAnomalies(stats);
      
      const revertAnomaly = result.anomalies.find(a => a.type === 'high_revert_failure_rate');
      expect(revertAnomaly).toBeDefined();
      expect(revertAnomaly.severity).toBe('critical');
    });
    
    it('should use custom thresholds', () => {
      const stats = {
        alerts: 120,
        errors: 20,
        permissionChanges: 50,
        permissionReverts: 50,
        revertFailures: 2,
        hoursWithData: 24
      };
      
      const customThresholds = {
        alertsPerHour: 10 // Custom threshold (default is 5)
      };
      
      const result = detectAnomalies(stats, customThresholds);
      
      expect(result.hasAnomalies).toBe(false); // 120/24 = 5/hour, below custom threshold of 10
    });
    
    it('should return no anomalies for normal activity', () => {
      const stats = {
        alerts: 50,
        errors: 100,
        permissionChanges: 200,
        permissionReverts: 200,
        revertFailures: 5, // 2.5% failure rate
        hoursWithData: 24
      };
      
      const result = detectAnomalies(stats);
      
      expect(result.hasAnomalies).toBe(false);
      expect(result.anomalies.length).toBe(0);
    });
    
    it('should count critical and warning anomalies separately', () => {
      const stats = {
        alerts: 150,     // High alert rate (warning)
        errors: 300,     // High error rate (warning)
        permissionChanges: 600, // High permission change rate (warning)
        permissionReverts: 50,
        revertFailures: 10, // 20% failure rate (critical)
        hoursWithData: 24
      };
      
      const result = detectAnomalies(stats);
      
      expect(result.criticalCount).toBe(1);
      expect(result.warningCount).toBe(3);
    });
  });
  
  describe('formatStatsDisplay()', () => {
    it('should format statistics for display', () => {
      const stats = {
        sweeps: 72,
        alerts: 24,
        permissionChanges: 120,
        permissionReverts: 115,
        revertFailures: 5,
        errors: 18,
        memberFetchTimeouts: 3,
        restarts: 1,
        hoursWithData: 24,
        windowStart: '2025-11-29T00:00:00.000Z',
        windowEnd: '2025-11-30T00:00:00.000Z'
      };
      
      const display = formatStatsDisplay(stats);
      
      expect(display).toContain('📊 Statistics (24 hours)');
      expect(display).toContain('Sweeps: 72');
      expect(display).toContain('Alerts: 24');
      expect(display).toContain('Permission Changes: 120');
      expect(display).toContain('⏱️ Window:');
    });
    
    it('should handle empty statistics', () => {
      const emptyStats = {
        hoursWithData: 0,
        sweeps: 0,
        alerts: 0
      };
      
      const display = formatStatsDisplay(emptyStats);
      
      expect(display).toContain('No data available');
    });
  });
  
  describe('formatRatesDisplay()', () => {
    it('should format rates for display', () => {
      const rates = {
        sweepsPerHour: 3.0,
        sweepsPerDay: 72.0,
        alertsPerHour: 1.0,
        alertsPerDay: 24.0,
        permissionChangesPerHour: 5.0,
        permissionChangesPerDay: 120.0,
        errorsPerHour: 0.75,
        errorsPerDay: 18.0
      };
      
      const display = formatRatesDisplay(rates);
      
      expect(display).toContain('📈 Activity Rates');
      expect(display).toContain('Sweeps: 3/hour (72/day)');
      expect(display).toContain('Alerts: 1/hour (24/day)');
      expect(display).toContain('Permission Changes: 5/hour (120/day)');
      expect(display).toContain('Errors: 0.75/hour (18/day)');
    });
    
    it('should handle null rates', () => {
      const display = formatRatesDisplay(null);
      
      expect(display).toContain('No rate data available');
    });
  });
  
  describe('Overflow Prevention', () => {
    it('should handle very large metric values without overflow', () => {
      const largeMetrics = [
        {
          timestamp: new Date().toISOString(),
          sweeps: Number.MAX_SAFE_INTEGER - 1000,
          alerts: 1000000000,
          permissionChanges: 500000000,
          permissionReverts: 500000000,
          revertFailures: 0,
          errors: 0,
          memberFetchTimeouts: 0,
          restarts: 0
        }
      ];
      
      const stats = calculateWindowStats(largeMetrics, TIME_WINDOWS.HOUR_1);
      
      expect(stats.sweeps).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
      expect(stats.alerts).toBe(1000000000);
      expect(stats.permissionChanges).toBe(500000000);
    });
    
    it('should provide accurate rates even with large windows', () => {
      // Simulate 30 days of metrics
      const now = Date.now();
      const thirtyDaysMetrics = [];
      
      for (let i = 0; i < 720; i++) { // 30 days * 24 hours = 720 hours
        thirtyDaysMetrics.push({
          timestamp: new Date(now - (i * 60 * 60 * 1000)).toISOString(),
          sweeps: 3,
          alerts: 1,
          permissionChanges: 5,
          permissionReverts: 5,
          revertFailures: 0,
          errors: 0,
          memberFetchTimeouts: 0,
          restarts: 0
        });
      }
      
      const stats = calculateWindowStats(thirtyDaysMetrics, TIME_WINDOWS.DAYS_30);
      const rates = calculateRates(stats, TIME_WINDOWS.DAYS_30);
      
      expect(rates.sweepsPerHour).toBe(3.0); // Exactly 3/hour
      expect(rates.sweepsPerDay).toBe(72.0); // Exactly 72/day
      expect(stats.hoursWithData).toBe(720);
    });
  });
});
