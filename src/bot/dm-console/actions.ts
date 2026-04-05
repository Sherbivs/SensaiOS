/**
 * DripBot DM Management Console — Action Handlers
 *
 * Mutating operations (sweep, cache) that respond to button presses.
 * Each returns a PanelResult showing the result of the action.
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

import { CONSOLE_PREFIX, Panel, type ConsoleContext, type PanelResult } from './types.js';
import { getErrorMessage } from '../../shared/utils/index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function btn(customId: string, label: string, style: ButtonStyle = ButtonStyle.Secondary, emoji?: string): ButtonBuilder {
  const b = new ButtonBuilder()
    .setCustomId(`${CONSOLE_PREFIX}${customId}`)
    .setLabel(label)
    .setStyle(style);
  if (emoji) b.setEmoji(emoji);
  return b;
}

function row(...buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

function resultEmbed(title: string, description: string, success: boolean): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(success ? 0x57F287 : 0xED4245)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SWEEP ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function actionPauseSweep(ctx: ConsoleContext, requesterTag: string): PanelResult {
  if (!ctx.continuousSweepState.running) {
    return {
      embeds: [resultEmbed('⏸️ Pause Sweep', 'Sweep loop is already stopped.', true)],
      components: [row(btn(Panel.SYSTEM, 'Back to System', ButtonStyle.Secondary, '◀'))],
    };
  }

  ctx.continuousSweepState.abortController?.abort();
  ctx.log('warn', 'Continuous sweep loop paused via console', { requester: requesterTag });
  ctx.report('Sweep Loop Paused — Console', { requester: requesterTag }, 'warn');

  return {
    embeds: [resultEmbed('⏸️ Pause Sweep', 'Sweep loop pause signalled. It will stop after the current guild finishes.', true)],
    components: [row(btn(Panel.SYSTEM, 'Back to System', ButtonStyle.Secondary, '◀'))],
  };
}

export function actionResumeSweep(ctx: ConsoleContext, requesterTag: string): PanelResult {
  if (ctx.continuousSweepState.running) {
    return {
      embeds: [resultEmbed('▶️ Resume Sweep', 'Sweep loop is already running.', true)],
      components: [row(btn(Panel.SYSTEM, 'Back to System', ButtonStyle.Secondary, '◀'))],
    };
  }

  if (!ctx.enableContinuousSweep) {
    return {
      embeds: [resultEmbed('▶️ Resume Sweep', '`ENABLE_CONTINUOUS_SWEEP` is disabled in config — cannot resume.', false)],
      components: [row(btn(Panel.SYSTEM, 'Back to System', ButtonStyle.Secondary, '◀'))],
    };
  }

  ctx.startContinuousSweepLoop();
  ctx.log('warn', 'Continuous sweep loop resumed via console', { requester: requesterTag });
  ctx.report('Sweep Loop Resumed — Console', { requester: requesterTag }, 'warn');

  return {
    embeds: [resultEmbed('▶️ Resume Sweep', 'Sweep loop restarted.', true)],
    components: [row(btn(Panel.SYSTEM, 'Back to System', ButtonStyle.Secondary, '◀'))],
  };
}

export async function actionRestartSweep(ctx: ConsoleContext, requesterTag: string): Promise<PanelResult> {
  if (!ctx.enableContinuousSweep) {
    return {
      embeds: [resultEmbed('🔄 Restart Sweep', '`ENABLE_CONTINUOUS_SWEEP` is disabled in config — cannot restart.', false)],
      components: [row(btn(Panel.SYSTEM, 'Back to System', ButtonStyle.Secondary, '◀'))],
    };
  }

  if (ctx.continuousSweepState.running) {
    ctx.continuousSweepState.abortController?.abort();
    await new Promise<void>(resolve => setTimeout(resolve, 500));
  }

  ctx.startContinuousSweepLoop();
  ctx.log('warn', 'Continuous sweep loop restarted via console', { requester: requesterTag });
  ctx.report('Sweep Loop Restarted — Console', { requester: requesterTag }, 'warn');

  return {
    embeds: [resultEmbed('🔄 Restart Sweep', 'Sweep loop restarted successfully.', true)],
    components: [row(btn(Panel.SYSTEM, 'Back to System', ButtonStyle.Secondary, '◀'))],
  };
}

export async function actionForceSweep(ctx: ConsoleContext, requesterTag: string): Promise<PanelResult> {
  const guilds = [...ctx.client.guilds.cache.values()];
  const sweepStart = Date.now();

  let trainerAssigned = 0;
  let trainerFailed = 0;
  let dripApplied = 0;
  let sweepErrors = 0;

  ctx.log('warn', 'Force sweep triggered via console', { requester: requesterTag });
  ctx.report('Force Sweep — Console Triggered', { requester: requesterTag }, 'warn');

  // 1. Trainer role sweep
  for (const guild of guilds) {
    try {
      const assignedBefore = ctx.securityCliState.lastSweepAssigned;
      const failedBefore = ctx.securityCliState.lastSweepFailed;
      await ctx.sweepGuild(guild, 'console-force-sweep');
      trainerAssigned += Math.max(0, ctx.securityCliState.lastSweepAssigned - assignedBefore);
      trainerFailed += Math.max(0, ctx.securityCliState.lastSweepFailed - failedBefore);
    } catch {
      sweepErrors++;
    }
  }

  // 2. Drip role channel enforcement
  for (const guild of guilds) {
    try {
      await ctx.enforceDripRoleAllChannels(guild, 'console-force-sweep');
      dripApplied++;
    } catch {
      sweepErrors++;
    }
  }

  // 3. Gym Leader role sync
  try {
    await ctx.syncModeratorChannelRoles('console-force-sweep');
  } catch {
    sweepErrors++;
  }

  const elapsed = Math.round((Date.now() - sweepStart) / 1000);

  const description = [
    `Completed in **${elapsed}s** across **${guilds.length}** guild(s).`,
    '',
    `**Trainer roles assigned:** ${trainerAssigned}`,
    `**Assignment failures:** ${trainerFailed}`,
    `**Drip channel guilds enforced:** ${dripApplied}`,
    `**Gym Leader sync:** ✅`,
    sweepErrors > 0 ? `\n⚠️ **${sweepErrors} error(s) encountered** — check logs` : '',
  ].join('\n');

  ctx.report('Force Sweep — Console Complete', {
    requester: requesterTag, guilds: guilds.length,
    trainerAssigned, trainerFailed, dripApplied, sweepErrors, elapsedSeconds: elapsed,
  }, sweepErrors > 0 ? 'warn' : 'success');

  return {
    embeds: [resultEmbed(
      sweepErrors > 0 ? '⚠️ Force Sweep — Partial' : '✅ Force Sweep — Complete',
      description,
      sweepErrors === 0,
    )],
    components: [row(btn(Panel.SYSTEM, 'Back to System', ButtonStyle.Secondary, '◀'))],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CACHE ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export async function actionClearCache(ctx: ConsoleContext, requesterTag: string): Promise<PanelResult> {
  ctx.log('warn', 'Cache clear triggered via console', { requester: requesterTag });

  try {
    const result = await ctx.prisma.cacheEntry.deleteMany({
      where: {
        namespace: 'discord-cache',
        key: { startsWith: 'discord-cache:assign:' },
      },
    });
    ctx.cache.cleanOldCache();
    ctx.report('Cache Cleared — Console', { requester: requesterTag, deletedEntries: result.count }, 'warn');

    return {
      embeds: [resultEmbed(
        '🗑️ Cache Cleared',
        `Cleared **${result.count}** assignment cache entries.\nExpired entries also pruned. Next sweep will re-evaluate all members.`,
        true,
      )],
      components: [row(btn(Panel.SYSTEM, 'Back to System', ButtonStyle.Secondary, '◀'))],
    };
  } catch (err) {
    ctx.log('error', 'Cache clear failed via console', { error: getErrorMessage(err) });
    return {
      embeds: [resultEmbed('❌ Cache Clear Failed', getErrorMessage(err), false)],
      components: [row(btn(Panel.SYSTEM, 'Back to System', ButtonStyle.Secondary, '◀'))],
    };
  }
}

export async function actionRebuildCache(ctx: ConsoleContext, requesterTag: string): Promise<PanelResult> {
  ctx.log('warn', 'Engine cache rebuild triggered via console', { requester: requesterTag });

  const start = Date.now();
  try {
    await ctx.engineCache.initialize();
    const elapsed = Math.round((Date.now() - start) / 1000);
    const stats = ctx.engineCache.getStats();
    ctx.report('Engine Cache Rebuilt — Console', { requester: requesterTag, elapsedSeconds: elapsed }, 'warn');

    return {
      embeds: [resultEmbed(
        '♻️ Engine Cache Rebuilt',
        [
          `Rebuilt in **${elapsed}s**.`,
          `**Pokemon:** ${stats.pokemonCount}`,
          `**Moves:** ${stats.moveCount}`,
          `**Type Chart:** ${stats.typeEffectivenessCount}`,
          `**Memory:** ${stats.memorySizeMb.toFixed(1)} MB`,
        ].join('\n'),
        true,
      )],
      components: [row(btn(Panel.SYSTEM, 'Back to System', ButtonStyle.Secondary, '◀'))],
    };
  } catch (err) {
    ctx.log('error', 'Engine cache rebuild failed via console', { error: getErrorMessage(err) });
    return {
      embeds: [resultEmbed('❌ Cache Rebuild Failed', getErrorMessage(err), false)],
      components: [row(btn(Panel.SYSTEM, 'Back to System', ButtonStyle.Secondary, '◀'))],
    };
  }
}
