#!/usr/bin/env node
// Fetches and caches the full Pokémon roster to data/pokemon.json

const { buildPokemonRoster, CACHE_PATH } = require('../utils/pokemon-fetcher');

(async () => {
  try {
    const res = await buildPokemonRoster();
    console.log(`Your service is live 💦: ${Object.keys(res.roster || {}).length} entries -> ${CACHE_PATH}`);
  } catch (err) {
    console.error('❌ Roster fetch failed:', err.message);
    process.exit(1);
  }
})();
