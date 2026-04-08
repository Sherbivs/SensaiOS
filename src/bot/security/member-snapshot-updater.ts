// Security Bot Persistent Member Snapshot Updater
// Fetches all eligible (non-bot) members for each guild and updates the SecurityMemberSnapshot table.

import { Client, Guild } from 'discord.js';
import { prisma } from '../../shared/prisma.js';

/**
 * Fetch all eligible (non-bot) members for a guild and upsert into SecurityMemberSnapshot.
 */
export async function updateGuildMemberSnapshot(guild: Guild): Promise<number> {
  // Fetch all members (requires GUILD_MEMBERS intent)
  await guild.members.fetch();
  const eligible = guild.members.cache.filter(m => !m.user.bot);
  const now = new Date();

  // Remove old snapshot for this guild
  await prisma.securityMemberSnapshot.deleteMany({ where: { guildId: guild.id } });

  // Upsert all eligible members
  const data = eligible.map(m => ({
    guildId: guild.id,
    userId: m.id,
    username: m.user.username,
    discriminator: m.user.discriminator,
    isBot: false,
    snapshotAt: now,
  }));
  // Batch insert
  for (const chunk of chunkArray(data, 100)) {
    await prisma.securityMemberSnapshot.createMany({ data: chunk });
  }
  return eligible.size;
}

/**
 * Update all guilds for the client.
 */
export async function updateAllGuildSnapshots(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    await updateGuildMemberSnapshot(guild);
  }
}

function chunkArray(arr: any[], size: number): any[][] {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
