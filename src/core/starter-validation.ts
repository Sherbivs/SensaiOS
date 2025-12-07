/**
 * Starter Pokémon Validation System
 * 
 * Validates whether a Pokémon can be chosen as a starter in the
 * Pokémon Infinite Gauntlet open starter selection system.
 * 
 * RULES:
 * - ❌ Regional starters (all generations) are FORBIDDEN
 * - ❌ Legendary Pokémon are FORBIDDEN
 * - ❌ Mythical Pokémon are FORBIDDEN  
 * - ❌ Pseudo-legendary FINAL evolutions are FORBIDDEN
 * - ✅ Earlier forms of pseudo-legendaries (e.g., Pupitar) are ALLOWED
 * - ✅ Regular Pokémon are ALLOWED (Pikachu, Scyther, Riolu, etc.)
 * 
 * @module core/starter-validation
 */

// ============================================================================
// FORBIDDEN POKEMON LISTS (National Dex IDs)
// ============================================================================

/**
 * Regional starter Pokémon lines (all generations)
 * Includes base forms and all evolutions
 */
export const REGIONAL_STARTERS: ReadonlySet<number> = new Set([
  // Gen 1 - Kanto
  1, 2, 3,      // Bulbasaur line
  4, 5, 6,      // Charmander line
  7, 8, 9,      // Squirtle line
  
  // Gen 2 - Johto
  152, 153, 154, // Chikorita line
  155, 156, 157, // Cyndaquil line
  158, 159, 160, // Totodile line
  
  // Gen 3 - Hoenn
  252, 253, 254, // Treecko line
  255, 256, 257, // Torchic line
  258, 259, 260, // Mudkip line
  
  // Gen 4 - Sinnoh
  387, 388, 389, // Turtwig line
  390, 391, 392, // Chimchar line
  393, 394, 395, // Piplup line
  
  // Gen 5 - Unova
  495, 496, 497, // Snivy line
  498, 499, 500, // Tepig line
  501, 502, 503, // Oshawott line
  
  // Gen 6 - Kalos
  650, 651, 652, // Chespin line
  653, 654, 655, // Fennekin line
  656, 657, 658, // Froakie line
  
  // Gen 7 - Alola
  722, 723, 724, // Rowlet line
  725, 726, 727, // Litten line
  728, 729, 730, // Popplio line
  
  // Gen 8 - Galar
  810, 811, 812, // Grookey line
  813, 814, 815, // Scorbunny line
  816, 817, 818, // Sobble line
  
  // Gen 9 - Paldea
  906, 907, 908, // Sprigatito line
  909, 910, 911, // Fuecoco line
  912, 913, 914, // Quaxly line
]);

/**
 * Legendary Pokémon (box legendaries, trios, etc.)
 */
export const LEGENDARY_POKEMON: ReadonlySet<number> = new Set([
  // Gen 1
  144, 145, 146, // Legendary Birds
  150,           // Mewtwo
  
  // Gen 2
  243, 244, 245, // Legendary Beasts
  249, 250,      // Lugia, Ho-Oh
  
  // Gen 3
  377, 378, 379, // Regis
  380, 381,      // Latios, Latias
  382, 383, 384, // Weather Trio
  
  // Gen 4
  480, 481, 482, // Lake Trio
  483, 484, 487, // Creation Trio (Dialga, Palkia, Giratina)
  485, 486,      // Heatran, Regigigas
  488,           // Cresselia
  
  // Gen 5
  638, 639, 640, // Swords of Justice
  641, 642, 645, // Forces of Nature
  643, 644, 646, // Tao Trio (Reshiram, Zekrom, Kyurem)
  
  // Gen 6
  716, 717, 718, // Xerneas, Yveltal, Zygarde
  
  // Gen 7
  785, 786, 787, 788, // Tapus
  789, 790, 791, 792, // Cosmog line + Sun/Moon duo
  800,           // Necrozma
  
  // Gen 8
  888, 889, 890, // Zacian, Zamazenta, Eternatus
  891, 892,      // Kubfu, Urshifu
  894, 895, 896, 897, 898, // Glastrier, Spectrier, Calyrex, Regieleki, Regidrago
  
  // Gen 9
  1001, 1002, 1003, 1004, // Wo-Chien, Chien-Pao, Ting-Lu, Chi-Yu
  1007, 1008, 1009, 1010, // Koraidon, Miraidon, Walking Wake, Iron Leaves
  1014, 1015, 1016, 1017, // Okidogi, Munkidori, Fezandipiti, Ogerpon
  1020, 1021, 1024,       // Gouging Fire, Raging Bolt, Terapagos
]);

/**
 * Mythical Pokémon (event-exclusive)
 */
export const MYTHICAL_POKEMON: ReadonlySet<number> = new Set([
  // Gen 1
  151,           // Mew
  
  // Gen 2
  251,           // Celebi
  
  // Gen 3
  385, 386,      // Jirachi, Deoxys
  
  // Gen 4
  489, 490,      // Phione, Manaphy
  491, 492,      // Darkrai, Shaymin
  493,           // Arceus
  
  // Gen 5
  494,           // Victini
  647, 648, 649, // Keldeo, Meloetta, Genesect
  
  // Gen 6
  719, 720, 721, // Diancie, Hoopa, Volcanion
  
  // Gen 7
  801, 802,      // Magearna, Marshadow
  807, 808, 809, // Zeraora, Meltan, Melmetal
  
  // Gen 8
  893,           // Zarude
  
  // Gen 9
  1025,          // Pecharunt
]);

/**
 * Pseudo-legendary FINAL EVOLUTIONS only
 * (Earlier forms like Pupitar ARE allowed)
 */
export const PSEUDO_LEGENDARY_FINALS: ReadonlySet<number> = new Set([
  149,  // Dragonite (Dratini #147, Dragonair #148 allowed)
  248,  // Tyranitar (Larvitar #246, Pupitar #247 allowed)
  373,  // Salamence (Bagon #371, Shelgon #372 allowed)
  376,  // Metagross (Beldum #374, Metang #375 allowed)
  445,  // Garchomp (Gible #443, Gabite #444 allowed)
  635,  // Hydreigon (Deino #633, Zweilous #634 allowed)
  706,  // Goodra (Goomy #704, Sliggoo #705 allowed)
  784,  // Kommo-o (Jangmo-o #782, Hakamo-o #783 allowed)
  887,  // Dragapult (Dreepy #885, Drakloak #886 allowed)
  998,  // Baxcalibur (Frigibax #996, Arctibax #997 allowed)
]);

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export type StarterValidationResult = 
  | { valid: true; speciesId: number; name: string }
  | { valid: false; reason: StarterRejectionReason; speciesId?: number; name?: string };

export type StarterRejectionReason = 
  | 'unknown_pokemon'
  | 'regional_starter'
  | 'legendary'
  | 'mythical'
  | 'pseudo_legendary_final';

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Check if a species ID corresponds to a regional starter
 */
export function isRegionalStarter(speciesId: number): boolean {
  return REGIONAL_STARTERS.has(speciesId);
}

/**
 * Check if a species ID corresponds to a legendary Pokémon
 */
export function isLegendary(speciesId: number): boolean {
  return LEGENDARY_POKEMON.has(speciesId);
}

/**
 * Check if a species ID corresponds to a mythical Pokémon
 */
export function isMythical(speciesId: number): boolean {
  return MYTHICAL_POKEMON.has(speciesId);
}

/**
 * Check if a species ID is a pseudo-legendary FINAL evolution
 */
export function isPseudoLegendaryFinal(speciesId: number): boolean {
  return PSEUDO_LEGENDARY_FINALS.has(speciesId);
}

/**
 * Check if a species ID is forbidden as a starter (any reason)
 */
export function isForbiddenStarter(speciesId: number): boolean {
  return (
    isRegionalStarter(speciesId) ||
    isLegendary(speciesId) ||
    isMythical(speciesId) ||
    isPseudoLegendaryFinal(speciesId)
  );
}

/**
 * Get the specific reason why a Pokémon is forbidden as a starter
 * Returns null if the Pokémon is allowed
 */
export function getForbiddenReason(speciesId: number): StarterRejectionReason | null {
  if (isRegionalStarter(speciesId)) return 'regional_starter';
  if (isLegendary(speciesId)) return 'legendary';
  if (isMythical(speciesId)) return 'mythical';
  if (isPseudoLegendaryFinal(speciesId)) return 'pseudo_legendary_final';
  return null;
}

/**
 * Get user-friendly error message for a rejection reason
 */
export function getRejectionMessage(reason: StarterRejectionReason): string {
  switch (reason) {
    case 'unknown_pokemon':
      return "That doesn't match any known Pokémon. Try again with a valid name.";
    case 'regional_starter':
      return "Regional starters can't be used as your Infinite Gauntlet starter. Choose a different Pokémon!";
    case 'legendary':
      return "Legendary Pokémon can't be used as starters. Choose a regular Pokémon to begin your journey!";
    case 'mythical':
      return "Mythical Pokémon can't be used as starters. Choose a regular Pokémon to begin your journey!";
    case 'pseudo_legendary_final':
      return "Pseudo-legendary final evolutions (like Tyranitar or Dragonite) can't be chosen as starters. You can choose their earlier forms like Pupitar or Dratini instead!";
    default:
      return "That Pokémon can't be used as a starter. Please choose a different one.";
  }
}

// ============================================================================
// LOOKUP INTEGRATION
// ============================================================================

/**
 * Species lookup function type
 * Returns { id: number, name: string } or null if not found
 */
export type SpeciesLookup = (query: string | number) => { id: number; name: string } | null;

/**
 * Validate a starter selection with full lookup
 * 
 * @param query - Pokémon name or ID to validate
 * @param lookupFn - Function to look up species data
 * @returns Validation result with detailed info
 * 
 * @example
 * ```ts
 * const result = validateStarterSelection('pikachu', getPokemon);
 * if (result.valid) {
 *   console.log(`${result.name} is a valid starter!`);
 * } else {
 *   console.log(getRejectionMessage(result.reason));
 * }
 * ```
 */
export function validateStarterSelection(
  query: string | number,
  lookupFn: SpeciesLookup
): StarterValidationResult {
  // Step 1: Look up the species
  const species = lookupFn(query);
  
  if (!species) {
    return { valid: false, reason: 'unknown_pokemon' };
  }
  
  // Step 2: Check forbidden categories
  const forbiddenReason = getForbiddenReason(species.id);
  
  if (forbiddenReason) {
    return { 
      valid: false, 
      reason: forbiddenReason,
      speciesId: species.id,
      name: species.name,
    };
  }
  
  // Step 3: Pokémon is valid as a starter
  return {
    valid: true,
    speciesId: species.id,
    name: species.name,
  };
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

/**
 * Get all forbidden species IDs (for debugging/display)
 */
export function getAllForbiddenIds(): number[] {
  return [
    ...REGIONAL_STARTERS,
    ...LEGENDARY_POKEMON,
    ...MYTHICAL_POKEMON,
    ...PSEUDO_LEGENDARY_FINALS,
  ];
}

/**
 * Get count of forbidden Pokémon by category
 */
export function getForbiddenCounts(): Record<string, number> {
  return {
    regional_starters: REGIONAL_STARTERS.size,
    legendary: LEGENDARY_POKEMON.size,
    mythical: MYTHICAL_POKEMON.size,
    pseudo_legendary_finals: PSEUDO_LEGENDARY_FINALS.size,
    total: getAllForbiddenIds().length,
  };
}
