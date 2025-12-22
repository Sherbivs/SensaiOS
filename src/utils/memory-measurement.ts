/**
 * Memory Measurement Utilities
 * 
 * Provides accurate component memory measurement to replace hardcoded estimates.
 * Methods: JSON serialization, sampling, differential measurement
 * 
 * @module memory-measurement
 */

import { getLogBuffer } from '../shared/logBuffer.js';
import { EventBus } from '../shared/event-bus.js';
import { getErrorMessage } from '../shared/utils/index.js';
import type { BusStats } from '../shared/event-bus.js';
import type { Client, Message, GuildMember, ThreadChannel, Guild, Role } from 'discord.js';

/** Log buffer statistics shape (inline type) */
type LogBufferStats = { buffered: number; totalMessages: number };

/**
 * Component memory statistics with measurement metadata
 */
export interface ComponentMemoryStats {
  /** Estimated memory usage in bytes */
  estimatedBytes: number;
  /** Number of entries measured */
  entryCount: number;
  /** Average bytes per entry */
  averageBytesPerEntry: number;
  /** Measurement method used */
  measurementMethod: 'json' | 'differential' | 'sampling';
  /** Confidence level in the measurement */
  confidence: 'high' | 'medium' | 'low';
  /** Additional metadata about the measurement */
  metadata?: Record<string, unknown>;
}

/**
 * Safely estimate size of an object using JSON serialization
 * Handles circular references by catching errors
 */
function safeJsonSize(obj: unknown): number {
  try {
    return JSON.stringify(obj).length;
  } catch {
    // Circular reference or other serialization error
    return 0;
  }
}

/**
 * Measure Log Buffer actual memory usage
 * 
 * Method: JSON serialization of entire buffer Map
 * Confidence: HIGH (exact measurement of serialized data)
 * 
 * @param bufferStats - Current buffer statistics from getStats()
 * @returns Component memory statistics
 */
export function measureLogBufferMemory(bufferStats: LogBufferStats): ComponentMemoryStats {
  try {
    const buffer = getLogBuffer();
    // Access internal buffer Map (private but accessible in TypeScript)
    const internalBuffer = (buffer as unknown as { buffer: Map<string, unknown> }).buffer;
    
    // Measure by serializing all buffer entries
    const entries = Array.from(internalBuffer.entries());
    const bytes = safeJsonSize(entries);
    
    return {
      estimatedBytes: bytes,
      entryCount: bufferStats.buffered,
      averageBytesPerEntry: bufferStats.buffered > 0 ? bytes / bufferStats.buffered : 0,
      measurementMethod: 'json',
      confidence: 'high',
      metadata: {
        totalMessages: bufferStats.totalMessages,
        dedupRatio: bufferStats.buffered > 0 ? bufferStats.totalMessages / bufferStats.buffered : 1
      }
    };
  } catch (err) {
    // Fallback to safe estimate if measurement fails
    return {
      estimatedBytes: bufferStats.buffered * 2048, // 2KB fallback
      entryCount: bufferStats.buffered,
      averageBytesPerEntry: 2048,
      measurementMethod: 'json',
      confidence: 'low',
      metadata: {
        error: getErrorMessage(err),
        fallbackUsed: true
      }
    };
  }
}

/**
 * Measure Event Bus actual memory usage
 * 
 * Method: JSON serialization of replay buffer + subscriptions + pattern cache
 * Confidence: MEDIUM (subscriptions may have circular references)
 * 
 * Components measured:
 * - Replay buffer (array of event objects)
 * - Subscriptions (handler functions + stats)
 * - Pattern cache (LRU cache of 500 compiled regexes)
 * 
 * @param busStats - Current Event Bus statistics from getStats()
 * @returns Component memory statistics
 */
export function measureEventBusMemory(busStats: BusStats): ComponentMemoryStats {
  try {
    const bus = EventBus.getInstance();
    
    // Measure replay buffer - use getReplayBuffer() to get the array
    const replayBufferData = bus.getReplayBuffer();
    const replayBytes = safeJsonSize(replayBufferData);
    
    // Measure subscriptions via subscriber info
    const subscribers = bus.getSubscribers();
    const subsBytes = safeJsonSize(subscribers);
    
    // Measure pattern cache via public API
    const patternCacheStats = bus.getPatternCacheStats();
    const cacheBytes = safeJsonSize(patternCacheStats.patterns);
    
    const totalBytes = replayBytes + subsBytes + cacheBytes;
    const totalEntries = busStats.replayBufferSize + busStats.subscriptionsActive + patternCacheStats.size;
    
    return {
      estimatedBytes: totalBytes,
      entryCount: totalEntries,
      averageBytesPerEntry: totalEntries > 0 ? totalBytes / totalEntries : 0,
      measurementMethod: 'json',
      confidence: 'medium',
      metadata: {
        replayBufferBytes: replayBytes,
        subscriptionsBytes: subsBytes,
        patternCacheBytes: cacheBytes,
        patternCacheSize: patternCacheStats.size
      }
    };
  } catch (err) {
    // Fallback to rough estimate if measurement fails
    const estimatedBytes = (busStats.replayBufferSize * 100) + (busStats.subscriptionsActive * 200);
    return {
      estimatedBytes,
      entryCount: busStats.replayBufferSize + busStats.subscriptionsActive,
      averageBytesPerEntry: 150,
      measurementMethod: 'json',
      confidence: 'low',
      metadata: {
        error: getErrorMessage(err),
        fallbackUsed: true
      }
    };
  }
}

/**
 * Measure Discord Cache actual memory usage
 * 
 * Method: Sampling-based estimation (sample 10 entries per cache type, extrapolate)
 * Confidence: MEDIUM (representative sample, not exact)
 * 
 * Discord.js caches:
 * - Messages (per-channel)
 * - Members (per-guild)
 * - Threads (per-channel)
 * 
 * @param client - Discord.js Client instance
 * @returns Component memory statistics
 */
export function measureDiscordCacheMemory(client: Client): ComponentMemoryStats {
  try {
    const messageSamples: number[] = [];
    const memberSamples: number[] = [];
    const threadSamples: number[] = [];
    
    let messageCount = 0;
    let memberCount = 0;
    let threadCount = 0;
    
    // Sample messages (up to 10 from channels with messages)
    for (const channel of client.channels.cache.values()) {
      if ('messages' in channel && channel.messages?.cache?.size > 0) {
        const messages = Array.from(channel.messages.cache.values()).slice(0, 10);
        messages.forEach((msg: Message) => {
          const size = safeJsonSize({
            id: msg.id,
            content: msg.content,
            author: msg.author,
            embeds: msg.embeds,
            attachments: msg.attachments,
            reactions: msg.reactions
          });
          if (size > 0) messageSamples.push(size);
        });
        messageCount += channel.messages.cache.size;
        if (messageSamples.length >= 10) break;
      }
    }
    
    // Sample members (up to 10 from guilds)
    for (const guild of client.guilds.cache.values()) {
      const members = Array.from(guild.members.cache.values()).slice(0, 10);
      members.forEach((member: GuildMember) => {
        const size = safeJsonSize({
          id: member.id,
          user: member.user,
          roles: member.roles.cache.map((r: Role) => r.id),
          joinedAt: member.joinedAt,
          premiumSince: member.premiumSince
        });
        if (size > 0) memberSamples.push(size);
      });
      memberCount += guild.members.cache.size;
      if (memberSamples.length >= 10) break;
    }
    
    // Sample threads (up to 10 from channels with threads)
    for (const channel of client.channels.cache.values()) {
      if ('threads' in channel && channel.threads?.cache?.size > 0) {
        const threads = Array.from(channel.threads.cache.values() as Iterable<ThreadChannel>).slice(0, 10);
        threads.forEach((thread: ThreadChannel) => {
          const size = safeJsonSize({
            id: thread.id,
            name: thread.name,
            ownerId: thread.ownerId,
            archived: thread.archived,
            memberCount: thread.memberCount
          });
          if (size > 0) threadSamples.push(size);
        });
        threadCount += channel.threads.cache.size;
        if (threadSamples.length >= 10) break;
      }
    }
    
    // Calculate averages from samples (or use fallback)
    const avgMessageBytes = messageSamples.length > 0 
      ? messageSamples.reduce((a, b) => a + b, 0) / messageSamples.length 
      : 2048; // Fallback to 2KB if no samples
    const avgMemberBytes = memberSamples.length > 0 
      ? memberSamples.reduce((a, b) => a + b, 0) / memberSamples.length 
      : 1024; // Fallback to 1KB
    const avgThreadBytes = threadSamples.length > 0 
      ? threadSamples.reduce((a, b) => a + b, 0) / threadSamples.length 
      : 1024; // Fallback to 1KB
    
    const estimatedBytes = 
      (messageCount * avgMessageBytes) +
      (memberCount * avgMemberBytes) +
      (threadCount * avgThreadBytes);
    
    const totalEntries = messageCount + memberCount + threadCount;
    
    // Determine confidence based on sample quality
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    if (messageSamples.length === 0 && memberSamples.length === 0 && threadSamples.length === 0) {
      confidence = 'low'; // No samples, using fallback
    } else if (messageSamples.length >= 10 && memberSamples.length >= 10) {
      confidence = 'medium'; // Good sampling
    }
    
    return {
      estimatedBytes,
      entryCount: totalEntries,
      averageBytesPerEntry: totalEntries > 0 ? estimatedBytes / totalEntries : 0,
      measurementMethod: 'sampling',
      confidence,
      metadata: {
        messageCount,
        memberCount,
        threadCount,
        avgMessageBytes: Math.round(avgMessageBytes),
        avgMemberBytes: Math.round(avgMemberBytes),
        avgThreadBytes: Math.round(avgThreadBytes),
        sampleSizes: {
          messages: messageSamples.length,
          members: memberSamples.length,
          threads: threadSamples.length
        }
      }
    };
  } catch (err) {
    // Fallback to basic counting if measurement fails
    let messageCount = 0;
    let memberCount = 0;
    let threadCount = 0;
    
    try {
      messageCount = client.channels.cache.reduce((acc: number, ch) => {
        return acc + ('messages' in ch && ch.messages?.cache?.size ? ch.messages.cache.size : 0);
      }, 0);
      memberCount = client.guilds.cache.reduce((acc: number, g: Guild) => {
        return acc + g.members.cache.size;
      }, 0);
      threadCount = client.channels.cache.reduce((acc: number, ch) => {
        return acc + ('threads' in ch && ch.threads?.cache?.size ? ch.threads.cache.size : 0);
      }, 0);
    } catch {
      // Ignore errors in fallback counting
    }
    
    const estimatedBytes = (messageCount * 2048) + (memberCount * 1024) + (threadCount * 1024);
    const totalEntries = messageCount + memberCount + threadCount;
    
    return {
      estimatedBytes,
      entryCount: totalEntries,
      averageBytesPerEntry: totalEntries > 0 ? estimatedBytes / totalEntries : 0,
      measurementMethod: 'sampling',
      confidence: 'low',
      metadata: {
        error: getErrorMessage(err),
        fallbackUsed: true,
        messageCount,
        memberCount,
        threadCount
      }
    };
  }
}

/**
 * Get confidence emoji indicator
 * @param confidence - Confidence level
 * @returns Emoji string
 */
export function getConfidenceEmoji(confidence: 'high' | 'medium' | 'low'): string {
  switch (confidence) {
    case 'high': return '✅';
    case 'medium': return '🟡';
    case 'low': return '⚠️';
  }
}

/**
 * Format bytes as megabytes with 2 decimal places
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.50" for 1.5 MB)
 */
export function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2);
}
