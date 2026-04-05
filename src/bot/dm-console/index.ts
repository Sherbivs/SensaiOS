/**
 * DripBot DM Management Console — Entry Point
 *
 * Two public functions:
 *   handleDmMessage()      — Called from messageCreate (DM only)
 *   handleConsoleInteraction() — Called from interactionCreate (button/select)
 */

import type { Message, ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';

import {
  CONSOLE_PREFIX,
  Panel,
  type ConsoleContext,
  type PanelResult,
} from './types.js';

import {
  renderMainMenu,
  renderOverview,
  renderSecurity,
  renderRoles,
  renderMembers,
  renderAdmins,
  renderChannels,
  renderAudit,
  renderChanges,
  renderSystem,
  renderLogs,
  renderErrors,
  renderBots,
} from './panels.js';

import {
  actionPauseSweep,
  actionResumeSweep,
  actionRestartSweep,
  actionForceSweep,
  actionClearCache,
  actionRebuildCache,
} from './actions.js';

// Re-export types for main.ts convenience
export { CONSOLE_PREFIX, type ConsoleContext } from './types.js';

// ─── Text Command → Panel Mapping ────────────────────────────────────────────
// Preserves backward compatibility: typing a command opens the relevant panel

const TEXT_COMMAND_MAP: Record<string, string> = {
  'menu':          Panel.MAIN,
  'console':       Panel.MAIN,
  'help':          Panel.MAIN,
  '?':             Panel.MAIN,
  'stats':         Panel.OVERVIEW,
  'status':        Panel.OVERVIEW,
  'overview':      Panel.OVERVIEW,
  'guilds':        Panel.OVERVIEW,
  'security':      Panel.SECURITY,
  'roles':         Panel.SEC_ROLES,
  'members':       Panel.SEC_MEMBERS,
  'admins':        Panel.SEC_ADMINS,
  'channels':      Panel.SEC_CHANNELS,
  'audit':         Panel.SEC_AUDIT,
  'changes':       Panel.SEC_CHANGES,
  'system':        Panel.SYSTEM,
  'sweep':         Panel.SYSTEM,
  'cache':         Panel.SYSTEM,
  'logs':          Panel.LOGS,
  'errors':        Panel.LOG_ERRORS,
  'bots':          Panel.LOG_BOTS,

  // Legacy aliases that now map to system actions
  'pause sweep':   Panel.SYS_PAUSE,
  'pausesweep':    Panel.SYS_PAUSE,
  'resume sweep':  Panel.SYS_RESUME,
  'resumesweep':   Panel.SYS_RESUME,
  'restart sweep': Panel.SYS_RESTART,
  'restartsweep':  Panel.SYS_RESTART,
  'force sweep':   Panel.SYS_FORCE_SWEEP,
  'forcesweep':    Panel.SYS_FORCE_SWEEP,
  'clear cache':   Panel.SYS_CLEAR_CACHE,
  'clearcache':    Panel.SYS_CLEAR_CACHE,
  'rebuild cache': Panel.SYS_REBUILD_CACHE,
  'rebuildcache':  Panel.SYS_REBUILD_CACHE,
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PUBLIC: Handle DM Messages
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle an incoming DM from an authorized user.
 * Replaces the old text-based if/else chain.
 * Any text input opens the corresponding panel (or main menu by default).
 */
export async function handleDmMessage(message: Message, ctx: ConsoleContext): Promise<void> {
  const content = message.content.trim().toLowerCase();
  const panelId = TEXT_COMMAND_MAP[content] ?? Panel.MAIN;
  const requesterTag = ctx.describeUser(message.author);

  try {
    const result = await resolvePanel(panelId, ctx, requesterTag);
    await message.reply({
      embeds: result.embeds,
      components: result.components,
      allowedMentions: { repliedUser: false },
    });
  } catch (err) {
    ctx.log('error', 'DM console render failed', { panel: panelId, error: String(err) });
    await message.reply({
      content: '❌ Console error. Try again or check logs.',
      allowedMentions: { repliedUser: false },
    }).catch(() => undefined);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PUBLIC: Handle Button/Select Interactions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns true if this interaction belongs to the console (customId starts with CONSOLE_PREFIX).
 * Call from the interactionCreate handler in main.ts.
 */
export function isConsoleInteraction(interaction: ButtonInteraction | StringSelectMenuInteraction): boolean {
  return interaction.customId.startsWith(CONSOLE_PREFIX);
}

/**
 * Process a console button/select interaction.
 * Updates the original message in-place for seamless navigation.
 */
export async function handleConsoleInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  ctx: ConsoleContext,
): Promise<void> {
  // Extract panel ID: strip prefix, handle select menus
  let panelId: string;
  if (interaction.isStringSelectMenu()) {
    // Select menu value IS the panel ID directly
    panelId = interaction.values[0];
  } else {
    // Button customId = dc:<panelId>
    panelId = interaction.customId.slice(CONSOLE_PREFIX.length);
  }

  const requesterTag = ctx.describeUser(interaction.user);

  try {
    // For long-running actions, defer the update first
    const isAction = panelId.startsWith('sys:');
    if (isAction) {
      await interaction.deferUpdate();
    }

    const result = await resolvePanel(panelId, ctx, requesterTag);

    if (isAction || interaction.deferred) {
      await interaction.editReply({
        embeds: result.embeds,
        components: result.components,
      });
    } else {
      await interaction.update({
        embeds: result.embeds,
        components: result.components,
      });
    }
  } catch (err) {
    ctx.log('error', 'Console interaction failed', { panel: panelId, error: String(err) });
    // Try to acknowledge even on error
    const errorMsg = '❌ Console error. Try again.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: errorMsg, embeds: [], components: [] }).catch(() => undefined);
    } else {
      await interaction.update({ content: errorMsg, embeds: [], components: [] }).catch(() => undefined);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INTERNAL: Panel Router
// ═══════════════════════════════════════════════════════════════════════════════

async function resolvePanel(panelId: string, ctx: ConsoleContext, requesterTag: string): Promise<PanelResult> {
  // ── Pagination — format: page:<panel>:<pageNum> ──
  if (panelId.startsWith('page:')) {
    const parts = panelId.split(':');
    const subPanel = parts[1];
    const page = parseInt(parts[2], 10) || 0;

    switch (subPanel) {
      case 'roles':    return renderRoles(ctx, page);
      case 'members':  return renderMembers(ctx, page);
      case 'channels': return renderChannels(ctx, page);
      case 'audit':    return renderAudit(ctx, page);
      case 'changes':  return renderChanges(ctx, page);
    }
  }

  // ── Navigation panels ──
  switch (panelId) {
    case Panel.MAIN:         return renderMainMenu(ctx);
    case Panel.OVERVIEW:     return renderOverview(ctx);
    case `${Panel.OVERVIEW}:refresh`: return renderOverview(ctx);
    case Panel.SECURITY:     return renderSecurity(ctx);
    case Panel.SYSTEM:       return renderSystem(ctx);
    case Panel.LOGS:         return renderLogs(ctx);

    // Security sub-panels
    case Panel.SEC_ROLES:    return renderRoles(ctx);
    case Panel.SEC_MEMBERS:  return renderMembers(ctx);
    case Panel.SEC_ADMINS:   return renderAdmins(ctx);
    case Panel.SEC_CHANNELS: return renderChannels(ctx);
    case Panel.SEC_AUDIT:    return renderAudit(ctx);
    case Panel.SEC_CHANGES:  return renderChanges(ctx);

    // Log sub-panels
    case Panel.LOG_ERRORS:   return renderErrors(ctx);
    case Panel.LOG_BOTS:     return renderBots(ctx);

    // System actions
    case Panel.SYS_PAUSE:         return actionPauseSweep(ctx, requesterTag);
    case Panel.SYS_RESUME:        return actionResumeSweep(ctx, requesterTag);
    case Panel.SYS_RESTART:       return actionRestartSweep(ctx, requesterTag);
    case Panel.SYS_FORCE_SWEEP:   return actionForceSweep(ctx, requesterTag);
    case Panel.SYS_CLEAR_CACHE:   return actionClearCache(ctx, requesterTag);
    case Panel.SYS_REBUILD_CACHE: return actionRebuildCache(ctx, requesterTag);

    default:
      return renderMainMenu(ctx);
  }
}
