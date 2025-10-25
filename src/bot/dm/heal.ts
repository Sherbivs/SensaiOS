import { RepliableInteraction } from "discord.js";
import { prisma, UserRepo } from "../../models/index.js";

export async function healPartyForUser(discordId: string) {
  const user = await UserRepo.upsertByDiscordId(discordId);
  // Find user's first party
  const party = await prisma.party.findFirst({ where: { ownerId: user.id } });
  if (!party) return { healed: 0 } as const;

  const slots = await prisma.partySlot.findMany({ where: { partyId: party.id } });
  if (!slots.length) return { healed: 0 } as const;

  const pokemonIds = slots.map((s) => s.pokemonId);
  // Fetch instances to know maxHp
  const instances = await prisma.pokemonInstance.findMany({
    where: { id: { in: pokemonIds } },
    select: { id: true, maxHp: true },
  });

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
