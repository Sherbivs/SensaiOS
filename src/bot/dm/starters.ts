import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  User as DiscordUser,
  RepliableInteraction,
} from "discord.js";

import { ensureUser } from "../../shared/models/user-queries-pg.js";
import { getPartyWithSlots, createParty, createPartySlot, createPokemon } from "../../shared/models/party-queries-pg.js";
import { getProdDb } from "../../shared/pg-connection.js";

// Kanto starters (species IDs per National Dex)
export const STARTER_OPTIONS = [
  { speciesId: 1, name: "Bulbasaur" },
  { speciesId: 4, name: "Charmander" },
  { speciesId: 7, name: "Squirtle" },
];

export function buildStartersEmbed() {
  const embed = new EmbedBuilder()
    .setTitle("Choose your starter")
    .setDescription("Pick one of the classic starters. This is a one-time choice.")
    .setColor(0x00c853);

  embed.addFields(
    STARTER_OPTIONS.map((s) => ({
      name: `${s.name}`,
      value: `Level 5 • Classic starter`,
      inline: true,
    }))
  );

  return embed;
}

export function buildStartersButtons() {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...STARTER_OPTIONS.map((s) =>
      new ButtonBuilder()
        .setCustomId(`STARTER_PICK_${s.speciesId}`)
        .setLabel(s.name)
        .setStyle(ButtonStyle.Success)
    )
  );
  return [row];
}

export async function openStartersDM(user: DiscordUser) {
  const dm = await user.createDM();
  const embed = buildStartersEmbed();
  const components = buildStartersButtons();
  await dm.send({ embeds: [embed], components });
}

type CreateOpts = { discordId: string; speciesId: number };

// Minimal stat bootstrap without referencing the full Dex yet
function computeInitialStats(level: number) {
  const maxHp = 20 + level * 3; // simple placeholder formula
  return { hp: maxHp, maxHp };
}

export async function createStarterAndAssignParty({
  discordId,
  speciesId,
}: CreateOpts) {
  // Ensure user exists
  const user = await ensureUser(discordId);

  // Check if user already owns any Pokemon — starter is one-time
  const db = getProdDb();
  const countResult = await db.query(
    'SELECT COUNT(*)::int as count FROM "PokemonInstance" WHERE "ownerId" = $1',
    [user.id]
  );
  const existingCount = countResult.rows[0]?.count ?? 0;
  
  if (existingCount > 0) {
    return { alreadyHasStarter: true } as const;
  }

  const level = 5;
  const { hp, maxHp } = computeInitialStats(level);

  const ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
  const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const moves = [
    { id: 33, name: "Tackle", pp: 35, maxPP: 35 }, // placeholder ids
    { id: 45, name: "Growl", pp: 40, maxPP: 40 },
  ];

  const created = await createPokemon({
    ownerId: user.id,
    speciesId,
    level,
    exp: 0,
    nature: null,
    ivsJson: ivs,
    evsJson: evs,
    movesJson: moves,
    status: null,
    hp,
    maxHp,
    isShiny: false,
    nickname: null,
    boxSlot: null,
  });

  // Ensure a party exists and get available slots in one query
  const party = await getPartyWithSlots(user.id);
  
  let partyId: string;
  let slots: Array<{ slot: number }>;
  
  if (!party) {
    // Create new party
    const newParty = await createParty(user.id);
    partyId = newParty.id;
    slots = [];
  } else {
    partyId = party.id;
    slots = party.slots;
  }

  // Determine next available slot 1..6
  const used = new Set(slots.map((s) => s.slot));
  let nextSlot = 1;
  for (; nextSlot <= 6; nextSlot++) {
    if (!used.has(nextSlot)) break;
  }
  if (nextSlot > 6) {
    // If party is full, just leave it in the box
    return { created, partyFull: true } as const;
  }

  await createPartySlot(partyId, created.id, nextSlot);

  return { created, partyFull: false } as const;
}

export async function handleStarterPick(
  interaction: RepliableInteraction,
  speciesId: number
) {
  const discordId = interaction.user.id;
  const res = await createStarterAndAssignParty({ discordId, speciesId });
  if ("alreadyHasStarter" in res && res.alreadyHasStarter) {
    await interaction.reply({
      content: "You already have a Pokémon. Starter can only be chosen once.",
      ephemeral: true,
    });
    return;
  }

  if (res.partyFull) {
    await interaction.reply({
      content:
        "You received your starter! Your party is full, so it was placed in your box.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: `You received your starter! Welcome to the world of Pokémon.`,
    ephemeral: true,
  });
}
