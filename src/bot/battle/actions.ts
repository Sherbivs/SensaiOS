import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  User as DiscordUser,
} from "discord.js";
import type { PrismaClient } from "@prisma/client";
import { prisma as prismaClient, BattleRepo } from "../../models/index.js";
import type { BattleWithPlayers } from "../../models/index.js";
import * as concludeModule from "./conclude.js";

export const MOVE_PREFIX = "BATTLE_MOVE_";
export const SWITCH_PREFIX = "BATTLE_SWITCH_";
export const FORFEIT_PREFIX = "BATTLE_FORFEIT_";

type PrismaLike = PrismaClient;

export function buildBattleActionPrompt(battleId: string) {
  const embed = new EmbedBuilder()
    .setTitle("Your Move")
    .setDescription("Choose an action for this turn.")
    .setColor(0x2196f3);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${MOVE_PREFIX}${battleId}`).setLabel("Move").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${SWITCH_PREFIX}${battleId}`).setLabel("Switch").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${FORFEIT_PREFIX}${battleId}`).setLabel("Forfeit").setStyle(ButtonStyle.Danger)
  );

  return { embed, components: [row] };
}

async function loadBattle(prisma: PrismaLike, battleId: string): Promise<BattleWithPlayers | null> {
  return prisma.battle.findUnique({ where: { id: battleId }, include: { p1: true, p2: true } }) as any;
}

export async function openActionDMs(battleId: string, clientUserFetcher: (id: string) => Promise<DiscordUser>) {
  const prisma = prismaClient;
  const battle = await loadBattle(prisma, battleId);
  if (!battle) return false;
  const payload = buildBattleActionPrompt(battle.id);
  try {
    const u1 = await clientUserFetcher(battle.p1.discordId);
    const dm1 = await u1.createDM();
    await dm1.send({ embeds: [payload.embed], components: payload.components });
  } catch {}
  try {
    const u2 = await clientUserFetcher(battle.p2.discordId);
    const dm2 = await u2.createDM();
    await dm2.send({ embeds: [payload.embed], components: payload.components });
  } catch {}
  return true;
}

function parse(customId: string) {
  if (customId.startsWith(MOVE_PREFIX)) return { kind: "move" as const, battleId: customId.substring(MOVE_PREFIX.length) };
  if (customId.startsWith(SWITCH_PREFIX)) return { kind: "switch" as const, battleId: customId.substring(SWITCH_PREFIX.length) };
  if (customId.startsWith(FORFEIT_PREFIX)) return { kind: "forfeit" as const, battleId: customId.substring(FORFEIT_PREFIX.length) };
  return null;
}

export async function handleBattleActionButton(interaction: ButtonInteraction, opts: { prisma?: PrismaLike } = {}) {
  const parsed = parse(interaction.customId);
  if (!parsed) return;

  const prisma = opts.prisma ?? prismaClient;
  const battle = await loadBattle(prisma, parsed.battleId);
  if (!battle) {
    await interaction.reply({ content: "This battle no longer exists.", ephemeral: true });
    return;
  }
  if (battle.state !== "Active") {
    await interaction.reply({ content: `Battle is ${battle.state}.`, ephemeral: true });
    return;
  }

  if (parsed.kind === "move") {
    await interaction.reply({ content: "Move selection UI coming soon.", ephemeral: true });
    return;
  }
  if (parsed.kind === "switch") {
    await interaction.reply({ content: "Switch UI coming soon.", ephemeral: true });
    return;
  }

  if (parsed.kind === "forfeit") {
    const identify = (...values: Array<string | null | undefined>) => {
      const ids = new Set<string>();
      for (const value of values) {
        if (Array.isArray(value)) {
          for (const entry of value) {
            if (entry != null) ids.add(String(entry));
          }
        } else if (value != null) {
          ids.add(String(value));
        }
      }
      return ids;
    };

    const userIds = identify((interaction.user as any)?.id, (interaction.user as any)?.discordId);
    const p1Ids = identify(battle.p1?.id, (battle.p1 as any)?.userId, battle.p1?.discordId);
    const forfeiterIsP1 = Array.from(p1Ids).some((id) => userIds.has(id));
    const winnerKey = forfeiterIsP1 ? "p2" : "p1";
    const result = await BattleRepo.concludeBattle({
      prisma,
      battle,
      winner: winnerKey,
      turnCount: 0,
      reason: "forfeit",
    });

    await concludeModule.announceBattleResult({
      client: interaction.client as any,
      battle,
      result,
      updateLoserInteraction: async (message) => {
        await interaction.update({ content: message, components: [] });
      },
    });
    return;
  }
}

export const __testing = { parse };
