// Forwarder for compatibility
const { startPokemonBot } = require('./pokemon-bot.js');

startPokemonBot().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[Pokémon Bot] Startup failed:', error);
  process.exit(1);
});

