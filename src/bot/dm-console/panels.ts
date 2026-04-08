/**
 * DripBot DM Management Console — Panel Renderers
 *
 * Each function returns { embeds, components } ready to send or edit.
 * Panels are pure data transforms — no side effects, no Discord API calls.
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
} from 'discord.js';

import {
  CONSOLE_PREFIX,
  Panel,
  PAGE_SIZE,
  pageSlice,
  totalPages,
  type ConsoleContext,
  type PanelResult,
} from './types.js';

import { resourceMonitor } from '../../services/monitoring/resource-monitor.js';
import { resourceManager } from '../../services/monitoring/resource-manager.js';
import { getDatabaseHealthReport } from '../../kernel/database-resource-manager.js';
import { TIER } from '../../config/resource-tiers.js';

// ─── Theme ───────────────────────────────────────────────────────────────────

const Color = {
  PRIMARY:   0x5865F2,  // Discord blurple
  SUCCESS:   0x57F287,  // Green
  WARNING:   0xFEE75C,  // Yellow
  DANGER:    0xED4245,  // Red
  SECURITY:  0xEB459E,  // Fuchsia
  INFO:      0x5BC0EB,  // Light blue
  MUTED:     0x99AAB5,  // Grey
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function btn(customId: string, label: string, style: ButtonStyle = ButtonStyle.Secondary, emoji?: string): ButtonBuilder {
  const b = new ButtonBuilder()
    .setCustomId(`${CONSOLE_PREFIX}${customId}`)
    .setLabel(label)
    .setStyle(style);
  if (emoji) b.setEmoji(emoji);
  return b;
}

function backBtn(panel: string = Panel.MAIN): ButtonBuilder {
  return btn(panel, 'Back', ButtonStyle.Secondary, '◀');
}

function row(...buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function timeAgo(date: Date | null): string {
  if (!date) return 'never';
  const ms = Date.now() - date.getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function truncField(value: string, max = 1024): string {
  return value.length > max ? value.slice(0, max - 3) + '...' : value;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN MENU
// ═══════════════════════════════════════════════════════════════════════════════

export function renderMainMenu(ctx: ConsoleContext): PanelResult {
  const uptimeMs = process.uptime() * 1000;
  const guildCount = ctx.client.guilds.cache.size;
  const sweepStatus = ctx.continuousSweepState.running ? '🟢 Active' : '🔴 Stopped';
  const totalSweeps = ctx.botState?.cumulative.sweepCount ?? ctx.securityCliState.totalSweeps;
  const totalAlerts = ctx.botState?.cumulative.alertCount ?? 0;

  const embed = new EmbedBuilder()
    .setColor(Color.PRIMARY)
    .setTitle('🛡️  DripBot Management Console')
    .setDescription(
      `Welcome to the DripBot admin center.\nUse the buttons below to navigate.`,
    )
    .addFields(
      { name: 'Status', value: `\`${ctx.securityCliState.status}\``, inline: true },
      { name: 'Uptime', value: `\`${formatUptime(uptimeMs)}\``, inline: true },
      { name: 'Guilds', value: `\`${guildCount}\``, inline: true },
      { name: 'Sweep', value: sweepStatus, inline: true },
      { name: 'Total Sweeps', value: `\`${totalSweeps}\``, inline: true },
      { name: 'Alerts', value: `\`${totalAlerts}\``, inline: true },
    )
    .setFooter({ text: 'DripBot Console • Text commands still work' })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(
        btn(Panel.OVERVIEW,   'Overview',   ButtonStyle.Primary,   '📊'),
        btn(Panel.RESOURCES,  'Resources',  ButtonStyle.Primary,   '📈'),
        btn(Panel.SECURITY,   'Security',   ButtonStyle.Primary,   '🔒'),
        btn(Panel.SYSTEM,     'System',     ButtonStyle.Primary,   '⚙️'),
        btn(Panel.LOGS,       'Logs',       ButtonStyle.Primary,   '📋'),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  OVERVIEW PANEL
// ═══════════════════════════════════════════════════════════════════════════════

export async function renderOverview(ctx: ConsoleContext): Promise<PanelResult> {
  const uptimeMs = process.uptime() * 1000;
  const mem = process.memoryUsage();
  const rssStr = `${(mem.rss / 1024 / 1024).toFixed(0)} MB`;
  const heapStr = `${(mem.heapUsed / 1024 / 1024).toFixed(0)} / ${(mem.heapTotal / 1024 / 1024).toFixed(0)} MB`;

  // Guild info
  const guildLines: string[] = [];
  for (const guild of ctx.client.guilds.cache.values()) {
    const lastSweep = ctx.securityCliState.lastSweepGuild?.startsWith(guild.name)
      ? ctx.securityCliState.lastSweepCompletedAt
      : null;
    const sweepAgo = lastSweep ? timeAgo(lastSweep) : 'not yet';
    guildLines.push(`• **${guild.name}** — ${guild.memberCount?.toLocaleString() ?? '?'} members · sweep ${sweepAgo}`);
  }
  if (guildLines.length === 0) guildLines.push('No guilds connected.');

  // Coverage
  let coverageStr = 'N/A';
  if (ctx.securityCliState.memberStats) {
    const ms = ctx.securityCliState.memberStats;
    const denominator = ms.totalEligibleMembers && ms.totalEligibleMembers > 0
      ? ms.totalEligibleMembers
      : ms.totalMembers;
    const pct = denominator > 0 ? ((ms.totalWithRole / denominator) * 100).toFixed(1) : '0';
    coverageStr = `${ms.totalWithRole}/${denominator} (${pct}%)${ms.partial ? ' est.' : ''}`;
  }

  // Engine cache stats
  let engineLine = 'Not loaded';
  try {
    const es = ctx.engineCache.getStats();
    engineLine = `🐾 ${es.pokemonCount} Pokémon · ⚔️ ${es.moveCount} Moves · 🎯 ${es.typeEffectivenessCount} Type entries · ${es.memorySizeMb.toFixed(1)} MB`;
  } catch { /* cache not ready */ }

  const embed = new EmbedBuilder()
    .setColor(Color.INFO)
    .setTitle('📊  System Overview')
    .addFields(
      { name: 'Bot Identity', value: `${ctx.client.user?.tag ?? 'unknown'}`, inline: true },
      { name: 'Uptime', value: formatUptime(uptimeMs), inline: true },
      { name: 'Environment', value: `${process.env.NODE_ENV || (process.env.RENDER ? 'production' : 'development')}`, inline: true },
      { name: 'Memory (RSS)', value: rssStr, inline: true },
      { name: 'Heap', value: heapStr, inline: true },
      { name: 'Trainer Coverage', value: coverageStr, inline: true },
    )
    .addFields(
      { name: 'Engine Cache', value: engineLine },
      { name: 'Guilds', value: truncField(guildLines.join('\n')) },
    )
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(
        btn(`${Panel.OVERVIEW}:refresh`, 'Refresh', ButtonStyle.Success, '🔄'),
        backBtn(),
      ),
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SECURITY PANEL (hub)
// ═══════════════════════════════════════════════════════════════════════════════

export function renderSecurity(ctx: ConsoleContext): PanelResult {
  const sweepStatus = ctx.continuousSweepState.running ? '✅ Active' : '❌ Stopped';
  const lastSweep = timeAgo(ctx.securityCliState.lastSweepCompletedAt);
  const totalChanges = ctx.botState?.cumulative.permissionChangeCount ?? 0;
  const lastAlert = timeAgo(ctx.securityCliState.lastAlertSentAt);

  const embed = new EmbedBuilder()
    .setColor(Color.SECURITY)
    .setTitle('🔒  Security Dashboard')
    .setDescription('Browse security data and audit trails.')
    .addFields(
      { name: 'Sweep Status', value: sweepStatus, inline: true },
      { name: 'Last Sweep', value: lastSweep, inline: true },
      { name: 'Perm Changes', value: `${totalChanges}`, inline: true },
      { name: 'Last Alert', value: lastAlert, inline: true },
      { name: 'Total Sweeps', value: `${ctx.botState?.cumulative.sweepCount ?? ctx.securityCliState.totalSweeps}`, inline: true },
      { name: 'Assignments', value: `${ctx.securityCliState.totalAssignments} ok / ${ctx.securityCliState.totalFailures} fail`, inline: true },
    )
    .setTimestamp();

  // Use select menu for cleaner sub-navigation
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${CONSOLE_PREFIX}sec:select`)
    .setPlaceholder('Choose a security view…')
    .addOptions(
      { label: 'Roles',    value: Panel.SEC_ROLES,    emoji: '🏷️', description: 'All roles with position and flags' },
      { label: 'Members',  value: Panel.SEC_MEMBERS,  emoji: '👥', description: 'Top members by role count' },
      { label: 'Admins',   value: Panel.SEC_ADMINS,   emoji: '👑', description: 'Admin/owner members & dangerous roles' },
      { label: 'Channels', value: Panel.SEC_CHANNELS,  emoji: '📺', description: 'Channel overview with Drip status' },
      { label: 'Audit Log',value: Panel.SEC_AUDIT,     emoji: '📝', description: 'Recent role changes' },
      { label: 'Changes',  value: Panel.SEC_CHANGES,   emoji: '🔄', description: 'Change attempts incl. reverts' },
    );

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  return {
    embeds: [embed],
    components: [
      selectRow,
      row(backBtn()),
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SECURITY SUB-PANELS
// ═══════════════════════════════════════════════════════════════════════════════

export async function renderRoles(ctx: ConsoleContext, page = 0): Promise<PanelResult> {
  const db = await ctx.ensurePrisma();
  const roles = await db.discordRole.findMany({ orderBy: { position: 'desc' } });
  const total = roles.length;
  const pages = totalPages(total);
  const slice = pageSlice(roles, page);

  const lines: string[] = [];
  for (const r of slice) {
    const flags: string[] = [];
    if (r.discordRoleId === ctx.dripRoleId) flags.push('🤖');
    if (r.isAdmin) flags.push('ADM');
    if (r.isDangerous) flags.push('⚠️');
    if (r.managed) flags.push('managed');
    const flagStr = flags.length > 0 ? ` ${flags.join(' ')}` : '';
    lines.push(`\`${String(r.position).padStart(2)}\` **${r.name}** — ${r.memberCount} members${flagStr}`);
  }

  const embed = new EmbedBuilder()
    .setColor(Color.MUTED)
    .setTitle(`🏷️  Roles (${total})`)
    .setDescription(truncField(lines.join('\n') || 'No roles found.'))
    .setFooter({ text: `Page ${page + 1}/${pages} • ${total} roles` })
    .setTimestamp();

  const buttons: ButtonBuilder[] = [];
  if (page > 0) buttons.push(btn(`page:roles:${page - 1}`, 'Prev', ButtonStyle.Secondary, '◀'));
  if (page < pages - 1) buttons.push(btn(`page:roles:${page + 1}`, 'Next', ButtonStyle.Secondary, '▶'));
  buttons.push(backBtn(Panel.SECURITY));

  return { embeds: [embed], components: [row(...buttons)] };
}

export async function renderMembers(ctx: ConsoleContext, page = 0): Promise<PanelResult> {
  const db = await ctx.ensurePrisma();
  const total = await db.discordMember.count({ where: { bot: false } });
  const pages = totalPages(total);
  const members = await db.discordMember.findMany({
    where: { bot: false },
    orderBy: { roleCount: 'desc' },
    skip: page * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const lines: string[] = [];
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const flags: string[] = [];
    if (m.isOwner) flags.push('👑');
    if (m.isAdministrator) flags.push('ADM');
    if (m.roles.includes(ctx.dripRoleId)) flags.push('🤖');
    const flagStr = flags.length > 0 ? ` ${flags.join(' ')}` : '';
    const rank = page * PAGE_SIZE + i + 1;
    lines.push(`\`${String(rank).padStart(3)}\` **${m.username}** — ${m.roleCount} roles${flagStr}`);
  }

  const embed = new EmbedBuilder()
    .setColor(Color.MUTED)
    .setTitle(`👥  Members (${total})`)
    .setDescription(truncField(lines.join('\n') || 'No members found.'))
    .setFooter({ text: `Page ${page + 1}/${pages} • ${total} members (sorted by role count)` })
    .setTimestamp();

  const buttons: ButtonBuilder[] = [];
  if (page > 0) buttons.push(btn(`page:members:${page - 1}`, 'Prev', ButtonStyle.Secondary, '◀'));
  if (page < pages - 1) buttons.push(btn(`page:members:${page + 1}`, 'Next', ButtonStyle.Secondary, '▶'));
  buttons.push(backBtn(Panel.SECURITY));

  return { embeds: [embed], components: [row(...buttons)] };
}

export async function renderAdmins(ctx: ConsoleContext): Promise<PanelResult> {
  const db = await ctx.ensurePrisma();
  const botUserId = ctx.client.user?.id ?? '';

  const adminMembers = await db.discordMember.findMany({
    where: { OR: [{ isAdministrator: true }, { isOwner: true }] },
    orderBy: { roleCount: 'desc' },
  });
  const dangerousRoles = await db.discordRole.findMany({
    where: { OR: [{ isAdmin: true }, { isDangerous: true }] },
    orderBy: { position: 'desc' },
  });

  const memberLines: string[] = [];
  for (const m of adminMembers) {
    const tags: string[] = [];
    if (m.isOwner) tags.push('👑 Owner');
    if (m.isAdministrator) tags.push('Admin');
    if (m.roles.includes(ctx.dripRoleId)) tags.push('🤖');
    if (m.discordUserId === ctx.dripUserId || m.discordUserId === botUserId) tags.push('Bot');
    memberLines.push(`• **${m.username}** \`${m.discordUserId}\` — ${tags.join(', ')}`);
  }

  const roleLines: string[] = [];
  for (const r of dangerousRoles) {
    const flags: string[] = [];
    if (r.discordRoleId === ctx.dripRoleId) flags.push('🤖');
    if (r.isAdmin) flags.push('ADM');
    if (r.isDangerous) flags.push('⚠️ DANGER');
    roleLines.push(`• **${r.name}** — ${r.memberCount} members [${flags.join(', ')}]`);
  }

  const embed = new EmbedBuilder()
    .setColor(Color.DANGER)
    .setTitle('👑  Admins & Dangerous Roles')
    .setTimestamp();

  if (memberLines.length > 0) {
    embed.addFields({ name: 'Admin / Owner Members', value: truncField(memberLines.join('\n')) });
  }
  if (roleLines.length > 0) {
    embed.addFields({ name: 'Dangerous / Admin Roles', value: truncField(roleLines.join('\n')) });
  }
  if (memberLines.length === 0 && roleLines.length === 0) {
    embed.setDescription('No admin members or dangerous roles found.');
  }

  return {
    embeds: [embed],
    components: [row(backBtn(Panel.SECURITY))],
  };
}

export function renderChannels(ctx: ConsoleContext, page = 0): PanelResult {
  const guild = ctx.client.guilds.cache.first();
  if (!guild) {
    const embed = new EmbedBuilder()
      .setColor(Color.MUTED)
      .setTitle('📺  Channels')
      .setDescription('No guilds in cache.')
      .setTimestamp();
    return { embeds: [embed], components: [row(backBtn(Panel.SECURITY))] };
  }

  const typeLabel = (t: number): string => {
    switch (t) {
      case ChannelType.GuildText: return 'text';
      case ChannelType.GuildVoice: return 'voice';
      case ChannelType.GuildCategory: return 'cat';
      case ChannelType.GuildAnnouncement: return 'news';
      case ChannelType.GuildForum: return 'forum';
      case ChannelType.GuildStageVoice: return 'stage';
      default: return `t-${t}`;
    }
  };

  const allChannels = [...guild.channels.cache.values()].sort(
    (a, b) => ('position' in a ? a.position : 0) - ('position' in b ? b.position : 0),
  );

  // Build flattened display list (categories are headers)
  const displayLines: string[] = [];
  const categories = allChannels.filter(c => c.type === ChannelType.GuildCategory);
  const uncategorized = allChannels.filter(c => c.type !== ChannelType.GuildCategory && !c.parentId);

  const dripTag = (ch: typeof allChannels[number]): string => {
    if (ch.type === ChannelType.GuildCategory) return '';
    if (!('permissionOverwrites' in ch)) return ' ❓';
    const ow = (ch as { permissionOverwrites: { cache: Map<string, unknown> } }).permissionOverwrites.cache;
    return ow.has(ctx.dripRoleId) ? ' ✅' : ' ❌';
  };

  if (uncategorized.length > 0) {
    displayLines.push('**No Category**');
    for (const ch of uncategorized) {
      displayLines.push(`\`${typeLabel(ch.type).padEnd(5)}\` ${ch.name}${dripTag(ch)}`);
    }
  }
  for (const cat of categories) {
    const children = allChannels
      .filter(c => c.parentId === cat.id)
      .sort((a, b) => ('position' in a ? a.position : 0) - ('position' in b ? b.position : 0));
    displayLines.push(`\n**${cat.name}**`);
    for (const ch of children) {
      displayLines.push(`\`${typeLabel(ch.type).padEnd(5)}\` ${ch.name}${dripTag(ch)}`);
    }
  }

  const pages = totalPages(displayLines.length);
  const slice = pageSlice(displayLines, page);

  const embed = new EmbedBuilder()
    .setColor(Color.MUTED)
    .setTitle(`📺  Channels — ${guild.name} (${allChannels.length})`)
    .setDescription(truncField(slice.join('\n') || 'No channels.'))
    .setFooter({ text: `Page ${page + 1}/${pages} • ✅ = Drip overwrite · ❌ = missing` })
    .setTimestamp();

  const buttons: ButtonBuilder[] = [];
  if (page > 0) buttons.push(btn(`page:channels:${page - 1}`, 'Prev', ButtonStyle.Secondary, '◀'));
  if (page < pages - 1) buttons.push(btn(`page:channels:${page + 1}`, 'Next', ButtonStyle.Secondary, '▶'));
  buttons.push(backBtn(Panel.SECURITY));

  return { embeds: [embed], components: [row(...buttons)] };
}

export async function renderAudit(ctx: ConsoleContext, page = 0): Promise<PanelResult> {
  const db = await ctx.ensurePrisma();
  const total = await db.roleChangeAudit.count();
  const pages = totalPages(total);
  const entries = await db.roleChangeAudit.findMany({
    orderBy: { createdAt: 'desc' },
    skip: page * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const lines: string[] = [];
  for (const e of entries) {
    const ts = e.createdAt.toISOString().slice(5, 16).replace('T', ' ');
    const action = e.changeType === 'addition' ? '➕' : '➖';
    const flags: string[] = [];
    if (e.reverted) flags.push('↩️');
    if (!e.authorized) flags.push('🚫');
    const flagStr = flags.join('');
    lines.push(`\`${ts}\` ${action} **${e.roleName}** → ${e.memberTag} ${flagStr}`);
  }

  const embed = new EmbedBuilder()
    .setColor(Color.WARNING)
    .setTitle(`📝  Role Audit (${total})`)
    .setDescription(truncField(lines.join('\n') || 'No audit entries.'))
    .setFooter({ text: `Page ${page + 1}/${pages} • ➕ add · ➖ remove · ↩️ reverted · 🚫 unauthorized` })
    .setTimestamp();

  const buttons: ButtonBuilder[] = [];
  if (page > 0) buttons.push(btn(`page:audit:${page - 1}`, 'Prev', ButtonStyle.Secondary, '◀'));
  if (page < pages - 1) buttons.push(btn(`page:audit:${page + 1}`, 'Next', ButtonStyle.Secondary, '▶'));
  buttons.push(backBtn(Panel.SECURITY));

  return { embeds: [embed], components: [row(...buttons)] };
}

export async function renderChanges(ctx: ConsoleContext, page = 0): Promise<PanelResult> {
  const db = await ctx.ensurePrisma();
  const total = await db.roleChangeAudit.count();
  const pages = totalPages(total);
  const entries = await db.roleChangeAudit.findMany({
    orderBy: { createdAt: 'desc' },
    skip: page * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const lines: string[] = [];
  for (const e of entries) {
    const ts = e.createdAt.toISOString().slice(5, 16).replace('T', ' ');
    const action = e.changeType === 'addition' ? '➕' : '➖';
    const flags: string[] = [];
    if (!e.authorized) flags.push('❌ UNAUTH');
    if (e.reverted) flags.push('↩️ REVERTED');
    if (e.roleId === ctx.dripRoleId) flags.push('🤖 Drip');
    const flagStr = flags.length > 0 ? ` [${flags.join(' | ')}]` : '';
    lines.push(
      `\`${ts}\` ${action} **${e.roleName}** → ${e.memberTag}\n` +
      `  by ${e.executorTag} · ${e.origin}${flagStr}`,
    );
  }

  const embed = new EmbedBuilder()
    .setColor(Color.WARNING)
    .setTitle(`🔄  Recent Changes (${total})`)
    .setDescription(truncField(lines.join('\n') || 'No change attempts recorded.'))
    .setFooter({ text: `Page ${page + 1}/${pages}` })
    .setTimestamp();

  const buttons: ButtonBuilder[] = [];
  if (page > 0) buttons.push(btn(`page:changes:${page - 1}`, 'Prev', ButtonStyle.Secondary, '◀'));
  if (page < pages - 1) buttons.push(btn(`page:changes:${page + 1}`, 'Next', ButtonStyle.Secondary, '▶'));
  buttons.push(backBtn(Panel.SECURITY));

  return { embeds: [embed], components: [row(...buttons)] };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SYSTEM PANEL
// ═══════════════════════════════════════════════════════════════════════════════

export function renderSystem(ctx: ConsoleContext): PanelResult {
  const sweepRunning = ctx.continuousSweepState.running;
  const engineStats = ctx.engineCache.getStats();
  const errCount = ctx.pendingOpsErrorQueue.length;

  const embed = new EmbedBuilder()
    .setColor(Color.PRIMARY)
    .setTitle('⚙️  System Controls')
    .setDescription('Manage sweeps, cache, and engine systems.')
    .addFields(
      { name: 'Sweep Loop', value: sweepRunning ? '🟢 Running' : '🔴 Stopped', inline: true },
      { name: 'Engine Cache', value: `${engineStats.pokemonCount} species · ${engineStats.memorySizeMb.toFixed(1)} MB`, inline: true },
      { name: 'Pending Errors', value: `${errCount}`, inline: true },
    )
    .setTimestamp();

  // Action buttons — sweep controls row
  const sweepRow = row(
    sweepRunning
      ? btn(Panel.SYS_PAUSE,   'Pause Sweep',   ButtonStyle.Danger,    '⏸️')
      : btn(Panel.SYS_RESUME,  'Resume Sweep',  ButtonStyle.Success,   '▶️'),
    btn(Panel.SYS_RESTART, 'Restart Sweep', ButtonStyle.Secondary, '🔄'),
    btn(Panel.SYS_FORCE_SWEEP, 'Force Sweep', ButtonStyle.Primary, '🔍'),
  );

  // Cache controls row
  const cacheRow = row(
    btn(Panel.SYS_CLEAR_CACHE,   'Clear Cache',   ButtonStyle.Danger,    '🗑️'),
    btn(Panel.SYS_REBUILD_CACHE, 'Rebuild Cache', ButtonStyle.Secondary, '♻️'),
    backBtn(),
  );

  return {
    embeds: [embed],
    components: [sweepRow, cacheRow],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LOGS PANEL
// ═══════════════════════════════════════════════════════════════════════════════

export function renderLogs(ctx: ConsoleContext): PanelResult {
  const errCount = ctx.pendingOpsErrorQueue.length;
  const timelineErrors = ctx.botState?.timeline
    .filter(t => t.type === 'error' || t.type === 'alert')
    .length ?? 0;

  const embed = new EmbedBuilder()
    .setColor(Color.INFO)
    .setTitle('📋  Logs & Diagnostics')
    .setDescription('View errors, bot accounts, and system diagnostics.')
    .addFields(
      { name: 'Ops Error Queue', value: `${errCount} pending`, inline: true },
      { name: 'Timeline Events', value: `${timelineErrors} errors/alerts`, inline: true },
    )
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(
        btn(Panel.LOG_ERRORS, 'Errors',   ButtonStyle.Danger,    '❌'),
        btn(Panel.LOG_BOTS,   'Bots',     ButtonStyle.Secondary, '🤖'),
        backBtn(),
      ),
    ],
  };
}

export function renderErrors(ctx: ConsoleContext): PanelResult {
  const queueErrors = ctx.pendingOpsErrorQueue.slice(-10);
  const timelineErrors = (ctx.botState?.timeline ?? [])
    .filter(t => t.type === 'error' || t.type === 'alert')
    .slice(-10);

  const lines: string[] = [];
  if (queueErrors.length > 0) {
    lines.push('**Ops Queue:**');
    for (const e of queueErrors) {
      const ts = e.timestamp ? new Date(e.timestamp).toISOString().slice(11, 19) : '?';
      lines.push(`\`${ts}\` ${e.message}`);
    }
  }
  if (timelineErrors.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('**Timeline:**');
    for (const e of timelineErrors) {
      const ts = e.timestamp ? new Date(e.timestamp).toISOString().slice(11, 19) : '?';
      const label = e.details?.message ?? e.details?.error ?? e.type;
      lines.push(`\`${ts}\` ${label}`);
    }
  }
  if (lines.length === 0) lines.push('No recent errors.');

  const embed = new EmbedBuilder()
    .setColor(Color.DANGER)
    .setTitle('❌  Recent Errors')
    .setDescription(truncField(lines.join('\n')))
    .setTimestamp();

  return {
    embeds: [embed],
    components: [row(backBtn(Panel.LOGS))],
  };
}

export async function renderBots(ctx: ConsoleContext): Promise<PanelResult> {
  const db = await ctx.ensurePrisma();
  const bots = await db.discordMember.findMany({
    where: { bot: true },
    orderBy: { roleCount: 'desc' },
  });

  const botUserId = ctx.client.user?.id ?? '';
  const lines: string[] = [];
  for (const b of bots) {
    const tags: string[] = [];
    if (b.discordUserId === ctx.dripUserId || b.discordUserId === botUserId) tags.push('🤖 THIS BOT');
    if (b.roles.includes(ctx.dripRoleId)) tags.push('Has Drip');
    const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
    lines.push(`• **${b.username}** \`${b.discordUserId}\` — ${b.roleCount} roles${tagStr}`);
  }
  if (lines.length === 0) lines.push('No bot accounts found.');

  const embed = new EmbedBuilder()
    .setColor(Color.MUTED)
    .setTitle(`🤖  Bot Accounts (${bots.length})`)
    .setDescription(truncField(lines.join('\n')))
    .setTimestamp();

  return {
    embeds: [embed],
    components: [row(backBtn(Panel.LOGS))],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  RESOURCE USAGE PANEL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Renders a comprehensive resource usage dashboard with real system metrics.
 *
 * DATA SOURCES — All values are queried from actual OS/runtime APIs:
 * - RAM: process.memoryUsage() → RSS, heap, external, array buffers
 * - CPU: process.cpuUsage() → user + system time (microseconds → seconds)
 * - Disk (/Store): Directory walk via getCachedDirectorySize() (60s cache)
 *   On Render, statfsSync shows the container overlay FS, NOT the mounted
 *   volume quota. The only accurate measure is a directory walk of /Store.
 *   The 1 GB total is Render's /Store persistent disk quota (hardcoded).
 * - DB: pg_database_size() via kernel database-resource-manager probes
 * - Tier: Auto-detected via os.totalmem() / process.constrainedMemory()
 * - Resources: resourceManager tracks listeners, timers, connections, caches
 */
export function renderResources(): PanelResult {
  // ── Collect live metrics ───────────────────────────────────────────────
  const mem = process.memoryUsage();
  const cpuRaw = process.cpuUsage();
  const uptimeS = process.uptime();
  const metrics = resourceMonitor.getMetrics();
  const diskStatus = resourceMonitor.getDiskStatus();
  const resourceStats = resourceManager.getStats();

  // DB health (safe — returns defaults if manager not yet started)
  let dbReport: ReturnType<typeof getDatabaseHealthReport> | null = null;
  try {
    dbReport = getDatabaseHealthReport();
  } catch { /* DB resource manager may not be running */ }

  // ── Format memory ──────────────────────────────────────────────────────
  const rss     = (mem.rss / 1024 / 1024).toFixed(1);
  const heapU   = (mem.heapUsed / 1024 / 1024).toFixed(1);
  const heapT   = (mem.heapTotal / 1024 / 1024).toFixed(1);
  const ext     = (mem.external / 1024 / 1024).toFixed(1);
  const arrBuf  = (mem.arrayBuffers / 1024 / 1024).toFixed(1);
  const planMB  = TIER.memory.planLimitMB;
  const rssMB   = mem.rss / 1024 / 1024;
  const rssPct  = ((rssMB / planMB) * 100).toFixed(1);

  const memPressure = rssMB >= TIER.memory.emergencyMB ? '🔴 EMERGENCY'
    : rssMB >= TIER.memory.criticalMB ? '🟠 CRITICAL'
    : rssMB >= TIER.memory.warningMB ? '🟡 WARNING'
    : '🟢 NORMAL';

  // ── Format CPU ─────────────────────────────────────────────────────────
  const cpuUserS   = (cpuRaw.user / 1_000_000).toFixed(1);
  const cpuSystemS = (cpuRaw.system / 1_000_000).toFixed(1);
  const cpuTotalS  = ((cpuRaw.user + cpuRaw.system) / 1_000_000).toFixed(1);
  // Approximate CPU % = (cpu time / wall clock time) × 100
  const cpuPct = uptimeS > 0
    ? (((cpuRaw.user + cpuRaw.system) / 1_000_000) / uptimeS * 100).toFixed(1)
    : '0.0';

  // ── Format disk (/Store) ───────────────────────────────────────────────
  const diskTotalMB = (metrics.diskTotal / 1024 / 1024).toFixed(0);
  const diskUsedMB  = (metrics.diskUsed / 1024 / 1024).toFixed(1);
  const diskPct     = metrics.diskTotal > 0
    ? ((metrics.diskUsed / metrics.diskTotal) * 100).toFixed(1)
    : '0.0';
  const diskPressure = diskStatus.pressureLevel === 'EMERGENCY' ? '🔴 EMERGENCY'
    : diskStatus.pressureLevel === 'CRITICAL' ? '🟠 CRITICAL'
    : diskStatus.pressureLevel === 'WARNING' ? '🟡 WARNING'
    : '🟢 NORMAL';
  const cacheSizeMB = (metrics.cacheSize / 1024 / 1024).toFixed(1);

  // ── Format DB storage ──────────────────────────────────────────────────
  let dbLine: string;
  if (dbReport) {
    const emoji = { healthy: '🟢', warning: '🟡', critical: '🟠', emergency: '🔴' }[dbReport.level];
    dbLine = `${emoji} **${dbReport.level.toUpperCase()}** — ${dbReport.currentSizeMb.toFixed(1)} MB / ${dbReport.storageLimitMb} MB (${dbReport.usagePercent}%)`;
    if (dbReport.trend.sampleCount >= 3) {
      const dir = dbReport.trend.mbPerDay > 0 ? '+' : '';
      dbLine += `\nGrowth: ${dir}${dbReport.trend.mbPerDay} MB/day`;
      if (dbReport.trend.daysUntilFull !== Infinity && dbReport.trend.daysUntilFull < 90) {
        dbLine += ` · ${dbReport.trend.daysUntilFull}d until full`;
      }
    }
    dbLine += `\nRetention: ${dbReport.thresholds.effectiveRetentionDays}d`;
    if (dbReport.thresholds.effectiveRetentionDays < dbReport.thresholds.retentionDays) {
      dbLine += ` (reduced from ${dbReport.thresholds.retentionDays}d)`;
    }
  } else {
    dbLine = 'DB resource manager not active';
  }

  // ── Format resource lifecycle ──────────────────────────────────────────
  const rs = resourceStats;
  const resourceLines = [
    `Total tracked: **${rs.total}**`,
    `Listeners: ${rs.byType.listener} · Timers: ${rs.byType.timer}`,
    `Connections: ${rs.byType.connection} · Caches: ${rs.byType.cache}`,
    `Disk caches: ${rs.byType['disk-cache']} · Buffers: ${rs.byType['disk-buffer']} · Logs: ${rs.byType['disk-log']}`,
  ];
  if (rs.leakSuspects.length > 0) {
    resourceLines.push(`⚠️ Leak suspects: ${rs.leakSuspects.length}`);
  }
  if (rs.diskUsage && rs.diskUsage.totalDiskBytes > 0) {
    resourceLines.push(`Tracked disk: ${(rs.diskUsage.totalDiskBytes / 1024 / 1024).toFixed(1)} MB`);
  }

  // ── Format Render tier ─────────────────────────────────────────────────
  const tierLine = `**${TIER.label}** (detected via ${TIER.detectedVia})`;

  // ── Build embeds ───────────────────────────────────────────────────────
  const memEmbed = new EmbedBuilder()
    .setColor(rssMB >= TIER.memory.criticalMB ? Color.DANGER : rssMB >= TIER.memory.warningMB ? Color.WARNING : Color.SUCCESS)
    .setTitle('📊  Resource Usage — Memory & CPU')
    .addFields(
      { name: 'Render Plan', value: tierLine },
      { name: 'RSS (Total Process)', value: `\`${rss} MB / ${planMB} MB (${rssPct}%)\``, inline: true },
      { name: 'Heap', value: `\`${heapU} / ${heapT} MB\``, inline: true },
      { name: 'Pressure', value: memPressure, inline: true },
      { name: 'External', value: `\`${ext} MB\``, inline: true },
      { name: 'Array Buffers', value: `\`${arrBuf} MB\``, inline: true },
      { name: 'V8 Heap Limit', value: `\`${TIER.heap.maxOldSpaceMB} MB\``, inline: true },
      { name: 'CPU Time', value: `\`${cpuTotalS}s\` (${cpuPct}% avg)\nUser: ${cpuUserS}s · System: ${cpuSystemS}s`, inline: false },
    )
    .setFooter({ text: `PID ${metrics.pid} · Node ${metrics.nodeVersion} · Uptime ${formatUptime(uptimeS * 1000)}` })
    .setTimestamp();

  const storageEmbed = new EmbedBuilder()
    .setColor(diskStatus.pressureLevel !== 'NORMAL' ? Color.WARNING : Color.INFO)
    .setTitle('💾  Resource Usage — Storage')
    .addFields(
      { name: '/Store Disk', value: `\`${diskUsedMB} MB / ${diskTotalMB} MB (${diskPct}%)\` ${diskPressure}\nCache files: ${cacheSizeMB} MB`, inline: false },
      { name: 'Database (PostgreSQL)', value: truncField(dbLine), inline: false },
      { name: 'Resource Lifecycle', value: truncField(resourceLines.join('\n')), inline: false },
    )
    .setFooter({ text: 'Disk = directory walk of /Store · DB = pg_database_size()' })
    .setTimestamp();

  // ── Data source documentation ──────────────────────────────────────────
  const sourceEmbed = new EmbedBuilder()
    .setColor(Color.MUTED)
    .setTitle('🔎  Data Source Methodology')
    .setDescription([
      '**RAM** — `process.memoryUsage()` (actual Node.js RSS + heap)',
      '**CPU** — `process.cpuUsage()` (actual user + system μs)',
      '**Disk** — Directory walk of `/Store` with 60s cache',
      '> `statfsSync` shows container overlay FS on Render,',
      '> not the mounted volume. Walk matches Render Dashboard.',
      '**Disk Total** — Render /Store quota (1 GB, hardcoded)',
      `**DB** — \`pg_database_size()\` via ${dbReport ? `${dbReport.manager.probesCompleted} probes` : 'kernel probes'}`,
      `**Tier** — Auto-detected: \`${TIER.detectedVia}\` (${TIER.detectedRamMB} MB raw)`,
    ].join('\n'));

  return {
    embeds: [memEmbed, storageEmbed, sourceEmbed],
    components: [
      row(
        btn(`${Panel.RESOURCES}:refresh`, 'Refresh', ButtonStyle.Success, '🔄'),
        backBtn(),
      ),
    ],
  };
}
