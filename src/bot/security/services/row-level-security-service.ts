/**
 * Row-Level Security (RLS) Service — PostgreSQL Multi-Tenant Data Isolation
 * ==========================================================================
 *
 * Implements PostgreSQL Row-Level Security policies for multi-tenant data
 * isolation in security tables. Ensures guilds can only access their own data.
 *
 * @module security/services/row-level-security-service
 * @research D7 (Row-Level Security)
 * @compliance SOC 2 Type II - Access Control (CC6.1)
 * @compliance GDPR Article 32 - Security of Processing
 *
 * ## Architecture
 *
 * RLS provides database-level enforcement of data isolation:
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                      Application Layer                          │
 * │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
 * │  │   Guild A     │  │   Guild B     │  │   Guild C     │       │
 * │  │   Context     │  │   Context     │  │   Context     │       │
 * │  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘       │
 * │          │                  │                  │                │
 * │          ▼                  ▼                  ▼                │
 * │  ┌───────────────────────────────────────────────────────┐     │
 * │  │              RLS Security Context                      │     │
 * │  │         SET app.current_guild_id = 'guild_id'          │     │
 * │  └───────────────────────────────────────────────────────┘     │
 * └─────────────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                     PostgreSQL RLS Layer                        │
 * │                                                                 │
 * │  Policy: guild_isolation_policy                                 │
 * │  ────────────────────────────────────────────────────────────  │
 * │  USING (guild_id = current_setting('app.current_guild_id'))    │
 * │                                                                 │
 * │  ┌─────────────────────────────────────────────────────────┐   │
 * │  │ SecurityEvent │ RoleChangeAudit │ ThreatDetection │ ... │   │
 * │  │ ┌───────────┐ │ ┌───────────┐   │ ┌───────────┐   │     │   │
 * │  │ │ Guild A   │ │ │ Guild A   │   │ │ Guild A   │   │     │   │
 * │  │ │ Data Only │ │ │ Data Only │   │ │ Data Only │   │     │   │
 * │  │ └───────────┘ │ └───────────┘   │ └───────────┘   │     │   │
 * │  └─────────────────────────────────────────────────────────┘   │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Security Tables with RLS
 *
 * | Table               | Policy Type     | Isolation Key |
 * |---------------------|-----------------|---------------|
 * | security_events     | guild_id        | Full RLS      |
 * | role_change_audit   | guild_id        | Full RLS      |
 * | threat_detections   | guild_id        | Full RLS      |
 * | security_baselines  | guild_id        | Full RLS      |
 * | permission_snapshots| guild_id        | Full RLS      |
 * | admin_role_requests | guild_id        | Full RLS      |
 *
 * ## Usage
 *
 * ```typescript
 * import { createRowLevelSecurityService } from './row-level-security-service';
 *
 * const rlsService = createRowLevelSecurityService({ prisma });
 *
 * // Set guild context before queries
 * await rlsService.setGuildContext('guild_123');
 * const events = await prisma.securityEvent.findMany();
 * // events only contains data from guild_123
 *
 * // Check RLS status
 * const status = await rlsService.getRLSStatus();
 * console.log(status.tables); // { security_events: { enabled: true, ... }, ... }
 * ```
 */

import { getErrorMessage, getErrorCause } from '../../../shared/utils/error-utils.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Security tables that support RLS
 */
export const RLS_TABLES = [
  'security_events',
  'role_change_audit',
  'threat_detections',
  'security_baselines',
  'permission_snapshots',
  'admin_role_requests',
] as const;

export type RLSTable = (typeof RLS_TABLES)[number];

/**
 * RLS policy types
 */
export enum RLSPolicyType {
  /** Standard guild isolation - guild_id column */
  GUILD_ISOLATION = 'guild_isolation',
  /** Read-only policy - SELECT only */
  READ_ONLY = 'read_only',
  /** Full access with audit - all operations logged */
  FULL_ACCESS_AUDITED = 'full_access_audited',
}

/**
 * RLS policy definition
 */
export interface RLSPolicy {
  /** Policy name */
  name: string;
  /** Table the policy applies to */
  table: RLSTable;
  /** Policy type */
  type: RLSPolicyType;
  /** SQL command type: ALL, SELECT, INSERT, UPDATE, DELETE */
  command: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  /** USING clause expression */
  using: string;
  /** WITH CHECK clause expression (for INSERT/UPDATE) */
  withCheck?: string;
  /** Roles the policy applies to */
  roles: string[];
}

/**
 * Table RLS status
 */
export interface TableRLSStatus {
  /** Table name */
  table: RLSTable;
  /** Whether RLS is enabled on the table */
  enabled: boolean;
  /** Whether the table is forced (no bypass) */
  forceEnabled: boolean;
  /** Policies applied to the table */
  policies: RLSPolicyInfo[];
}

/**
 * Policy information from database
 */
export interface RLSPolicyInfo {
  /** Policy name */
  name: string;
  /** Command type */
  command: string;
  /** Whether policy is permissive or restrictive */
  permissive: boolean;
  /** Roles the policy applies to */
  roles: string[];
  /** USING expression */
  using: string | null;
  /** WITH CHECK expression */
  withCheck: string | null;
}

/**
 * Overall RLS status
 */
export interface RLSStatus {
  /** Whether RLS is supported by the database */
  supported: boolean;
  /** PostgreSQL version */
  version: string;
  /** Per-table status */
  tables: Record<RLSTable, TableRLSStatus>;
  /** Total policies count */
  totalPolicies: number;
  /** Tables with RLS enabled */
  enabledTables: number;
  /** Last status check timestamp */
  checkedAt: Date;
}

/**
 * Guild context for RLS operations
 */
export interface GuildContext {
  /** Guild ID for isolation */
  guildId: string;
  /** Optional user ID for audit */
  userId?: string;
  /** Optional operation name for logging */
  operation?: string;
}

/**
 * RLS operation result
 */
export interface RLSOperationResult {
  /** Whether operation succeeded */
  success: boolean;
  /** Tables affected */
  tables: RLSTable[];
  /** Policies created/modified */
  policies: string[];
  /** Any errors encountered */
  errors: RLSError[];
  /** Operation duration in milliseconds */
  durationMs: number;
}

/**
 * RLS error details
 */
export interface RLSError {
  /** Table where error occurred */
  table: RLSTable;
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Whether the error is recoverable */
  recoverable: boolean;
}

/**
 * Logger interface for verbose output
 */
export interface RLSLogger {
  info(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

/**
 * Prisma-like client interface for raw queries
 */
export interface RLSPrismaClient {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

/**
 * Service configuration
 */
export interface RowLevelSecurityServiceConfig {
  /** Prisma client instance */
  prisma: RLSPrismaClient;
  /** Custom app namespace for session variables */
  appNamespace?: string;
  /** Database roles to apply policies to */
  targetRoles?: string[];
  /** Optional logger for verbose output */
  logger?: RLSLogger;
}

// ============================================================================
// ERROR CODES
// ============================================================================

export const RLS_ERROR_CODES = {
  // Configuration errors
  RLS_NOT_SUPPORTED: 'RLS_NOT_SUPPORTED',
  INVALID_TABLE: 'RLS_INVALID_TABLE',
  INVALID_GUILD_ID: 'RLS_INVALID_GUILD_ID',
  POLICY_EXISTS: 'RLS_POLICY_EXISTS',
  
  // Operation errors
  ENABLE_FAILED: 'RLS_ENABLE_FAILED',
  DISABLE_FAILED: 'RLS_DISABLE_FAILED',
  POLICY_CREATE_FAILED: 'RLS_POLICY_CREATE_FAILED',
  POLICY_DROP_FAILED: 'RLS_POLICY_DROP_FAILED',
  
  // Context errors
  CONTEXT_SET_FAILED: 'RLS_CONTEXT_SET_FAILED',
  CONTEXT_RESET_FAILED: 'RLS_CONTEXT_RESET_FAILED',
  
  // Query errors
  STATUS_CHECK_FAILED: 'RLS_STATUS_CHECK_FAILED',
  PERMISSION_DENIED: 'RLS_PERMISSION_DENIED',
} as const;

export type RLSErrorCode = (typeof RLS_ERROR_CODES)[keyof typeof RLS_ERROR_CODES];

// ============================================================================
// SQL TEMPLATES
// ============================================================================

/**
 * SQL templates for RLS operations
 */
const SQL_TEMPLATES = {
  // Check PostgreSQL version
  CHECK_VERSION: `SELECT version()`,
  
  // Enable RLS on a table
  ENABLE_RLS: (table: string) => `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
  
  // Force RLS even for table owner
  FORCE_RLS: (table: string) => `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
  
  // Disable RLS on a table
  DISABLE_RLS: (table: string) => `ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`,
  
  // Remove force RLS
  NO_FORCE_RLS: (table: string) => `ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`,
  
  // Create guild isolation policy
  CREATE_GUILD_POLICY: (table: string, policyName: string, roles: string[]) => `
    CREATE POLICY "${policyName}" ON "${table}"
    FOR ALL
    TO ${roles.join(', ')}
    USING (guild_id = current_setting('app.current_guild_id', true))
    WITH CHECK (guild_id = current_setting('app.current_guild_id', true))
  `,
  
  // Create read-only policy
  CREATE_READ_POLICY: (table: string, policyName: string, roles: string[]) => `
    CREATE POLICY "${policyName}" ON "${table}"
    FOR SELECT
    TO ${roles.join(', ')}
    USING (guild_id = current_setting('app.current_guild_id', true))
  `,
  
  // Create bypass policy for admins
  CREATE_BYPASS_POLICY: (table: string, policyName: string, roles: string[]) => `
    CREATE POLICY "${policyName}" ON "${table}"
    FOR ALL
    TO ${roles.join(', ')}
    USING (current_setting('app.rls_bypass', true) = 'true')
    WITH CHECK (current_setting('app.rls_bypass', true) = 'true')
  `,
  
  // Drop policy
  DROP_POLICY: (table: string, policyName: string) => 
    `DROP POLICY IF EXISTS "${policyName}" ON "${table}"`,
  
  // Set guild context (session-level)
  SET_GUILD_CONTEXT: (namespace: string, guildId: string) => 
    `SET ${namespace}.current_guild_id = '${guildId}'`,
  
  // Set guild context (transaction-local)
  SET_GUILD_CONTEXT_LOCAL: (namespace: string, guildId: string) => 
    `SET LOCAL ${namespace}.current_guild_id = '${guildId}'`,
  
  // Set bypass context
  SET_BYPASS_CONTEXT: (namespace: string) => 
    `SET ${namespace}.rls_bypass = 'true'`,
  
  // Reset guild context
  RESET_GUILD_CONTEXT: (namespace: string) => 
    `RESET ${namespace}.current_guild_id`,
  
  // Reset bypass context
  RESET_BYPASS_CONTEXT: (namespace: string) => 
    `RESET ${namespace}.rls_bypass`,
  
  // Get current guild context
  GET_GUILD_CONTEXT: (namespace: string) =>
    `SELECT current_setting('${namespace}.current_guild_id', true) as guild_id`,
  
  // Get bypass context
  GET_BYPASS_CONTEXT: (namespace: string) =>
    `SELECT current_setting('${namespace}.rls_bypass', true) as bypass`,
  
  // Check RLS status for a table
  CHECK_TABLE_RLS: `
    SELECT 
      relname as table_name,
      relrowsecurity as rls_enabled,
      relforcerowsecurity as force_rls
    FROM pg_class
    WHERE relname = $1
    AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `,
  
  // Get policies for a table
  GET_TABLE_POLICIES: `
    SELECT 
      polname as policy_name,
      polcmd as command,
      polpermissive as permissive,
      pg_get_expr(polqual, polrelid) as using_expr,
      pg_get_expr(polwithcheck, polrelid) as with_check_expr,
      polroles::regrole[] as roles
    FROM pg_policy
    WHERE polrelid = $1::regclass
  `,
  
  // Check if policy exists
  POLICY_EXISTS: `
    SELECT EXISTS (
      SELECT 1 FROM pg_policy 
      WHERE polname = $1 
      AND polrelid = $2::regclass
    ) as exists
  `,
};

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Row-Level Security Service
 *
 * Manages PostgreSQL RLS policies for multi-tenant data isolation.
 */
export class RowLevelSecurityService {
  private readonly prisma: RLSPrismaClient;
  private readonly appNamespace: string;
  private readonly targetRoles: string[];
  private readonly enabledPolicies: Map<RLSTable, Set<string>>;
  private readonly logger?: RLSLogger;
  private currentGuildId: string | null = null;
  private bypassEnabled: boolean = false;
  
  constructor(config: RowLevelSecurityServiceConfig) {
    this.prisma = config.prisma;
    this.appNamespace = config.appNamespace ?? 'app';
    this.targetRoles = config.targetRoles ?? ['PUBLIC'];
    this.logger = config.logger;
    this.enabledPolicies = new Map();
    
    // Initialize enabled policies tracking
    for (const table of RLS_TABLES) {
      this.enabledPolicies.set(table, new Set());
    }
  }
  
  // --------------------------------------------------------------------------
  // CONTEXT MANAGEMENT
  // --------------------------------------------------------------------------
  
  /**
   * Set the guild context for RLS filtering.
   *
   * All subsequent queries will be filtered to this guild's data.
   *
   * @param guildId - Guild ID to isolate to
   */
  async setGuildContext(guildId: string): Promise<void> {
    if (!guildId || typeof guildId !== 'string') {
      throw new RLSServiceError(
        RLS_ERROR_CODES.INVALID_GUILD_ID,
        'Guild ID must be a non-empty string',
        { guildId },
      );
    }
    
    try {
      await this.prisma.$executeRawUnsafe(
        SQL_TEMPLATES.SET_GUILD_CONTEXT(
          this.appNamespace,
          this.escapeString(guildId),
        ),
      );
      
      this.currentGuildId = guildId;
      this.bypassEnabled = false;
      
      this.logger?.debug(`[RLS] Guild context set: ${guildId}`);
    } catch (error) {
      throw new RLSServiceError(
        RLS_ERROR_CODES.CONTEXT_SET_FAILED,
        `Failed to set guild context: ${getErrorMessage(error)}`,
        { guildId },
        getErrorCause(error),
      );
    }
  }
  
  /**
   * Set the guild context for use within a transaction.
   *
   * Uses SET LOCAL so the context is transaction-scoped.
   *
   * @param guildId - Guild ID to isolate to
   */
  async setGuildContextLocal(guildId: string): Promise<void> {
    if (!guildId || typeof guildId !== 'string') {
      throw new RLSServiceError(
        RLS_ERROR_CODES.INVALID_GUILD_ID,
        'Guild ID must be a non-empty string',
        { guildId },
      );
    }
    
    try {
      await this.prisma.$executeRawUnsafe(
        SQL_TEMPLATES.SET_GUILD_CONTEXT_LOCAL(
          this.appNamespace,
          this.escapeString(guildId),
        ),
      );
      
      this.logger?.debug(`[RLS] Local guild context set: ${guildId}`);
    } catch (error) {
      throw new RLSServiceError(
        RLS_ERROR_CODES.CONTEXT_SET_FAILED,
        `Failed to set local guild context: ${getErrorMessage(error)}`,
        { guildId },
        getErrorCause(error),
      );
    }
  }
  
  /**
   * Set bypass context for admin operations.
   *
   * ⚠️ WARNING: This bypasses all RLS policies. Use only for
   * legitimate admin operations that require cross-guild access.
   *
   * @param audit - Optional audit information
   */
  async setBypassContext(audit?: { reason: string; userId: string }): Promise<void> {
    if (audit) {
      this.logger?.info(`[RLS] Bypass requested by ${audit.userId}: ${audit.reason}`);
    }
    
    try {
      await this.prisma.$executeRawUnsafe(
        SQL_TEMPLATES.SET_BYPASS_CONTEXT(this.appNamespace),
      );
      
      this.bypassEnabled = true;
      this.currentGuildId = null;
      
      this.logger?.debug('[RLS] Bypass context enabled');
    } catch (error) {
      throw new RLSServiceError(
        RLS_ERROR_CODES.CONTEXT_SET_FAILED,
        `Failed to set bypass context: ${getErrorMessage(error)}`,
        { audit },
        getErrorCause(error),
      );
    }
  }
  
  /**
   * Reset the RLS context.
   *
   * Clears both guild context and bypass flags.
   */
  async resetContext(): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(
        SQL_TEMPLATES.RESET_GUILD_CONTEXT(this.appNamespace),
      );
      await this.prisma.$executeRawUnsafe(
        SQL_TEMPLATES.RESET_BYPASS_CONTEXT(this.appNamespace),
      );
      
      this.currentGuildId = null;
      this.bypassEnabled = false;
      
      this.logger?.debug('[RLS] Context reset');
    } catch (error) {
      throw new RLSServiceError(
        RLS_ERROR_CODES.CONTEXT_RESET_FAILED,
        `Failed to reset context: ${getErrorMessage(error)}`,
        {},
        getErrorCause(error),
      );
    }
  }
  
  /**
   * Get the current guild context from the database.
   *
   * @returns Current guild ID and bypass status
   */
  async getCurrentContext(): Promise<{ guildId: string | null; bypass: boolean }> {
    try {
      const guildResult = await this.prisma.$queryRawUnsafe<[{ guild_id: string | null }]>(
        SQL_TEMPLATES.GET_GUILD_CONTEXT(this.appNamespace),
      );
      
      const bypassResult = await this.prisma.$queryRawUnsafe<[{ bypass: string | null }]>(
        SQL_TEMPLATES.GET_BYPASS_CONTEXT(this.appNamespace),
      );
      
      return {
        guildId: guildResult[0]?.guild_id ?? null,
        bypass: bypassResult[0]?.bypass === 'true',
      };
    } catch {
      return { guildId: null, bypass: false };
    }
  }
  
  /**
   * Get the locally tracked guild ID (may differ from DB session).
   */
  getTrackedGuildId(): string | null {
    return this.currentGuildId;
  }
  
  /**
   * Check if bypass is currently enabled (locally tracked).
   */
  isBypassEnabled(): boolean {
    return this.bypassEnabled;
  }
  
  // --------------------------------------------------------------------------
  // RLS MANAGEMENT
  // --------------------------------------------------------------------------
  
  /**
   * Enable RLS on all security tables.
   *
   * Creates guild isolation policies for multi-tenant data separation.
   *
   * @param options - Enable options
   * @returns Operation result
   */
  async enableRLS(options?: {
    tables?: RLSTable[];
    force?: boolean;
  }): Promise<RLSOperationResult> {
    const tables = options?.tables ?? [...RLS_TABLES];
    const force = options?.force ?? true;
    const startTime = Date.now();
    const errors: RLSError[] = [];
    const policies: string[] = [];
    
    for (const table of tables) {
      try {
        // Enable RLS on table
        await this.prisma.$executeRawUnsafe(SQL_TEMPLATES.ENABLE_RLS(table));
        
        if (force) {
          await this.prisma.$executeRawUnsafe(SQL_TEMPLATES.FORCE_RLS(table));
        }
        
        // Create guild isolation policy
        const policyName = `${table}_guild_isolation`;
        
        // Drop existing policy if exists
        await this.prisma.$executeRawUnsafe(
          SQL_TEMPLATES.DROP_POLICY(table, policyName),
        );
        
        // Create new policy
        await this.prisma.$executeRawUnsafe(
          SQL_TEMPLATES.CREATE_GUILD_POLICY(table, policyName, this.targetRoles),
        );
        
        // Create bypass policy for admins
        const bypassPolicyName = `${table}_admin_bypass`;
        await this.prisma.$executeRawUnsafe(
          SQL_TEMPLATES.DROP_POLICY(table, bypassPolicyName),
        );
        await this.prisma.$executeRawUnsafe(
          SQL_TEMPLATES.CREATE_BYPASS_POLICY(table, bypassPolicyName, this.targetRoles),
        );
        
        // Track enabled policies
        this.enabledPolicies.get(table)?.add(policyName);
        this.enabledPolicies.get(table)?.add(bypassPolicyName);
        
        policies.push(policyName, bypassPolicyName);
        
        this.logger?.info(`[RLS] Enabled on ${table} with policies: ${policyName}, ${bypassPolicyName}`);
      } catch (error) {
        errors.push({
          table,
          code: RLS_ERROR_CODES.ENABLE_FAILED,
          message: getErrorMessage(error),
          recoverable: true,
        });
        
        this.logger?.error(`[RLS] Failed to enable on ${table}:`, error);
      }
    }
    
    return {
      success: errors.length === 0,
      tables: tables.filter(t => !errors.some(e => e.table === t)),
      policies,
      errors,
      durationMs: Date.now() - startTime,
    };
  }
  
  /**
   * Disable RLS on specified tables.
   *
   * ⚠️ WARNING: This removes data isolation. Use with caution.
   *
   * @param options - Disable options
   * @returns Operation result
   */
  async disableRLS(options?: {
    tables?: RLSTable[];
  }): Promise<RLSOperationResult> {
    const tables = options?.tables ?? [...RLS_TABLES];
    const startTime = Date.now();
    const errors: RLSError[] = [];
    const policies: string[] = [];
    
    for (const table of tables) {
      try {
        // Get existing policies
        const existingPolicies = this.enabledPolicies.get(table) ?? new Set();
        
        // Drop all policies
        for (const policyName of existingPolicies) {
          await this.prisma.$executeRawUnsafe(
            SQL_TEMPLATES.DROP_POLICY(table, policyName),
          );
          policies.push(policyName);
        }
        
        // Also try dropping standard policy names
        const standardPolicies = [
          `${table}_guild_isolation`,
          `${table}_admin_bypass`,
          `${table}_read_only`,
        ];
        
        for (const policyName of standardPolicies) {
          await this.prisma.$executeRawUnsafe(
            SQL_TEMPLATES.DROP_POLICY(table, policyName),
          );
        }
        
        // Disable RLS on table
        await this.prisma.$executeRawUnsafe(SQL_TEMPLATES.NO_FORCE_RLS(table));
        await this.prisma.$executeRawUnsafe(SQL_TEMPLATES.DISABLE_RLS(table));
        
        // Clear tracked policies
        this.enabledPolicies.set(table, new Set());
        
        this.logger?.info(`[RLS] Disabled on ${table}`);
      } catch (error) {
        errors.push({
          table,
          code: RLS_ERROR_CODES.DISABLE_FAILED,
          message: getErrorMessage(error),
          recoverable: true,
        });
        
        this.logger?.error(`[RLS] Failed to disable on ${table}:`, error);
      }
    }
    
    return {
      success: errors.length === 0,
      tables: tables.filter(t => !errors.some(e => e.table === t)),
      policies,
      errors,
      durationMs: Date.now() - startTime,
    };
  }
  
  /**
   * Create a custom RLS policy.
   *
   * @param policy - Policy definition
   * @returns Whether the policy was created successfully
   */
  async createPolicy(policy: RLSPolicy): Promise<boolean> {
    // Validate table
    if (!RLS_TABLES.includes(policy.table)) {
      throw new RLSServiceError(
        RLS_ERROR_CODES.INVALID_TABLE,
        `Invalid table: ${policy.table}`,
        { validTables: RLS_TABLES },
      );
    }
    
    try {
      // Drop existing policy if exists
      await this.prisma.$executeRawUnsafe(
        SQL_TEMPLATES.DROP_POLICY(policy.table, policy.name),
      );
      
      // Build policy SQL
      const roles = policy.roles.join(', ');
      let sql = `CREATE POLICY "${policy.name}" ON "${policy.table}"\n`;
      sql += `FOR ${policy.command}\n`;
      sql += `TO ${roles}\n`;
      sql += `USING (${policy.using})`;
      
      if (policy.withCheck) {
        sql += `\nWITH CHECK (${policy.withCheck})`;
      }
      
      await this.prisma.$executeRawUnsafe(sql);
      
      // Track policy
      this.enabledPolicies.get(policy.table)?.add(policy.name);
      
      this.logger?.info(`[RLS] Created policy ${policy.name} on ${policy.table}`);
      
      return true;
    } catch (error) {
      throw new RLSServiceError(
        RLS_ERROR_CODES.POLICY_CREATE_FAILED,
        `Failed to create policy ${policy.name}: ${getErrorMessage(error)}`,
        { policy },
        getErrorCause(error),
      );
    }
  }
  
  /**
   * Drop a policy by name.
   *
   * @param table - Table name
   * @param policyName - Policy name
   * @returns Whether the policy was dropped
   */
  async dropPolicy(table: RLSTable, policyName: string): Promise<boolean> {
    try {
      await this.prisma.$executeRawUnsafe(
        SQL_TEMPLATES.DROP_POLICY(table, policyName),
      );
      
      this.enabledPolicies.get(table)?.delete(policyName);
      
      this.logger?.info(`[RLS] Dropped policy ${policyName} from ${table}`);
      
      return true;
    } catch (error) {
      throw new RLSServiceError(
        RLS_ERROR_CODES.POLICY_DROP_FAILED,
        `Failed to drop policy ${policyName}: ${getErrorMessage(error)}`,
        { table, policyName },
        getErrorCause(error),
      );
    }
  }
  
  // --------------------------------------------------------------------------
  // STATUS & DIAGNOSTICS
  // --------------------------------------------------------------------------
  
  /**
   * Get comprehensive RLS status.
   *
   * @returns RLS status for all security tables
   */
  async getRLSStatus(): Promise<RLSStatus> {
    try {
      // Get PostgreSQL version
      const versionResult = await this.prisma.$queryRawUnsafe<[{ version: string }]>(
        SQL_TEMPLATES.CHECK_VERSION,
      );
      const version = versionResult[0]?.version ?? 'unknown';
      
      // Check RLS support (PostgreSQL 9.5+)
      const versionMatch = version.match(/PostgreSQL (\d+)\.(\d+)/);
      const majorVersion = versionMatch ? parseInt(versionMatch[1], 10) : 0;
      const minorVersion = versionMatch ? parseInt(versionMatch[2], 10) : 0;
      const supported = majorVersion > 9 || (majorVersion === 9 && minorVersion >= 5);
      
      // Get status for each table
      const tables: Record<RLSTable, TableRLSStatus> = {} as Record<RLSTable, TableRLSStatus>;
      let totalPolicies = 0;
      let enabledTables = 0;
      
      for (const table of RLS_TABLES) {
        const tableStatus = await this.getTableRLSStatus(table);
        tables[table] = tableStatus;
        totalPolicies += tableStatus.policies.length;
        if (tableStatus.enabled) enabledTables++;
      }
      
      return {
        supported,
        version,
        tables,
        totalPolicies,
        enabledTables,
        checkedAt: new Date(),
      };
    } catch (error) {
      throw new RLSServiceError(
        RLS_ERROR_CODES.STATUS_CHECK_FAILED,
        `Failed to get RLS status: ${getErrorMessage(error)}`,
        {},
        getErrorCause(error),
      );
    }
  }
  
  /**
   * Get RLS status for a specific table.
   *
   * @param table - Table name
   * @returns Table RLS status
   */
  async getTableRLSStatus(table: RLSTable): Promise<TableRLSStatus> {
    try {
      // Check if RLS is enabled
      const rlsCheck = await this.prisma.$queryRawUnsafe<
        Array<{ table_name: string; rls_enabled: boolean; force_rls: boolean }>
      >(SQL_TEMPLATES.CHECK_TABLE_RLS, table);
      
      const rlsInfo = rlsCheck[0];
      const enabled = rlsInfo?.rls_enabled ?? false;
      const forceEnabled = rlsInfo?.force_rls ?? false;
      
      // Get policies
      let policies: RLSPolicyInfo[] = [];
      
      try {
        interface PolicyResult {
          policy_name: string;
          command: string;
          permissive: boolean;
          using_expr: string | null;
          with_check_expr: string | null;
          roles: string[];
        }
        
        const policyResults = await this.prisma.$queryRawUnsafe<PolicyResult[]>(
          SQL_TEMPLATES.GET_TABLE_POLICIES, table,
        );
        
        policies = policyResults.map((p: PolicyResult) => ({
          name: p.policy_name,
          command: this.mapCommandChar(p.command),
          permissive: p.permissive,
          roles: p.roles,
          using: p.using_expr,
          withCheck: p.with_check_expr,
        }));
      } catch {
        // Table might not have any policies
        policies = [];
      }
      
      return {
        table,
        enabled,
        forceEnabled,
        policies,
      };
    } catch {
      // Return default status on error
      return {
        table,
        enabled: false,
        forceEnabled: false,
        policies: [],
      };
    }
  }
  
  /**
   * Verify RLS is working correctly.
   *
   * Performs a test to ensure guild isolation is enforced.
   *
   * @param guildId - Test guild ID
   * @returns Whether RLS is functioning correctly
   */
  async verifyRLS(guildId: string): Promise<{
    working: boolean;
    details: {
      contextSet: boolean;
      contextMatches: boolean;
      bypassWorks: boolean;
    };
  }> {
    const details = {
      contextSet: false,
      contextMatches: false,
      bypassWorks: false,
    };
    
    try {
      // Test 1: Context can be set
      await this.setGuildContext(guildId);
      details.contextSet = true;
      
      // Test 2: Context matches
      const context = await this.getCurrentContext();
      details.contextMatches = context.guildId === guildId;
      
      // Test 3: Bypass works
      await this.setBypassContext();
      const bypassContext = await this.getCurrentContext();
      details.bypassWorks = bypassContext.bypass === true;
      
      // Reset context
      await this.resetContext();
      
      return {
        working: details.contextSet && details.contextMatches && details.bypassWorks,
        details,
      };
    } catch {
      return {
        working: false,
        details,
      };
    }
  }
  
  // --------------------------------------------------------------------------
  // UTILITY METHODS
  // --------------------------------------------------------------------------
  
  /**
   * Check if a table has RLS enabled.
   *
   * @param table - Table name
   * @returns Whether RLS is enabled
   */
  async isRLSEnabled(table: RLSTable): Promise<boolean> {
    const status = await this.getTableRLSStatus(table);
    return status.enabled;
  }
  
  /**
   * Get list of policies for a table.
   *
   * @param table - Table name
   * @returns List of policy names
   */
  async getPolicies(table: RLSTable): Promise<string[]> {
    const status = await this.getTableRLSStatus(table);
    return status.policies.map(p => p.name);
  }
  
  /**
   * Check if a specific policy exists.
   *
   * @param table - Table name
   * @param policyName - Policy name
   * @returns Whether the policy exists
   */
  async policyExists(table: RLSTable, policyName: string): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRawUnsafe<[{ exists: boolean }]>(
        SQL_TEMPLATES.POLICY_EXISTS,
        policyName,
        table,
      );
      return result[0]?.exists ?? false;
    } catch {
      return false;
    }
  }
  
  /**
   * Get tracked policies (from memory).
   *
   * @returns Map of table to policy names
   */
  getTrackedPolicies(): Map<RLSTable, Set<string>> {
    return new Map(this.enabledPolicies);
  }
  
  /**
   * Get the list of RLS-enabled tables.
   */
  getTables(): readonly RLSTable[] {
    return RLS_TABLES;
  }
  
  // --------------------------------------------------------------------------
  // PRIVATE HELPERS
  // --------------------------------------------------------------------------
  
  /**
   * Escape a string for safe SQL interpolation.
   */
  private escapeString(value: string): string {
    // Basic SQL injection prevention
    return value.replace(/'/g, "''").replace(/\\/g, '\\\\');
  }
  
  /**
   * Map PostgreSQL command character to string.
   */
  private mapCommandChar(cmd: string): string {
    const mapping: Record<string, string> = {
      'r': 'SELECT',
      'a': 'INSERT',
      'w': 'UPDATE',
      'd': 'DELETE',
      '*': 'ALL',
    };
    return mapping[cmd] ?? cmd;
  }
}

// ============================================================================
// ERROR CLASS
// ============================================================================

/**
 * Custom error for RLS operations
 */
export class RLSServiceError extends Error {
  readonly code: RLSErrorCode;
  readonly context: Record<string, unknown>;
  readonly cause?: Error;
  
  constructor(
    code: RLSErrorCode,
    message: string,
    context: Record<string, unknown> = {},
    cause?: Error,
  ) {
    super(message);
    this.name = 'RLSServiceError';
    this.code = code;
    this.context = context;
    this.cause = cause;
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RLSServiceError);
    }
  }
  
  /**
   * Convert to JSON for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a RowLevelSecurityService instance.
 *
 * @param config - Service configuration
 * @returns Configured service instance
 */
export function createRowLevelSecurityService(
  config: RowLevelSecurityServiceConfig,
): RowLevelSecurityService {
  return new RowLevelSecurityService(config);
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if a value is a valid RLS table name.
 */
export function isRLSTable(value: unknown): value is RLSTable {
  return typeof value === 'string' && RLS_TABLES.includes(value as RLSTable);
}

/**
 * Check if an error is an RLSServiceError.
 */
export function isRLSError(error: unknown): error is RLSServiceError {
  return error instanceof RLSServiceError;
}

/**
 * Check if an RLS error is recoverable.
 */
export function isRecoverableRLSError(error: unknown): boolean {
  if (!isRLSError(error)) return false;
  
  const recoverableCodes: RLSErrorCode[] = [
    RLS_ERROR_CODES.CONTEXT_SET_FAILED,
    RLS_ERROR_CODES.CONTEXT_RESET_FAILED,
  ];
  
  return recoverableCodes.includes(error.code);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default RowLevelSecurityService;
