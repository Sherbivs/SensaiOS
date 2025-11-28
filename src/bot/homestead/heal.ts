/**
 * Homestead Heal Module
 * 
 * Handles Pokémon party healing in homestead channels.
 * Migrated from src/bot/dm/heal.ts (DM-based implementation).
 * 
 * @module homestead/heal
 */

import { RepliableInteraction } from "discord.js";

import { ensureUser } from "../../shared/models/user-queries-pg.js";
import { getPartyWithSlots, healPokemon } from "../../shared/models/party-queries-pg.js";

export async function healPartyForUser(discordId: string) {
  const user = await ensureUser(discordId);
  // Find user's first party with all slots and pokemon in one query
  const party = await getPartyWithSlots(user.id);
  if (!party) return { healed: 0 } as const;

  const slots = party.slots;
  if (!slots.length) return { healed: 0 } as const;

  // Extract pokemon instances from the joined query result
  const instances = slots
    .map((slot) => slot.pokemon)
    .filter((pokemon): pokemon is NonNullable<typeof pokemon> => pokemon !== null);

  if (!instances.length) return { healed: 0 } as const;

  // Heal all pokemon instances at once
  const healed = await healPokemon(instances.map(p => p.id));
  return { healed } as const;
}

export async function handleHeal(interaction: RepliableInteraction) {
  const discordId = interaction.user.id;
  const res = await healPartyForUser(discordId);
  if (res.healed === 0) {
    await interaction.reply({
      content: "You don't have a party to heal yet. Use /starter to pick one!",
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: `Healed your party (restored ${res.healed} Pokémon).`,
      ephemeral: true,
    });
  }
}
