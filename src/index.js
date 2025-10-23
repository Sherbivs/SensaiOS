const { startSecurityBot } = require('./bot/main');
const { startPokemonBot } = require('../discord-pokemon-bot/pokemon-bot');
const { SECURITY_BOT_TOKEN, POKEMON_BOT_TOKEN, ENABLE_POKEMON_BOT } = require('./config/env');
const cliStatus = require('./utils/cliStatus');
const { log: baseLog } = require('./utils/logger');

const log = (level, message, context) => baseLog(level, message, context, { debugMode: false });

async function startAllBots() {
  cliStatus.startStatusDisplay();

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
        log('error', 'Pokémon bot failed to launch', { error: error.message });
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
      status: 'disabled (ENABLE_POKEMON_BOT=false)',
      metrics: [],
    });
  }

  return Promise.all(launches);
}

const startup = startAllBots();

startup.catch((error) => {
  cliStatus.setPhase('Startup failed');
  log('error', 'Startup failed', { error: error && error.message ? error.message : error });
  process.exit(1);
});

module.exports = {
  startAllBots,
  startup,
};
