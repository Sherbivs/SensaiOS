/**
 * Engine-Specific Error Handler
 * Purpose: Recognize and enrich game engine errors (battles, encounters, calculations)
 * Integrates with ErrorTracker for centralized error capture
 * 
 * @module core/engine-error-handler
 */

import { errorTracker, type ErrorContext } from '../services/error-tracker.js';

/// ---- Engine Error Types ----

export interface EngineErrorContext extends ErrorContext {
  battleId?: string;
  encounterId?: string;
  trainerId?: string;
  pokemonId?: string;
  moveId?: string;
  calculationType?: string;
  inputValues?: Record<string, unknown>;
}

export interface BattleState {
  battleId?: string;
  trainer1Id?: string;
  trainer2Id?: string;
  turn?: number;
  pokemon1?: { id: string; hp: number; species: string };
  pokemon2?: { id: string; hp: number; species: string };
  weather?: string;
  terrain?: string;
}

export interface EncounterContext {
  encounterId?: string;
  trainerId?: string;
  location?: string;
  encounterType?: string;
  pokemonSpecies?: string;
}

/// ---- Engine Error Handler ----

export class EngineErrorHandler {
  /**
   * Handle battle execution errors
   * Captures full battle state for debugging
   */
  async handleBattleError(
    error: Error,
    battleState: Partial<BattleState>
  ): Promise<string> {
    const context: EngineErrorContext = {
      category: 'ENGINE',
      severity: this.classifyBattleErrorSeverity(error, battleState),
      userId: battleState.trainer1Id,
      service: 'battle-engine',
      operation: 'battle-execution',
      battleId: battleState.battleId,
      trainerId: battleState.trainer1Id,
      customData: {
        battleState: this.sanitizeBattleState(battleState),
        errorStage: this.detectBattleErrorStage(error),
      },
    };
    
    return errorTracker.captureError(error, context);
  }
  
  /**
   * Handle damage calculation errors
   * Critical for battle integrity
   */
  async handleCalculationError(
    error: Error,
    calculation: string,
    inputs: Record<string, unknown>
  ): Promise<string> {
    const context: EngineErrorContext = {
      category: 'ENGINE',
      severity: 'HIGH', // Calculation errors break battles
      service: 'battle-engine',
      operation: 'damage-calculation',
      calculationType: calculation,
      inputValues: this.sanitizeInputs(inputs),
      customData: {
        calculationFormula: calculation,
        inputCount: Object.keys(inputs).length,
        hasNullInputs: Object.values(inputs).some(v => v === null || v === undefined),
        hasNaNInputs: Object.values(inputs).some(v => typeof v === 'number' && isNaN(v)),
      },
    };
    
    return errorTracker.captureError(error, context);
  }
  
  /**
   * Handle encounter generation errors
   */
  async handleEncounterError(
    error: Error,
    encounterContext: Partial<EncounterContext>
  ): Promise<string> {
    const context: EngineErrorContext = {
      category: 'ENGINE',
      severity: this.classifyEncounterErrorSeverity(error),
      userId: encounterContext.trainerId,
      service: 'encounter-engine',
      operation: 'encounter-generation',
      encounterId: encounterContext.encounterId,
      trainerId: encounterContext.trainerId,
      customData: {
        location: encounterContext.location,
        encounterType: encounterContext.encounterType,
        pokemonSpecies: encounterContext.pokemonSpecies,
      },
    };
    
    return errorTracker.captureError(error, context);
  }
  
  /**
   * Handle move execution errors
   */
  async handleMoveError(
    error: Error,
    moveId: string | number,
    battleState?: Partial<BattleState>
  ): Promise<string> {
    const context: EngineErrorContext = {
      category: 'ENGINE',
      severity: 'HIGH',
      service: 'battle-engine',
      operation: 'move-execution',
      moveId: String(moveId),
      battleId: battleState?.battleId,
      customData: {
        moveName: this.getMoveNameFromId(moveId),
        battleTurn: battleState?.turn,
        attackerHp: battleState?.pokemon1?.hp,
        defenderHp: battleState?.pokemon2?.hp,
      },
    };
    
    return errorTracker.captureError(error, context);
  }
  
  /**
   * Handle Pokemon data errors (missing species, invalid stats)
   */
  async handlePokemonDataError(
    error: Error,
    pokemonId: string | number,
    operation: string
  ): Promise<string> {
    const context: EngineErrorContext = {
      category: 'ENGINE',
      severity: 'MEDIUM',
      service: 'pokemon-data',
      operation,
      pokemonId: String(pokemonId),
      customData: {
        errorType: error.name,
        isMissingData: error.message.includes('not found') || error.message.includes('undefined'),
      },
    };
    
    return errorTracker.captureError(error, context);
  }
  
  /**
   * Handle stat calculation errors (HP, Attack, Defense, etc.)
   */
  async handleStatCalculationError(
    error: Error,
    statType: string,
    inputs: Record<string, unknown>
  ): Promise<string> {
    const numInputs = inputs as Record<string, number | undefined>;
    const context: EngineErrorContext = {
      category: 'ENGINE',
      severity: 'HIGH',
      service: 'stat-calculator',
      operation: 'stat-calculation',
      calculationType: statType,
      inputValues: this.sanitizeInputs(inputs),
      customData: {
        statType,
        hasInvalidBase: numInputs.base === undefined || numInputs.base < 0,
        hasInvalidIV: numInputs.iv === undefined || numInputs.iv < 0 || numInputs.iv > 31,
        hasInvalidEV: numInputs.ev === undefined || numInputs.ev < 0 || numInputs.ev > 255,
      },
    };
    
    return errorTracker.captureError(error, context);
  }
  
  /**
   * Handle type effectiveness calculation errors
   */
  async handleTypeEffectivenessError(
    error: Error,
    attackType: string,
    defendTypes: string[]
  ): Promise<string> {
    const context: EngineErrorContext = {
      category: 'ENGINE',
      severity: 'HIGH',
      service: 'type-calculator',
      operation: 'type-effectiveness',
      customData: {
        attackType,
        defendTypes,
        typeCount: defendTypes.length,
        hasUnknownType: error.message.includes('unknown') || error.message.includes('not found'),
      },
    };
    
    return errorTracker.captureError(error, context);
  }
  
  /// ---- Private Helpers ----
  
  private classifyBattleErrorSeverity(
    error: Error,
    battleState: Partial<BattleState>
  ): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    // Database errors during battle are CRITICAL (corrupts battle state)
    if (error.name.includes('Prisma') || error.message.includes('database')) {
      return 'CRITICAL';
    }
    
    // Null reference errors are HIGH (battle crashes)
    if (error.name === 'TypeError' && error.message.includes('null')) {
      return 'HIGH';
    }
    
    // Calculation errors are HIGH (incorrect battle outcomes)
    if (error.message.includes('calculation') || error.message.includes('NaN')) {
      return 'HIGH';
    }
    
    // Late-game errors are more severe (user invested more time)
    if (battleState.turn && battleState.turn > 10) {
      return 'HIGH';
    }
    
    return 'MEDIUM';
  }
  
  private classifyEncounterErrorSeverity(error: Error): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    // Database errors are CRITICAL
    if (error.name.includes('Prisma')) {
      return 'CRITICAL';
    }
    
    // Missing Pokemon data is HIGH (breaks encounters)
    if (error.message.includes('not found') || error.message.includes('undefined')) {
      return 'HIGH';
    }
    
    // RNG errors are MEDIUM (annoying but not critical)
    if (error.message.includes('random') || error.message.includes('seed')) {
      return 'MEDIUM';
    }
    
    return 'MEDIUM';
  }
  
  private detectBattleErrorStage(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('initialization') || message.includes('setup')) {
      return 'initialization';
    }
    
    if (message.includes('move') || message.includes('attack')) {
      return 'move-execution';
    }
    
    if (message.includes('damage') || message.includes('calculation')) {
      return 'damage-calculation';
    }
    
    if (message.includes('status') || message.includes('condition')) {
      return 'status-effect';
    }
    
    if (message.includes('end') || message.includes('finish')) {
      return 'battle-conclusion';
    }
    
    return 'unknown';
  }
  
  private sanitizeBattleState(battleState: Partial<BattleState>): Record<string, unknown> {
    return {
      battleId: battleState.battleId,
      turn: battleState.turn,
      weather: battleState.weather,
      terrain: battleState.terrain,
      pokemon1: battleState.pokemon1 ? {
        species: battleState.pokemon1.species,
        hp: battleState.pokemon1.hp,
      } : null,
      pokemon2: battleState.pokemon2 ? {
        species: battleState.pokemon2.species,
        hp: battleState.pokemon2.hp,
      } : null,
    };
  }
  
  private sanitizeInputs(inputs: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(inputs)) {
      // Sanitize sensitive data
      if (key.toLowerCase().includes('password') || key.toLowerCase().includes('token')) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = '[OBJECT]';
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  private getMoveNameFromId(moveId: string | number): string {
    // TODO: Lookup move name from dexpack or database
    // For now, just return the ID
    return `Move ${moveId}`;
  }
}

// Singleton instance
export const engineErrorHandler = new EngineErrorHandler();
