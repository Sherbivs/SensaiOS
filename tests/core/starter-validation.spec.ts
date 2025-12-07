/**
 * Starter Validation Tests
 * 
 * Tests the starter Pokémon validation system that enforces:
 * - No regional starters (all generations)
 * - No legendaries
 * - No mythicals
 * - No pseudo-legendary final evolutions
 * 
 * @group starter
 * @group validation
 */

import { describe, it, expect } from 'vitest';
import {
  isRegionalStarter,
  isLegendary,
  isMythical,
  isPseudoLegendaryFinal,
  isForbiddenStarter,
  getForbiddenReason,
  getRejectionMessage,
  validateStarterSelection,
  getAllForbiddenIds,
  getForbiddenCounts,
  REGIONAL_STARTERS,
  LEGENDARY_POKEMON,
  MYTHICAL_POKEMON,
  PSEUDO_LEGENDARY_FINALS,
} from '../../src/core/starter-validation.js';

// ============================================================================
// TEST DATA
// ============================================================================

const VALID_STARTERS = [
  { id: 25, name: 'Pikachu' },
  { id: 133, name: 'Eevee' },
  { id: 123, name: 'Scyther' },
  { id: 447, name: 'Riolu' },
  { id: 440, name: 'Happiny' },
  { id: 247, name: 'Pupitar' },      // Pre-evo of pseudo-legendary
  { id: 147, name: 'Dratini' },      // Pre-evo of pseudo-legendary
  { id: 214, name: 'Heracross' },
  { id: 58, name: 'Growlithe' },
  { id: 37, name: 'Vulpix' },
];

const REGIONAL_STARTER_SAMPLES = [
  { id: 1, name: 'Bulbasaur', gen: 1 },
  { id: 4, name: 'Charmander', gen: 1 },
  { id: 7, name: 'Squirtle', gen: 1 },
  { id: 152, name: 'Chikorita', gen: 2 },
  { id: 252, name: 'Treecko', gen: 3 },
  { id: 387, name: 'Turtwig', gen: 4 },
  { id: 495, name: 'Snivy', gen: 5 },
  { id: 650, name: 'Chespin', gen: 6 },
  { id: 722, name: 'Rowlet', gen: 7 },
  { id: 810, name: 'Grookey', gen: 8 },
  { id: 906, name: 'Sprigatito', gen: 9 },
];

const LEGENDARY_SAMPLES = [
  { id: 144, name: 'Articuno' },
  { id: 150, name: 'Mewtwo' },
  { id: 249, name: 'Lugia' },
  { id: 382, name: 'Kyogre' },
  { id: 483, name: 'Dialga' },
  { id: 643, name: 'Reshiram' },
  { id: 716, name: 'Xerneas' },
  { id: 888, name: 'Zacian' },
];

const MYTHICAL_SAMPLES = [
  { id: 151, name: 'Mew' },
  { id: 251, name: 'Celebi' },
  { id: 385, name: 'Jirachi' },
  { id: 493, name: 'Arceus' },
  { id: 494, name: 'Victini' },
  { id: 719, name: 'Diancie' },
  { id: 801, name: 'Magearna' },
];

const PSEUDO_LEGENDARY_FINAL_SAMPLES = [
  { id: 149, name: 'Dragonite' },
  { id: 248, name: 'Tyranitar' },
  { id: 373, name: 'Salamence' },
  { id: 376, name: 'Metagross' },
  { id: 445, name: 'Garchomp' },
  { id: 635, name: 'Hydreigon' },
  { id: 706, name: 'Goodra' },
  { id: 784, name: 'Kommo-o' },
  { id: 887, name: 'Dragapult' },
];

// ============================================================================
// INDIVIDUAL CHECK TESTS
// ============================================================================

describe('isRegionalStarter', () => {
  it('should identify regional starters from all generations', () => {
    for (const starter of REGIONAL_STARTER_SAMPLES) {
      expect(isRegionalStarter(starter.id)).toBe(true);
    }
  });

  it('should not flag regular Pokémon as starters', () => {
    for (const pokemon of VALID_STARTERS) {
      expect(isRegionalStarter(pokemon.id)).toBe(false);
    }
  });

  it('should include starter evolutions', () => {
    // Charizard (Charmander evolution)
    expect(isRegionalStarter(6)).toBe(true);
    // Venusaur (Bulbasaur evolution)
    expect(isRegionalStarter(3)).toBe(true);
    // Blastoise (Squirtle evolution)
    expect(isRegionalStarter(9)).toBe(true);
  });
});

describe('isLegendary', () => {
  it('should identify legendary Pokémon', () => {
    for (const legendary of LEGENDARY_SAMPLES) {
      expect(isLegendary(legendary.id)).toBe(true);
    }
  });

  it('should not flag regular Pokémon as legendary', () => {
    for (const pokemon of VALID_STARTERS) {
      expect(isLegendary(pokemon.id)).toBe(false);
    }
  });

  it('should not flag mythicals as legendary', () => {
    for (const mythical of MYTHICAL_SAMPLES) {
      expect(isLegendary(mythical.id)).toBe(false);
    }
  });
});

describe('isMythical', () => {
  it('should identify mythical Pokémon', () => {
    for (const mythical of MYTHICAL_SAMPLES) {
      expect(isMythical(mythical.id)).toBe(true);
    }
  });

  it('should not flag regular Pokémon as mythical', () => {
    for (const pokemon of VALID_STARTERS) {
      expect(isMythical(pokemon.id)).toBe(false);
    }
  });

  it('should not flag legendaries as mythical', () => {
    for (const legendary of LEGENDARY_SAMPLES) {
      expect(isMythical(legendary.id)).toBe(false);
    }
  });
});

describe('isPseudoLegendaryFinal', () => {
  it('should identify pseudo-legendary final evolutions', () => {
    for (const pseudo of PSEUDO_LEGENDARY_FINAL_SAMPLES) {
      expect(isPseudoLegendaryFinal(pseudo.id)).toBe(true);
    }
  });

  it('should NOT flag pre-evolutions of pseudo-legendaries', () => {
    // Pupitar (pre-evo of Tyranitar)
    expect(isPseudoLegendaryFinal(247)).toBe(false);
    // Larvitar
    expect(isPseudoLegendaryFinal(246)).toBe(false);
    // Dratini
    expect(isPseudoLegendaryFinal(147)).toBe(false);
    // Dragonair
    expect(isPseudoLegendaryFinal(148)).toBe(false);
    // Gible
    expect(isPseudoLegendaryFinal(443)).toBe(false);
    // Gabite
    expect(isPseudoLegendaryFinal(444)).toBe(false);
  });

  it('should not flag regular Pokémon', () => {
    for (const pokemon of VALID_STARTERS.filter(p => !['Pupitar', 'Dratini'].includes(p.name))) {
      expect(isPseudoLegendaryFinal(pokemon.id)).toBe(false);
    }
  });
});

// ============================================================================
// COMBINED VALIDATION TESTS
// ============================================================================

describe('isForbiddenStarter', () => {
  it('should return true for all forbidden categories', () => {
    // Regional starters
    expect(isForbiddenStarter(1)).toBe(true);   // Bulbasaur
    // Legendaries
    expect(isForbiddenStarter(150)).toBe(true); // Mewtwo
    // Mythicals
    expect(isForbiddenStarter(151)).toBe(true); // Mew
    // Pseudo-legendary finals
    expect(isForbiddenStarter(149)).toBe(true); // Dragonite
  });

  it('should return false for valid starters', () => {
    for (const pokemon of VALID_STARTERS) {
      expect(isForbiddenStarter(pokemon.id)).toBe(false);
    }
  });
});

describe('getForbiddenReason', () => {
  it('should return correct reason for each category', () => {
    expect(getForbiddenReason(1)).toBe('regional_starter');
    expect(getForbiddenReason(150)).toBe('legendary');
    expect(getForbiddenReason(151)).toBe('mythical');
    expect(getForbiddenReason(149)).toBe('pseudo_legendary_final');
  });

  it('should return null for valid Pokémon', () => {
    expect(getForbiddenReason(25)).toBeNull();  // Pikachu
    expect(getForbiddenReason(133)).toBeNull(); // Eevee
    expect(getForbiddenReason(247)).toBeNull(); // Pupitar
  });
});

describe('getRejectionMessage', () => {
  it('should return user-friendly messages for each reason', () => {
    expect(getRejectionMessage('unknown_pokemon')).toContain("doesn't match");
    expect(getRejectionMessage('regional_starter')).toContain('Regional starters');
    expect(getRejectionMessage('legendary')).toContain('Legendary');
    expect(getRejectionMessage('mythical')).toContain('Mythical');
    expect(getRejectionMessage('pseudo_legendary_final')).toContain('Pseudo-legendary');
  });

  it('should mention allowed alternatives for pseudo-legendaries', () => {
    const message = getRejectionMessage('pseudo_legendary_final');
    expect(message).toContain('Pupitar');
    expect(message).toContain('Dratini');
  });
});

// ============================================================================
// FULL VALIDATION FLOW TESTS
// ============================================================================

describe('validateStarterSelection', () => {
  // Mock lookup function
  const mockLookup = (query: string | number) => {
    const database: Record<string | number, { id: number; name: string }> = {
      'pikachu': { id: 25, name: 'Pikachu' },
      25: { id: 25, name: 'Pikachu' },
      'charmander': { id: 4, name: 'Charmander' },
      4: { id: 4, name: 'Charmander' },
      'mewtwo': { id: 150, name: 'Mewtwo' },
      150: { id: 150, name: 'Mewtwo' },
      'mew': { id: 151, name: 'Mew' },
      151: { id: 151, name: 'Mew' },
      'dragonite': { id: 149, name: 'Dragonite' },
      149: { id: 149, name: 'Dragonite' },
      'pupitar': { id: 247, name: 'Pupitar' },
      247: { id: 247, name: 'Pupitar' },
    };
    const key = typeof query === 'string' ? query.toLowerCase() : query;
    return database[key] ?? null;
  };

  it('should validate valid starters', () => {
    const result = validateStarterSelection('pikachu', mockLookup);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.speciesId).toBe(25);
      expect(result.name).toBe('Pikachu');
    }
  });

  it('should validate by ID', () => {
    const result = validateStarterSelection(25, mockLookup);
    expect(result.valid).toBe(true);
  });

  it('should reject unknown Pokémon', () => {
    const result = validateStarterSelection('notapokemon', mockLookup);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('unknown_pokemon');
    }
  });

  it('should reject regional starters', () => {
    const result = validateStarterSelection('charmander', mockLookup);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('regional_starter');
      expect(result.name).toBe('Charmander');
    }
  });

  it('should reject legendaries', () => {
    const result = validateStarterSelection('mewtwo', mockLookup);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('legendary');
    }
  });

  it('should reject mythicals', () => {
    const result = validateStarterSelection('mew', mockLookup);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('mythical');
    }
  });

  it('should reject pseudo-legendary finals', () => {
    const result = validateStarterSelection('dragonite', mockLookup);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('pseudo_legendary_final');
    }
  });

  it('should allow pseudo-legendary pre-evolutions', () => {
    const result = validateStarterSelection('pupitar', mockLookup);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.speciesId).toBe(247);
    }
  });
});

// ============================================================================
// UTILITY FUNCTION TESTS
// ============================================================================

describe('getAllForbiddenIds', () => {
  it('should return array of all forbidden IDs', () => {
    const ids = getAllForbiddenIds();
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThan(0);
    
    // Should include samples from each category
    expect(ids).toContain(1);   // Bulbasaur (starter)
    expect(ids).toContain(150); // Mewtwo (legendary)
    expect(ids).toContain(151); // Mew (mythical)
    expect(ids).toContain(149); // Dragonite (pseudo-legendary final)
  });
});

describe('getForbiddenCounts', () => {
  it('should return counts for each category', () => {
    const counts = getForbiddenCounts();
    
    expect(counts.regional_starters).toBe(REGIONAL_STARTERS.size);
    expect(counts.legendary).toBe(LEGENDARY_POKEMON.size);
    expect(counts.mythical).toBe(MYTHICAL_POKEMON.size);
    expect(counts.pseudo_legendary_finals).toBe(PSEUDO_LEGENDARY_FINALS.size);
    expect(counts.total).toBeGreaterThan(0);
  });

  it('should have consistent total', () => {
    const counts = getForbiddenCounts();
    const ids = getAllForbiddenIds();
    expect(counts.total).toBe(ids.length);
  });
});

// ============================================================================
// DATA INTEGRITY TESTS
// ============================================================================

describe('Forbidden Lists Integrity', () => {
  it('should have no overlap between starters and legendaries', () => {
    for (const id of REGIONAL_STARTERS) {
      expect(LEGENDARY_POKEMON.has(id)).toBe(false);
    }
  });

  it('should have no overlap between starters and mythicals', () => {
    for (const id of REGIONAL_STARTERS) {
      expect(MYTHICAL_POKEMON.has(id)).toBe(false);
    }
  });

  it('should have no overlap between legendaries and mythicals', () => {
    for (const id of LEGENDARY_POKEMON) {
      expect(MYTHICAL_POKEMON.has(id)).toBe(false);
    }
  });

  it('should have no overlap between pseudo-legendary finals and other categories', () => {
    for (const id of PSEUDO_LEGENDARY_FINALS) {
      expect(REGIONAL_STARTERS.has(id)).toBe(false);
      expect(LEGENDARY_POKEMON.has(id)).toBe(false);
      expect(MYTHICAL_POKEMON.has(id)).toBe(false);
    }
  });

  it('should have valid Pokémon IDs (1-1025+)', () => {
    const allIds = getAllForbiddenIds();
    for (const id of allIds) {
      expect(id).toBeGreaterThan(0);
      expect(id).toBeLessThan(2000); // Reasonable upper bound
    }
  });
});
