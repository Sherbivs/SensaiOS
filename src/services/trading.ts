/**
 * Trading Service
 * 
 * Core logic for player-to-player Pokémon trading.
 * Implements a double-confirmation system to prevent scams.
 * 
 * TRADE FLOW (per doc 25):
 * 1. Player A initiates /trade @PlayerB
 * 2. Player B accepts/declines invitation
 * 3. Both select Pokémon to offer
 * 4. Both confirm the trade
 * 5. Trade executes atomically
 * 
 * @module services/trading
 */

// === CRITICAL: Logger & Error Handling MUST be first imports ===
import { getLogger } from "../shared/logging/index.js";
const logger = getLogger();

// === Application Imports ===
import { prisma } from "../shared/prisma.js";
import { ensureUser } from "../shared/models/user-queries-pg.js";

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Trade session configuration
 */
export const TRADE_CONFIG = {
  // Timeouts
  INVITE_TIMEOUT_MS: 5 * 60 * 1000,    // 5 minutes to accept invite
  SESSION_TIMEOUT_MS: 15 * 60 * 1000,  // 15 minutes max trade session
  CONFIRM_TIMEOUT_MS: 60 * 1000,        // 60 seconds to confirm after both select
  
  // Rate limits
  MAX_TRADES_PER_DAY: 10,
  MAX_PENDING_INVITES: 3,
  INVITE_COOLDOWN_MS: 30 * 1000,        // 30 seconds between invites
  SAME_PAIR_COOLDOWN_MS: 60 * 60 * 1000, // 1 hour between same pair
  
  // Account requirements
  MIN_ACCOUNT_AGE_MS: 24 * 60 * 60 * 1000,  // 1 day
  MIN_POKEMON_CAUGHT: 5,
} as const;

/**
 * Trade session states
 */
export type TradeStatus = 
  | "PENDING"      // Invite sent, waiting for acceptance
  | "ACTIVE"       // Both players in trade room
  | "CONFIRMING"   // Both have selected, waiting for confirmations
  | "COMPLETED"    // Trade successfully executed
  | "CANCELLED"    // One player cancelled
  | "EXPIRED";     // Timed out

// ============================================================================
// IN-MEMORY SESSION STORE
// ============================================================================

/**
 * Trade session data structure
 */
export interface TradeSession {
  id: string;
  
  // Participants
  initiatorId: string;      // Discord ID of who started
  recipientId: string;      // Discord ID of who was invited
  
  // State
  status: TradeStatus;
  
  // Selected Pokémon (null until selected)
  initiatorPokemonId: string | null;
  recipientPokemonId: string | null;
  
  // Confirmation flags
  initiatorConfirmed: boolean;
  recipientConfirmed: boolean;
  
  // Channel IDs for messaging
  initiatorChannelId: string | null;
  recipientChannelId: string | null;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

/**
 * Active trade sessions stored in memory
 * Key: session ID
 */
const activeSessions = new Map<string, TradeSession>();

/**
 * Quick lookup by user ID
 * One user can only be in one trade at a time
 */
const userToSession = new Map<string, string>();

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Generate unique session ID
 */
function generateSessionId(): string {
  return `trade_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Get a trade session by ID
 */
export function getTradeSession(sessionId: string): TradeSession | null {
  return activeSessions.get(sessionId) ?? null;
}

/**
 * Get active trade session for a user
 */
export function getUserTradeSession(discordId: string): TradeSession | null {
  const sessionId = userToSession.get(discordId);
  if (!sessionId) return null;
  return activeSessions.get(sessionId) ?? null;
}

/**
 * Check if user is currently in a trade
 */
export function isUserInTrade(discordId: string): boolean {
  const session = getUserTradeSession(discordId);
  return session !== null && session.status !== "COMPLETED" && session.status !== "CANCELLED" && session.status !== "EXPIRED";
}

/**
 * Create a new trade invitation
 */
export async function createTradeInvite(
  initiatorId: string,
  recipientId: string,
  initiatorChannelId: string
): Promise<TradeSession | { error: string }> {
  // Validate initiator not in trade
  if (isUserInTrade(initiatorId)) {
    return { error: "You're already in a trade session." };
  }
  
  // Validate recipient not in trade
  if (isUserInTrade(recipientId)) {
    return { error: "That player is already in a trade." };
  }
  
  // Can't trade with yourself
  if (initiatorId === recipientId) {
    return { error: "You can't trade with yourself!" };
  }
  
  // Validate both users exist
  const [initiatorUser, recipientUser] = await Promise.all([
    ensureUser(initiatorId),
    ensureUser(recipientId),
  ]);
  
  if (!initiatorUser || !recipientUser) {
    return { error: "One or both users don't have accounts yet." };
  }
  
  // Check rate limits
  const rateCheck = await checkTradeRateLimits(initiatorId, recipientId);
  if ('error' in rateCheck) {
    return rateCheck;
  }
  
  // Create session
  const session: TradeSession = {
    id: generateSessionId(),
    initiatorId,
    recipientId,
    status: "PENDING",
    initiatorPokemonId: null,
    recipientPokemonId: null,
    initiatorConfirmed: false,
    recipientConfirmed: false,
    initiatorChannelId,
    recipientChannelId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + TRADE_CONFIG.INVITE_TIMEOUT_MS),
  };
  
  // Store session
  activeSessions.set(session.id, session);
  userToSession.set(initiatorId, session.id);
  userToSession.set(recipientId, session.id);
  
  logger.info('TradingService', 'createTradeInvite', 'Trade invite created', {
    userId: initiatorId,
    metadata: { sessionId: session.id, recipientId },
  });
  
  return session;
}

/**
 * Accept a trade invitation
 */
export function acceptTradeInvite(
  sessionId: string,
  recipientId: string,
  recipientChannelId: string
): TradeSession | { error: string } {
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return { error: "Trade session not found or expired." };
  }
  
  if (session.recipientId !== recipientId) {
    return { error: "This trade invitation is not for you." };
  }
  
  if (session.status !== "PENDING") {
    return { error: "This trade is no longer pending." };
  }
  
  if (new Date() > session.expiresAt) {
    expireSession(sessionId);
    return { error: "This trade invitation has expired." };
  }
  
  // Update session
  session.status = "ACTIVE";
  session.recipientChannelId = recipientChannelId;
  session.updatedAt = new Date();
  session.expiresAt = new Date(Date.now() + TRADE_CONFIG.SESSION_TIMEOUT_MS);
  
  logger.info('TradingService', 'acceptTradeInvite', 'Trade invite accepted', {
    userId: recipientId,
    metadata: { sessionId },
  });
  
  return session;
}

/**
 * Decline a trade invitation
 */
export function declineTradeInvite(
  sessionId: string,
  recipientId: string
): TradeSession | { error: string } {
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return { error: "Trade session not found." };
  }
  
  if (session.recipientId !== recipientId) {
    return { error: "This trade invitation is not for you." };
  }
  
  session.status = "CANCELLED";
  session.updatedAt = new Date();
  
  // Clean up lookups
  userToSession.delete(session.initiatorId);
  userToSession.delete(session.recipientId);
  
  logger.info('TradingService', 'declineTradeInvite', 'Trade invite declined', {
    userId: recipientId,
    metadata: { sessionId },
  });
  
  return session;
}

/**
 * Select a Pokémon to offer in trade
 */
export async function selectTradeOffer(
  sessionId: string,
  userId: string,
  pokemonId: string
): Promise<TradeSession | { error: string }> {
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return { error: "Trade session not found." };
  }
  
  if (session.status !== "ACTIVE" && session.status !== "CONFIRMING") {
    return { error: "Cannot select Pokémon in current trade state." };
  }
  
  // Check expiration
  if (new Date() > session.expiresAt) {
    expireSession(sessionId);
    return { error: "Trade session has expired." };
  }
  
  // Verify the Pokémon belongs to this user
  const dbUser = await ensureUser(userId);
  const pokemon = await prisma.pokemonInstance.findFirst({
    where: {
      id: pokemonId,
      ownerId: dbUser.id,
    },
  });

  if (!pokemon) {
    return { error: "Pokémon not found or doesn't belong to you." };
  }
  
  // Can't trade party members (optional - could remove this restriction)
  const partySlot = await prisma.partySlot.findFirst({
    where: {
      pokemonId: pokemonId,
    },
  });
  
  if (partySlot) {
    return { error: "You can't trade Pokémon in your active party. Remove them first." };
  }
  
  // Update session with selection
  if (userId === session.initiatorId) {
    session.initiatorPokemonId = pokemonId;
    session.initiatorConfirmed = false; // Reset confirmation on new selection
  } else if (userId === session.recipientId) {
    session.recipientPokemonId = pokemonId;
    session.recipientConfirmed = false;
  } else {
    return { error: "You're not part of this trade." };
  }

  session.updatedAt = new Date();

  // If both have selected, move to confirming state
  if (session.initiatorPokemonId && session.recipientPokemonId) {
    session.status = "CONFIRMING";
  }

  logger.info('TradingService', 'selectTradeOffer', 'Pokémon selected for trade', {
    userId,
    metadata: { sessionId, pokemonId },
  });
  
  return session;
}

/**
 * Confirm a trade (must be done by both parties)
 */
export function confirmTrade(
  sessionId: string,
  userId: string
): TradeSession | { error: string } | { execute: true; session: TradeSession } {
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return { error: "Trade session not found." };
  }
  
  if (session.status !== "CONFIRMING") {
    return { error: "Both players must select a Pokémon first." };
  }
  
  // Set confirmation flag
  if (userId === session.initiatorId) {
    session.initiatorConfirmed = true;
  } else if (userId === session.recipientId) {
    session.recipientConfirmed = true;
  } else {
    return { error: "You're not part of this trade." };
  }
  
  session.updatedAt = new Date();
  
  // If both confirmed, signal ready to execute
  if (session.initiatorConfirmed && session.recipientConfirmed) {
    return { execute: true, session };
  }
  
  logger.info('TradingService', 'confirmTrade', 'Trade confirmed by one party', {
    userId,
    metadata: { sessionId, bothConfirmed: session.initiatorConfirmed && session.recipientConfirmed },
  });
  
  return session;
}

/**
 * Execute the trade (swap Pokémon)
 */
export async function executeTrade(
  sessionId: string
): Promise<{ success: true; session: TradeSession } | { error: string }> {
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return { error: "Trade session not found." };
  }
  
  if (!session.initiatorConfirmed || !session.recipientConfirmed) {
    return { error: "Both parties must confirm the trade." };
  }
  
  if (!session.initiatorPokemonId || !session.recipientPokemonId) {
    return { error: "Both parties must select a Pokémon." };
  }
  
  // Get database user IDs
  const [initiatorDbUser, recipientDbUser] = await Promise.all([
    ensureUser(session.initiatorId),
    ensureUser(session.recipientId),
  ]);
  
  // Pre-fetch Pokémon details for OT tracking and trade log
  const [initiatorPokemon, recipientPokemon] = await Promise.all([
    prisma.pokemonInstance.findUnique({ where: { id: session.initiatorPokemonId! } }),
    prisma.pokemonInstance.findUnique({ where: { id: session.recipientPokemonId! } }),
  ]);
  
  if (!initiatorPokemon || !recipientPokemon) {
    return { error: "One or both Pokémon no longer exist." };
  }
  
  try {
    // Execute atomic swap
    await prisma.$transaction(async (tx) => {
      // Transfer initiator's Pokémon to recipient
      await tx.pokemonInstance.update({
        where: { id: session.initiatorPokemonId! },
        data: { 
          ownerId: recipientDbUser.id,
          // Preserve original trainer - set only if not already set
          originalTrainerId: initiatorPokemon.originalTrainerId ?? session.initiatorId,
          tradedAt: new Date(),
        },
      });
      
      // Transfer recipient's Pokémon to initiator
      await tx.pokemonInstance.update({
        where: { id: session.recipientPokemonId! },
        data: { 
          ownerId: initiatorDbUser.id,
          originalTrainerId: recipientPokemon.originalTrainerId ?? session.recipientId,
          tradedAt: new Date(),
        },
      });
      
      // Log the trade with full details
      await tx.tradeLog.create({
        data: {
          sessionId: session.id,
          senderId: session.initiatorId,
          receiverId: session.recipientId,
          senderPokemonId: session.initiatorPokemonId!,
          receiverPokemonId: session.recipientPokemonId!,
          senderPokemonSpeciesId: initiatorPokemon.speciesId,
          receiverPokemonSpeciesId: recipientPokemon.speciesId,
          senderPokemonLevel: initiatorPokemon.level,
          receiverPokemonLevel: recipientPokemon.level,
          senderPokemonShiny: initiatorPokemon.isShiny,
          receiverPokemonShiny: recipientPokemon.isShiny,
          completedAt: new Date(),
        },
      });
    });
    
    // Update session status
    session.status = "COMPLETED";
    session.updatedAt = new Date();
    
    // Clean up lookups
    userToSession.delete(session.initiatorId);
    userToSession.delete(session.recipientId);
    
    logger.info('TradingService', 'executeTrade', 'Trade completed successfully', {
      userId: session.initiatorId,
      metadata: { 
        sessionId,
        initiatorPokemonId: session.initiatorPokemonId,
        recipientPokemonId: session.recipientPokemonId,
      },
    });
    
    return { success: true, session };
  } catch (error) {
    logger.error('TradingService', 'executeTrade', 'Trade execution failed', {
      userId: session.initiatorId,
      metadata: { sessionId, error },
    });
    return { error: "Trade failed. Please try again." };
  }
}

/**
 * Cancel a trade session
 */
export function cancelTrade(
  sessionId: string,
  userId: string
): TradeSession | { error: string } {
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return { error: "Trade session not found." };
  }
  
  if (userId !== session.initiatorId && userId !== session.recipientId) {
    return { error: "You're not part of this trade." };
  }
  
  if (session.status === "COMPLETED") {
    return { error: "This trade has already completed." };
  }
  
  session.status = "CANCELLED";
  session.updatedAt = new Date();
  
  // Clean up lookups
  userToSession.delete(session.initiatorId);
  userToSession.delete(session.recipientId);
  
  logger.info('TradingService', 'cancelTrade', 'Trade cancelled', {
    userId,
    metadata: { sessionId },
  });
  
  return session;
}

/**
 * Mark session as expired
 */
function expireSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  
  session.status = "EXPIRED";
  session.updatedAt = new Date();
  
  // Clean up lookups
  userToSession.delete(session.initiatorId);
  userToSession.delete(session.recipientId);
  
  logger.info('TradingService', 'expireSession', 'Trade session expired', {
    userId: session.initiatorId,
    metadata: { sessionId },
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check rate limits for trading
 */
async function checkTradeRateLimits(
  _initiatorId: string,
  _recipientId: string
): Promise<{ ok: true } | { error: string }> {
  // For MVP, skip detailed rate limiting
  // TODO: Implement daily trade limits, cooldowns, etc.
  return { ok: true };
}

/**
 * Get trade statistics for a user
 */
export async function getUserTradeStats(
  discordId: string
): Promise<{
  totalTrades: number;
  tradesCompleted: number;
  uniquePartners: number;
}> {
  // Query by Discord ID directly since TradeLog stores Discord IDs
  const logs = await prisma.tradeLog.findMany({
    where: {
      OR: [
        { senderId: discordId },
        { receiverId: discordId },
      ],
    },
    select: {
      senderId: true,
      receiverId: true,
    },
  });
  
  const partners = new Set<string>();
  logs.forEach(log => {
    if (log.senderId !== discordId) partners.add(log.senderId);
    if (log.receiverId !== discordId) partners.add(log.receiverId);
  });
  
  return {
    totalTrades: logs.length,
    tradesCompleted: logs.length,
    uniquePartners: partners.size,
  };
}

/**
 * Get a user's tradeable Pokémon (not in party)
 */
export async function getTradeablePokemon(
  discordId: string
): Promise<Array<{
  id: string;
  speciesId: number;
  nickname: string | null;
  level: number;
  isShiny: boolean;
}>> {
  const dbUser = await ensureUser(discordId);
  
  // Get all Pokémon not in party
  const pokemon = await prisma.pokemonInstance.findMany({
    where: {
      ownerId: dbUser.id,
      partySlots: {
        none: {},
      },
    },
    select: {
      id: true,
      speciesId: true,
      nickname: true,
      level: true,
      isShiny: true,
    },
    orderBy: [
      { level: 'desc' },
      { speciesId: 'asc' },
    ],
    take: 30, // Limit for UI
  });
  
  return pokemon.map(p => ({
    id: p.id,
    speciesId: p.speciesId,
    nickname: p.nickname,
    level: p.level,
    isShiny: p.isShiny,
  }));
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up expired sessions (run periodically)
 */
export function cleanupExpiredSessions(): number {
  const now = new Date();
  let cleaned = 0;
  
  for (const [sessionId, session] of activeSessions) {
    if (session.status !== "COMPLETED" && session.status !== "CANCELLED" && now > session.expiresAt) {
      expireSession(sessionId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logger.info('TradingService', 'cleanupExpiredSessions', `Cleaned up ${cleaned} expired sessions`, {
      metadata: { cleaned },
    });
  }
  
  return cleaned;
}

// Run cleanup every minute
setInterval(cleanupExpiredSessions, 60 * 1000);
