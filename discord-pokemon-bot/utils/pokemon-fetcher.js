// discord-pokemon-bot/utils/pokemon-fetcher.js
// Fetch all Pokémon from PokéAPI, cache locally in data/pokemon.json

const fs = require('node:fs');
const path = require('node:path');

const CACHE_PATH = path.join(__dirname, '..', 'data', 'pokemon.json');

async function fetchJson(url) {
  // Use global fetch if available (Node 18+), otherwise dynamic import
  const f = global.fetch || (await import('node-fetch')).default;
  const res = await f(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchAllPokemon() {
  const url = 'https://pokeapi.co/api/v2/pokemon?limit=2000';
  const data = await fetchJson(url);
  return data.results || [];
}

async function fetchPokemonDetails(name) {
  const url = `https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(name)}`;
  const data = await fetchJson(url);
  return {
    id: data.id,
    name: data.name,
    types: (data.types || []).map(t => t.type?.name).filter(Boolean),
    stats: (data.stats || []).map(s => ({ name: s.stat?.name, base: s.base_stat })),
    moves: (data.moves || [])
      .filter(m => Array.isArray(m.version_group_details) && m.version_group_details.some(v => v.move_learn_method?.name === 'level-up'))
      .map(m => ({
        name: m.move?.name,
        level: Math.min(...m.version_group_details.map(v => v.level_learned_at || 0)),
      })),
    sprite: data.sprites?.front_default || null,
    isStarter: false,
    isLegendary: false,
    isPseudoLegendary: false,
    stage: 'baby|1',
  };
}

async function buildPokemonRoster() {
  console.log('[Pokémon Fetch] Fetching all Pokémon list...');
  const allPokemonList = await fetchAllPokemon();
  const roster = {};

  for (const poke of allPokemonList) {
    const name = poke?.name;
    if (!name) continue;
    try {
      const details = await fetchPokemonDetails(name);
      roster[details.name] = details;
      console.log(`[Pokémon Fetch] Added: ${details.name}`);
    } catch (err) {
      console.error('[Pokémon Fetch ERROR]', name, err.message);
    }
  }

  const out = { lastUpdated: Date.now(), roster };
  fs.writeFileSync(CACHE_PATH, JSON.stringify(out, null, 2), 'utf8');
  console.log('[Pokémon Fetch] Cache written to', CACHE_PATH);
  return out;
}

module.exports = { fetchAllPokemon, fetchPokemonDetails, buildPokemonRoster, CACHE_PATH };
