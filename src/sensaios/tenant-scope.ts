/**
 * SensaiOS Tenant Scope — Multi-Tenant Context Management
 * 
 * TenantScope is the MANDATORY context that must accompany every envelope,
 * log entry, and error in SensaiOS. It provides multi-tenant isolation and
 * enables proper routing, filtering, and aggregation of observability data.
 * 
 * Uses AsyncLocalStorage for automatic context propagation (same pattern
 * as kernel/correlation.ts).
 * 
 * @module sensaios/tenant-scope
 * @since 2025-12-28
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Environment } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * TenantScope — Mandatory context for all operations
 * 
 * Every log, error, and envelope MUST have a TenantScope.
 * This enables multi-tenant isolation and proper routing.
 */
export interface TenantScope {
  /**
   * Tenant identifier
   * 
   * For Discord: guild ID (multi-tenant per guild)
   * For System: "system" or service name
   * For User: user ID (homestead context)
   * 
   * @example "123456789012345678" // Guild ID
   * @example "system" // System operations
   * @example "user:563220840708177927" // User-scoped
   */
  tenant: string;

  /**
   * Deployment environment
   * 
   * Controls routing and filtering of logs.
   * Production logs go to Loki, development to console only.
   */
  environment: Environment;

  /**
   * Service name
   * 
   * Which service is generating this data.
   * 
   * @example "infinity-gauntlet"
   * @example "security-bot"
   * @example "cache-worker"
   */
  service: string;

  /**
   * Component within the service
   * 
   * More specific than service — the subsystem.
   * 
   * @example "battle-engine"
   * @example "homestead"
   * @example "database"
   */
  component: string;

  /**
   * Optional: Instance identifier
   * 
   * For worker processes or multiple instances.
   * 
   * @example "worker-1"
   * @example "srv-abc123"
   */
  instance?: string;

  /**
   * Optional: Region/zone
   * 
   * For geographically distributed deployments.
   * 
   * @example "us-east-1"
   * @example "virginia"
   */
  region?: string;
}

// ============================================================================
// ASYNC LOCAL STORAGE
// ============================================================================

/** AsyncLocalStorage for scope context propagation */
const scopeStorage = new AsyncLocalStorage<TenantScope>();

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

/**
 * Determine current environment from NODE_ENV
 */
function determineEnvironment(): Environment {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase();
  if (nodeEnv === 'production') return 'production';
  if (nodeEnv === 'staging') return 'staging';
  return 'development';
}

/**
 * Get default service name from environment
 */
function getDefaultService(): string {
  return process.env.SERVICE_NAME || 'infinity-gauntlet';
}

/**
 * Get instance ID from Render environment
 */
function getInstanceId(): string | undefined {
  return process.env.RENDER_SERVICE_ID || process.env.RENDER_INSTANCE_ID;
}

/**
 * Get region from Render environment
 */
function getRegion(): string | undefined {
  return process.env.RENDER_REGION;
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a TenantScope from a Discord interaction
 * 
 * @param interaction - Discord interaction object (duck-typed for flexibility)
 * @returns TenantScope with guild/user as tenant
 */
export function scopeFromInteraction(interaction: {
  guildId?: string | null;
  user: { id: string };
}): TenantScope {
  return {
    tenant: interaction.guildId || `user:${interaction.user.id}`,
    environment: determineEnvironment(),
    service: getDefaultService(),
    component: 'discord-bot',
    instance: getInstanceId(),
    region: getRegion(),
  };
}

/**
 * Create a TenantScope from a guild ID
 * 
 * @param guildId - Discord guild ID
 * @param component - Component name
 * @returns TenantScope with guild as tenant
 */
export function scopeFromGuild(guildId: string, component: string): TenantScope {
  return {
    tenant: guildId,
    environment: determineEnvironment(),
    service: getDefaultService(),
    component,
    instance: getInstanceId(),
    region: getRegion(),
  };
}

/**
 * Create a TenantScope for system operations
 * 
 * @param component - Component name
 * @returns TenantScope with "system" as tenant
 */
export function systemScope(component: string): TenantScope {
  return {
    tenant: 'system',
    environment: determineEnvironment(),
    service: getDefaultService(),
    component,
    instance: getInstanceId(),
    region: getRegion(),
  };
}

/**
 * Create a TenantScope for a specific user (homestead context)
 * 
 * @param userId - Discord user ID
 * @param component - Component name
 * @returns TenantScope with user as tenant
 */
export function scopeFromUser(userId: string, component: string): TenantScope {
  return {
    tenant: `user:${userId}`,
    environment: determineEnvironment(),
    service: getDefaultService(),
    component,
    instance: getInstanceId(),
    region: getRegion(),
  };
}

/**
 * Create a TenantScope for a worker process
 * 
 * @param workerName - Name of the worker
 * @returns TenantScope for worker context
 */
export function workerScope(workerName: string): TenantScope {
  return {
    tenant: 'system',
    environment: determineEnvironment(),
    service: workerName,
    component: 'worker',
    instance: getInstanceId(),
    region: getRegion(),
  };
}

// ============================================================================
// CONTEXT PROPAGATION
// ============================================================================

/**
 * Run a function with a specific scope in context
 * 
 * @param scope - TenantScope to set
 * @param fn - Function to run
 * @returns Result of the function
 * 
 * @example
 * await withScope(scope, async () => {
 *   // All operations here have access to scope via getCurrentScope()
 *   await doSomething();
 * });
 */
export function withScope<T>(scope: TenantScope, fn: () => T): T {
  return scopeStorage.run(scope, fn);
}

/**
 * Run an async function with a specific scope in context
 * 
 * @param scope - TenantScope to set
 * @param fn - Async function to run
 * @returns Promise of the function result
 */
export async function withScopeAsync<T>(
  scope: TenantScope,
  fn: () => Promise<T>
): Promise<T> {
  return scopeStorage.run(scope, fn);
}

/**
 * Get the current scope from context
 * 
 * @returns TenantScope if in context, undefined otherwise
 */
export function getCurrentScope(): TenantScope | undefined {
  return scopeStorage.getStore();
}

/**
 * Get the current scope or throw if not in context
 * 
 * @throws Error if no scope in context
 * @returns TenantScope from context
 */
export function requireScope(): TenantScope {
  const scope = scopeStorage.getStore();
  if (!scope) {
    throw new Error('No scope in context — did you forget withScope()?');
  }
  return scope;
}

/**
 * Check if currently inside a scoped context
 */
export function isInScope(): boolean {
  return scopeStorage.getStore() !== undefined;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validation error for scope
 */
export class ScopeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScopeValidationError';
  }
}

/**
 * Validate a TenantScope object
 * 
 * @throws ScopeValidationError if scope is invalid
 */
export function validateScope(scope: unknown): asserts scope is TenantScope {
  if (typeof scope !== 'object' || scope === null) {
    throw new ScopeValidationError('Scope must be an object');
  }

  const s = scope as Record<string, unknown>;

  if (typeof s.tenant !== 'string' || s.tenant.length === 0) {
    throw new ScopeValidationError('Scope.tenant is required and must be a non-empty string');
  }

  if (!['production', 'staging', 'development'].includes(s.environment as string)) {
    throw new ScopeValidationError('Scope.environment must be production|staging|development');
  }

  if (typeof s.service !== 'string' || s.service.length === 0) {
    throw new ScopeValidationError('Scope.service is required and must be a non-empty string');
  }

  if (typeof s.component !== 'string' || s.component.length === 0) {
    throw new ScopeValidationError('Scope.component is required and must be a non-empty string');
  }
}

/**
 * Check if a value is a valid TenantScope
 */
export function isTenantScope(value: unknown): value is TenantScope {
  try {
    validateScope(value);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// SERIALIZATION
// ============================================================================

/**
 * Serialize scope to JSON string
 */
export function serializeScope(scope: TenantScope): string {
  return JSON.stringify({
    tenant: scope.tenant,
    environment: scope.environment,
    service: scope.service,
    component: scope.component,
    instance: scope.instance,
    region: scope.region,
  });
}

/**
 * Create a compact scope string for log prefixes
 * 
 * @example "[prod:guild-123:battle-engine]"
 */
export function scopePrefix(scope: TenantScope): string {
  const env =
    scope.environment === 'production'
      ? 'prod'
      : scope.environment === 'development'
        ? 'dev'
        : 'stg';
  return `[${env}:${scope.tenant}:${scope.component}]`;
}

/**
 * Create a Loki-compatible labels object from scope
 */
export function scopeToLabels(scope: TenantScope): Record<string, string> {
  const labels: Record<string, string> = {
    tenant: scope.tenant,
    env: scope.environment,
    service: scope.service,
    component: scope.component,
  };

  if (scope.instance) {
    labels.instance = scope.instance;
  }

  if (scope.region) {
    labels.region = scope.region;
  }

  return labels;
}

// ============================================================================
// SCOPE RESOLUTION
// ============================================================================

/**
 * Resolve a scope by merging explicit values with context and defaults
 * 
 * Priority: explicit > context > defaults
 */
export function resolveScope(
  explicit?: Partial<TenantScope>,
  context?: TenantScope
): TenantScope {
  const defaults = systemScope('unknown');

  return {
    tenant: explicit?.tenant ?? context?.tenant ?? defaults.tenant,
    environment: explicit?.environment ?? context?.environment ?? defaults.environment,
    service: explicit?.service ?? context?.service ?? defaults.service,
    component: explicit?.component ?? context?.component ?? defaults.component,
    instance: explicit?.instance ?? context?.instance ?? defaults.instance,
    region: explicit?.region ?? context?.region ?? defaults.region,
  };
}

/**
 * Get scope data for log enrichment
 * Returns undefined if not in scope context
 */
export function getScopeData(): Record<string, unknown> | undefined {
  const scope = getCurrentScope();
  if (!scope) return undefined;

  return {
    tenant: scope.tenant,
    environment: scope.environment,
    service: scope.service,
    component: scope.component,
    instance: scope.instance,
    region: scope.region,
  };
}
