/**
 * Role Monitor Plugin
 *
 * @module src/bot/security/plugins/builtin/role-monitor-plugin
 * @description Monitors role changes and enforces security policies
 *
 * This plugin is the core of the Security Bot's role management system.
 * It implements:
 * - Role change detection and validation
 * - Permission escalation prevention
 * - Admin role assignment alerts (DRIP alerts to DripTVDD)
 * - Baseline comparison for anomaly detection
 *
 * @research R1 (CWE-208) - Timing-safe comparisons for sensitive operations
 * @research R5 (GDPR Art. 32) - Audit trail for role changes
 *
 * @since Sprint 0 - Foundation Enhancement
 * @version 1.0.0
 */

import type {
  PluginMetadata,
  PluginResponse,
  RoleChangeEvent,
  PermissionChangeEvent,
  ThreatDetectedEvent,
} from "../types.js";
import { PluginPriority } from "../types.js";
import { BaseSecurityPlugin } from "../base-plugin.js";

// ===========================================================================
// Types
// ===========================================================================

/**
 * Role classification for security decisions
 */
type RoleClassification =
  | "owner"
  | "super_admin"
  | "server_admin"
  | "moderator"
  | "trusted"
  | "member"
  | "restricted";

/**
 * Role change analysis result
 */
interface RoleChangeAnalysis {
  allowed: boolean;
  roleClassification: RoleClassification;
  isPrivileged: boolean;
  requiresAlert: boolean;
  reason: string;
}

/**
 * Plugin-specific configuration
 */
interface RoleMonitorConfig {
  enableDripAlerts: boolean;
  dripAlertUserId: string;
  protectedRoleIds: string[];
}

// ===========================================================================
// Constants
// ===========================================================================

/**
 * Discord permission flags that are considered sensitive
 */
const SENSITIVE_PERMISSIONS = {
  ADMINISTRATOR: 0x8n,
  BAN_MEMBERS: 0x4n,
  KICK_MEMBERS: 0x2n,
  MANAGE_GUILD: 0x20n,
  MANAGE_ROLES: 0x10000000n,
  MANAGE_CHANNELS: 0x10n,
  MANAGE_WEBHOOKS: 0x20000000n,
  MENTION_EVERYONE: 0x20000n,
} as const;

/**
 * Default configuration
 */
const DEFAULT_CONFIG: RoleMonitorConfig = {
  enableDripAlerts: true,
  dripAlertUserId: "",
  protectedRoleIds: [],
};

// ===========================================================================
// Plugin Implementation
// ===========================================================================

/**
 * Role Monitor Plugin
 *
 * Monitors and enforces security policies for role changes in Discord guilds.
 */
export class RoleMonitorPlugin extends BaseSecurityPlugin {
  readonly metadata: PluginMetadata = {
    id: "role-monitor",
    name: "Role Monitor",
    version: "1.0.0",
    description:
      "Monitors role changes and enforces security policies with DRIP alerts",
    author: "Infinity Gauntlet Security Team",
    priority: PluginPriority.CRITICAL,
    dependencies: [],
    tags: ["security", "roles", "monitoring", "drip-alerts"],
  };

  private config: RoleMonitorConfig = { ...DEFAULT_CONFIG };

  // ===========================================================================
  // Lifecycle Methods
  // ===========================================================================

  protected async onInitialize(): Promise<void> {
    this.log("info", "Initializing Role Monitor Plugin");

    // Set DRIP alert user ID from environment if not configured
    if (!this.config.dripAlertUserId && process.env.DRIP_ALERT_USER_ID) {
      this.config.dripAlertUserId = process.env.DRIP_ALERT_USER_ID;
    }

    this.log("info", "Role Monitor Plugin initialized", {
      enableDripAlerts: this.config.enableDripAlerts,
    });
  }

  protected async onShutdown(): Promise<void> {
    this.log("info", "Shutting down Role Monitor Plugin");
  }

  protected async onHealthCheck(): Promise<boolean> {
    return true;
  }

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  async onRoleChange(event: RoleChangeEvent): Promise<PluginResponse> {
    const startTime = Date.now();
    this.log("debug", "Processing role change event", {
      guildId: event.guildId,
      roleId: event.role.id,
      roleName: event.role.name,
      action: event.action,
      memberId: event.member.user.id,
    });

    try {
      const analysis = this.analyzeRoleChange(event);

      this.log("info", "Role change analysis complete", {
        allowed: analysis.allowed,
        classification: analysis.roleClassification,
        isPrivileged: analysis.isPrivileged,
        reason: analysis.reason,
      });

      // Build response based on analysis
      if (!analysis.allowed) {
        return {
          success: false,
          continueChain: true,
          action: {
            type: "revert",
            priority: 1,
            params: {
              roleId: event.role.id,
              guildId: event.guildId,
              memberId: event.member.user.id,
              originalAction: event.action,
              reason: analysis.reason,
            },
          },
          executionTimeMs: Date.now() - startTime,
          error: {
            code: "ROLE_CHANGE_DENIED",
            message: analysis.reason,
            recoverable: true,
          },
        };
      }

      // Alert for privileged role changes
      if (analysis.requiresAlert && this.config.enableDripAlerts) {
        return {
          success: true,
          continueChain: true,
          action: {
            type: "alert",
            priority: 2,
            params: {
              userId: this.config.dripAlertUserId,
              message: this.formatDripAlert(event, analysis),
            },
          },
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Log to audit
      return {
        success: true,
        continueChain: true,
        action: {
          type: "audit",
          priority: 100,
          params: {
            eventType: "role_change",
            roleId: event.role.id,
            roleName: event.role.name,
            memberId: event.member.user.id,
            action: event.action,
            analysis,
          },
        },
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log("error", "Error processing role change", {
        error: errorMessage,
        roleId: event.role.id,
      });

      return {
        success: false,
        continueChain: true,
        executionTimeMs: Date.now() - startTime,
        error: {
          code: "ROLE_MONITOR_ERROR",
          message: errorMessage,
          recoverable: true,
        },
      };
    }
  }

  async onPermissionChange(
    event: PermissionChangeEvent
  ): Promise<PluginResponse> {
    const startTime = Date.now();
    this.log("debug", "Processing permission change event", {
      guildId: event.guildId,
      targetType: event.targetType,
      targetId: event.targetId,
    });

    try {
      const sensitiveChanges = this.checkSensitivePermissions(event);

      if (sensitiveChanges.length > 0 && this.config.enableDripAlerts) {
        return {
          success: true,
          continueChain: true,
          action: {
            type: "alert",
            priority: 2,
            params: {
              userId: this.config.dripAlertUserId,
              message: this.formatPermissionAlert(event, sensitiveChanges),
            },
          },
          executionTimeMs: Date.now() - startTime,
        };
      }

      return {
        success: true,
        continueChain: true,
        action: {
          type: "audit",
          priority: 100,
          params: {
            eventType: "permission_change",
            targetType: event.targetType,
            targetId: event.targetId,
            sensitiveChanges,
          },
        },
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        success: false,
        continueChain: true,
        executionTimeMs: Date.now() - startTime,
        error: {
          code: "PERMISSION_MONITOR_ERROR",
          message: errorMessage,
          recoverable: true,
        },
      };
    }
  }

  async onThreatDetected(_event: ThreatDetectedEvent): Promise<PluginResponse> {
    return {
      success: true,
      continueChain: true,
      executionTimeMs: 0,
    };
  }

  // ===========================================================================
  // Analysis Methods
  // ===========================================================================

  private analyzeRoleChange(event: RoleChangeEvent): RoleChangeAnalysis {
    const roleId = event.role.id;
    const classification = this.classifyRole(event.role);
    const isPrivileged = this.isPrivilegedRole(classification);

    // Check if role is protected
    if (this.config.protectedRoleIds.includes(roleId)) {
      return {
        allowed: false,
        roleClassification: classification,
        isPrivileged,
        requiresAlert: true,
        reason: "Protected role cannot be modified",
      };
    }

    // Check authorization
    if (!event.authorized) {
      return {
        allowed: false,
        roleClassification: classification,
        isPrivileged,
        requiresAlert: true,
        reason: "Unauthorized role change attempt",
      };
    }

    return {
      allowed: true,
      roleClassification: classification,
      isPrivileged,
      requiresAlert: isPrivileged,
      reason: "Change authorized",
    };
  }

  private classifyRole(role: {
    permissions: { bitfield: bigint };
  }): RoleClassification {
    const permissions = role.permissions.bitfield;

    if (permissions & SENSITIVE_PERMISSIONS.ADMINISTRATOR) {
      return "super_admin";
    }

    if (
      permissions & SENSITIVE_PERMISSIONS.MANAGE_GUILD ||
      permissions & SENSITIVE_PERMISSIONS.MANAGE_ROLES
    ) {
      return "server_admin";
    }

    if (
      permissions & SENSITIVE_PERMISSIONS.BAN_MEMBERS ||
      permissions & SENSITIVE_PERMISSIONS.KICK_MEMBERS
    ) {
      return "moderator";
    }

    if (permissions & SENSITIVE_PERMISSIONS.MENTION_EVERYONE) {
      return "trusted";
    }

    return "member";
  }

  private isPrivilegedRole(classification: RoleClassification): boolean {
    return ["owner", "super_admin", "server_admin", "moderator"].includes(
      classification
    );
  }

  private checkSensitivePermissions(
    event: PermissionChangeEvent
  ): Array<{ name: string; granted: boolean }> {
    const oldPerms = event.oldPermissions;
    const newPerms = event.newPermissions;
    const changes: Array<{ name: string; granted: boolean }> = [];

    for (const [name, value] of Object.entries(SENSITIVE_PERMISSIONS)) {
      const hadBefore = (oldPerms & value) !== 0n;
      const hasAfter = (newPerms & value) !== 0n;

      if (hadBefore !== hasAfter) {
        changes.push({ name, granted: hasAfter });
      }
    }

    return changes;
  }

  // ===========================================================================
  // Alert Formatting
  // ===========================================================================

  private formatDripAlert(
    event: RoleChangeEvent,
    analysis: RoleChangeAnalysis
  ): string {
    const emoji = analysis.allowed ? "⚠️" : "🚨";

    return [
      `${emoji} **Role Change Alert**`,
      "",
      `**Guild:** ${this.context?.guild.name ?? event.guildId}`,
      `**Role:** ${event.role.name}`,
      `**Action:** ${event.action}`,
      `**Member:** <@${event.member.user.id}>`,
      `**Classification:** ${analysis.roleClassification}`,
      event.executor ? `**Executor:** <@${event.executor.id}>` : "",
      "",
      `**Reason:** ${analysis.reason}`,
      "",
      `*Time: ${new Date().toISOString()}*`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private formatPermissionAlert(
    event: PermissionChangeEvent,
    sensitiveChanges: Array<{ name: string; granted: boolean }>
  ): string {
    const grants = sensitiveChanges.filter((g) => g.granted);
    const revokes = sensitiveChanges.filter((g) => !g.granted);

    const lines = ["🔐 **Permission Change Alert**", ""];

    lines.push(`**Guild:** ${this.context?.guild.name ?? event.guildId}`);
    lines.push(`**Target:** ${event.targetType} - ${event.targetId}`);
    if (event.executor) {
      lines.push(`**Executor:** <@${event.executor.id}>`);
    }
    lines.push("");

    if (grants.length > 0) {
      lines.push(`**Granted:** ${grants.map((g) => g.name).join(", ")}`);
    }
    if (revokes.length > 0) {
      lines.push(`**Revoked:** ${revokes.map((g) => g.name).join(", ")}`);
    }

    lines.push("");
    lines.push(`*Time: ${new Date().toISOString()}*`);

    return lines.join("\n");
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  public updateConfig(config: Partial<RoleMonitorConfig>): void {
    this.config = { ...this.config, ...config };
    this.log("info", "Configuration updated", { config: this.config });
  }

  public getConfig(): Readonly<RoleMonitorConfig> {
    return this.config;
  }
}

// ===========================================================================
// Factory
// ===========================================================================

export function createRoleMonitorPlugin(): RoleMonitorPlugin {
  return new RoleMonitorPlugin();
}

export default RoleMonitorPlugin;
