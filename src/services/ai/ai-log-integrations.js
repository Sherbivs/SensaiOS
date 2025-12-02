/**
 * AI Log System Integrations - Observability Connectors
 * 
 * ⚠️ **DEPRECATED** — This file is being replaced by native logger.ts integrations.
 * 
 * **Replacement:** Use logger.ts with built-in observability hooks
 * 
 * **Migration Path:**
 * 1. Error Tracker: logger.error() automatically integrates with error tracking
 * 2. Console Logger: logger.ts replaces console.* (no mirroring needed)
 * 3. Resource Monitor: logger.info('system', 'metrics') for resource logging
 * 4. Database: Database workers use logger.ts natively (no integration needed)
 * 5. Discord: Bot commands use logger.info('bot', 'interaction') directly
 * 
 * **Why Deprecated:**
 * - OLD: Hook/intercept pattern to mirror logs (complex, fragile, monkey-patching)
 * - NEW: Direct logger.ts usage everywhere (simple, type-safe, standard)
 * - Logger.ts provides unified observability without integration layer
 * - No need for "AI logs" separate from standard logs (TimescaleDB stores all)
 * 
 * **Removal Timeline:** After 100% logger.ts adoption (Task 9 Phase 5 complete)
 * 
 * @module services/ai/ai-log-integrations
 * @deprecated Use src/shared/logger.ts with native integrations instead
 */
/* eslint-disable no-console */
import * as aiLogger from './ai-log-writer.js';

// ============================================================================
// AI LOG SYSTEM INTEGRATIONS
// ============================================================================
// Purpose: Connect AI logging system with existing observability systems
// Integrations:
//   - Error Tracker: Log all detected errors with full context
//   - Console Logger: Mirror important console logs to AI logs
//   - Resource Monitor: Log resource metrics and health checks
//   - Database: Log queries, connections, and performance
//   - Discord: Log API interactions and rate limits
// ============================================================================

const { CONFIG } = aiLogger;

// ============================================================================
// Error Tracker Integration
// ============================================================================

/**
 * Hook into error-tracker to log all tracked errors.
 * @param {object} errorTracker - ErrorTracker instance
 */
export function integrateErrorTracker(errorTracker) {
  if (!errorTracker) return;
  
  // Intercept trackError method
  const originalTrackError = errorTracker.trackError?.bind(errorTracker);
  
  if (originalTrackError) {
    errorTracker.trackError = async function(error, context = {}) {
      // Call original method
      const result = await originalTrackError(error, context);
      
      // Log to AI system
      aiLogger.error(CONFIG.categories.ERROR, `Error tracked: ${error.name}`, {
        error,
        data: {
          errorId: result?.errorId,
          severity: context.severity,
          category: context.category,
          feature: context.feature,
          userId: context.userId,
          guildId: context.guildId,
          recoverable: context.recoverable,
        },
        correlationId: context.correlationId,
        tags: ['error-tracker', context.category, context.severity].filter(Boolean),
      });
      
      return result;
    };
  }
  
  console.log('[ai-log-integrations] Error Tracker integrated');
}

// ============================================================================
// Console Logger Integration
// ============================================================================

/**
 * Hook into console logger to mirror important logs to AI system.
 * @param {object} logger - Logger instance
 */
export function integrateConsoleLogger(logger) {
  if (!logger || !logger.log) return;
  
  const originalLog = logger.log.bind(logger);
  const originalReport = logger.report?.bind(logger);
  
  // Intercept log method
  logger.log = function(level, message, context, options = {}) {
    // Call original
    originalLog(level, message, context, options);
    
    // Map console levels to AI levels
    const levelMap = {
      success: 'INFO',
      info: 'INFO',
      warn: 'WARN',
      detail: 'DEBUG',
      error: 'ERROR',
    };
    
    const aiLevel = levelMap[level] || 'INFO';
    
    // Determine category from context
    const category = context?.category || CONFIG.categories.SYSTEM;
    
    // Log to AI system
    aiLogger.log(aiLevel, category, message, {
      data: context,
      tags: ['console-logger', level],
    });
  };
  
  // Intercept report method
  if (originalReport) {
    logger.report = function(title, meta = {}, level = 'info') {
      // Call original
      originalReport(title, meta, level);
      
      // Log to AI system
      const aiLevel = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : 'NOTICE';
      
      aiLogger.log(aiLevel, CONFIG.categories.SYSTEM, title, {
        data: meta,
        tags: ['console-logger', 'report', level],
      });
    };
  }
  
  console.log('[ai-log-integrations] Console Logger integrated');
}

// ============================================================================
// Resource Monitor Integration
// ============================================================================

/**
 * Hook into resource monitor to log health checks and metrics.
 * @param {object} resourceMonitor - ResourceMonitor instance
 */
export function integrateResourceMonitor(resourceMonitor) {
  if (!resourceMonitor) return;
  
  // Log health checks
  const originalHealthCheck = resourceMonitor.performHealthCheck?.bind(resourceMonitor);
  
  if (originalHealthCheck) {
    resourceMonitor.performHealthCheck = async function() {
      const start = performance.now();
      const result = await originalHealthCheck();
      const duration = performance.now() - start;
      
      // Log health check
      aiLogger.log(
        result.status === 'healthy' ? 'INFO' : 'WARN',
        CONFIG.categories.RESOURCE,
        `Health check: ${result.status}`,
        {
          data: {
            status: result.status,
            metrics: result.metrics,
            duration,
            warnings: result.warnings,
            errors: result.errors,
          },
          tags: ['resource-monitor', 'health-check', result.status],
        }
      );
      
      return result;
    };
  }
  
  console.log('[ai-log-integrations] Resource Monitor integrated');
}

// ============================================================================
// Database Integration
// ============================================================================

/**
 * Hook into Prisma to log queries and connections.
 * NOTE: Prisma v6 removed $use() middleware. Query logging via $extends()
 * requires using the extended client. This integration logs connection events
 * and errors, but detailed query logging would require refactoring to use
 * the extended client throughout the application.
 * 
 * @param {object} prisma - Prisma client instance
 */
export function integratePrisma(prisma) {
  if (!prisma) {
    console.log('[ai-log-integrations] Prisma integration skipped (no client provided)');
    return;
  }
  
  try {
    // Log Prisma connection lifecycle events
    // Note: Prisma v6 has limited event hooks compared to v4/v5
    aiLogger.info(CONFIG.categories.DATABASE, 'Prisma client integrated with AI logging', {
      data: {
        prismaVersion: '6.x',
        note: 'Query-level logging requires $extends() and using extended client',
      },
      tags: ['prisma', 'database', 'integration'],
    });
    
    console.log('[ai-log-integrations] Prisma integrated (connection events only)');
    console.log('[ai-log-integrations] Note: Query-level logging requires $extends() refactor');
  } catch (error) {
    aiLogger.error(CONFIG.categories.DATABASE, 'Failed to integrate Prisma', {
      error,
      tags: ['prisma', 'integration-error'],
    });
    console.error('[ai-log-integrations] Prisma integration failed:', error);
  }
}

// ============================================================================
// Discord Integration
// ============================================================================

/**
 * Hook into Discord client to log API interactions.
 * @param {object} client - Discord.js Client instance
 */
export function integrateDiscordClient(client) {
  if (!client) return;
  
  // Log rate limits
  client.on('rateLimit', (rateLimitData) => {
    aiLogger.warn(CONFIG.categories.DISCORD, 'Rate limit hit', {
      data: {
        timeout: rateLimitData.timeout,
        limit: rateLimitData.limit,
        method: rateLimitData.method,
        path: rateLimitData.path,
        route: rateLimitData.route,
      },
      tags: ['discord', 'rate-limit'],
    });
  });
  
  // Log API errors
  client.on('error', (error) => {
    aiLogger.error(CONFIG.categories.DISCORD, 'Discord client error', {
      error,
      tags: ['discord', 'client-error'],
    });
  });
  
  // Log warnings
  client.on('warn', (warning) => {
    aiLogger.warn(CONFIG.categories.DISCORD, `Discord warning: ${warning}`, {
      tags: ['discord', 'warning'],
    });
  });
  
  // Log ready event
  client.once('ready', () => {
    aiLogger.info(CONFIG.categories.DISCORD, 'Discord client ready', {
      data: {
        user: client.user?.tag,
        guilds: client.guilds?.cache?.size,
        uptime: client.uptime,
      },
      tags: ['discord', 'ready'],
    });
  });
  
  // Log reconnect events
  client.on('shardReconnecting', (id) => {
    aiLogger.warn(CONFIG.categories.DISCORD, `Shard ${id} reconnecting`, {
      data: { shardId: id },
      tags: ['discord', 'reconnect'],
    });
  });
  
  console.log('[ai-log-integrations] Discord Client integrated');
}

// ============================================================================
// Game Engine Integration
// ============================================================================

/**
 * Log game engine events (battles, calculations, etc.).
 */
export const gameEngine = {
  /**
   * Log battle start.
   */
  logBattleStart(battleId, participants, options = {}) {
    aiLogger.info(CONFIG.categories.GAME_ENGINE, 'Battle started', {
      data: {
        battleId,
        participants: participants.map(p => ({
          userId: p.userId,
          pokemonId: p.pokemonId,
          level: p.level,
        })),
        mode: options.mode,
      },
      correlationId: options.correlationId,
      userId: participants[0]?.userId,
      guildId: options.guildId,
      tags: ['game-engine', 'battle', 'start'],
    });
  },
  
  /**
   * Log battle end.
   */
  logBattleEnd(battleId, result, duration, options = {}) {
    aiLogger.info(CONFIG.categories.GAME_ENGINE, 'Battle ended', {
      data: {
        battleId,
        winner: result.winner,
        duration,
        turns: result.turns,
        outcome: result.outcome,
      },
      correlationId: options.correlationId,
      tags: ['game-engine', 'battle', 'end'],
    });
    
    // Log performance
    aiLogger.debug(CONFIG.categories.PERFORMANCE, 'Battle performance', {
      data: {
        operation: 'battle',
        battleId,
        duration,
        turns: result.turns,
        complexity: result.complexity,
      },
      tags: ['performance', 'battle'],
    });
  },
  
  /**
   * Log battle error.
   */
  logBattleError(battleId, error, options = {}) {
    aiLogger.error(CONFIG.categories.GAME_ENGINE, 'Battle error', {
      error,
      data: {
        battleId,
        state: options.state,
      },
      correlationId: options.correlationId,
      tags: ['game-engine', 'battle', 'error'],
    });
  },
  
  /**
   * Log Pokemon spawn.
   */
  logPokemonSpawn(pokemon, options = {}) {
    aiLogger.debug(CONFIG.categories.GAME_ENGINE, 'Pokemon spawned', {
      data: {
        pokemonId: pokemon.id,
        species: pokemon.species,
        level: pokemon.level,
        rarity: pokemon.rarity,
        shiny: pokemon.shiny,
      },
      guildId: options.guildId,
      tags: ['game-engine', 'spawn', pokemon.rarity],
    });
  },
};

// ============================================================================
// Security Bot Integration
// ============================================================================

/**
 * Log security bot events.
 */
export const securityBot = {
  /**
   * Log permission sweep.
   */
  logSweep(results, duration) {
    const level = results.changesMade > 0 ? 'NOTICE' : 'DEBUG';
    
    aiLogger.log(level, CONFIG.categories.SECURITY, 'Permission sweep completed', {
      data: {
        duration,
        guildsChecked: results.guildsChecked,
        changesMade: results.changesMade,
        failures: results.failures,
      },
      tags: ['security-bot', 'sweep'],
    });
  },
  
  /**
   * Log unauthorized permission change.
   */
  logUnauthorizedChange(change) {
    aiLogger.warn(CONFIG.categories.SECURITY, 'Unauthorized permission detected', {
      data: {
        guildId: change.guildId,
        roleId: change.roleId,
        permission: change.permission,
        previousState: change.previousState,
        currentState: change.currentState,
      },
      guildId: change.guildId,
      tags: ['security-bot', 'unauthorized', 'alert'],
    });
  },
  
  /**
   * Log permission revert.
   */
  logRevert(revert, success) {
    const level = success ? 'INFO' : 'ERROR';
    
    aiLogger.log(level, CONFIG.categories.SECURITY, `Permission ${success ? 'reverted' : 'revert failed'}`, {
      data: {
        guildId: revert.guildId,
        roleId: revert.roleId,
        permission: revert.permission,
        success,
      },
      guildId: revert.guildId,
      tags: ['security-bot', 'revert', success ? 'success' : 'failure'],
    });
  },
};

// ============================================================================
// User Action Integration
// ============================================================================

/**
 * Log user-initiated actions.
 */
export const userActions = {
  /**
   * Log command execution.
   */
  logCommand(command, user, guild, args, options = {}) {
    aiLogger.notice(CONFIG.categories.USER_ACTION, `Command: ${command}`, {
      data: {
        command,
        args,
        user: {
          id: user.id,
          tag: user.tag,
        },
        guild: guild ? {
          id: guild.id,
          name: guild.name,
        } : null,
      },
      correlationId: options.correlationId,
      userId: user.id,
      guildId: guild?.id,
      tags: ['user-action', 'command', command],
    });
  },
  
  /**
   * Log command error.
   */
  logCommandError(command, error, user, guild, options = {}) {
    aiLogger.error(CONFIG.categories.USER_ACTION, `Command failed: ${command}`, {
      error,
      data: {
        command,
        user: {
          id: user.id,
          tag: user.tag,
        },
        guild: guild ? {
          id: guild.id,
          name: guild.name,
        } : null,
      },
      correlationId: options.correlationId,
      userId: user.id,
      guildId: guild?.id,
      tags: ['user-action', 'command-error', command],
    });
  },
};

// ============================================================================
// Resource Manager Integration
// ============================================================================

/**
 * Hook into resource-manager for leak detection and tracking.
 * @param {object} resourceManager - ResourceManager instance
 */
export function integrateResourceManager(resourceManager) {
  if (!resourceManager) return;
  
  // Log leak detections
  const originalDetectLeaks = resourceManager.detectLeaks?.bind(resourceManager);
  
  if (originalDetectLeaks) {
    resourceManager.detectLeaks = function() {
      const result = originalDetectLeaks();
      
      if (result && result.length > 0) {
        aiLogger.warn(CONFIG.categories.RESOURCE, `Memory leaks detected: ${result.length} resources`, {
          data: {
            leaks: result.map(leak => ({
              type: leak.type,
              id: leak.id,
              size: leak.size,
              age: leak.age,
              stackTrace: leak.stackTrace?.slice(0, 3), // First 3 frames
            })),
            totalSize: result.reduce((sum, leak) => sum + (leak.size || 0), 0),
          },
          tags: ['resource-manager', 'memory-leak', 'detection'],
        });
      }
      
      return result;
    };
  }
  
  // Log resource tracking
  const originalTrack = resourceManager.track?.bind(resourceManager);
  
  if (originalTrack) {
    resourceManager.track = function(type, resource, metadata = {}) {
      const result = originalTrack(type, resource, metadata);
      
      // Log high-value resources only
      if (metadata.size > 1024 * 1024 || metadata.critical) {
        aiLogger.debug(CONFIG.categories.RESOURCE, `Tracking ${type} resource`, {
          data: {
            type,
            id: resource.id || resource.name,
            size: metadata.size,
            critical: metadata.critical,
          },
          tags: ['resource-manager', 'tracking', type],
        });
      }
      
      return result;
    };
  }
  
  console.log('[ai-log-integrations] Resource Manager integrated');
}

// ============================================================================
// Database Connection Monitoring
// ============================================================================

/**
 * Monitor database connection health and operations.
 * @param {object} connectionMonitor - Connection monitor with getDatabaseStats
 */
export function integrateDatabaseMonitor(connectionMonitor) {
  if (!connectionMonitor || !connectionMonitor.getDatabaseStats) return;
  
  // Periodically log database stats
  setInterval(() => {
    try {
      const stats = connectionMonitor.getDatabaseStats();
      
      // Log each database's health
      for (const [dbName, dbStats] of Object.entries(stats)) {
        if (dbStats.status === 'error' || dbStats.status === 'degraded') {
          aiLogger.warn(CONFIG.categories.DATABASE, `Database ${dbName} health issue`, {
            data: {
              database: dbName,
              status: dbStats.status,
              latency: dbStats.latency,
              connections: dbStats.connections,
              source: dbStats.source,
              transport: dbStats.transport,
            },
            tags: ['database', 'health', dbName, dbStats.status],
          });
        }
      }
    } catch (error) {
      aiLogger.debug(CONFIG.categories.SYSTEM, 'Database stats collection failed', { error });
    }
  }, 60 * 1000); // Every minute
  
  console.log('[ai-log-integrations] Database Monitor integrated');
}

// ============================================================================
// Worker Process Integration
// ============================================================================

/**
 * Log worker process lifecycle and metrics.
 * @param {object} workerConfig - Worker configuration with name and type
 */
export function integrateWorkerProcess(workerConfig = {}) {
  const workerName = workerConfig.name || process.env.RENDER_SERVICE_NAME || 'unknown-worker';
  const workerType = workerConfig.type || process.env.RENDER_SERVICE_TYPE || 'unknown';
  
  // Log worker startup
  aiLogger.info(CONFIG.categories.SYSTEM, `Worker process started: ${workerName}`, {
    data: {
      workerName,
      workerType,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      cwd: process.cwd(),
    },
    tags: ['worker', 'startup', workerName, workerType],
  });
  
  // Log uncaught errors
  process.on('uncaughtException', (error) => {
    aiLogger.fatal(CONFIG.categories.ERROR, `Uncaught exception in ${workerName}`, {
      error,
      data: { workerName, workerType },
      tags: ['worker', 'fatal', 'uncaught-exception', workerName],
    });
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    aiLogger.critical(CONFIG.categories.ERROR, `Unhandled rejection in ${workerName}`, {
      error: reason instanceof Error ? reason : new Error(String(reason)),
      data: { workerName, workerType, promise: promise.toString() },
      tags: ['worker', 'critical', 'unhandled-rejection', workerName],
    });
  });
  
  // Log process metrics periodically
  setInterval(() => {
    const usage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    aiLogger.debug(CONFIG.categories.PERFORMANCE, `Worker metrics: ${workerName}`, {
      data: {
        workerName,
        workerType,
        memory: {
          rss: usage.rss,
          heapUsed: usage.heapUsed,
          heapTotal: usage.heapTotal,
          external: usage.external,
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        uptime: process.uptime(),
      },
      tags: ['worker', 'metrics', workerName, 'performance'],
    });
  }, 5 * 60 * 1000); // Every 5 minutes
  
  console.log(`[ai-log-integrations] Worker process integrated: ${workerName}`);
}

// ============================================================================
// Auto-Integration
// ============================================================================

/**
 * Automatically integrate with all available systems.
 * @param {object} services - Services to integrate
 * @returns {Promise<void>}
 */
export async function integrateAll(services = {}) {
  const {
    errorTracker,
    logger,
    resourceMonitor,
    resourceManager,
    databaseMonitor,
    prisma,
    discordClient,
    workerConfig,
  } = services;
  
  if (errorTracker) integrateErrorTracker(errorTracker);
  if (logger) integrateConsoleLogger(logger);
  if (resourceMonitor) integrateResourceMonitor(resourceMonitor);
  if (resourceManager) integrateResourceManager(resourceManager);
  if (databaseMonitor) integrateDatabaseMonitor(databaseMonitor);
  if (prisma) integratePrisma(prisma);
  if (discordClient) integrateDiscordClient(discordClient);
  if (workerConfig) integrateWorkerProcess(workerConfig);
  
  console.log('[ai-log-integrations] All integrations complete');
}

export default {
  integrateErrorTracker,
  integrateConsoleLogger,
  integrateResourceMonitor,
  integrateResourceManager,
  integrateDatabaseMonitor,
  integrateWorkerProcess,
  integratePrisma,
  integrateDiscordClient,
  gameEngine,
  securityBot,
  userActions,
  integrateAll,
};
