/**
 * AppManifest — Application manifest schema for SensaiOS app installation
 * 
 * Defines the structure for app metadata, capabilities, dependencies, lifecycle hooks,
 * and handler bindings. This is the contract between apps and the SensaiOS installation system.
 * 
 * @module sensaios/install/app-manifest
 */

import type { Capability } from '../types.js';
import type { CommandInteraction, Message } from 'discord.js';

// Forward declaration for ComponentContext (avoids circular dependency)
export interface ComponentContext {
  // Minimal interface - full definition in component-context.ts
  scope?: { tenantId: string; guildId: string };
  db: any;
  exports: any;
  jobs: any;
  outbox: any;
  obs: any;
}

/**
 * Lifecycle hooks for app management
 * Apps can define these hooks to perform initialization, cleanup, or state management
 */
export interface AppLifecycle {
  /**
   * Called when app manifest is loaded into memory (installation time)
   * Use for: Validating environment, checking dependencies, preparing resources
   */
  onLoad?(ctx: ComponentContext): Promise<void>;

  /**
   * Called when app is enabled for the first time or re-enabled after being disabled
   * Use for: Starting workers, registering event listeners, opening connections
   */
  onEnable?(ctx: ComponentContext): Promise<void>;

  /**
   * Called when app is disabled (but not uninstalled)
   * Use for: Pausing workers, unregistering listeners, releasing resources
   */
  onDisable?(ctx: ComponentContext): Promise<void>;

  /**
   * Called when app is being uninstalled
   * Use for: Final cleanup, closing connections, removing temporary data
   */
  onUnload?(ctx: ComponentContext): Promise<void>;
}

/**
 * Discord command/event handler signature
 * Apps bind Discord interactions to these handlers
 */
export type DiscordHandler = (ctx: ComponentContext, interaction: CommandInteraction) => Promise<void>;

/**
 * Export event handler signature
 * Apps consume export events from the export log
 */
export type ExportHandler = (ctx: ComponentContext, event: unknown) => Promise<void>;

/**
 * Job handler signature
 * Apps process background jobs from the job queue
 */
export type JobHandler = (ctx: ComponentContext, job: unknown) => Promise<void>;

/**
 * HTTP endpoint handler signature
 * Apps expose HTTP endpoints for webhooks or API calls
 */
export type HttpHandler = (ctx: ComponentContext, req: unknown, res: unknown) => Promise<void>;

/**
 * CLI command handler signature
 * Apps expose CLI commands for operator tooling
 */
export type CliHandler = (ctx: ComponentContext, args: string[]) => Promise<void>;

/**
 * Handler bindings for different event sources
 * Maps event names/routes to handler functions
 */
export interface AppHandlers {
  /**
   * Discord interaction handlers
   * Key: Command name (e.g., "battle", "walk", "heal")
   */
  discord?: Record<string, DiscordHandler>;

  /**
   * Export event handlers
   * Key: Event type pattern (e.g., "battle.completed", "encounter.*")
   */
  exports?: Record<string, ExportHandler>;

  /**
   * Job handlers
   * Key: Job kind (e.g., "cache.refresh", "outbox.deliver")
   */
  jobs?: Record<string, JobHandler>;

  /**
   * HTTP endpoint handlers
   * Key: Route pattern (e.g., "/webhook/github", "/health")
   */
  http?: Record<string, HttpHandler>;

  /**
   * CLI command handlers
   * Key: Command name (e.g., "migrate", "seed", "stats")
   */
  cli?: Record<string, CliHandler>;
}

/**
 * Data ownership declaration
 * Defines which database tables the app owns (canonical vs projections)
 */
export interface AppOwnership {
  /**
   * Canonical tables — App is the authoritative writer
   * Other apps MUST NOT write to these tables directly
   * 
   * Example: ["trainers", "pokemon", "battles"]
   */
  canonical?: string[];

  /**
   * Projection tables — App maintains derived/cached views
   * These can be rebuilt from export log or canonical data
   * 
   * Example: ["trainer_stats", "leaderboard", "battle_history"]
   */
  projections?: string[];
}

/**
 * Host types where the app can run
 * Determines which runtime environment(s) support this app
 */
export type HostKind = 'bot' | 'worker' | 'cron' | 'cli';

/**
 * Resource budget constraints
 * Limits the app's resource consumption
 */
export interface AppResources {
  /**
   * Maximum cache size in MB
   * Default: 50 MB
   */
  maxCacheMb?: number;

  /**
   * Maximum job queue size
   * Default: 1000 entries
   */
  maxQueueSize?: number;

  /**
   * Maximum concurrent operations
   * Default: 10
   */
  maxConcurrency?: number;
}

/**
 * Capability requirements for the app
 * Groups capabilities by category for clarity
 */
export interface AppCapabilityRequirements {
  /**
   * Database capabilities
   * - read: SELECT queries
   * - write: INSERT/UPDATE/DELETE queries
   * - migrate: Schema changes (CREATE/ALTER/DROP)
   */
  db: Array<'read' | 'write' | 'migrate'>;

  /**
   * Discord API capabilities
   * - read: Fetch guild/user/channel data
   * - send: Send messages/embeds
   * - moderate: Kick/ban/timeout users, manage roles
   */
  discord?: Array<'read' | 'send' | 'moderate'>;

  /**
   * Network capabilities
   * - http-egress: Make outbound HTTP requests
   */
  network?: Array<'http-egress'>;

  /**
   * Kernel capabilities (DANGEROUS - requires approval)
   * - observe: Read kernel state
   * - modify: Change kernel configuration
   */
  kernel?: Array<'observe' | 'modify'>;
}

/**
 * AppManifest — Complete app metadata for installation
 * 
 * This is the contract between an app and SensaiOS. Apps declare their identity,
 * requirements, capabilities, and handlers in this manifest.
 * 
 * @example
 * const manifest: AppManifest = {
 *   id: "game.battles",
 *   name: "Battle Engine",
 *   version: "1.0.0",
 *   description: "Pokemon battle system with deterministic mechanics",
 *   hosts: ["bot"],
 *   capabilities: {
 *     db: ["read", "write"],
 *     discord: ["read", "send"]
 *   },
 *   owns: {
 *     canonical: ["battles", "battle_turns"],
 *     projections: ["battle_stats"]
 *   },
 *   dependencies: ["game.core", "game.pokemon"],
 *   lifecycle: {
 *     onLoad: async (ctx) => { },
 *     onEnable: async (ctx) => { },
 *     onDisable: async (ctx) => { },
 *     onUnload: async (ctx) => { }
 *   },
 *   handlers: {
 *     discord: {
 *       "battle": handleBattleCommand,
 *       "move": handleMoveCommand
 *     },
 *     exports: {
 *       "battle.completed": handleBattleCompleted
 *     }
 *   },
 *   config: {
 *     maxBattleDuration: 3600000,
 *     enableSpectators: true
 *   }
 * };
 */
export interface AppManifest {
  /**
   * Unique app identifier
   * Format: namespace.app (e.g., "game.battles", "discord.bot")
   * MUST be unique across all installed apps
   */
  id: string;

  /**
   * Human-readable app name
   * Example: "Battle Engine", "Discord Bot Core"
   */
  name: string;

  /**
   * Semantic version
   * Format: MAJOR.MINOR.PATCH (e.g., "1.2.3")
   * See: https://semver.org/
   */
  version: string;

  /**
   * Optional app description
   * Brief summary of what the app does
   */
  description?: string;

  /**
   * Host environments where this app can run
   * - bot: Discord bot runtime (handles interactions)
   * - worker: Background worker (processes jobs)
   * - cron: Scheduled job runner (periodic tasks)
   * - cli: Command-line tool (operator scripts)
   */
  hosts: HostKind[];

  /**
   * Required capabilities
   * Apps MUST declare all capabilities they need
   * Dangerous capabilities (db.migrate, kernel.*, discord.moderate) require approval
   */
  capabilities: AppCapabilityRequirements;

  /**
   * Data ownership (optional)
   * Declares which tables this app owns
   * Only the owner app can write to canonical tables
   */
  owns?: AppOwnership;

  /**
   * App dependencies (optional)
   * List of other app IDs that MUST be installed first
   * Example: ["game.core", "discord.bot"]
   */
  dependencies?: string[];

  /**
   * Resource budgets (optional)
   * Limits the app's resource consumption
   */
  resources?: AppResources;

  /**
   * Lifecycle hooks (optional)
   * Functions called during app lifecycle transitions
   */
  lifecycle?: AppLifecycle;

  /**
   * Event handlers (optional)
   * Maps event sources to handler functions
   */
  handlers?: AppHandlers;

  /**
   * App-specific configuration (optional)
   * Free-form JSON object for app settings
   * Example: { maxRetries: 3, timeout: 5000 }
   */
  config?: Record<string, unknown>;
}

/**
 * Installation result
 * Returned by installApp() with status and details
 */
export interface InstallResult {
  /**
   * Installation success flag
   */
  success: boolean;

  /**
   * Installed app ID
   */
  appId: string;

  /**
   * Human-readable status message
   */
  message: string;

  /**
   * Detailed errors if installation failed
   */
  errors?: string[];

  /**
   * Capabilities requiring approval
   * Empty if no approvals needed or all approved
   */
  pendingApprovals?: string[];
}

/**
 * Uninstallation result
 * Returned by uninstallApp() with status and details
 */
export interface UninstallResult {
  /**
   * Uninstallation success flag
   */
  success: boolean;

  /**
   * Uninstalled app ID
   */
  appId: string;

  /**
   * Human-readable status message
   */
  message: string;

  /**
   * Detailed errors if uninstallation failed
   */
  errors?: string[];

  /**
   * Apps that depend on this app (blocks uninstall)
   */
  blockedByDependents?: string[];
}

/**
 * Dependency graph node
 * Represents an app and its dependencies
 */
export interface DependencyNode {
  /**
   * App ID
   */
  appId: string;

  /**
   * App version
   */
  version: string;

  /**
   * Direct dependencies
   */
  dependencies: string[];

  /**
   * Apps that depend on this app
   */
  dependents: string[];
}

/**
 * Dependency graph
 * Complete view of app dependencies
 */
export interface DependencyGraph {
  /**
   * All nodes in the graph
   */
  nodes: DependencyNode[];

  /**
   * Topologically sorted app IDs (install order)
   */
  installOrder: string[];

  /**
   * Circular dependency cycles detected
   */
  cycles?: string[][];
}
