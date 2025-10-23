/*
Handles all battle logic.
Features:
- Turn-based system between two Pokémon
- Simple damage calculation
- Tracks HP and levels
- Updates cache to persist Pokémon level-ups
*/

const { writeCache } = require('../../shared/cachePatch');
const { levelUp } = require('../utils/helpers');

// Simple damage calculation formula
function calculateDamage(attacker, defender) {
  return Math.max(1, attacker.stats.attack - Math.floor(defender.stats.defense / 2));
}

function selectPokemonForUser(userId, pokemonData, fallbackIndex) {
  const owned = pokemonData.filter((pokemon) => pokemon.caughtBy.includes(userId));
  if (owned.length > 0) {
    return JSON.parse(JSON.stringify(owned[Math.floor(Math.random() * owned.length)]));
  }
  return JSON.parse(JSON.stringify(pokemonData[fallbackIndex]));
}

// Initiate a battle between two users
async function initiateBattle(challengerId, opponentId, pokemonData) {
  const challengerPokemon = selectPokemonForUser(challengerId, pokemonData, 0);
  const opponentPokemon = selectPokemonForUser(opponentId, pokemonData, 1);

  let challengerHP = challengerPokemon.stats.hp;
  let opponentHP = opponentPokemon.stats.hp;
  let turn = 'challenger';
  const battleLog = [];

  while (challengerHP > 0 && opponentHP > 0) {
    if (turn === 'challenger') {
      const dmg = calculateDamage(challengerPokemon, opponentPokemon);
      opponentHP -= dmg;
      battleLog.push({ actor: challengerId, target: opponentId, damage: dmg, remainingHP: Math.max(0, opponentHP) });
      turn = 'opponent';
    } else {
      const dmg = calculateDamage(opponentPokemon, challengerPokemon);
      challengerHP -= dmg;
      battleLog.push({ actor: opponentId, target: challengerId, damage: dmg, remainingHP: Math.max(0, challengerHP) });
      turn = 'challenger';
    }
  }

  const winnerId = challengerHP > 0 ? challengerId : opponentId;
  const loserId = winnerId === challengerId ? opponentId : challengerId;

  const winningPokemonIndex = pokemonData.findIndex((pokemon) => pokemon.caughtBy.includes(winnerId));
  if (winningPokemonIndex >= 0) {
    pokemonData[winningPokemonIndex] = levelUp(pokemonData[winningPokemonIndex]);
  }

  writeCache('pokemonData', pokemonData);

  return {
    winner: winnerId,
    loser: loserId,
    battleLog,
    challengerPokemon,
    opponentPokemon,
  };
}

module.exports = { initiateBattle };
