/*
Helper functions for Pokémon management.
- Level up adjustments
- Status effects engine
- Damage calculation
- Party helpers (type guards)
*/

function levelUp(pokemon) {
  const updated = { ...pokemon };
  updated.level = (updated.level || 1) + 1;
  const s = updated.stats || {};
  updated.stats = {
    ...s,
    hp: (s.hp || 0) + 5,
    attack: (s.attack || 0) + 2,
    defense: (s.defense || 0) + 2,
    specialAttack: (s.specialAttack || 0) + 2,
    specialDefense: (s.specialDefense || 0) + 2,
    speed: (s.speed || 0) + 1,
  };
  return updated;
}

// Simple status effects engine (skeleton)
const STATUS_EFFECTS = {
  burn: {
    onTurn: (pokemon) => {
      const lvl = pokemon.level || 1;
      const dmg = Math.max(1, Math.floor(lvl * 0.1));
      if (pokemon.currentHp != null) pokemon.currentHp = Math.max(0, pokemon.currentHp - dmg);
      return dmg;
    },
    preventsAction: false,
  },
  poison: {
    onTurn: (pokemon) => {
      const lvl = pokemon.level || 1;
      const dmg = Math.max(1, Math.floor(lvl * 0.1));
      if (pokemon.currentHp != null) pokemon.currentHp = Math.max(0, pokemon.currentHp - dmg);
      return dmg;
    },
    preventsAction: false,
  },
  sleep: { onTurn: () => 0, preventsAction: true },
  paralysis: { onTurn: () => 0, preventsAction: () => Math.random() < 0.25 },
};

function applyStatusEffects(pokemon) {
  const statuses = Array.isArray(pokemon.status) ? pokemon.status : [];
  let total = 0;
  for (const eff of statuses) {
    const def = STATUS_EFFECTS[eff];
    if (!def) continue;
    try { total += def.onTurn(pokemon) || 0; } catch {}
  }
  return total;
}

// Damage calculation (skeleton, simplified)
function calculateDamage(attacker, defender, move) {
  const level = attacker.level || 1;
  const power = move?.power || 10;
  const physical = (move?.category || 'Physical') === 'Physical';
  const aStats = attacker.stats || {};
  const dStats = defender.stats || {};
  const attackStat = physical ? (aStats.attack || 10) : (aStats.specialAttack || 10);
  const defenseStat = physical ? (dStats.defense || 10) : (dStats.specialDefense || 10);
  let damage = Math.floor((((2 * level) / 5 + 2) * power * (attackStat / Math.max(1, defenseStat))) / 50 + 2);
  // STAB (placeholder: attacker.types: string[])
  try {
    if (Array.isArray(attacker.types) && move?.type && attacker.types.includes(move.type)) damage = Math.floor(damage * 1.5);
  } catch {}
  // Type effectiveness placeholder (1x)
  // Random factor 0.85-1.0
  damage = Math.floor(damage * (0.85 + Math.random() * 0.15));
  return Math.max(1, damage);
}

module.exports = { levelUp, STATUS_EFFECTS, applyStatusEffects, calculateDamage };
