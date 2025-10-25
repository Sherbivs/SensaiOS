'use strict';
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { createRequire } = require('node:module');
const { getSpriteUrl } = require('../lib/assets.js');

const requireESM = createRequire(__filename);
const DEFAULT_STARTER_COINS = 500;

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

function mapTrainerToView(trainer, now = new Date()) {
  if (!trainer) {
    return {
      coins: 0,
      nextDaily: 'Ready now',
      party: [],
      showStarters: true,
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
    const { PrismaClient } = require('@prisma/client');
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

function buildHomeEmbed({ coins = 0, nextDaily = 'Ready now', party = [] }) {
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

module.exports = {
  data: new SlashCommandBuilder().setName('home').setDescription('Open your Pokémon home in DMs'),
  cooldownMs: 1000,
  async execute(interaction) {
    let view = { coins: 0, nextDaily: 'Ready now', party: [], showStarters: true };
    try {
      const prisma = await getPrisma();
      if (!prisma) {
        console.warn('[home] Prisma client unavailable — showing placeholder Home view.');
      } else {
        const { trainer, createdUser, createdParty } = await loadTrainerWithBootstrap(prisma, interaction.user.id);
        view = mapTrainerToView(trainer);
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
  _internals: {
    mapTrainerToView,
    buildHomeEmbed,
    asDiscordTimestamp,
    loadTrainerWithBootstrap,
  },
};
