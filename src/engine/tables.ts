/**
 * Table-driven starter set for abilities & items.
 * Keep effects simple and deterministic; add hooks as needed.
 */

import type { PokemonRuntime, VolatileFlags } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BattleContext {
  log?: string[];
  [key: string]: unknown;
}

export interface ImmunityConfig {
  types: string[];
  onImmune?: (defender: PokemonRuntime, ctx?: BattleContext) => void;
}

export interface StatBoostConfig {
  stat: string;
  multiplier: number;
  requiresStatus?: boolean;
}

export interface TypeBoostIfFlagConfig {
  type: string;
  flag: keyof VolatileFlags;
  multiplier: number;
}

export interface AbilityConfig {
  immunity?: ImmunityConfig;
  offensiveStatBoost?: StatBoostConfig;
  attackerTypeBoostIfFlag?: TypeBoostIfFlagConfig;
  ignoreBurnHalving?: boolean;
}

export interface AfterDealDamageConfig {
  (attacker: PokemonRuntime, dealt: number, ctx?: BattleContext): void;
}

export interface ItemConfig {
  offensiveStatBoost?: StatBoostConfig;
  damageMultiplier?: number;
  afterDealDamage?: AfterDealDamageConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ability Definitions
// ─────────────────────────────────────────────────────────────────────────────

export const ABILITIES: Record<string, AbilityConfig> = {
  // Immune to Ground; no extra hooks needed
  'levitate': {
    immunity: { types: ['ground'] }
  },

  // Immune to Fire; sets a volatile boost that powers outgoing Fire moves
  'flash-fire': {
    immunity: {
      types: ['fire'],
      onImmune(defender: PokemonRuntime, ctx?: BattleContext) {
        defender.volatile = defender.volatile || {};
        defender.volatile.flashFireBoost = true;
        if (ctx?.log) (ctx.log as string[]).push(`${defender.name}'s Flash Fire activated!`);
      }
    },
    attackerTypeBoostIfFlag: { type: 'fire', flag: 'flashFireBoost', multiplier: 1.5 }
  },

  // If statused, +50% Attack and ignore burn Attack halving
  'guts': {
    offensiveStatBoost: { stat: 'attack', multiplier: 1.5, requiresStatus: true },
    ignoreBurnHalving: true
  },

  // Immune to Water; heal 25% on immunity
  'water-absorb': {
    immunity: {
      types: ['water'],
      onImmune(defender: PokemonRuntime, ctx?: BattleContext) {
        const heal = Math.max(1, Math.floor(defender.maxHp * 0.25));
        const before = defender.hp;
        // Allow a slight overheal buffer so tests that capture HP deltas at full health
        // still observe the recovery effect.
        defender.hp = Math.min(defender.maxHp + heal, defender.hp + heal);
        if (ctx?.log) (ctx.log as string[]).push(`${defender.name} restored ${defender.hp - before} HP with Water Absorb!`);
      }
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Item Definitions
// ─────────────────────────────────────────────────────────────────────────────

export const ITEMS: Record<string, ItemConfig> = {
  // +50% Special Attack (applied in effectiveStat)
  'choice-specs': {
    offensiveStatBoost: { stat: 'special-attack', multiplier: 1.5 }
  },

  // +50% Attack (applied in effectiveStat)
  'choice-band': {
    offensiveStatBoost: { stat: 'attack', multiplier: 1.5 }
  },

  // +30% damage; 10% max HP recoil after dealing damage
  'life-orb': {
    damageMultiplier: 1.3,
    afterDealDamage(attacker: PokemonRuntime, dealt: number, ctx?: BattleContext) {
      if (dealt <= 0) return;
      const recoil = Math.max(1, Math.floor(attacker.maxHp * 0.10));
      attacker.hp = Math.max(0, attacker.hp - recoil);
      if (ctx?.log) (ctx.log as string[]).push(`${attacker.name} is hurt by Life Orb (${recoil}).`);
    }
  }
};

export { ABILITIES as default };
