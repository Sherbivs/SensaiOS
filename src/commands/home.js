import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { createRequire } from 'node:module';
import { getSpriteUrl } from '../lib/assets.js';

const requireESM = createRequire(import.meta.url);
const DEFAULT_STARTER_COINS = 500;
const BATTLE_HISTORY_LIMIT = 3;
const HISTORY_SYMBOL = { WIN: "✅", LOSS: "❌" };

let questModuleCache = null;

function loadQuestModule() {
  if (questModuleCache) return questModuleCache;
  try {
    const mod = requireESM('../models/index.js');
    questModuleCache = mod || {};
  } catch {
    questModuleCache = {};
  }
  return questModuleCache;
}

function toDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? null : parsed;
  }
  return null;
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function diffInUtcDays(a, b) {
  const startA = startOfUtcDay(a).getTime();
  const startB = startOfUtcDay(b).getTime();
  return Math.floor((startA - startB) / (24 * 60 * 60 * 1000));
}

function formatRelativeTimestamp(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return null;
  const unix = Math.floor(date.getTime() / 1000);
  if (!Number.isFinite(unix)) return null;
  return `<t:${unix}:R>`;
}

function fallbackEvaluateDailyQuestStreak(input = {}, now = new Date()) {
  const streak = Number.isFinite(input.streak) ? Math.max(0, Math.floor(input.streak)) : 0;
  const lastCompleted = toDate(input.lastCompleted ?? null);
  const lastReset = toDate(input.lastReset ?? null);

  if (!lastCompleted || streak === 0) {
    return {
      streak: 0,
      status: lastReset ? 'reset' : 'fresh',
      atRisk: false,
      lost: Boolean(lastReset),
      lastCompleted: null,
      lastReset,
      nextDue: null,
      daysSinceCompletion: null,
      message: lastReset
        ? "Your streak reset. Complete today's quest to start a new run."
        : "Complete today's quest to begin your streak.",
    };
  }

  const gap = diffInUtcDays(now, lastCompleted);

  if (gap <= 0) {
    const nextDue = new Date(lastCompleted.getTime() + 24 * 60 * 60 * 1000);
    return {
      streak,
      status: 'locked',
      atRisk: false,
      lost: false,
      lastCompleted,
      lastReset,
      nextDue,
      daysSinceCompletion: 0,
      message: `On a ${streak}-day streak! Next quest unlocks ${formatRelativeTimestamp(nextDue, now) ?? 'soon'}.`,
    };
  }

  if (gap === 1) {
    return {
      streak,
      status: 'due',
      atRisk: true,
      lost: false,
      lastCompleted,
      lastReset,
      nextDue: null,
      daysSinceCompletion: 1,
      message: `Maintain your ${streak}-day streak by completing today's quest.`,
    };
  }

  return {
    streak: 0,
    status: 'reset',
    atRisk: false,
    lost: true,
    lastCompleted,
    lastReset: now,
    nextDue: null,
    daysSinceCompletion: gap,
    message: "Your streak reset after missing a day. Complete today's quest to start over.",
  };
}

function evaluateDailyQuestStreakForView(input = {}, now = new Date()) {
  const mod = loadQuestModule();
  if (mod && typeof mod.evaluateDailyQuestStreak === 'function') {
    try {
      return mod.evaluateDailyQuestStreak({ ...input, now });
    } catch {}
  }
  return fallbackEvaluateDailyQuestStreak(input, now);
}

function buildDailyQuestFieldValue(state, now = new Date()) {
  if (!state || typeof state !== 'object') {
    return "Complete today's quest to begin your streak.";
  }

  const lines = [];
  if (state.status === 'locked') {
    lines.push(`On a ${state.streak}-day streak!`);
    if (state.nextDue) {
      lines.push(`Next quest unlocks ${formatRelativeTimestamp(state.nextDue, now) ?? 'soon'}.`);
    }
    if (state.lastCompleted) {
      lines.push(`Last completed ${formatRelativeTimestamp(state.lastCompleted, now) ?? 'recently'}.`);
    }
  } else if (state.status === 'due') {
    lines.push(`Maintain your ${state.streak}-day streak by completing today's quest.`);
    if (state.lastCompleted) {
      lines.push(`Last completion ${formatRelativeTimestamp(state.lastCompleted, now) ?? 'recently'}.`);
    }
  } else if (state.status === 'reset') {
    lines.push("Your streak reset. Complete today's quest to start a new run.");
    if (state.lastCompleted) {
      lines.push(`Last streak ended ${formatRelativeTimestamp(state.lastCompleted, now) ?? 'recently'}.`);
    }
  } else {
    lines.push("Complete today's quest to begin your streak.");
  }

  return lines.join('\n');
}

function computeDailyQuestState(trainer, now = new Date(), providedState) {
  const baseState = providedState && typeof providedState === 'object' && providedState.status
    ? providedState
    : evaluateDailyQuestStreakForView(
      {
        streak: trainer?.dailyQuestStreak ?? 0,
        lastCompleted: trainer?.dailyQuestLastCompleted ?? null,
        lastReset: trainer?.dailyQuestLastReset ?? null,
      },
      now,
    );

  return {
    ...baseState,
    fieldValue: buildDailyQuestFieldValue(baseState, now),
  };
}

function sanitizeDiscordId(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizeBattleHistory(entries) {
  if (!Array.isArray(entries)) return [];
  const normalized = entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const battleId = typeof entry.battleId === "string" ? entry.battleId : null;
      if (!battleId) return null;
      const outcome = entry.outcome === "WIN" ? "WIN" : entry.outcome === "LOSS" ? "LOSS" : null;
      if (!outcome) return null;
      const opponentDiscordId = sanitizeDiscordId(entry.opponentDiscordId);
      const reward = Number.isFinite(entry.reward) ? Math.round(entry.reward) : null;
      const turnCount = Number.isFinite(entry.turnCount) ? Math.max(0, Math.round(entry.turnCount)) : null;
      let endedAt = null;
      if (entry.endedAt instanceof Date && !Number.isNaN(entry.endedAt.valueOf())) {
        endedAt = entry.endedAt.toISOString();
      } else if (typeof entry.endedAt === "string") {
        const parsed = new Date(entry.endedAt);
        if (!Number.isNaN(parsed.valueOf())) endedAt = parsed.toISOString();
      }
      return {
        battleId,
        outcome,
        opponentDiscordId,
        reward,
        turnCount,
        endedAt,
      };
    })
    .filter(Boolean)
    .slice(0, BATTLE_HISTORY_LIMIT);
  return normalized;
}

function formatBattleHistoryEntry(entry) {
  if (!entry) return "";
  const symbol = HISTORY_SYMBOL[entry.outcome] || "•";
  const outcomeLabel = entry.outcome === "WIN" ? "Win" : "Loss";
  const opponentLabel = entry.opponentDiscordId ? `<@${entry.opponentDiscordId}>` : "an unknown trainer";
  const rewardPart = typeof entry.reward === "number" ? ` — ${entry.reward >= 0 ? "+" : ""}${entry.reward} coins` : "";
  const turnPart = typeof entry.turnCount === "number" && entry.turnCount > 0 ? ` (${entry.turnCount} turns)` : "";
  const idSuffix = entry.battleId ? ` · ${entry.battleId}` : "";
  return `${symbol} ${outcomeLabel} vs ${opponentLabel}${rewardPart}${turnPart}${idSuffix}`;
}

const HOME_INCLUDE = {
  parties: {
    include: {
      slots: {
        include: { pokemon: true },
        orderBy: { slot: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 1,
  },
  cooldowns: {
    where: { kind: 'daily' },
    orderBy: { readyAt: 'desc' },
    take: 1,
  },
};

let prismaSingleton = globalThis.__dmHomePrisma || null;

function asDiscordTimestamp(date, nowRef = new Date()) {
  if (!date) return 'Ready now';
  const readyAt = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(readyAt.getTime())) return 'Ready now';
  if (readyAt <= nowRef) return 'Ready now';
  const unix = Math.floor(readyAt.getTime() / 1000);
  return `<t:${unix}:R>`;
}

function mapTrainerToView(trainer, now = new Date(), options = {}) {
  const battleHistory = normalizeBattleHistory(options?.battleHistory ?? []);
  const dailyQuest = computeDailyQuestState(trainer, now, options?.questState);
  if (!trainer) {
    return {
      coins: 0,
      nextDaily: 'Ready now',
      party: [],
      showStarters: true,
      battleHistory,
      dailyQuest,
    };
  }

  const nextDaily = trainer.cooldowns && trainer.cooldowns[0]
    ? asDiscordTimestamp(trainer.cooldowns[0].readyAt, now)
    : 'Ready now';

  const rawSlots = (trainer.parties?.[0]?.slots ?? []).slice().sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  const party = rawSlots.map((slot) => {
    const mon = slot.pokemon || {};
    const displayName = mon.nickname || (mon.speciesId ? `Species #${mon.speciesId}` : 'Empty slot');
    return {
      slot: slot.slot ?? 0,
      speciesId: mon.speciesId ?? null,
      name: displayName,
      hp: typeof mon.hp === 'number' ? mon.hp : null,
      maxHp: typeof mon.maxHp === 'number' ? mon.maxHp : null,
      isShiny: Boolean(mon.isShiny),
    };
  });

  const showStarters = !party.some((member) => member.speciesId);

  return {
    coins: typeof trainer.coins === 'number' ? trainer.coins : 0,
    nextDaily,
    party,
    showStarters,
    battleHistory,
    dailyQuest,
  };
}

async function getPrisma() {
  if (prismaSingleton) return prismaSingleton;
  try {
    const mod = requireESM('../models/index.js');
    if (mod?.prisma) {
      prismaSingleton = mod.prisma;
      if (process.env.NODE_ENV !== 'production') {
        globalThis.__dmHomePrisma = prismaSingleton;
      }
      return prismaSingleton;
    }
  } catch {}

  try {
    const { PrismaClient } = requireESM('@prisma/client');
    prismaSingleton = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
    if (process.env.NODE_ENV !== 'production') {
      globalThis.__dmHomePrisma = prismaSingleton;
    }
    return prismaSingleton;
  } catch (err) {
    console.error('[home] Failed to initialise Prisma client:', err?.message || err);
    return null;
  }
}

async function loadTrainerWithBootstrap(prisma, discordId) {
  let createdUser = false;
  let createdParty = false;

  let trainer = await prisma.user.findUnique({ where: { discordId }, include: HOME_INCLUDE });
  if (!trainer) {
    createdUser = true;
    trainer = await prisma.user.create({
      data: {
        discordId,
        coins: DEFAULT_STARTER_COINS,
        dailyQuestStreak: 0,
        parties: { create: [{}] },
      },
      include: HOME_INCLUDE,
    });
  }

  if (!trainer.parties || trainer.parties.length === 0) {
    createdParty = true;
    await prisma.party.create({
      data: {
        ownerId: trainer.id,
      },
    });
    trainer = await prisma.user.findUnique({ where: { id: trainer.id }, include: HOME_INCLUDE });
  }

  return { trainer, createdUser, createdParty };
}

function buildHomeEmbed({ coins = 0, nextDaily = 'Ready now', party = [], battleHistory = [], dailyQuest = null }) {
  const embed = new EmbedBuilder()
    .setTitle('Your Pokémon Home')
    .setDescription(`Coins: ${coins} • Next Daily: ${nextDaily}`)
    .setColor(0x35a7ff);

  const hasPokemon = party.some((member) => member.speciesId);
  const lines = [];

  if (hasPokemon) {
    const limited = party.filter((member) => member.speciesId).slice(0, 6);
    limited.forEach((member, index) => {
      const sprite = getSpriteUrl(member.speciesId ?? member.name ?? member.slot, 'sprite');
      const hpLabel = member.hp != null && member.maxHp != null ? `HP ${member.hp} / ${member.maxHp}` : 'HP ?';
      const shiny = member.isShiny ? ' ✨' : '';
      const label = `#${index + 1} ${member.name}${shiny} — ${hpLabel}`;
      lines.push(`${label}${sprite ? `\n${sprite}` : ''}`);
    });
  } else {
    lines.push('No party yet. Use /starter to choose your first Pokémon.');
  }


  const questValue = dailyQuest?.fieldValue && dailyQuest.fieldValue.trim().length > 0
    ? dailyQuest.fieldValue
    : "Complete today's quest to begin your streak.";
  embed.addFields({ name: 'Daily Quest', value: questValue });

  const historyEntries = normalizeBattleHistory(battleHistory);
  if (historyEntries.length > 0) {
    const historyLines = historyEntries.map((entry) => formatBattleHistoryEntry(entry)).filter(Boolean);
    embed.addFields({ name: 'Battle History', value: historyLines.join('\n') });
  } else {
    embed.addFields({
      name: 'Battle History',
      value: 'No finished battles yet. Try the Arena to start your record!',
    });
  }
  embed.addFields({ name: 'Party', value: lines.join('\n') });
  return embed;
}

function buildHomeButtons({ showStarters = true } = {}) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('HOME_HEAL').setLabel('Heal').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('HOME_PARTY').setLabel('Party').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('HOME_BOX').setLabel('Box').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('HOME_PROFILE').setLabel('Profile').setStyle(ButtonStyle.Secondary),
  );
  if (showStarters) {
    row.addComponents(
      new ButtonBuilder().setCustomId('HOME_STARTERS').setLabel('Starters').setStyle(ButtonStyle.Success),
    );
  }
  return [row];
}

function summarizeBattleForTrainer(battle, trainerDiscordId) {
  if (!battle || !trainerDiscordId) return null;

  const result = typeof battle.resultJson === 'object' && battle.resultJson !== null ? battle.resultJson : {};
  const winnerDiscordId = sanitizeDiscordId(result.winnerDiscordId ?? result.winner?.discordId);
  const loserDiscordId = sanitizeDiscordId(result.loserDiscordId ?? result.loser?.discordId);

  const rewards = typeof result.rewards === 'object' && result.rewards !== null ? result.rewards : {};
  const turnCount = Number.isFinite(result.turnCount) ? Math.round(result.turnCount) : null;
  const endedAt = battle.endedAt instanceof Date && !Number.isNaN(battle.endedAt.valueOf())
    ? battle.endedAt
    : battle.startedAt instanceof Date && !Number.isNaN(battle.startedAt.valueOf())
      ? battle.startedAt
      : null;

  if (winnerDiscordId === trainerDiscordId) {
    const opponent = sanitizeDiscordId(loserDiscordId ?? (sanitizeDiscordId(battle.p1?.discordId) === trainerDiscordId ? battle.p2?.discordId : battle.p1?.discordId));
    return {
      battleId: typeof battle.id === 'string' ? battle.id : 'battle',
      outcome: 'WIN',
      opponentDiscordId: opponent,
      reward: Number.isFinite(rewards.winner) ? Math.round(rewards.winner) : null,
      turnCount,
      endedAt,
    };
  }

  if (loserDiscordId === trainerDiscordId) {
    const opponent = sanitizeDiscordId(winnerDiscordId ?? (sanitizeDiscordId(battle.p1?.discordId) === trainerDiscordId ? battle.p2?.discordId : battle.p1?.discordId));
    return {
      battleId: typeof battle.id === 'string' ? battle.id : 'battle',
      outcome: 'LOSS',
      opponentDiscordId: opponent,
      reward: Number.isFinite(rewards.loser) ? Math.round(rewards.loser) : null,
      turnCount,
      endedAt,
    };
  }

  return null;
}

async function loadRecentBattleHistory(prisma, trainer) {
  if (!prisma || !trainer?.id || !trainer?.discordId) return [];
  try {
    const battles = await prisma.battle.findMany({
      where: {
        state: 'Finished',
        OR: [{ p1Id: trainer.id }, { p2Id: trainer.id }],
      },
      orderBy: [
        { endedAt: 'desc' },
        { startedAt: 'desc' },
      ],
      take: BATTLE_HISTORY_LIMIT,
      select: {
        id: true,
        endedAt: true,
        startedAt: true,
        resultJson: true,
        p1: { select: { discordId: true } },
        p2: { select: { discordId: true } },
      },
    });

    return battles
      .map((battle) => {
        const hydrated = {
          ...battle,
          p1: battle.p1 ?? {},
          p2: battle.p2 ?? {},
        };
        return summarizeBattleForTrainer(hydrated, trainer.discordId);
      })
      .filter(Boolean);
  } catch (err) {
    console.error(`[home] Failed to load battle history for ${trainer?.discordId ?? 'unknown'}:`, err?.message || err);
    return [];
  }
}

const internals = {
  mapTrainerToView,
  buildHomeEmbed,
  asDiscordTimestamp,
  loadTrainerWithBootstrap,
  loadRecentBattleHistory,
  formatBattleHistoryEntry,
  computeDailyQuestState,
  buildDailyQuestFieldValue,
  formatRelativeTimestamp,
};

const command = {
  data: new SlashCommandBuilder().setName('home').setDescription('Open your Pokémon home in DMs'),
  cooldownMs: 1000,
  async execute(interaction) {
    let view = {
      coins: 0,
      nextDaily: 'Ready now',
      party: [],
      showStarters: true,
      battleHistory: [],
      dailyQuest: computeDailyQuestState(null),
    };
    try {
      const prisma = await getPrisma();
      if (!prisma) {
        console.warn('[home] Prisma client unavailable — showing placeholder Home view.');
      } else {
        const { trainer, createdUser, createdParty } = await loadTrainerWithBootstrap(prisma, interaction.user.id);
        const battleHistory = await loadRecentBattleHistory(prisma, trainer);
        const now = new Date();
        let questState = null;
        let trainerForView = trainer;
        const mod = loadQuestModule();
        if (mod && typeof mod.ensureDailyQuestStreakFreshness === 'function') {
          try {
            const freshness = await mod.ensureDailyQuestStreakFreshness({ trainer, prisma, now });
            trainerForView = freshness?.trainer ?? trainer;
            questState = freshness?.state ?? null;
          } catch (err) {
            console.warn('[home] Failed to refresh quest streak state:', err?.message || err);
          }
        }

        view = mapTrainerToView(trainerForView, now, { battleHistory, questState });
        if (createdUser) {
          console.info(`[home] Created trainer baseline for ${interaction.user.id} (coins=${DEFAULT_STARTER_COINS}).`);
        }
        if (createdParty) {
          console.info(`[home] Created starter party shell for ${interaction.user.id}.`);
        }
        if (!view.party.some((member) => member.speciesId)) {
          console.warn(`[home] Trainer ${interaction.user.id} has no Pokémon yet — prompt them to use /starter.`);
        }
      }
    } catch (err) {
      console.error('[home] Failed to load trainer data:', err?.message || err);
    }

    try {
      const embed = buildHomeEmbed(view);
      const components = buildHomeButtons({ showStarters: view.showStarters });

      const dm = await interaction.user.createDM();
      await dm.send({ embeds: [embed], components });

      if (interaction.inGuild?.()) {
        await interaction.reply({ content: 'I opened your Home in DMs.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'Home opened above.', ephemeral: false });
      }
    } catch (err) {
      console.error('[home] Failed to open DM Home:', err?.message || err);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Could not open your DM Home. Check your privacy settings.', ephemeral: true });
        }
      } catch {}
    }
  },
  _internals: internals,
};

const { data, cooldownMs, execute, _internals } = command;

export { data, cooldownMs, execute, _internals };

export default command;
