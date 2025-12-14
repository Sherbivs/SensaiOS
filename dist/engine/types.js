/**
 * Minimal shapes for a deterministic battle engine.
 * Real games add items, abilities, weather, status, field effects, etc.
 */

function newPokemonRuntime(p, level = 50) {
  return {
    id: p.id,
    name: p.name,
    level,
    types: Array.isArray(p.types) ? p.types.slice() : [],
    base: { ...(p.stats || {}) },           // base stats from dex
    stages: {                               // stat stage modifiers (-6..+6)
      attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0
    },
    maxHp: 0, hp: 0,                        // set after computing derived stats
    status: null,                           // 'brn'|'par'|'psn'|'tox'|'slp'|'frz'|null
    ability: null,                          // e.g., 'levitate' | 'flash-fire'
    item: null,                             // e.g., 'choice-specs'
    volatile: {},                           // ephemeral flags like flashFireBoost
    moves: [],                              // array of move names (lowercase)
    matchups: p.matchups || {},
  };
}

function newBattleState(a, b) {
  const state = {
    a,
    b,
    turn: 1,
    weather: null, // later: 'rain'|'sun'|'sand'|'hail' etc.
  };
  state.state = state;
  return state;
}

function newAction(which, moveName) {
  return { who: which, move: String(moveName).toLowerCase() }; // which = 'a'|'b'
}

export { newPokemonRuntime, newBattleState, newAction };
