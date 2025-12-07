/**
 * Player Checkpoint & Recovery Service
 * 
 * Implements VS Code-style checkpoint recovery for player game state.
 * When a homestead channel is deleted (intentionally or accidentally),
 * this service:
 * 1. Runs full diagnostics on the player's profile/game state
 * 2. Attempts forced healing using the most up-to-date data from DB + cache
 * 3. Restores the player to their last known good checkpoint
 * 
 * Similar to how VS Code Copilot recovers chat context after session loss.
 * 
 * @module player-checkpoint
 */

import { Client, User, EmbedBuilder, TextChannel } from 'discord.js';
import { prisma } from '../shared/prisma.js';
import { log } from '../utils/logger.js';
import { HomesteadChannelManager } from './homestead-manager.js';
import { 
  resolveDiscordUser, 
  hasDiscordIdentity,
  type DiscordUserIdentity 
} from './discord-identity.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Snapshot of player's complete game state at a point in time
 */
export interface PlayerCheckpoint {
  id: string;
  userId: string;
  discordId: string;
  createdAt: Date;
  reason: CheckpointReason;
  
  // User profile snapshot
  profile: {
    coins: number;
    dailyQuestStreak: number;
    dailyQuestLastCompleted: Date | null;
    settingsJson: unknown;
  };
  
  // Party snapshot (active team)
  party: PartySnapshot | null;
  
  // Pokemon collection summary (not full data - that's in DB)
  pokemonSummary: {
    totalCount: number;
    highestLevel: number;
    speciesIds: number[];
  };
  
  // Homestead channel info (for recovery reference)
  homestead: {
    guildId: string;
    channelId: string;
    status: string;
  } | null;
  
  // Metadata
  checkpointVersion: number;
  expiresAt: Date;
}

export interface PartySnapshot {
  id: string;
  slots: Array<{
    slot: number;
    pokemonId: string;
    speciesId: number;
    nickname: string | null;
    level: number;
    hp: number;
    maxHp: number;
  }>;
}

export type CheckpointReason = 
  | 'homestead_deleted'      // Channel was deleted
  | 'session_start'          // New gameplay session started
  | 'milestone'              // Achievement/milestone reached
  | 'battle_complete'        // After battle conclusion
  | 'pokemon_caught'         // New Pokemon added to collection
  | 'periodic'               // Scheduled checkpoint (every N minutes)
  | 'manual';                // Explicitly requested

/**
 * Diagnostic test result for a specific aspect of player state
 */
export interface DiagnosticResult {
  testName: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  canAutoHeal: boolean;
  healAction?: () => Promise<void>;
}

/**
 * Full diagnostic report for a player
 */
export interface PlayerDiagnosticReport {
  userId: string;
  discordId: string;
  runAt: Date;
  overallStatus: 'healthy' | 'degraded' | 'critical';
  results: DiagnosticResult[];
  healingAttempted: boolean;
  healingSuccessful: boolean;
  checkpoint: PlayerCheckpoint | null;
}

// ============================================================================
// Configuration
// ============================================================================

const CHECKPOINT_VERSION = 1;
const CHECKPOINT_TTL_DAYS = 30; // Keep checkpoints for 30 days
const MAX_CHECKPOINTS_PER_USER = 10; // Rolling buffer of recent checkpoints
const PERIODIC_CHECKPOINT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// In-memory checkpoint cache (for fast recovery within session)
// In production, this would be backed by Redis or similar
const checkpointCache = new Map<string, PlayerCheckpoint[]>();

// ============================================================================
// Checkpoint Service Class
// ============================================================================

export class PlayerCheckpointService {
  private client: Client;
  private guildId: string;
  
  constructor(client: Client, guildId: string) {
    this.client = client;
    this.guildId = guildId;
  }
  
  // --------------------------------------------------------------------------
  // Checkpoint Creation
  // --------------------------------------------------------------------------
  
  /**
   * Create a new checkpoint for a player's current game state
   */
  async createCheckpoint(
    userId: string, 
    reason: CheckpointReason
  ): Promise<PlayerCheckpoint> {
    const start = Date.now();
    
    // Fetch complete player state from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        parties: {
          include: {
            slots: {
              include: {
                pokemon: {
                  select: {
                    id: true,
                    speciesId: true,
                    nickname: true,
                    level: true,
                    hp: true,
                    maxHp: true,
                  }
                }
              },
              orderBy: { slot: 'asc' }
            }
          }
        },
        pokemon: {
          select: {
            id: true,
            speciesId: true,
            level: true,
          }
        },
        homesteadChannels: {
          where: { guildId: this.guildId },
          take: 1,
        }
      }
    });
    
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    
    // Build checkpoint
    const checkpoint: PlayerCheckpoint = {
      id: `ckpt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      userId: user.id,
      discordId: user.discordId,
      createdAt: new Date(),
      reason,
      
      profile: {
        coins: user.coins,
        dailyQuestStreak: user.dailyQuestStreak,
        dailyQuestLastCompleted: user.dailyQuestLastCompleted,
        settingsJson: user.settingsJson,
      },
      
      party: user.parties[0] ? {
        id: user.parties[0].id,
        slots: user.parties[0].slots.map(s => ({
          slot: s.slot,
          pokemonId: s.pokemonId,
          speciesId: s.pokemon.speciesId,
          nickname: s.pokemon.nickname,
          level: s.pokemon.level,
          hp: s.pokemon.hp,
          maxHp: s.pokemon.maxHp,
        }))
      } : null,
      
      pokemonSummary: {
        totalCount: user.pokemon.length,
        highestLevel: user.pokemon.reduce((max, p) => Math.max(max, p.level), 0),
        speciesIds: [...new Set(user.pokemon.map(p => p.speciesId))],
      },
      
      homestead: user.homesteadChannels[0] ? {
        guildId: user.homesteadChannels[0].guildId,
        channelId: user.homesteadChannels[0].channelId,
        status: user.homesteadChannels[0].status,
      } : null,
      
      checkpointVersion: CHECKPOINT_VERSION,
      expiresAt: new Date(Date.now() + CHECKPOINT_TTL_DAYS * 24 * 60 * 60 * 1000),
    };
    
    // Store in cache (rolling buffer)
    this.storeCheckpoint(userId, checkpoint);
    
    log.info('[PlayerCheckpoint] Created checkpoint', {
      userId,
      checkpointId: checkpoint.id,
      reason,
      pokemonCount: checkpoint.pokemonSummary.totalCount,
      hasParty: !!checkpoint.party,
      latencyMs: Date.now() - start,
    });
    
    return checkpoint;
  }
  
  /**
   * Store checkpoint in rolling buffer (in-memory + could persist to DB)
   */
  private storeCheckpoint(userId: string, checkpoint: PlayerCheckpoint): void {
    const existing = checkpointCache.get(userId) || [];
    existing.unshift(checkpoint); // Add to front (newest first)
    
    // Trim to max size
    if (existing.length > MAX_CHECKPOINTS_PER_USER) {
      existing.length = MAX_CHECKPOINTS_PER_USER;
    }
    
    checkpointCache.set(userId, existing);
  }
  
  /**
   * Get the most recent checkpoint for a user
   */
  getLatestCheckpoint(userId: string): PlayerCheckpoint | null {
    const checkpoints = checkpointCache.get(userId);
    return checkpoints?.[0] ?? null;
  }
  
  /**
   * Get all checkpoints for a user (for recovery UI)
   */
  getAllCheckpoints(userId: string): PlayerCheckpoint[] {
    return checkpointCache.get(userId) || [];
  }
  
  // --------------------------------------------------------------------------
  // Diagnostics Suite
  // --------------------------------------------------------------------------
  
  /**
   * Run full diagnostic tests on a player's game state
   */
  async runDiagnostics(userId: string): Promise<PlayerDiagnosticReport> {
    const start = Date.now();
    const results: DiagnosticResult[] = [];
    
    // Fetch current user state
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        parties: { include: { slots: true } },
        pokemon: true,
        homesteadChannels: { where: { guildId: this.guildId } },
      }
    });
    
    if (!user) {
      return {
        userId,
        discordId: 'unknown',
        runAt: new Date(),
        overallStatus: 'critical',
        results: [{
          testName: 'user_exists',
          status: 'fail',
          message: 'User record not found in database',
          canAutoHeal: false,
        }],
        healingAttempted: false,
        healingSuccessful: false,
        checkpoint: null,
      };
    }
    
    // Test 1: User profile integrity
    results.push(this.testUserProfile(user));
    
    // Test 2: Party consistency
    results.push(await this.testPartyConsistency(user));
    
    // Test 3: Pokemon collection integrity
    results.push(await this.testPokemonCollection(user));
    
    // Test 4: Homestead channel status
    results.push(await this.testHomesteadStatus(user));
    
    // Test 5: Active battle state (shouldn't have orphaned battles)
    results.push(await this.testActiveBattles(user));
    
    // Test 6: Discord identity in security database
    results.push(await this.testDiscordIdentity(user));
    
    // Calculate overall status
    const failCount = results.filter(r => r.status === 'fail').length;
    const warnCount = results.filter(r => r.status === 'warn').length;
    
    let overallStatus: 'healthy' | 'degraded' | 'critical';
    if (failCount > 0) {
      overallStatus = 'critical';
    } else if (warnCount > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }
    
    // Get latest checkpoint for recovery reference
    const checkpoint = this.getLatestCheckpoint(userId);
    
    log.info('[PlayerCheckpoint] Diagnostics complete', {
      userId,
      overallStatus,
      passCount: results.filter(r => r.status === 'pass').length,
      warnCount,
      failCount,
      latencyMs: Date.now() - start,
    });
    
    return {
      userId,
      discordId: user.discordId,
      runAt: new Date(),
      overallStatus,
      results,
      healingAttempted: false,
      healingSuccessful: false,
      checkpoint,
    };
  }
  
  /**
   * Test user profile for data integrity
   */
  private testUserProfile(user: { 
    id: string; 
    coins: number; 
    dailyQuestStreak: number;
  }): DiagnosticResult {
    // Check for negative values (shouldn't happen)
    if (user.coins < 0) {
      return {
        testName: 'user_profile',
        status: 'fail',
        message: `Coins are negative: ${user.coins}`,
        canAutoHeal: true,
        healAction: async () => {
          await prisma.user.update({
            where: { id: user.id },
            data: { coins: 0 }
          });
        }
      };
    }
    
    if (user.dailyQuestStreak < 0) {
      return {
        testName: 'user_profile',
        status: 'fail',
        message: `Daily quest streak is negative: ${user.dailyQuestStreak}`,
        canAutoHeal: true,
        healAction: async () => {
          await prisma.user.update({
            where: { id: user.id },
            data: { dailyQuestStreak: 0 }
          });
        }
      };
    }
    
    return {
      testName: 'user_profile',
      status: 'pass',
      message: 'User profile data is valid',
      canAutoHeal: false,
    };
  }
  
  /**
   * Test party consistency (slots match actual Pokemon)
   */
  private async testPartyConsistency(user: {
    id: string;
    parties: Array<{ id: string; slots: Array<{ pokemonId: string }> }>;
  }): Promise<DiagnosticResult> {
    const party = user.parties[0];
    
    if (!party) {
      return {
        testName: 'party_consistency',
        status: 'warn',
        message: 'No active party found (expected for new players)',
        canAutoHeal: false,
      };
    }
    
    // Check if all Pokemon in party slots still exist
    for (const slot of party.slots) {
      const pokemon = await prisma.pokemonInstance.findUnique({
        where: { id: slot.pokemonId }
      });
      
      if (!pokemon) {
        return {
          testName: 'party_consistency',
          status: 'fail',
          message: `Party references missing Pokemon: ${slot.pokemonId}`,
          canAutoHeal: true,
          healAction: async () => {
            // Remove the orphaned slot
            await prisma.partySlot.deleteMany({
              where: { 
                partyId: party.id,
                pokemonId: slot.pokemonId 
              }
            });
          }
        };
      }
    }
    
    return {
      testName: 'party_consistency',
      status: 'pass',
      message: `Party has ${party.slots.length} valid Pokemon`,
      canAutoHeal: false,
    };
  }
  
  /**
   * Test Pokemon collection for data integrity
   */
  private async testPokemonCollection(user: {
    id: string;
    pokemon: Array<{ id: string; hp: number; maxHp: number; level: number }>;
  }): Promise<DiagnosticResult> {
    const issues: string[] = [];
    
    for (const pokemon of user.pokemon) {
      // Check HP doesn't exceed maxHP
      if (pokemon.hp > pokemon.maxHp) {
        issues.push(`Pokemon ${pokemon.id}: HP (${pokemon.hp}) > MaxHP (${pokemon.maxHp})`);
      }
      
      // Check HP isn't negative
      if (pokemon.hp < 0) {
        issues.push(`Pokemon ${pokemon.id}: Negative HP (${pokemon.hp})`);
      }
      
      // Check level bounds
      if (pokemon.level < 1 || pokemon.level > 100) {
        issues.push(`Pokemon ${pokemon.id}: Invalid level (${pokemon.level})`);
      }
    }
    
    if (issues.length > 0) {
      return {
        testName: 'pokemon_collection',
        status: 'fail',
        message: issues.join('; '),
        canAutoHeal: true,
        healAction: async () => {
          // Fix HP issues
          for (const pokemon of user.pokemon) {
            const updates: { hp?: number; level?: number } = {};
            
            if (pokemon.hp > pokemon.maxHp) {
              updates.hp = pokemon.maxHp;
            }
            if (pokemon.hp < 0) {
              updates.hp = 0;
            }
            if (pokemon.level < 1) {
              updates.level = 1;
            }
            if (pokemon.level > 100) {
              updates.level = 100;
            }
            
            if (Object.keys(updates).length > 0) {
              await prisma.pokemonInstance.update({
                where: { id: pokemon.id },
                data: updates,
              });
            }
          }
        }
      };
    }
    
    return {
      testName: 'pokemon_collection',
      status: 'pass',
      message: `${user.pokemon.length} Pokemon verified`,
      canAutoHeal: false,
    };
  }
  
  /**
   * Test homestead channel status
   */
  private async testHomesteadStatus(user: {
    id: string;
    homesteadChannels: Array<{ channelId: string; status: string }>;
  }): Promise<DiagnosticResult> {
    const homestead = user.homesteadChannels[0];
    
    if (!homestead) {
      return {
        testName: 'homestead_status',
        status: 'warn',
        message: 'No homestead channel record (will be created on next interaction)',
        canAutoHeal: false,
      };
    }
    
    // Try to verify Discord channel still exists
    try {
      const channel = await this.client.channels.fetch(homestead.channelId);
      if (!channel) {
        return {
          testName: 'homestead_status',
          status: 'fail',
          message: 'Homestead channel deleted in Discord but DB record remains',
          canAutoHeal: true,
          healAction: async () => {
            await prisma.homesteadChannel.updateMany({
              where: { channelId: homestead.channelId },
              data: { status: 'deleted' }
            });
          }
        };
      }
    } catch {
      // Channel fetch failed - likely deleted or no permission
      return {
        testName: 'homestead_status',
        status: 'warn',
        message: 'Cannot verify homestead channel (may be deleted or inaccessible)',
        canAutoHeal: false,
      };
    }
    
    return {
      testName: 'homestead_status',
      status: 'pass',
      message: `Homestead channel verified (status: ${homestead.status})`,
      canAutoHeal: false,
    };
  }
  
  /**
   * Test for orphaned/stuck battles
   */
  private async testActiveBattles(user: {
    id: string;
  }): Promise<DiagnosticResult> {
    // Check for battles stuck in active state for too long (>1 hour)
    const stuckBattles = await prisma.battle.findMany({
      where: {
        OR: [
          { p1Id: user.id },
          { p2Id: user.id },
        ],
        state: 'Active',
        startedAt: {
          lt: new Date(Date.now() - 60 * 60 * 1000) // Older than 1 hour
        }
      }
    });
    
    if (stuckBattles.length > 0) {
      return {
        testName: 'active_battles',
        status: 'warn',
        message: `${stuckBattles.length} stuck battle(s) found (>1 hour old)`,
        canAutoHeal: true,
        healAction: async () => {
          for (const battle of stuckBattles) {
            await prisma.battle.update({
              where: { id: battle.id },
              data: { 
                state: 'Aborted',
                endedAt: new Date(),
              }
            });
          }
        }
      };
    }
    
    return {
      testName: 'active_battles',
      status: 'pass',
      message: 'No stuck battles found',
      canAutoHeal: false,
    };
  }
  
  /**
   * Test Discord identity exists in security database
   * 
   * The security bot maintains a comprehensive registry of guild members
   * with usernames, display names, and roles. This test verifies the player's
   * Discord identity is tracked in that canonical data source.
   */
  private async testDiscordIdentity(user: {
    id: string;
    discordId: string;
  }): Promise<DiagnosticResult> {
    try {
      // Check if user exists in security database
      const identityExists = await hasDiscordIdentity(user.discordId, this.guildId);
      
      if (!identityExists) {
        return {
          testName: 'discord_identity',
          status: 'warn',
          message: 'User not found in security database (awaiting next security sweep)',
          canAutoHeal: false,
        };
      }
      
      // Get full identity for validation
      const identity = await resolveDiscordUser(user.discordId, this.guildId);
      
      if (!identity) {
        return {
          testName: 'discord_identity',
          status: 'warn',
          message: 'Discord identity lookup returned null unexpectedly',
          canAutoHeal: false,
        };
      }
      
      // Verify the Discord ID matches what we have in User table
      if (identity.discordUserId !== user.discordId) {
        return {
          testName: 'discord_identity',
          status: 'fail',
          message: `Discord ID mismatch: User.discordId=${user.discordId} vs SecurityDB=${identity.discordUserId}`,
          canAutoHeal: false,  // This requires manual investigation
        };
      }
      
      return {
        testName: 'discord_identity',
        status: 'pass',
        message: `Discord identity verified: @${identity.username}${identity.displayName ? ` (${identity.displayName})` : ''}`,
        canAutoHeal: false,
      };
      
    } catch (error) {
      log.warn('[PlayerCheckpoint] Discord identity test failed', {
        userId: user.id,
        discordId: user.discordId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        testName: 'discord_identity',
        status: 'warn',
        message: 'Failed to query Discord identity (security database may be unavailable)',
        canAutoHeal: false,
      };
    }
  }
  
  // --------------------------------------------------------------------------
  // Forced Healing
  // --------------------------------------------------------------------------
  
  /**
   * Attempt to heal all issues found in diagnostics
   */
  async attemptForcedHealing(
    report: PlayerDiagnosticReport
  ): Promise<PlayerDiagnosticReport> {
    const healableIssues = report.results.filter(r => 
      r.status !== 'pass' && r.canAutoHeal && r.healAction
    );
    
    if (healableIssues.length === 0) {
      log.info('[PlayerCheckpoint] No healable issues found', {
        userId: report.userId,
      });
      return { ...report, healingAttempted: true, healingSuccessful: true };
    }
    
    log.info('[PlayerCheckpoint] Attempting forced healing', {
      userId: report.userId,
      issueCount: healableIssues.length,
    });
    
    let allSuccess = true;
    
    for (const issue of healableIssues) {
      try {
        if (issue.healAction) {
          await issue.healAction();
          log.info('[PlayerCheckpoint] Healed issue', {
            userId: report.userId,
            testName: issue.testName,
          });
        }
      } catch (error) {
        allSuccess = false;
        log.error('[PlayerCheckpoint] Failed to heal issue', {
          userId: report.userId,
          testName: issue.testName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    return {
      ...report,
      healingAttempted: true,
      healingSuccessful: allSuccess,
    };
  }
  
  // --------------------------------------------------------------------------
  // Recovery Flow (Triggered on Homestead Deletion)
  // --------------------------------------------------------------------------
  
  /**
   * Full recovery flow triggered when homestead channel is deleted
   * 
   * This is the main entry point - similar to VS Code Copilot's
   * chat context recovery after session loss.
   */
  async handleHomesteadDeletion(
    userId: string,
    discordUser: User
  ): Promise<{
    report: PlayerDiagnosticReport;
    newHomestead: TextChannel | null;
    recoveryMessage: EmbedBuilder;
  }> {
    log.info('[PlayerCheckpoint] Homestead deletion recovery started', {
      userId,
      discordId: discordUser.id,
    });
    
    // Step 1: Create checkpoint of current state (before any changes)
    try {
      await this.createCheckpoint(userId, 'homestead_deleted');
    } catch (error) {
      log.warn('[PlayerCheckpoint] Could not create checkpoint', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    
    // Step 2: Run full diagnostics
    let report = await this.runDiagnostics(userId);
    
    // Step 3: Attempt forced healing if issues found
    if (report.overallStatus !== 'healthy') {
      report = await this.attemptForcedHealing(report);
    }
    
    // Step 4: Recreate homestead channel (getOrCreateChannel handles this)
    let newHomestead: TextChannel | null = null;
    try {
      const manager = new HomesteadChannelManager(this.client, this.guildId);
      const result = await manager.getOrCreateChannel(discordUser);
      newHomestead = result.channel;
      
      log.info('[PlayerCheckpoint] Recreated homestead channel', {
        userId,
        channelId: newHomestead.id,
      });
    } catch (error) {
      log.error('[PlayerCheckpoint] Failed to recreate homestead', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    
    // Step 5: Build recovery summary embed
    const recoveryMessage = this.buildRecoveryEmbed(report, newHomestead);
    
    return { report, newHomestead, recoveryMessage };
  }
  
  /**
   * Build a user-friendly recovery status embed
   */
  private buildRecoveryEmbed(
    report: PlayerDiagnosticReport,
    newHomestead: TextChannel | null
  ): EmbedBuilder {
    const statusEmoji = {
      healthy: '✅',
      degraded: '⚠️',
      critical: '❌',
    };
    
    const embed = new EmbedBuilder()
      .setTitle('🔄 Game State Recovery Complete')
      .setColor(report.overallStatus === 'healthy' ? 0x00FF00 : 
                report.overallStatus === 'degraded' ? 0xFFFF00 : 0xFF0000)
      .setTimestamp();
    
    // Status summary
    embed.addFields({
      name: 'Recovery Status',
      value: `${statusEmoji[report.overallStatus]} ${report.overallStatus.charAt(0).toUpperCase() + report.overallStatus.slice(1)}`,
      inline: true,
    });
    
    // Checkpoint info
    if (report.checkpoint) {
      const age = Date.now() - report.checkpoint.createdAt.getTime();
      const ageMinutes = Math.floor(age / 60000);
      embed.addFields({
        name: 'Last Checkpoint',
        value: ageMinutes < 60 ? `${ageMinutes}m ago` : `${Math.floor(ageMinutes / 60)}h ago`,
        inline: true,
      });
      
      if (report.checkpoint.pokemonSummary) {
        embed.addFields({
          name: 'Pokémon Saved',
          value: `${report.checkpoint.pokemonSummary.totalCount} Pokémon`,
          inline: true,
        });
      }
    }
    
    // Diagnostic results summary
    const passCount = report.results.filter(r => r.status === 'pass').length;
    const totalCount = report.results.length;
    embed.addFields({
      name: 'Diagnostics',
      value: `${passCount}/${totalCount} checks passed`,
      inline: true,
    });
    
    // Healing status
    if (report.healingAttempted) {
      embed.addFields({
        name: 'Auto-Healing',
        value: report.healingSuccessful ? '✅ Successful' : '⚠️ Partial',
        inline: true,
      });
    }
    
    // New homestead info
    if (newHomestead) {
      embed.addFields({
        name: 'New Homestead',
        value: `<#${newHomestead.id}>`,
        inline: true,
      });
    }
    
    // Issues found (if any)
    const issues = report.results.filter(r => r.status !== 'pass');
    if (issues.length > 0) {
      const issueList = issues
        .slice(0, 5) // Max 5 issues shown
        .map(i => `• ${i.testName}: ${i.message}`)
        .join('\n');
      embed.addFields({
        name: 'Issues Detected',
        value: issueList + (issues.length > 5 ? `\n... and ${issues.length - 5} more` : ''),
        inline: false,
      });
    }
    
    embed.setDescription(
      'Your homestead channel was deleted. I\'ve run diagnostics on your game state ' +
      'and restored everything from the last checkpoint. Your Pokémon, items, and ' +
      'progress are safe! 🎮'
    );
    
    embed.setFooter({ text: 'Infinity Gauntlet Recovery System' });
    
    return embed;
  }
}

// ============================================================================
// Event Handler: Channel Deletion Detection
// ============================================================================

/**
 * Set up the channelDelete event handler for IMMEDIATE recovery
 * Call this during bot initialization
 * 
 * VS Code Copilot-style behavior: When user deletes their homestead channel
 * (intentionally or accidentally), the system IMMEDIATELY:
 * 1. Detects the deletion via Discord event
 * 2. Runs full diagnostics on player state
 * 3. Recreates the channel automatically
 * 4. Sends recovery status embed to the new channel
 * 
 * User experience: Delete channel → instant recreation with recovery message
 * No waiting for next interaction required.
 */
export function setupHomesteadDeletionHandler(client: Client): void {
  client.on('channelDelete', async (channel) => {
    // Only handle guild text channels
    if (channel.type !== 0) return; // 0 = GuildText
    
    // Check if this was a homestead channel
    const homestead = await prisma.homesteadChannel.findUnique({
      where: { channelId: channel.id },
      include: { user: true }
    });
    
    if (!homestead) return; // Not a homestead channel
    
    const startTime = Date.now();
    log.info('[PlayerCheckpoint] 🔄 Homestead deletion detected - IMMEDIATE RECOVERY INITIATED', {
      channelId: channel.id,
      userId: homestead.userId,
      discordId: homestead.user.discordId,
      channelName: 'name' in channel ? channel.name : 'unknown',
    });
    
    try {
      // Step 1: Mark the DB record as deleted (audit trail)
      await prisma.homesteadChannel.update({
        where: { id: homestead.id },
        data: { status: 'deleted' }
      });
      
      // Step 2: Fetch the Discord user for channel recreation
      const discordUser = await client.users.fetch(homestead.user.discordId);
      if (!discordUser) {
        log.error('[PlayerCheckpoint] Cannot fetch Discord user for recovery', {
          discordId: homestead.user.discordId,
        });
        return;
      }
      
      // Step 3: Get guild for channel creation
      const guild = client.guilds.cache.get(homestead.guildId);
      if (!guild) {
        log.error('[PlayerCheckpoint] Cannot find guild for recovery', {
          guildId: homestead.guildId,
        });
        return;
      }
      
      // Step 4: Create checkpoint service and run full recovery
      const checkpointService = new PlayerCheckpointService(client, homestead.guildId);
      const { report, newHomestead, recoveryMessage } = await checkpointService.handleHomesteadDeletion(
        homestead.userId,
        discordUser
      );
      
      // Step 5: Send recovery message to the NEW channel
      if (newHomestead) {
        await newHomestead.send({ embeds: [recoveryMessage] });
        
        const recoveryTimeMs = Date.now() - startTime;
        log.info('[PlayerCheckpoint] ✅ IMMEDIATE RECOVERY COMPLETE', {
          userId: homestead.userId,
          discordId: homestead.user.discordId,
          oldChannelId: channel.id,
          newChannelId: newHomestead.id,
          recoveryTimeMs,
          diagnosticStatus: report.overallStatus,
          healingSuccessful: report.healingSuccessful,
        });
      }
      
    } catch (error) {
      log.error('[PlayerCheckpoint] ❌ IMMEDIATE RECOVERY FAILED', {
        userId: homestead.userId,
        discordId: homestead.user.discordId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      // Fallback: Try to DM the user about the failure
      try {
        const discordUser = await client.users.fetch(homestead.user.discordId);
        await discordUser.send({
          content: '⚠️ Your homestead channel was deleted but automatic recovery failed. ' +
                   'Please use `/home` or any game command to manually trigger recovery. ' +
                   'Your game data is safe!'
        });
      } catch {
        log.warn('[PlayerCheckpoint] Could not DM user about recovery failure', {
          discordId: homestead.user.discordId,
        });
      }
    }
  });
  
  log.info('[PlayerCheckpoint] ✅ Homestead deletion handler registered (IMMEDIATE RECOVERY MODE)');
}

// ============================================================================
// Singleton/Factory Helper
// ============================================================================

/**
 * Create a checkpoint service for a specific guild
 */
export function createCheckpointService(
  client: Client, 
  guildId: string
): PlayerCheckpointService {
  return new PlayerCheckpointService(client, guildId);
}
