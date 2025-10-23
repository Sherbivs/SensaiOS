/*
Helper functions for Pokémon management.
- Level up Pokémon and adjust stats
*/

function levelUp(pokemon) {
  const updated = { ...pokemon };
  updated.level += 1;
  updated.stats = {
    ...updated.stats,
    hp: updated.stats.hp + 5,
    attack: updated.stats.attack + 2,
    defense: updated.stats.defense + 2,
    specialAttack: updated.stats.specialAttack + 2,
    specialDefense: updated.stats.specialDefense + 2,
    speed: updated.stats.speed + 1,
  };
  return updated;
}

module.exports = { levelUp };
