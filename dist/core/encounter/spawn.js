import { prisma as prismaClient } from "../../models/index.js";
// Simple helpers are exported for testability
export function chooseSpeciesId() {
    // Placeholder: pick one from a small early-game range
    const candidates = [10, 13, 16, 19, 21, 23, 25];
    return candidates[Math.floor(Math.random() * candidates.length)];
}
export function chooseLevel() {
    // Early encounters: level 2..6
    return 2 + Math.floor(Math.random() * 5);
}
/**
 * Creates an Encounter row in Spawned state for a user and returns it.
 * A simple TTL of 60 minutes is applied via expiresAt.
 */
export async function spawnEncounterForUser(opts) {
    const prisma = opts.prisma ?? prismaClient;
    const user = await prisma.user.findUnique({ where: { discordId: opts.discordId } });
    if (!user)
        throw new Error("User not found for spawn");
    const speciesId = chooseSpeciesId();
    const level = chooseLevel();
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    const enc = await prisma.encounter.create({
        data: {
            ownerId: user.id,
            speciesId,
            level,
            state: "Spawned",
            dataJson: {},
            expiresAt: expires,
        },
    });
    return enc;
}
