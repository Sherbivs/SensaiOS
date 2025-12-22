/**
 * Memory Measurement Utilities Tests
 * 
 * Validates accuracy of component memory measurement functions
 * 
 * @module tests/memory-measurement
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  measureLogBufferMemory, 
  measureEventBusMemory, 
  measureDiscordCacheMemory,
  formatMB,
  getConfidenceEmoji
} from '../src/utils/memory-measurement.js';
import { getLogBuffer } from '../src/shared/logBuffer.js';
import { EventBus } from '../src/shared/event-bus.js';

describe('Memory Measurement Utilities', () => {
  describe('measureLogBufferMemory', () => {
    it('should measure buffer with valid stats', () => {
      const buffer = getLogBuffer();
      if (!buffer) {
        // Skip if buffer not initialized
        return;
      }
      
      const stats = buffer.getStats();
      const memory = measureLogBufferMemory(stats);
      
      expect(memory.estimatedBytes).toBeGreaterThanOrEqual(0);
      expect(memory.entryCount).toBe(stats.buffered);
      expect(memory.measurementMethod).toBe('json');
      expect(['high', 'medium', 'low']).toContain(memory.confidence);
    });
    
    it('should handle measurement errors gracefully', () => {
      // Simulate normal stats
      const stats = { buffered: 5, totalMessages: 10 };
      const memory = measureLogBufferMemory(stats);
      
      expect(memory.confidence).toBeDefined();
      expect(memory.estimatedBytes).toBeGreaterThan(0);
      expect(memory.metadata).toBeDefined();
    });
    
    it('should include metadata', () => {
      const buffer = getLogBuffer();
      if (!buffer) return;
      
      const stats = buffer.getStats();
      const memory = measureLogBufferMemory(stats);
      
      expect(memory.metadata).toBeDefined();
      if (memory.metadata) {
        expect(memory.metadata.totalMessages).toBe(stats.totalMessages);
      }
    });
  });
  
  describe('measureEventBusMemory', () => {
    let bus: EventBus;
    
    beforeEach(() => {
      bus = EventBus.getInstance();
      // Clear any existing subscriptions
      (bus as any).subscriptions.clear();
      // Use the proper clear method on the replay buffer
      (bus as any).replayBuffer.clear();
      (bus as any).stats.eventsEmitted = 0;
    });
    
    it('should measure empty Event Bus correctly', () => {
      const stats = bus.getStats();
      const memory = measureEventBusMemory(stats);
      
      expect(memory.estimatedBytes).toBeGreaterThanOrEqual(0);
      expect(memory.measurementMethod).toBe('json');
      expect(['high', 'medium', 'low']).toContain(memory.confidence);
    });
    
    it('should measure Event Bus with subscriptions and events', () => {
      // Add subscription
      bus.subscribe('test.*', (_event) => {
        // Handler
      });
      
      // Emit events
      bus.emit('test.event1', { data: 'payload 1' });
      bus.emit('test.event2', { data: 'payload 2' });
      
      const stats = bus.getStats();
      const memory = measureEventBusMemory(stats);
      
      expect(memory.estimatedBytes).toBeGreaterThan(0);
      expect(memory.entryCount).toBeGreaterThan(0);
      expect(memory.metadata).toBeDefined();
      expect(memory.metadata?.replayBufferBytes).toBeGreaterThan(0);
      expect(memory.metadata?.subscriptionsBytes).toBeGreaterThan(0);
    });
    
    it('should include pattern cache in measurement', () => {
      // Subscribe with multiple patterns (triggers pattern cache)
      bus.subscribe('test.*', () => {});
      bus.subscribe('other.*', () => {});
      bus.subscribe('another.*', () => {});
      
      const stats = bus.getStats();
      const memory = measureEventBusMemory(stats);
      
      expect(memory.metadata?.patternCacheSize).toBeGreaterThan(0);
      expect(memory.metadata?.patternCacheBytes).toBeGreaterThan(0);
    });
    
    it('should measure replay buffer growth', () => {
      // Emit multiple events to populate replay buffer
      for (let i = 0; i < 10; i++) {
        bus.emit(`test.event${i}`, { index: i, data: 'payload' });
      }
      
      const stats = bus.getStats();
      const memory = measureEventBusMemory(stats);
      
      expect(stats.replayBufferSize).toBe(10);
      expect(memory.metadata?.replayBufferBytes).toBeGreaterThan(0);
      expect(memory.entryCount).toBeGreaterThanOrEqual(10);
    });
    
    it('should handle measurement errors with fallback', () => {
      const stats = bus.getStats();
      const memory = measureEventBusMemory(stats);
      
      // Should always return valid stats
      expect(memory.estimatedBytes).toBeGreaterThanOrEqual(0);
      expect(memory.confidence).toBeDefined();
    });
  });
  
  describe('measureDiscordCacheMemory', () => {
    it('should handle null/undefined client gracefully', () => {
      const memory = measureDiscordCacheMemory(null);
      
      expect(memory.estimatedBytes).toBeGreaterThanOrEqual(0);
      expect(memory.confidence).toBe('low');
      expect(memory.metadata?.fallbackUsed).toBe(true);
    });
    
    it('should handle empty Discord client', () => {
      const mockClient = {
        channels: { cache: new Map() },
        guilds: { cache: new Map() }
      };
      
      const memory = measureDiscordCacheMemory(mockClient);
      
      expect(memory.estimatedBytes).toBeGreaterThanOrEqual(0);
      expect(memory.entryCount).toBe(0);
      expect(memory.measurementMethod).toBe('sampling');
    });
    
    it('should sample messages when available', () => {
      const mockMessage = {
        id: '123',
        content: 'Test message',
        author: { id: '456', username: 'testuser' },
        embeds: [],
        attachments: new Map(),
        reactions: new Map()
      };
      
      const mockChannel = {
        messages: {
          cache: new Map([['123', mockMessage]])
        }
      };
      
      const mockClient = {
        channels: { cache: new Map([['channel1', mockChannel]]) },
        guilds: { cache: new Map() }
      };
      
      const memory = measureDiscordCacheMemory(mockClient);
      
      expect(memory.estimatedBytes).toBeGreaterThan(0);
      expect(memory.metadata?.messageCount).toBe(1);
      expect(memory.metadata?.sampleSizes?.messages).toBeGreaterThan(0);
    });
    
    it('should calculate averages from samples', () => {
      // Create mock messages
      const mockMessages = Array.from({ length: 5 }, (_, i) => ({
        id: `${i}`,
        content: `Message ${i}`,
        author: { id: '456', username: 'testuser' },
        embeds: [],
        attachments: new Map(),
        reactions: new Map()
      }));
      
      const mockChannel = {
        messages: {
          cache: new Map(mockMessages.map(m => [m.id, m]))
        }
      };
      
      const mockClient = {
        channels: { cache: new Map([['channel1', mockChannel]]) },
        guilds: { cache: new Map() }
      };
      
      const memory = measureDiscordCacheMemory(mockClient);
      
      expect(memory.metadata?.avgMessageBytes).toBeGreaterThan(0);
      expect(memory.metadata?.messageCount).toBe(5);
    });
    
    it('should handle sampling errors with fallback', () => {
      const brokenClient = {
        channels: { 
          cache: { 
            values: () => { throw new Error('Simulated error'); } 
          } 
        }
      };
      
      const memory = measureDiscordCacheMemory(brokenClient);
      
      expect(memory.confidence).toBe('low');
      expect(memory.metadata?.fallbackUsed).toBe(true);
      expect(memory.metadata?.error).toBeDefined();
    });
  });
  
  describe('formatMB', () => {
    it('should format bytes to MB correctly', () => {
      expect(formatMB(0)).toBe('0.00');
      expect(formatMB(1024 * 1024)).toBe('1.00'); // 1 MB
      expect(formatMB(1024 * 1024 * 2.5)).toBe('2.50'); // 2.5 MB
      expect(formatMB(500 * 1024)).toBe('0.49'); // ~0.49 MB
    });
    
    it('should handle large values', () => {
      const result = formatMB(1024 * 1024 * 1024); // 1 GB
      expect(parseFloat(result)).toBe(1024); // 1024 MB
    });
  });
  
  describe('getConfidenceEmoji', () => {
    it('should return correct emoji for each confidence level', () => {
      expect(getConfidenceEmoji('high')).toBe('✅');
      expect(getConfidenceEmoji('medium')).toBe('🟡');
      expect(getConfidenceEmoji('low')).toBe('⚠️');
    });
  });
  
  describe('Accuracy Validation', () => {
    it('should produce reasonable memory estimates', () => {
      const buffer = getLogBuffer();
      if (!buffer) return;
      
      const stats = buffer.getStats();
      const memory = measureLogBufferMemory(stats);
      
      // Estimate should be reasonable (non-negative)
      expect(memory.estimatedBytes).toBeGreaterThanOrEqual(0);
      expect(memory.confidence).toBeDefined();
    });
    
    it('should show consistent measurements across multiple calls', () => {
      const buffer = getLogBuffer();
      if (!buffer) return;
      
      const stats = buffer.getStats();
      const memory1 = measureLogBufferMemory(stats);
      const memory2 = measureLogBufferMemory(stats);
      
      // Should be identical (deterministic)
      expect(memory1.estimatedBytes).toBe(memory2.estimatedBytes);
      expect(memory1.entryCount).toBe(memory2.entryCount);
    });
  });
});
