/*
Handles all battle logic.
Features:
- Turn-based system between two Pokémon
- Simple damage calculation
- Tracks HP and levels
- Updates cache to persist Pokémon level-ups
*/

const { writeCache, cachePokemonList } = require('../cache');
const { levelUp } = require('../utils/pokemon-helpers');

// Simple damage calculation formula
function calculateDamage(attacker, defender) {
  return Math.max(1, attacker.stats.attack - Math.floor(defender.stats.defense / 2));
}

function selectPokemonForUser(userId, pokemonData, fallbackIndex) {
  // Prefer per-user selected Pokémon from profile cache
  const profile = getUserData(userId);
  if (profile?.pokemon) {
    return JSON.parse(JSON.stringify(profile.pokemon));
  }
  // Fallback: pick from dataset (first/second)
  const length = Array.isArray(pokemonData) ? pokemonData.length : 0;
  if (length > 0) {
    const idx = Math.max(0, Math.min(length - 1, fallbackIndex));
    const base = pokemonData[idx];
    if (base) return JSON.parse(JSON.stringify(base));
  }
  // As a last resort, return a minimal placeholder to avoid crashing
  return { name: 'Missingno', stats: { hp: 50, attack: 10, defense: 10, specialAttack: 10, specialDefense: 10, speed: 10 } };
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

  // Award XP/level to winner's profile
  const winnerProfile = getUserData(winnerId) || { pokemon: selectPokemonForUser(winnerId, pokemonData, 0), level: 1, xp: 0, hp: 100 };
  winnerProfile.xp = (winnerProfile.xp || 0) + 50;
  // Simple level-up rule: every 100 XP
  while (winnerProfile.xp >= 100) {
    winnerProfile.xp -= 100;
    winnerProfile.level = (winnerProfile.level || 1) + 1;
    // apply helper to evolve stats if available
    if (winnerProfile.pokemon) {
      try { winnerProfile.pokemon = levelUp(winnerProfile.pokemon); } catch {}
    }
  }
  winnerProfile.updatedAt = new Date().toISOString();
  setUserData(winnerId, winnerProfile);

  writeCache('pokemonData', pokemonData);
  cachePokemonList(pokemonData);

  return {
    winner: winnerId,
    loser: loserId,
    battleLog,
    challengerPokemon,
    opponentPokemon,
  };
}

module.exports = { initiateBattle };

// ----------------------------
// Turn-based BattleManager (skeleton)
// ----------------------------
class BattleManager {
  constructor(channel) {
    this.channel = channel;
    this.activeBattles = new Map(); // battleId -> state
  }

  startBattle(player1, player2) {
    const p1 = getUserCache(player1.id);
    const p2 = getUserCache(player2.id);
    if (!p1?.party?.length || !p2?.party?.length) {
      this.channel?.send?.('Both players must have a Pokémon in their party.');
      return null;
    }
    const state = {
      players: [player1.id, player2.id],
      turnIdx: 0,
      parties: {
        [player1.id]: JSON.parse(JSON.stringify(p1)),
        [player2.id]: JSON.parse(JSON.stringify(p2)),
      },
      log: [],
      createdAt: Date.now(),
    };
    const id = `${player1.id}-${player2.id}-${Date.now()}`;
    this.activeBattles.set(id, state);
    this.channel?.send?.(`Battle started between <@${player1.id}> and <@${player2.id}>! Turn: <@${player1.id}>`);
    return id;
  }

  getActive(state, userId) {
    const party = state.parties[userId];
    const idx = party?.currentActive ?? 0;
    return party?.party?.[idx] || null;
  }

  async playerMove(battleId, userId, moveName) {
    const state = this.activeBattles.get(battleId);
    if (!state) return false;
    const currentUser = state.players[state.turnIdx % state.players.length];
    if (currentUser !== userId) {
      this.channel?.send?.(`Not your turn, <@${userId}>.`);
      return false;
    }
    const oppId = state.players.find(id => id !== userId);
    const atk = this.getActive(state, userId);
    const def = this.getActive(state, oppId);
    if (!atk || !def) return false;

    // Status effects tick
    applyStatusEffects(atk);
    applyStatusEffects(def);

    const move = (atk.moves || []).find(m => (m.name || '').toLowerCase() === String(moveName).toLowerCase());
    if (!move || (move.pp != null && move.pp <= 0)) {
      this.channel?.send?.(`<@${userId}> has no PP for ${moveName} or it doesn't exist.`);
      return false;
    }
    if (typeof move.pp === 'number') move.pp = Math.max(0, move.pp - 1);

    const dmg = calculateDamage({ ...atk, types: atk.types, stats: atk.stats, level: atk.level }, { ...def, stats: def.stats }, move);
    def.currentHp = Math.max(0, (def.currentHp ?? def.stats?.hp ?? 50) - dmg);
    state.log.push({ t: Date.now(), actor: userId, move: move.name, dmg, target: oppId, hp: def.currentHp });
    this.channel?.send?.(`${atk.name} used ${move.name}! ${def.name} took ${dmg} damage (HP ${def.currentHp}).`);

    if (def.currentHp <= 0) {
      this.channel?.send?.(`<@${oppId}>'s ${def.name} fainted! <@${userId}> wins!`);
      // Simple reward
      const profile = getUserData(userId) || {};
      profile.xp = (profile.xp || 0) + 10;
      setUserData(userId, profile);
      this.activeBattles.delete(battleId);
      return true;
    }

    // Next turn
    state.turnIdx += 1;
    this.activeBattles.set(battleId, state);
    this.channel?.send?.(`Next turn: <@${state.players[state.turnIdx % state.players.length]}>`);
    return true;
  }
}

module.exports.BattleManager = BattleManager;
