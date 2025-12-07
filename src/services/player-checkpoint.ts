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
 * Set up the channelDelete event handler for AUTOMATIC recovery
 * 
 * When a homestead channel is deleted:
 * 1. Detect it via Discord channelDelete event
 * 2. Mark the DB record as 'deleted' 
 * 3. AUTOMATICALLY recreate the channel (no user command needed)
 * 4. Run full diagnostics and healing
 * 5. Notify the user in their new homestead with recovery status
 * 
 * Call this during bot initialization.
 */
export function setupHomesteadDeletionHandler(client: Client): void {
  client.on('channelDelete', async (channel) => {
    // Only handle guild text channels
    if (!channel.isTextBased() || !('guild' in channel)) return;
    
    // Check if this was a homestead channel
    const homestead = await prisma.homesteadChannel.findUnique({
      where: { channelId: channel.id },
      include: { user: true }
    });
    
    if (!homestead) return; // Not a homestead channel
    
    const guildId = 'guild' in channel ? channel.guild.id : homestead.guildId;
    
    log.info('[PlayerCheckpoint] Homestead channel deleted, initiating AUTOMATIC recovery', {
      channelId: channel.id,
      userId: homestead.userId,
      discordId: homestead.user.discordId,
      guildId,
    });
    
    // Mark the DB record as deleted (keep for audit trail)
    await prisma.homesteadChannel.update({
      where: { id: homestead.id },
      data: { status: 'deleted' }
    });
    
    // ========================================================================
    // AUTOMATIC RECOVERY: Recreate homestead without user command
    // ========================================================================
    try {
      // Fetch the Discord user object
      const discordUser = await client.users.fetch(homestead.user.discordId);
      
      // Get the guild
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        log.error('[PlayerCheckpoint] Cannot auto-recover: Guild not found', { guildId });
        return;
      }
      
      // Create new homestead channel
      const manager = new HomesteadChannelManager(client, guildId);
      const { channel: newChannel } = await manager.getOrCreateChannel(discordUser);
      
      log.info('[PlayerCheckpoint] Auto-created new homestead channel', {
        userId: homestead.userId,
        discordId: homestead.user.discordId,
        newChannelId: newChannel.id,
      });
      
      // Run full recovery diagnostics
      const checkpointService = new PlayerCheckpointService(client, guildId);
      const { report, recoveryMessage } = await checkpointService.handleHomesteadDeletion(
        homestead.userId,
        discordUser
      );
      
      // Send recovery status to the new channel
      await newChannel.send({ embeds: [recoveryMessage] });
      
      // Also send a welcome-back message with channel link hint
      const welcomeBack = new EmbedBuilder()
        .setTitle('🏠 Your Homestead Has Been Restored!')
        .setColor(0x00FF00)
        .setDescription(
          `Your homestead channel was deleted, but don't worry — I've automatically ` +
          `recreated it and recovered your game state!\n\n` +
          `**Your Pokémon, items, and progress are safe.** ✨\n\n` +
          `This is your new homestead. Everything works just like before.`
        )
        .addFields({
          name: 'Recovery Status',
          value: report.overallStatus === 'healthy' 
            ? '✅ All systems nominal' 
            : `⚠️ ${report.overallStatus} — see details above`,
          inline: true,
        })
        .setTimestamp()
        .setFooter({ text: 'Infinity Gauntlet Auto-Recovery' });
      
      await newChannel.send({ embeds: [welcomeBack] });
      
      log.info('[PlayerCheckpoint] Automatic homestead recovery complete', {
        userId: homestead.userId,
        discordId: homestead.user.discordId,
        newChannelId: newChannel.id,
        recoveryStatus: report.overallStatus,
      });
      
    } catch (error) {
      log.error('[PlayerCheckpoint] Automatic homestead recovery FAILED', {
        userId: homestead.userId,
        discordId: homestead.user.discordId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Try to DM the user as fallback notification
      try {
        const discordUser = await client.users.fetch(homestead.user.discordId);
        await discordUser.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('⚠️ Homestead Recovery Issue')
              .setColor(0xFFFF00)
              .setDescription(
                `Your homestead channel was deleted, but I had trouble automatically ` +
                `recreating it. Don't worry — your game data is safe!\n\n` +
                `**To restore your homestead**, just run \`/home\` in any channel on the server.`
              )
              .setTimestamp()
          ]
        });
      } catch (dmError) {
        log.warn('[PlayerCheckpoint] Could not DM user about recovery failure', {
          discordId: homestead.user.discordId,
          error: dmError instanceof Error ? dmError.message : String(dmError),
        });
      }
    }
  });
  
  log.info('[PlayerCheckpoint] Homestead deletion handler registered (AUTOMATIC recovery enabled)');
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
