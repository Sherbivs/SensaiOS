const { startSecurityBot } = require('./bot/main');
const { startPokemonBot } = require('../discord-pokemon-bot/pokemon-bot');
const { initializePokemonCache } = require('./services/pokemonService');
const {
  SECURITY_BOT_TOKEN,
  POKEMON_BOT_TOKEN,
  ENABLE_POKEMON_BOT,
  POKEMON_BOT_AUTO_DISABLED,
} = require('./config/env');
const cliStatus = require('./utils/cliStatus');
const { log: baseLog } = require('./utils/logger');

const log = (level, message, context) => baseLog(level, message, context, { debugMode: false });

async function startAllBots() {
  cliStatus.startStatusDisplay();

  try {
    await initializePokemonCache();
  } catch (error) {
    log('error', 'Pokémon cache initialization failed', error instanceof Error ? { error } : { error: String(error) });
    if (ENABLE_POKEMON_BOT) {
      const message = error instanceof Error ? error.message : String(error);
      cliStatus.setSection('pokemon', {
        title: 'Pokémon Bot',
        status: 'cache init failed',
        metrics: [['error', message]],
      });
      throw error;
    }
  }

  const launches = [];

  try {
    launches.push(startSecurityBot({ token: SECURITY_BOT_TOKEN }));
  } catch (error) {
    cliStatus.setPhase('Startup failed');
    throw error;
  }

  if (ENABLE_POKEMON_BOT) {
    if (POKEMON_BOT_TOKEN) {
      try {
        launches.push(startPokemonBot({ token: POKEMON_BOT_TOKEN }));
      } catch (error) {
        log('error', 'Pokémon bot failed to launch', error instanceof Error ? { error } : { error: String(error) });
        cliStatus.setSection('pokemon', {
          title: 'Pokémon Bot',
          status: 'failed to launch',
          metrics: [[ 'error', error.message || 'unknown' ]],
        });
        throw error;
      }
    } else {
      log('warn', 'POKEMON_BOT_TOKEN missing; Pokémon bot will not start.', {});
      cliStatus.setSection('pokemon', {
        title: 'Pokémon Bot',
        status: 'skipped (missing token)',
        metrics: [],
      });
    }
  } else {
    cliStatus.setSection('pokemon', {
      title: 'Pokémon Bot',
      status: POKEMON_BOT_AUTO_DISABLED ? 'disabled (missing token)' : 'disabled (ENABLE_POKEMON_BOT=false)',
      metrics: [],
    });
    if (!POKEMON_BOT_AUTO_DISABLED) {
      log('info', 'Pokémon bot disabled via ENABLE_POKEMON_BOT=false.', {});
    }
  }

  return Promise.all(launches);
}

const startup = startAllBots();

startup.catch((error) => {
  cliStatus.setPhase('Startup failed');
  log('error', 'Startup failed', error instanceof Error ? { error } : { error: String(error) });
  process.exit(1);
});

module.exports = {
  startAllBots,
  startup,
};
