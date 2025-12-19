/**
 * Centralized Party Query Patterns
 * 
 * Purpose: Eliminate duplicate party+slots query patterns across codebase
 * Used by: DM flows, battle handlers, encounter logic, healing
 * 
 * Performance: Reduces 3 sequential queries to 1 joined query (10-20ms improvement)
 */

import { PrismaClient, Party, PartySlot, PokemonInstance } from '../../generated/prisma/client.js';

/**
 * Standard include pattern for party with slots and Pokemon
 * Use this constant for consistency across all party queries
 */
export const PARTY_WITH_SLOTS_INCLUDE = {
  slots: {
    include: {
      pokemon: true,
    },
    orderBy: { slot: "asc" as const },
  },
} as const;

/**
 * Party with slots and Pokemon instances fully loaded
 */
export type PartyWithSlots = Party & {
  slots: Array<PartySlot & { pokemon: PokemonInstance }>;
};

/**
 * Get user's first party with all slots and Pokemon loaded
 * 
 * Replaces pattern:
 *   const party = await prisma.party.findFirst({ where: { ownerId } });
 *   const slots = await prisma.partySlot.findMany({ where: { partyId: party.id } });
 *   const pokemon = await prisma.pokemonInstance.findMany(...);
 * 
 * @param prisma - Prisma client instance
 * @param ownerId - User ID who owns the party
 * @returns Party with slots and Pokemon, or null if no party exists
 */
export async function getPartyWithSlots(
  prisma: PrismaClient,
  ownerId: string
): Promise<PartyWithSlots | null> {
  return prisma.party.findFirst({
    where: { ownerId },
    include: PARTY_WITH_SLOTS_INCLUDE,
  }) as Promise<PartyWithSlots | null>;
}

/**
 * Get party by ID with slots and Pokemon loaded
 * 
 * @param prisma - Prisma client instance
 * @param partyId - Party ID to fetch
 * @returns Party with slots and Pokemon, or null if not found
 */
export async function getPartyByIdWithSlots(
  prisma: PrismaClient,
  partyId: string
): Promise<PartyWithSlots | null> {
  return prisma.party.findUnique({
    where: { id: partyId },
    include: PARTY_WITH_SLOTS_INCLUDE,
  }) as Promise<PartyWithSlots | null>;
}

/**
 * Get all parties for a user with slots and Pokemon
 * Less common, but useful for profile/admin views
 * 
 * @param prisma - Prisma client instance
 * @param ownerId - User ID who owns the parties
 * @returns Array of parties with slots and Pokemon
 */
export async function getAllPartiesWithSlots(
  prisma: PrismaClient,
  ownerId: string
): Promise<PartyWithSlots[]> {
  return prisma.party.findMany({
    where: { ownerId },
    include: PARTY_WITH_SLOTS_INCLUDE,
    orderBy: { createdAt: "asc" },
  }) as Promise<PartyWithSlots[]>;
}

/**
 * Check if user has any party
 * Lightweight query when you only need existence check
 * 
 * @param prisma - Prisma client instance
 * @param ownerId - User ID to check
 * @returns True if user has at least one party
 */
export async function hasParty(
  prisma: PrismaClient,
  ownerId: string
): Promise<boolean> {
  const count = await prisma.party.count({ where: { ownerId } });
  return count > 0;
}

/**
 * Get party with only slot count (no Pokemon data)
 * Use when you only need to know how many slots are filled
 * 
 * @param prisma - Prisma client instance
 * @param ownerId - User ID who owns the party
 * @returns Party with slot count, or null
 */
export async function getPartyWithSlotCount(
  prisma: PrismaClient,
  ownerId: string
): Promise<(Party & { _count: { slots: number } }) | null> {
  return prisma.party.findFirst({
    where: { ownerId },
    include: {
      _count: {
        select: { slots: true },
      },
    },
  });
}
