/**
 * AI Log System Integrations
 * @module services/ai/ai-log-integrations
 *
 * Purpose: Connect AI logging system with existing observability systems
 *
 * Integrations:
 *   - Error Tracker: Log all detected errors with full context
 *   - Console Logger: Mirror important console logs to AI logs
 *   - Resource Monitor: Log resource metrics and health checks
 *   - Database: Log queries, connections, and performance
 *   - Discord: Log API interactions and rate limits
 *   - Game Engine: Log battles, spawns, and calculations
 *   - Security Bot: Log permission sweeps and alerts
 *   - User Actions: Log commands and interactions
 */
import * as aiLogger from './ai-log-writer.js';
import { ensureError } from "../../shared/utils/error-utils.js";
import { scopedLogger } from '../../observability/envelope/console.js';
/** Scoped logger for AI log integrations */
const log = scopedLogger('ai-log-integrations');
// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────
const { CONFIG } = aiLogger;
// ─────────────────────────────────────────────────────────────────────────────
// Error Tracker Integration
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Hook into error-tracker to log all tracked errors.
 */
export function integrateErrorTracker(errorTracker) {
    if (!errorTracker)
        return;
    // Intercept trackError method
    const originalTrackError = errorTracker.trackError?.bind(errorTracker);
    if (originalTrackError) {
        errorTracker.trackError = async function (error, context = {}) {
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
    log.info('integrate', 'Error Tracker integrated');
}
// ─────────────────────────────────────────────────────────────────────────────
// Console Logger Integration
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Hook into console logger to mirror important logs to AI system.
 */
export function integrateConsoleLogger(logger) {
    if (!logger || !logger.log)
        return;
    const originalLog = logger.log.bind(logger);
    const originalReport = logger.report?.bind(logger);
    // Intercept log method
    logger.log = function (level, message, context, options = {}) {
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
        const category = (context?.category || CONFIG.categories.SYSTEM);
        // Log to AI system
        aiLogger.log(aiLevel, category, message, {
            data: context,
            tags: ['console-logger', level],
        });
    };
    // Intercept report method
    if (originalReport) {
        logger.report = function (title, meta = {}, level = 'info') {
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
    log.info('integrate', 'Console Logger integrated');
}
// ─────────────────────────────────────────────────────────────────────────────
// Resource Monitor Integration
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Hook into resource monitor to log health checks and metrics.
 */
export function integrateResourceMonitor(resourceMonitor) {
    if (!resourceMonitor)
        return;
    // Log health checks
    const originalHealthCheck = resourceMonitor.performHealthCheck?.bind(resourceMonitor);
    if (originalHealthCheck) {
        resourceMonitor.performHealthCheck = async function () {
            const start = performance.now();
            const result = await originalHealthCheck();
            const duration = performance.now() - start;
            // Log health check
            aiLogger.log(result.status === 'healthy' ? 'INFO' : 'WARN', CONFIG.categories.RESOURCE, `Health check: ${result.status}`, {
                data: {
                    status: result.status,
                    metrics: result.metrics,
                    duration,
                    warnings: result.warnings,
                    errors: result.errors,
                },
                tags: ['resource-monitor', 'health-check', result.status],
            });
            return result;
        };
    }
    log.info('integrate', 'Resource Monitor integrated');
}
// ─────────────────────────────────────────────────────────────────────────────
// Database Integration
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Hook into Prisma to log queries and connections.
 * NOTE: Prisma v6 removed $use() middleware. Query logging via $extends()
 * requires using the extended client. This integration logs connection events
 * and errors, but detailed query logging would require refactoring to use
 * the extended client throughout the application.
 */
export function integratePrisma(prisma) {
    if (!prisma) {
        log.info('integrate', 'Prisma integration skipped (no client provided)');
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
        log.info('integrate', 'Prisma integrated (connection events only)');
        log.info('integrate', 'Query-level logging requires $extends() refactor');
    }
    catch (error) {
        aiLogger.error(CONFIG.categories.DATABASE, 'Failed to integrate Prisma', {
            error: ensureError(error),
            tags: ['prisma', 'integration-error'],
        });
        log.error('integrate', 'Prisma integration failed', { error: String(error) });
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Discord Integration
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Hook into Discord client to log API interactions.
 */
export function integrateDiscordClient(client) {
    if (!client)
        return;
    // Log rate limits (note: RateLimitData structure varies by discord.js version)
    client.rest.on('rateLimited', (rateLimitData) => {
        aiLogger.warn(CONFIG.categories.DISCORD, 'Rate limit hit', {
            data: {
                timeToReset: rateLimitData.timeToReset,
                limit: rateLimitData.limit,
                method: rateLimitData.method,
                url: rateLimitData.url,
                route: rateLimitData.route,
                global: rateLimitData.global,
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
    log.info('integrate', 'Discord Client integrated');
}
// ─────────────────────────────────────────────────────────────────────────────
// Game Engine Integration
// ─────────────────────────────────────────────────────────────────────────────
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
// ─────────────────────────────────────────────────────────────────────────────
// Security Bot Integration
// ─────────────────────────────────────────────────────────────────────────────
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
// ─────────────────────────────────────────────────────────────────────────────
// User Action Integration
// ─────────────────────────────────────────────────────────────────────────────
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
// ─────────────────────────────────────────────────────────────────────────────
// Resource Manager Integration
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Hook into resource-manager for leak detection and tracking.
 */
export function integrateResourceManager(resourceManager) {
    if (!resourceManager)
        return;
    // Log leak detections
    const originalDetectLeaks = resourceManager.detectLeaks?.bind(resourceManager);
    if (originalDetectLeaks) {
        resourceManager.detectLeaks = function () {
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
        resourceManager.track = function (type, resource, metadata = {}) {
            const result = originalTrack(type, resource, metadata);
            // Log high-value resources only
            if ((metadata.size && metadata.size > 1024 * 1024) || metadata.critical) {
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
    log.info('integrate', 'Resource Manager integrated');
}
// ─────────────────────────────────────────────────────────────────────────────
// Database Connection Monitoring
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Monitor database connection health and operations.
 */
export function integrateDatabaseMonitor(connectionMonitor) {
    if (!connectionMonitor || !connectionMonitor.getDatabaseStats)
        return;
    // Periodically log database stats
    setInterval(() => {
        try {
            const stats = connectionMonitor.getDatabaseStats();
            // Log each database's health
            for (const [dbName, rawStats] of Object.entries(stats)) {
                const dbStats = rawStats;
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
                        tags: ['database', 'health', dbName, String(dbStats.status)],
                    });
                }
            }
        }
        catch (error) {
            aiLogger.debug(CONFIG.categories.SYSTEM, 'Database stats collection failed', {
                error: ensureError(error)
            });
        }
    }, 60 * 1000); // Every minute
    log.info('integrate', 'Database Monitor integrated');
}
// ─────────────────────────────────────────────────────────────────────────────
// Worker Process Integration
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Log worker process lifecycle and metrics.
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
            error: ensureError(reason),
            data: { workerName, workerType, promise: String(promise) },
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
    log.info('integrate', 'Worker process integrated', { workerName });
}
// ─────────────────────────────────────────────────────────────────────────────
// Auto-Integration
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Automatically integrate with all available systems.
 */
export async function integrateAll(services = {}) {
    const { errorTracker, logger, resourceMonitor, resourceManager, databaseMonitor, prisma, discordClient, workerConfig, } = services;
    if (errorTracker && typeof errorTracker === 'object' && 'trackError' in errorTracker) {
        integrateErrorTracker(errorTracker);
    }
    if (logger && typeof logger === 'object' && 'log' in logger && typeof logger.log === 'function') {
        integrateConsoleLogger(logger);
    }
    if (resourceMonitor)
        integrateResourceMonitor(resourceMonitor);
    if (resourceManager)
        integrateResourceManager(resourceManager);
    if (databaseMonitor)
        integrateDatabaseMonitor(databaseMonitor);
    if (prisma)
        integratePrisma(prisma);
    if (discordClient)
        integrateDiscordClient(discordClient);
    if (workerConfig)
        integrateWorkerProcess(workerConfig);
    log.info('integrate', 'All integrations complete');
}
// ─────────────────────────────────────────────────────────────────────────────
// Default Export
// ─────────────────────────────────────────────────────────────────────────────
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
