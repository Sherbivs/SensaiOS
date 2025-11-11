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
 * @param {object} prisma - Prisma client instance
 */
export function integratePrisma(prisma) {
  if (!prisma) return;
  
  // Prisma middleware for query logging
  prisma.$use(async (params, next) => {
    const start = performance.now();
    
    try {
      const result = await next(params);
      const duration = performance.now() - start;
      
      // Log slow queries (>100ms)
      if (duration > 100) {
        aiLogger.warn(CONFIG.categories.DATABASE, `Slow query: ${params.model}.${params.action}`, {
          data: {
            model: params.model,
            action: params.action,
            duration,
            args: params.args,
          },
          tags: ['prisma', 'slow-query', params.action],
        });
      } else {
        // Log all queries at DEBUG level
        aiLogger.debug(CONFIG.categories.DATABASE, `Query: ${params.model}.${params.action}`, {
          data: {
            model: params.model,
            action: params.action,
            duration,
          },
          tags: ['prisma', 'query', params.action],
        });
      }
      
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      
      // Log query errors
      aiLogger.error(CONFIG.categories.DATABASE, `Query failed: ${params.model}.${params.action}`, {
        error,
        data: {
          model: params.model,
          action: params.action,
          duration,
          args: params.args,
        },
        tags: ['prisma', 'query-error', params.action],
      });
      
      throw error;
    }
  });
  
  console.log('[ai-log-integrations] Prisma integrated');
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
    prisma,
    discordClient,
  } = services;
  
  if (errorTracker) integrateErrorTracker(errorTracker);
  if (logger) integrateConsoleLogger(logger);
  if (resourceMonitor) integrateResourceMonitor(resourceMonitor);
  if (prisma) integratePrisma(prisma);
  if (discordClient) integrateDiscordClient(discordClient);
  
  console.log('[ai-log-integrations] All integrations complete');
}

export default {
  integrateErrorTracker,
  integrateConsoleLogger,
  integrateResourceMonitor,
  integratePrisma,
  integrateDiscordClient,
  gameEngine,
  securityBot,
  userActions,
  integrateAll,
};
