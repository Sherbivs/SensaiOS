/**
 * GameServer Singleton — Application-Wide GameServerAPI Instance
 * 
 * This module provides a singleton GameServerAPI instance that can be
 * imported by Discord bot handlers without needing ComponentContext access.
 * 
 * ## Usage
 * 
 * ### During Bot Initialization (src/bot/index.ts)
 * 
 * ```ts
 * import { initializeGameServer } from '../sensaios/gameserver/singleton.js';
 * 
 * // After Prisma is ready:
 * await initializeGameServer(prisma);
 * ```
 * 
 * ### In Bot Handlers (src/bot/homestead/*.ts)
 * 
 * ```ts
 * import { getGameServer } from '../../sensaios/gameserver/singleton.js';
 * 
 * async function handleHeal(interaction: ButtonInteraction) {
 *   const gameServer = getGameServer();
 *   const trainer = await gameServer.trainers.get(interaction.user.id);
 *   // ...
 * }
 * ```
 * 
 * ## Architecture Notes
 * 
 * The singleton pattern allows gradual migration of handlers from direct
 * Prisma access to GameServerAPI without requiring changes to the handler
 * registration system. Handlers can simply import getGameServer() and use
 * the pre-initialized API instance.
 * 
 * The ComponentContext is created with a "discord-bot" scope and includes
 * full Prisma access for database operations.
 * 
 * @module sensaios/gameserver/singleton
 * @since 2026-01-04
 */

import type { PrismaClient } from '@prisma/client';
import { createComponentContext } from '../context-factory.js';
import { createGameServerClient, type GameServerAPI, type ComponentManifest } from './api.js';
import { initializeDevelopmentEncryption, isEncryptionInitialized } from './encryption.js';

// ============================================================================
// SINGLETON STATE
// ============================================================================

let gameServerInstance: GameServerAPI | null = null;
let initialized = false;

// ============================================================================
// DISCORD BOT MANIFEST
// ============================================================================

/**
 * Default manifest for Discord bot
 * 
 * Declares all game capabilities needed by the bot.
 */
const DISCORD_BOT_MANIFEST: ComponentManifest = {
  name: 'discord-bot',
  capabilities: {
    game: [
      // Trainer operations
      'game.trainer.read',
      'game.trainer.write',
      
      // Battle operations
      'game.battle.create',
      'game.battle.read',
      'game.battle.write',
      
      // Encounter operations
      'game.encounter.spawn',
      'game.encounter.catch',
      
      // Logging
      'game.logs.write',
    ],
  },
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the GameServer singleton
 * 
 * Must be called during bot startup, after Prisma is ready.
 * Safe to call multiple times - subsequent calls are no-ops.
 * 
 * @param prisma - The Prisma client instance
 * @returns The initialized GameServerAPI
 * 
 * @example
 * ```ts
 * // In src/bot/index.ts after Prisma initialization:
 * await initializeGameServer(prisma);
 * console.log('GameServer API ready');
 * ```
 */
export async function initializeGameServer(prisma: PrismaClient): Promise<GameServerAPI> {
  if (initialized && gameServerInstance) {
    return gameServerInstance;
  }

  // Initialize encryption for development/testing
  if (!isEncryptionInitialized()) {
    initializeDevelopmentEncryption();
  }

  // Create ComponentContext with Prisma access
  const ctx = createComponentContext({
    component: 'discord-bot',
    scope: {
      tenant: 'global', // Bot serves all guilds
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      service: 'infinity-gauntlet',
      component: 'discord-bot',
    },
    prisma,
  });

  // Create the GameServerAPI instance
  gameServerInstance = createGameServerClient(ctx, DISCORD_BOT_MANIFEST);
  initialized = true;

  return gameServerInstance;
}

// ============================================================================
// ACCESSOR
// ============================================================================

/**
 * Get the GameServer singleton instance
 * 
 * Must be called after initializeGameServer() has completed.
 * Throws an error if called before initialization.
 * 
 * @returns The GameServerAPI instance
 * @throws Error if GameServer has not been initialized
 * 
 * @example
 * ```ts
 * const gameServer = getGameServer();
 * const trainer = await gameServer.trainers.get(discordId);
 * ```
 */
export function getGameServer(): GameServerAPI {
  if (!initialized || !gameServerInstance) {
    throw new Error(
      'GameServer not initialized. Call initializeGameServer(prisma) during bot startup.'
    );
  }
  return gameServerInstance;
}

/**
 * Check if GameServer has been initialized
 * 
 * @returns True if GameServer is ready for use
 */
export function isGameServerReady(): boolean {
  return initialized && gameServerInstance !== null;
}

// ============================================================================
// TESTING UTILITIES
// ============================================================================

/**
 * Reset the singleton (for testing only)
 * 
 * @internal
 */
export function resetGameServerForTesting(): void {
  gameServerInstance = null;
  initialized = false;
}

/**
 * Set a mock GameServer instance (for testing only)
 * 
 * @param mockInstance - The mock GameServerAPI to use
 * @internal
 */
export function setGameServerForTesting(mockInstance: GameServerAPI): void {
  gameServerInstance = mockInstance;
  initialized = true;
}
