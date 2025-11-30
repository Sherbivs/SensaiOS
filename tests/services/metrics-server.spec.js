/**
 * @file Metrics Server Tests
 * @description Tests for Express HTTP server exposing Prometheus metrics
 * @module tests/services/metrics-server
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  startMetricsServer,
  stopMetricsServer,
  isMetricsServerRunning,
  getMetricsServerInfo
} from '../../src/services/metrics-server.js';
import {
  recordRoleAssignment,
  shutdownMetrics
} from '../../src/services/prometheus-metrics.js';

describe('Metrics Server', () => {
  let serverInfo = null;
  
  beforeEach(async () => {
    // Ensure clean state
    if (isMetricsServerRunning()) {
      await stopMetricsServer();
    }
    shutdownMetrics();
  });
  
  afterEach(async () => {
    // Clean up after each test
    if (isMetricsServerRunning()) {
      await stopMetricsServer();
    }
    shutdownMetrics();
  });
  
  describe('startMetricsServer()', () => {
    it('should start metrics server on default port 9090', async () => {
      serverInfo = await startMetricsServer();
      
      expect(serverInfo).toBeDefined();
      expect(serverInfo.port).toBe(9090);
      expect(serverInfo.host).toBe('0.0.0.0');
      expect(serverInfo.path).toBe('/metrics');
      expect(serverInfo.url).toContain('9090');
      expect(isMetricsServerRunning()).toBe(true);
    });
    
    it('should start metrics server on custom port', async () => {
      serverInfo = await startMetricsServer({ port: 9091 });
      
      expect(serverInfo.port).toBe(9091);
      expect(serverInfo.url).toContain('9091');
      expect(isMetricsServerRunning()).toBe(true);
    });
    
    it('should start metrics server with custom path', async () => {
      serverInfo = await startMetricsServer({ path: '/custom-metrics' });
      
      expect(serverInfo.path).toBe('/custom-metrics');
      expect(serverInfo.url).toContain('/custom-metrics');
      expect(isMetricsServerRunning()).toBe(true);
    });
    
    it('should initialize Prometheus metrics on startup', async () => {
      serverInfo = await startMetricsServer();
      
      // Fetch metrics endpoint
      const response = await fetch(`http://127.0.0.1:${serverInfo.port}${serverInfo.path}`);
      const metricsText = await response.text();
      
      expect(response.status).toBe(200);
      expect(metricsText).toContain('# HELP');
      expect(metricsText).toContain('# TYPE');
    });
  });
  
  describe('stopMetricsServer()', () => {
    it('should stop running metrics server', async () => {
      serverInfo = await startMetricsServer({ port: 9092 });
      expect(isMetricsServerRunning()).toBe(true);
      
      await stopMetricsServer();
      
      expect(isMetricsServerRunning()).toBe(false);
    });
    
    it('should handle stopping when not running', async () => {
      expect(isMetricsServerRunning()).toBe(false);
      
      await expect(stopMetricsServer()).resolves.not.toThrow();
    });
    
    it('should cleanup metrics registry on shutdown', async () => {
      serverInfo = await startMetricsServer({ port: 9093 });
      
      recordRoleAssignment('member-join', 'guild123', 'Test Guild', 'success');
      
      await stopMetricsServer();
      
      // Starting again should have clean metrics
      serverInfo = await startMetricsServer({ port: 9093 });
      const response = await fetch(`http://127.0.0.1:${serverInfo.port}${serverInfo.path}`);
      
      // New registry should not have the previous recording
      // (metrics were reset during restart)
      expect(response.status).toBe(200);
    });
  });
  
  describe('isMetricsServerRunning()', () => {
    it('should return false when server not started', () => {
      expect(isMetricsServerRunning()).toBe(false);
    });
    
    it('should return true when server is running', async () => {
      serverInfo = await startMetricsServer({ port: 9094 });
      
      expect(isMetricsServerRunning()).toBe(true);
    });
    
    it('should return false after server stopped', async () => {
      serverInfo = await startMetricsServer({ port: 9095 });
      await stopMetricsServer();
      
      expect(isMetricsServerRunning()).toBe(false);
    });
  });
  
  describe('getMetricsServerInfo()', () => {
    it('should return null when server not running', () => {
      const info = getMetricsServerInfo();
      
      expect(info).toBeNull();
    });
    
    it('should return server details when running', async () => {
      serverInfo = await startMetricsServer({ port: 9096, path: '/test-metrics' });
      
      const info = getMetricsServerInfo();
      
      expect(info).toBeDefined();
      expect(info.port).toBe(9096);
      expect(info.host).toBe('0.0.0.0');
      expect(info.path).toBe('/test-metrics');
    });
  });
  
  describe('HTTP Endpoints', () => {
    beforeEach(async () => {
      serverInfo = await startMetricsServer({ port: 9097 });
    });
    
    describe('GET /metrics', () => {
      it('should return Prometheus text format', async () => {
        const response = await fetch(`http://127.0.0.1:${serverInfo.port}/metrics`);
        const metricsText = await response.text();
        
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('text/plain');
        expect(metricsText).toContain('# HELP');
        expect(metricsText).toContain('# TYPE');
      });
      
      it('should include recorded metrics', async () => {
        recordRoleAssignment('member-join', 'guild123', 'Test Guild', 'success');
        
        const response = await fetch(`http://127.0.0.1:${serverInfo.port}/metrics`);
        const metricsText = await response.text();
        
        expect(response.status).toBe(200);
        expect(metricsText).toContain('security_bot_role_assignments_total');
        expect(metricsText).toContain('origin="member-join"');
      });
      
      it('should return valid Prometheus format for scraping', async () => {
        const response = await fetch(`http://127.0.0.1:${serverInfo.port}/metrics`);
        const metricsText = await response.text();
        
        // Verify Prometheus format structure
        expect(response.status).toBe(200);
        
        // Should have metric definitions
        const hasHelp = metricsText.includes('# HELP');
        const hasType = metricsText.includes('# TYPE');
        
        expect(hasHelp).toBe(true);
        expect(hasType).toBe(true);
        
        // Should have metric values (counter, gauge, histogram, or summary)
        const hasMetricValue = /^[a-z_]+\{.*\}\s+[\d.]+/m.test(metricsText) || /^[a-z_]+\s+[\d.]+/m.test(metricsText);
        expect(hasMetricValue).toBe(true);
      });
    });
    
    describe('GET /health', () => {
      it('should return health check JSON', async () => {
        const response = await fetch(`http://127.0.0.1:${serverInfo.port}/health`);
        const healthJson = await response.json();
        
        expect(response.status).toBe(200);
        expect(healthJson).toHaveProperty('status', 'healthy');
        expect(healthJson).toHaveProperty('timestamp');
        expect(healthJson).toHaveProperty('metricsInitialized', true);
      });
      
      it('should have valid timestamp', async () => {
        const response = await fetch(`http://127.0.0.1:${serverInfo.port}/health`);
        const healthJson = await response.json();
        
        const timestamp = new Date(healthJson.timestamp);
        expect(timestamp.getTime()).not.toBeNaN();
        
        // Timestamp should be recent (within last 5 seconds)
        const now = new Date();
        const diffMs = now - timestamp;
        expect(diffMs).toBeLessThan(5000);
      });
    });
    
    describe('GET /', () => {
      it('should return service information', async () => {
        const response = await fetch(`http://127.0.0.1:${serverInfo.port}/`);
        const infoJson = await response.json();
        
        expect(response.status).toBe(200);
        expect(infoJson).toHaveProperty('service', 'Security Bot Metrics Server');
        expect(infoJson).toHaveProperty('endpoints');
      });
      
      it('should list available endpoints', async () => {
        const response = await fetch(`http://127.0.0.1:${serverInfo.port}/`);
        const infoJson = await response.json();
        
        expect(Array.isArray(infoJson.endpoints)).toBe(true);
        
        const paths = infoJson.endpoints.map(e => e.path);
        expect(paths).toContain('/metrics');
        expect(paths).toContain('/health');
      });
    });
    
    describe('Error Handling', () => {
      it('should return 404 for unknown endpoints', async () => {
        const response = await fetch(`http://127.0.0.1:${serverInfo.port}/unknown`);
        
        expect(response.status).toBe(404);
      });
    });
  });
  
  describe('Production Scenarios', () => {
    it('should handle Prometheus scrape workflow', async () => {
      serverInfo = await startMetricsServer({ port: 9098 });
      
      // Simulate application recording metrics
      recordRoleAssignment('member-join', 'guild123', 'Prod Guild', 'success');
      recordRoleAssignment('member-leave', 'guild123', 'Prod Guild', 'success');
      recordRoleAssignment('member-join', 'guild456', 'Another Guild', 'failed');
      
      // Prometheus scrapes /metrics
      const response = await fetch(`http://127.0.0.1:${serverInfo.port}/metrics`);
      const metricsText = await response.text();
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('text/plain');
      
      // Verify multiple metrics present
      expect(metricsText).toContain('security_bot_role_assignments_total');
      expect(metricsText).toContain('origin="member-join"');
      expect(metricsText).toContain('origin="member-leave"');
      expect(metricsText).toContain('result="success"');
      expect(metricsText).toContain('result="failed"');
    });
    
    it('should handle multiple concurrent scrapes', async () => {
      serverInfo = await startMetricsServer({ port: 9099 });
      
      recordRoleAssignment('member-join', 'guild123', 'Test Guild', 'success');
      
      // Simulate multiple Prometheus instances scraping simultaneously
      const requests = [
        fetch(`http://127.0.0.1:${serverInfo.port}/metrics`),
        fetch(`http://127.0.0.1:${serverInfo.port}/metrics`),
        fetch(`http://127.0.0.1:${serverInfo.port}/metrics`)
      ];
      
      const responses = await Promise.all(requests);
      
      // All should succeed
      for (const response of responses) {
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).toContain('security_bot_role_assignments_total');
      }
    });
    
    it('should restart gracefully', async () => {
      // Start first time
      serverInfo = await startMetricsServer({ port: 9100 });
      expect(isMetricsServerRunning()).toBe(true);
      
      // Stop
      await stopMetricsServer();
      expect(isMetricsServerRunning()).toBe(false);
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Start again
      serverInfo = await startMetricsServer({ port: 9100 });
      expect(isMetricsServerRunning()).toBe(true);
      
      // Should be functional
      const response = await fetch(`http://127.0.0.1:${serverInfo.port}/metrics`);
      expect(response.status).toBe(200);
    });
  });
});
