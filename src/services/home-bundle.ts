import type {
  Cooldown,
  Encounter,
  Party,
  PartySlot,
  PokemonInstance,
  User,
} from "@prisma/client";

import { TtlLruCache } from "../shared/cache/ttl-lru.js";
import { prisma } from "../shared/prisma.js";

function coercePositiveNumber(value: unknown, fallback: number, minimum: number): number {
  const numeric = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.max(minimum, Math.floor(numeric));
}

const DEFAULT_MAX_ENTRIES = coercePositiveNumber(
  process.env.HOME_CACHE_MAX_ENTRIES,
  500,
  50,
);
const DEFAULT_TTL_MS = coercePositiveNumber(process.env.HOME_CACHE_TTL_MS, 60_000, 5_000);

export type PartyWithSlots = Party & {
  slots: Array<PartySlot & { pokemon: PokemonInstance }>;
};

export type HomeBundle = {
  user: User;
  party: PartyWithSlots | null;
  cooldowns: Cooldown[];
  encounter: Encounter | null;
};

const homeCache = new TtlLruCache<string, HomeBundle>({
  max: DEFAULT_MAX_ENTRIES,
  ttlMs: DEFAULT_TTL_MS,
});

function cacheKey(userId: string): string {
  return `home:${userId}`;
}

export async function loadHomeBundleByDiscordId(discordId: string): Promise<HomeBundle> {
  const user = await prisma.user.findUniqueOrThrow({ where: { discordId } });
  const key = cacheKey(user.id);
  const cached = homeCache.get(key);
  if (cached) {
    return cached;
  }

  const now = new Date();
  const [party, cooldowns, encounter] = await Promise.all([
    prisma.party.findUnique({
      where: { ownerId: user.id },
      include: {
        slots: {
          orderBy: { slot: "asc" },
          include: { pokemon: true },
        },
      },
    }),
    prisma.cooldown.findMany({
      where: { ownerId: user.id },
    }),
    prisma.encounter.findFirst({
      where: {
        ownerId: user.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const bundle: HomeBundle = { user, party, cooldowns, encounter };
  homeCache.set(key, bundle);
  return bundle;
}

export function primeHomeBundle(userId: string, bundle: HomeBundle): void {
  homeCache.set(cacheKey(userId), bundle);
}
