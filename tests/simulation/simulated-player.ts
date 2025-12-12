/**
 * Simulated Player with AI Decision-Making
 * 
 * AI-driven player that makes autonomous gameplay decisions based on personality traits.
 * Supports battle decision-making, wild encounter handling, and automated gameplay actions.
 * 
 * @module tests/simulation/simulated-player
 */

import { EventEmitter } from "events";
import { MockUser } from "./mocks/discord-mocks.js";

/**
 * Player personality traits that drive AI decision-making
 */
export enum PlayerPersonality {
  /** Always attacks, prefers highest damage moves, never switches, catches all wilds */
  AGGRESSIVE = "aggressive",
  /** Switches frequently, prefers status moves, runs from wilds when low HP */
  DEFENSIVE = "defensive",
  /** Mix of strategies, tactical decisions based on type matchups */
  BALANCED = "balanced",
  /** Completely random decisions for chaos testing */
  RANDOM = "random",
}

/**
 * Pokémon in player's party or box
 */
export interface Pokemon {
  id: string;
  speciesId: number;
  speciesName: string;
  level: number;
  currentHp: number;
  maxHp: number;
  moves: string[];
  status?: string;
}

/**
 * Battle state information for AI decision-making
 */
export interface BattleState {
  battleId: string;
  yourPokemon: Pokemon;
  opponentPokemon: Pokemon;
  yourParty: Pokemon[];
  opponentParty: Pokemon[];
  turn: number;
  weather?: string;
  yourSide?: {
    hazards?: string[];
    boosts?: Record<string, number>;
  };
  opponentSide?: {
    hazards?: string[];
    boosts?: Record<string, number>;
  };
}

/**
 * Move selection decision
 */
export interface MoveSelection {
  type: "move";
  moveIndex: number;
  moveName: string;
  reasoning?: string;
}

/**
 * Switch selection decision
 */
export interface SwitchSelection {
  type: "switch";
  targetIndex: number;
  targetPokemon: Pokemon;
  reasoning?: string;
}

/**
 * Battle action (move or switch)
 */
export type BattleAction = MoveSelection | SwitchSelection;

/**
 * Wild encounter state
 */
export interface EncounterState {
  encounterId: string;
  wildPokemon: Pokemon;
  yourPokemon: Pokemon;
  catchRate: number;
  turn: number;
}

/**
 * Encounter action decision
 */
export type EncounterAction = 
  | { type: "catch"; reasoning?: string }
  | { type: "fight"; moveIndex: number; reasoning?: string }
  | { type: "run"; reasoning?: string };

/**
 * Player configuration options
 */
export interface PlayerOptions {
  personality?: PlayerPersonality;
  preferredStarter?: string; // "Bulbasaur", "Charmander", "Squirtle"
  riskTolerance?: number; // 0-1, affects decision-making (0 = cautious, 1 = reckless)
  catchThreshold?: number; // 0-1, minimum catch rate to attempt catch (default 0.3)
}

/**
 * Simulated player with AI-driven decision-making
 */
export class SimulatedPlayer extends EventEmitter {
  // Identity
  public readonly id: string;
  public readonly username: string;
  public readonly user: MockUser;
  
  // State (will be populated by simulation engine from database)
  public party: Pokemon[] = [];
  public box: Pokemon[] = [];
  public coins: number = 0;
  public hasStarter: boolean = false;
  
  // AI Configuration
  public readonly personality: PlayerPersonality;
  public readonly options: PlayerOptions;
  
  // Internal state
  private rng: () => number; // Random number generator [0,1)
  
  /**
   * Create a simulated player
   * @param id User ID
   * @param username Username
   * @param user Mock Discord user
   * @param options Player configuration
   */
  constructor(id: string, username: string, user: MockUser, options: PlayerOptions = {}) {
    super();
    
    this.id = id;
    this.username = username;
    this.user = user;
    this.personality = options.personality || PlayerPersonality.BALANCED;
    this.options = {
      riskTolerance: options.riskTolerance ?? 0.5,
      catchThreshold: options.catchThreshold ?? 0.3,
      preferredStarter: options.preferredStarter,
      ...options,
    };
    
    // Simple RNG seeded with username
    let seed = 0;
    for (let i = 0; i < username.length; i++) {
      seed = (seed * 31 + username.charCodeAt(i)) | 0;
    }
    let state = (seed >>> 0) || 1;
    this.rng = () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return (state >>> 0) / 0x100000000;
    };
  }
  
  /**
   * Select a starter Pokémon
   * Uses personality and preferences to choose
   * @returns Starter choice ("Bulbasaur", "Charmander", or "Squirtle")
   */
  selectStarter(): string {
    const starters = ["Bulbasaur", "Charmander", "Squirtle"];
    
    // Use preferred starter if specified
    if (this.options.preferredStarter && starters.includes(this.options.preferredStarter)) {
      this.emit("decision", { type: "starter", choice: this.options.preferredStarter, reasoning: "preferred" });
      return this.options.preferredStarter;
    }
    
    // Personality-based selection
    switch (this.personality) {
      case PlayerPersonality.AGGRESSIVE:
        // Prefers Charmander (fire = offensive)
        this.emit("decision", { type: "starter", choice: "Charmander", reasoning: "aggressive personality" });
        return "Charmander";
      
      case PlayerPersonality.DEFENSIVE:
        // Prefers Bulbasaur (grass/poison = status effects)
        this.emit("decision", { type: "starter", choice: "Bulbasaur", reasoning: "defensive personality" });
        return "Bulbasaur";
      
      case PlayerPersonality.BALANCED:
        // Prefers Squirtle (water = versatile)
        this.emit("decision", { type: "starter", choice: "Squirtle", reasoning: "balanced personality" });
        return "Squirtle";
      
      case PlayerPersonality.RANDOM:
      default: {
        // Random selection
        const choice = starters[Math.floor(this.rng() * starters.length)];
        this.emit("decision", { type: "starter", choice, reasoning: "random" });
        return choice;
      }
    }
  }
  
  /**
   * Select a move during battle
   * Uses personality and battle state to make tactical decisions
   * @param battle Current battle state
   * @returns Battle action (move or switch)
   */
  selectBattleAction(battle: BattleState): BattleAction {
    const yourPokemon = battle.yourPokemon;
    
    // Check if we should switch (if current Pokémon is in bad shape)
    const hpPercent = yourPokemon.currentHp / yourPokemon.maxHp;
    const shouldConsiderSwitch = this.shouldSwitch(battle, hpPercent);
    
    if (shouldConsiderSwitch) {
      const switchTarget = this.selectSwitchTarget(battle);
      if (switchTarget) {
        return switchTarget;
      }
    }
    
    // Select a move
    return this.selectMove(battle);
  }
  
  /**
   * Determine if we should switch Pokémon
   * @param battle Battle state
   * @param hpPercent Current Pokémon HP percentage (0-1)
   * @returns True if should consider switching
   */
  private shouldSwitch(battle: BattleState, hpPercent: number): boolean {
    switch (this.personality) {
      case PlayerPersonality.AGGRESSIVE:
        // Never switches (fights to the end)
        return false;
      
      case PlayerPersonality.DEFENSIVE:
        // Switches frequently when HP < 60%
        return hpPercent < 0.6 && battle.yourParty.some(p => p.currentHp > 0 && p.id !== battle.yourPokemon.id);
      
      case PlayerPersonality.BALANCED:
        // Switches tactically when HP < 30%
        return hpPercent < 0.3 && battle.yourParty.some(p => p.currentHp > 0 && p.id !== battle.yourPokemon.id);
      
      case PlayerPersonality.RANDOM:
        // Random 20% chance to switch each turn if options available
        return this.rng() < 0.2 && battle.yourParty.some(p => p.currentHp > 0 && p.id !== battle.yourPokemon.id);
      
      default:
        return false;
    }
  }
  
  /**
   * Select which Pokémon to switch to
   * @param battle Battle state
   * @returns Switch selection or null if no good switch
   */
  private selectSwitchTarget(battle: BattleState): SwitchSelection | null {
    // Find alive Pokémon that aren't currently active
    const availablePokemon = battle.yourParty.filter(
      p => p.currentHp > 0 && p.id !== battle.yourPokemon.id
    );
    
    if (availablePokemon.length === 0) {
      return null;
    }
    
    // Simple selection: highest HP Pokémon
    // TODO: Could enhance with type matchup analysis
    const bestSwitch = availablePokemon.reduce((best, current) => 
      current.currentHp > best.currentHp ? current : best
    );
    
    const targetIndex = battle.yourParty.findIndex(p => p.id === bestSwitch.id);
    
    const selection: SwitchSelection = {
      type: "switch",
      targetIndex,
      targetPokemon: bestSwitch,
      reasoning: `${this.personality}: switching to healthier Pokémon`,
    };
    
    this.emit("decision", { type: "switch", target: bestSwitch.speciesName, reasoning: selection.reasoning });
    return selection;
  }
  
  /**
   * Select a move to use in battle
   * @param battle Battle state
   * @returns Move selection
   */
  private selectMove(battle: BattleState): MoveSelection {
    const yourPokemon = battle.yourPokemon;
    const availableMoves = yourPokemon.moves;
    
    if (availableMoves.length === 0) {
      // Fallback: struggle (index 0)
      return {
        type: "move",
        moveIndex: 0,
        moveName: "struggle",
        reasoning: "no moves available",
      };
    }
    
    let selectedIndex = 0;
    let reasoning = "";
    
    switch (this.personality) {
      case PlayerPersonality.AGGRESSIVE:
        // Always picks first move (assumed to be strongest attacking move)
        selectedIndex = 0;
        reasoning = "aggressive: always attack with primary move";
        break;
      
      case PlayerPersonality.DEFENSIVE:
        // Prefers status moves (assume they're later in moveset)
        // For now, picks last move
        selectedIndex = availableMoves.length - 1;
        reasoning = "defensive: prefer status/setup moves";
        break;
      
      case PlayerPersonality.BALANCED: {
        // Tactical: picks based on situation
        // Simple heuristic: use strongest move when opponent HP > 50%, otherwise vary
        const opponentHpPercent = battle.opponentPokemon.currentHp / battle.opponentPokemon.maxHp;
        if (opponentHpPercent > 0.5) {
          selectedIndex = 0;
          reasoning = "balanced: strong attack when opponent healthy";
        } else {
          selectedIndex = Math.floor(this.rng() * availableMoves.length);
          reasoning = "balanced: varied moves when opponent weakened";
        }
        break;
      }
      
      case PlayerPersonality.RANDOM:
      default:
        // Completely random
        selectedIndex = Math.floor(this.rng() * availableMoves.length);
        reasoning = "random: chaos testing";
        break;
    }
    
    const selection: MoveSelection = {
      type: "move",
      moveIndex: selectedIndex,
      moveName: availableMoves[selectedIndex],
      reasoning,
    };
    
    this.emit("decision", { type: "move", move: selection.moveName, reasoning: selection.reasoning });
    return selection;
  }
  
  /**
   * Handle a wild encounter
   * Decides whether to catch, fight, or run
   * @param encounter Wild encounter state
   * @returns Encounter action
   */
  handleWildEncounter(encounter: EncounterState): EncounterAction {
    const catchRate = encounter.catchRate;
    const yourPokemon = encounter.yourPokemon;
    const yourHpPercent = yourPokemon.currentHp / yourPokemon.maxHp;
    
    // Check if party is full
    const partyFull = this.party.length >= 6;
    
    switch (this.personality) {
      case PlayerPersonality.AGGRESSIVE:
        // Always tries to catch (if not full) or fight
        if (!partyFull && catchRate >= this.options.catchThreshold!) {
          this.emit("decision", { type: "encounter", action: "catch", reasoning: "aggressive: always catch" });
          return { type: "catch", reasoning: "aggressive personality" };
        }
        // Fight if can't catch
        this.emit("decision", { type: "encounter", action: "fight", reasoning: "aggressive: fight" });
        return { type: "fight", moveIndex: 0, reasoning: "aggressive: fight everything" };
      
      case PlayerPersonality.DEFENSIVE:
        // Runs when low HP, otherwise considers catching
        if (yourHpPercent < 0.4) {
          this.emit("decision", { type: "encounter", action: "run", reasoning: "defensive: low HP" });
          return { type: "run", reasoning: "defensive: low HP, retreat" };
        }
        if (!partyFull && catchRate >= 0.5) {
          this.emit("decision", { type: "encounter", action: "catch", reasoning: "defensive: good catch rate" });
          return { type: "catch", reasoning: "defensive: favorable conditions" };
        }
        // Run if conditions aren't good
        this.emit("decision", { type: "encounter", action: "run", reasoning: "defensive: avoid risk" });
        return { type: "run", reasoning: "defensive: avoid unnecessary battles" };
      
      case PlayerPersonality.BALANCED:
        // Tactical decision based on catch rate and HP
        if (!partyFull && catchRate >= this.options.catchThreshold!) {
          const shouldCatch = this.rng() < (catchRate * (this.options.riskTolerance! + 0.5));
          if (shouldCatch) {
            this.emit("decision", { type: "encounter", action: "catch", reasoning: "balanced: tactical catch" });
            return { type: "catch", reasoning: "balanced: calculated risk" };
          }
        }
        if (yourHpPercent < 0.3) {
          this.emit("decision", { type: "encounter", action: "run", reasoning: "balanced: preserve HP" });
          return { type: "run", reasoning: "balanced: preserve resources" };
        }
        // Fight otherwise
        this.emit("decision", { type: "encounter", action: "fight", reasoning: "balanced: engage" });
        return { type: "fight", moveIndex: 0, reasoning: "balanced: standard engagement" };
      
      case PlayerPersonality.RANDOM:
      default: {
        // Random decision
        const roll = this.rng();
        if (!partyFull && roll < 0.33) {
          this.emit("decision", { type: "encounter", action: "catch", reasoning: "random" });
          return { type: "catch", reasoning: "random: chaos" };
        } else if (roll < 0.66) {
          this.emit("decision", { type: "encounter", action: "fight", reasoning: "random" });
          return { type: "fight", moveIndex: Math.floor(this.rng() * yourPokemon.moves.length), reasoning: "random: chaos" };
        } else {
          this.emit("decision", { type: "encounter", action: "run", reasoning: "random" });
          return { type: "run", reasoning: "random: chaos" };
        }
      }
    }
  }
  
  /**
   * Get player's current state summary
   * @returns State description
   */
  getState(): string {
    return JSON.stringify({
      username: this.username,
      personality: this.personality,
      partySize: this.party.length,
      boxSize: this.box.length,
      coins: this.coins,
      hasStarter: this.hasStarter,
    }, null, 2);
  }
  
  /**
   * Update player's party (called by simulation engine after database sync)
   * @param party New party state
   */
  updateParty(party: Pokemon[]): void {
    this.party = party;
    this.hasStarter = party.length > 0;
    this.emit("partyUpdated", { partySize: party.length });
  }
  
  /**
   * Update player's box (called by simulation engine after database sync)
   * @param box New box state
   */
  updateBox(box: Pokemon[]): void {
    this.box = box;
    this.emit("boxUpdated", { boxSize: box.length });
  }
  
  /**
   * Update player's coins (called by simulation engine after database sync)
   * @param coins New coin amount
   */
  updateCoins(coins: number): void {
    this.coins = coins;
    this.emit("coinsUpdated", { coins });
  }
}

/**
 * Create a simulated player with specific personality
 * Convenience factory function
 */
export function createSimulatedPlayer(
  id: string,
  username: string,
  user: MockUser,
  personality: PlayerPersonality,
  options: Partial<PlayerOptions> = {}
): SimulatedPlayer {
  return new SimulatedPlayer(id, username, user, {
    personality,
    ...options,
  });
}
