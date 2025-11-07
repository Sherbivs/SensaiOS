import { RepliableInteraction } from "discord.js";

import { prisma, UserRepo } from "../../models/index.js";
import { getPartyWithSlots } from "../../shared/models/index.js";

export async function healPartyForUser(discordId: string) {
  const user = await UserRepo.upsertByDiscordId(discordId);
  // Find user's first party with all slots and pokemon in one query
  const party = await getPartyWithSlots(prisma, user.id);
  if (!party) return { healed: 0 } as const;

  const slots = party.slots;
  if (!slots.length) return { healed: 0 } as const;

  // Extract pokemon instances from the joined query result
  const instances = slots
    .map((slot) => slot.pokemon)
    .filter((pokemon): pokemon is NonNullable<typeof pokemon> => pokemon !== null);

  if (!instances.length) return { healed: 0 } as const;

  // Heal each instance
  const updates = instances.map((p) =>
    prisma.pokemonInstance.update({
      where: { id: p.id },
      data: { hp: p.maxHp, status: null },
    })
  );
  await prisma.$transaction(updates);
  return { healed: instances.length } as const;
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
