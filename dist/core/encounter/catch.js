import { prisma as prismaClient, UserRepo } from "../../models/index.js";
import { invalidateEncounter, loadEncounter } from "../../services/cache/recipes.js";
import { getPartyWithSlots } from "../../shared/models/party-queries-pg.js";
import { clamp } from "../../shared/utils/index.js";
function ballBonus(ball) {
    switch (ball) {
        case "great":
            return 0.1;
        case "ultra":
            return 0.2;
        default:
            return 0;
    }
}
/**
 * Very simple v1 catch chance based on level and ball type.
 * Lower level -> easier. Returns probability in [0.05, 0.95].
 */
export function catchChance(level, ball = "poke") {
    const base = 0.5 - level * 0.02; // Lv2=0.46, Lv6=0.38
    const chance = base + ballBonus(ball);
    return clamp(chance, 0.05, 0.95);
}
function computeInitialStats(level) {
    const maxHp = 20 + level * 3; // simple placeholder formula (same shape as starters)
    return { hp: maxHp, maxHp };
}
export async function attemptCatch(opts) {
    const prisma = opts.prisma ?? prismaClient;
    const ball = opts.ball ?? "poke";
    const user = await UserRepo.upsertByDiscordId(opts.discordId, prisma);
    const enc = await loadEncounter(opts.encounterId, { prisma });
    if (!enc || enc.ownerId !== user.id) {
        return { ok: false, reason: "not_found_or_not_owner" };
    }
    if (enc.state !== "Spawned") {
        return { ok: false, reason: "not_spawned" };
    }
    if (enc.expiresAt && enc.expiresAt.getTime() <= Date.now()) {
        await prisma.encounter.update({ where: { id: enc.id }, data: { state: "Expired" } });
        await invalidateEncounter(enc.id);
        return { ok: false, reason: "expired" };
    }
    // Roll - caller should provide deterministic roll from RNG context
    const p = catchChance(enc.level, ball);
    const roll = opts.roll ?? 0.5; // Default to 50% if no roll provided (deterministic fallback)
    const success = roll < p;
    // Track attempts in dataJson
    const prev = enc.dataJson ?? {};
    const prevAttempts = typeof prev.attempts === "number" ? prev.attempts : 0;
    const attempts = prevAttempts + 1;
    if (!success) {
        const failureData = {
            ...prev,
            attempts,
            lastBall: ball,
            lastRoll: roll,
            lastChance: p,
        };
        await prisma.encounter.update({
            where: { id: enc.id },
            data: { dataJson: failureData },
        });
        await invalidateEncounter(enc.id);
        return { ok: true, caught: false, attempts, chance: p, roll };
    }
    // Success: mark Caught, create a PokemonInstance for the user
    const { hp, maxHp } = computeInitialStats(enc.level);
    const ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
    const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    const moves = [
        { id: 33, name: "Tackle", pp: 35, maxPP: 35 },
    ];
    const created = await prisma.pokemonInstance.create({
        data: {
            ownerId: user.id,
            speciesId: enc.speciesId,
            level: enc.level,
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
        },
    });
    // Try to assign to party if slot is available
    const party = await getPartyWithSlots(user.id);
    if (!party) {
        // Create party if it doesn't exist
        const newParty = await prisma.party.create({ data: { ownerId: user.id } });
        await prisma.partySlot.create({ data: { partyId: newParty.id, pokemonId: created.id, slot: 1 } });
    }
    else {
        const slots = party.slots ?? [];
        const used = new Set(slots.map((s) => s.slot));
        let nextSlot = 1;
        for (; nextSlot <= 6; nextSlot++)
            if (!used.has(nextSlot))
                break;
        if (nextSlot <= 6) {
            await prisma.partySlot.create({ data: { partyId: party.id, pokemonId: created.id, slot: nextSlot } });
        }
    }
    await prisma.encounter.update({
        where: { id: enc.id },
        data: {
            state: "Caught",
            dataJson: {
                ...prev,
                attempts,
                caughtAt: new Date().toISOString(),
                ball,
                pokemonId: created.id,
            },
        },
    });
    await invalidateEncounter(enc.id);
    return { ok: true, caught: true, attempts, pokemonId: created.id };
}
export async function runFromEncounter(opts) {
    const prisma = opts.prisma ?? prismaClient;
    const user = await UserRepo.upsertByDiscordId(opts.discordId, prisma);
    const enc = await loadEncounter(opts.encounterId, { prisma });
    if (!enc || enc.ownerId !== user.id) {
        return { ok: false, reason: "not_found_or_not_owner" };
    }
    if (enc.state !== "Spawned") {
        return { ok: false, reason: "not_spawned" };
    }
    await prisma.encounter.update({ where: { id: enc.id }, data: { state: "Fled" } });
    await invalidateEncounter(enc.id);
    return { ok: true };
}
