/** Standard stage multipliers for non-accuracy/evasion stats */
function stageMultiplier(n) {
  // n in [-6..+6]
  if (n >= 0) return (2 + n) / 2;
  return 2 / (2 - n);
}

/** Very simple derived stats from base only (no IVs/EVs/nature) for a deterministic skeleton */
function derivedStats(base, level) {
  const safe = (k) => Number(base?.[k] ?? 1);
  const hpBase = safe('hp');
  const hp = Math.floor((2 * hpBase * level) / 100) + level + 10;
  const other = (s) => Math.floor((2 * safe(s) * level) / 100) + 5;
  return {
    hp,
    attack: other('attack'),
    defense: other('defense'),
    'special-attack': other('special-attack'),
    'special-defense': other('special-defense'),
    speed: other('speed')
  };
}

export { stageMultiplier, derivedStats };

export default { stageMultiplier, derivedStats };
