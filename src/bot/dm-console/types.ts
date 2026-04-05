/**
 * DripBot DM Management Console — Type Definitions
 *
 * Custom ID convention:  dc:<panel>:<action>
 * Examples:
 *   dc:nav:main        — Navigate to main menu
 *   dc:nav:overview    — Navigate to overview panel
 *   dc:sec:roles       — Security → Roles subpanel
 *   dc:sys:pause       — System → Pause sweep action
 *   dc:page:roles:2    — Paginate roles page 2
 */

import type {
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  Guild,
  User,
  ButtonInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import type { PrismaClient } from '@prisma/client';

// ─── Custom ID Prefix ────────────────────────────────────────────────────────

/** All console custom IDs start with this prefix for routing. */
export const CONSOLE_PREFIX = 'dc:';

// ─── Panel IDs ───────────────────────────────────────────────────────────────

export const Panel = {
  // Top-level navigation
  MAIN:        'nav:main',
  OVERVIEW:    'nav:overview',
  SECURITY:    'nav:security',
  SYSTEM:      'nav:system',
  LOGS:        'nav:logs',

  // Security sub-panels
  SEC_ROLES:   'sec:roles',
  SEC_MEMBERS: 'sec:members',
  SEC_ADMINS:  'sec:admins',
  SEC_CHANNELS:'sec:channels',
  SEC_AUDIT:   'sec:audit',
  SEC_CHANGES: 'sec:changes',

  // System actions
  SYS_PAUSE:   'sys:pause',
  SYS_RESUME:  'sys:resume',
  SYS_RESTART: 'sys:restart',
  SYS_CLEAR_CACHE:   'sys:clear_cache',
  SYS_REBUILD_CACHE: 'sys:rebuild_cache',
  SYS_FORCE_SWEEP:   'sys:force_sweep',

  // Logs sub-panels
  LOG_ERRORS:  'log:errors',
  LOG_BOTS:    'log:bots',

  // Pagination (dynamic)
  // Format: page:<panel>:<pageNum>   e.g.  page:roles:2
} as const;

// ─── Console Context ─────────────────────────────────────────────────────────

/**
 * All state the console needs, injected from main.ts.
 * Avoids the console module importing main.ts internals.
 */
export interface ConsoleContext {
  client: Client;
  prisma: PrismaClient;
  ensurePrisma: () => Promise<PrismaClient>;

  // Security CLI state (read-only view)
  securityCliState: {
    status: string;
    lastSweepStartedAt: Date | null;
    lastSweepCompletedAt: Date | null;
    lastSweepDurationMs: number | null;
    lastSweepOrigin: string | null;
    lastSweepGuild: string | null;
    lastSweepCandidates: number;
    lastSweepAssigned: number;
    lastSweepFailed: number;
    lastSweepResult: string | null;
    totalSweeps: number;
    totalAssignments: number;
    totalFailures: number;
    lastAlertSentAt: Date | null;
    lastAlertMessage: string | null;
    memberStats: {
      totalMembers: number;
      totalWithRole: number;
      partial: boolean;
    } | null;
  };

  // Continuous sweep state
  continuousSweepState: {
    running: boolean;
    abortController: AbortController | null;
  };

  // Error queue
  pendingOpsErrorQueue: Array<{
    message: string;
    timestamp: Date;
  }>;

  // Bot state (security persistence)
  botState: {
    cumulative: {
      sweepCount: number;
      alertCount: number;
      permissionChangeCount: number;
      totalUptimeMs: number;
    };
    guilds: Record<string, { monitoring: boolean }>;
    timeline: Array<{
      type: string;
      timestamp: string;
      details?: { message?: string; error?: string } | null;
    }>;
  } | null;

  // Config constants
  dripRoleId: string;
  dripUserId: string;
  enableContinuousSweep: boolean;

  // Functions from main.ts
  startContinuousSweepLoop: () => void;
  sweepGuild: (guild: Guild, origin: string) => Promise<void>;
  enforceDripRoleAllChannels: (guild: Guild, origin: string) => Promise<void>;
  syncModeratorChannelRoles: (origin: string) => Promise<void>;
  describeUser: (user: User | null | undefined) => string;
  log: (...args: [level: string, message: string, data?: Record<string, unknown>]) => void;
  report: (title: string, data: Record<string, unknown>, severity?: string) => void;

  // Engine cache
  engineCache: {
    initialize: () => Promise<void>;
    getStats: () => {
      pokemonCount: number;
      moveCount: number;
      typeEffectivenessCount: number;
      memorySizeMb: number;
    };
  };

  // Discord cache service
  cache: {
    cleanOldCache: () => void;
  };
}

// ─── Panel Render Result ─────────────────────────────────────────────────────

/** What a panel renderer returns — ready to send/edit as a Discord message. */
export interface PanelResult {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
}

// ─── Interaction Types ───────────────────────────────────────────────────────

export type ConsoleInteraction = ButtonInteraction | StringSelectMenuInteraction;

// ─── Pagination ──────────────────────────────────────────────────────────────

export const PAGE_SIZE = 12;

export function pageSlice<T>(items: T[], page: number): T[] {
  const start = page * PAGE_SIZE;
  return items.slice(start, start + PAGE_SIZE);
}

export function totalPages(count: number): number {
  return Math.max(1, Math.ceil(count / PAGE_SIZE));
}
