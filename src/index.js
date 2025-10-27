import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { startSecurityBot } from './bot/main.js';
import { initializePokemonCache } from './services/pokemonService.js';
import {
  SECURITY_BOT_TOKEN,
  POKEMON_BOT_TOKEN,
  ENABLE_POKEMON_BOT,
  POKEMON_BOT_AUTO_DISABLED,
} from './config/env.js';
import cliStatus from './utils/cliStatus.js';
import { log as baseLog } from './utils/logger.js';

const require = createRequire(import.meta.url);
const { startPokemonBot } = require('../discord-pokemon-bot/pokemon-bot');

const log = (level, message, context) => baseLog(level, message, context, { debugMode: false });

async function startAllBots({
  displayCli = true,
  startSecurity = true,
  startPokemon = ENABLE_POKEMON_BOT,
  securityToken = SECURITY_BOT_TOKEN,
  pokemonToken = POKEMON_BOT_TOKEN,
} = {}) {
  if (displayCli) {
    cliStatus.startStatusDisplay();
  }

  try {
    await initializePokemonCache();
  } catch (error) {
    log('error', 'Pokémon cache initialization failed', error instanceof Error ? { error } : { error: String(error) });
    if (displayCli) {
      const message = error instanceof Error ? error.message : String(error);
      cliStatus.setSection('pokemon', {
        title: 'Pokémon Bot',
        status: 'cache init failed',
        metrics: [['error', message]],
      });
    }
    if (startPokemon && ENABLE_POKEMON_BOT) {
      throw error;
    }
  }

  const launches = [];

  if (startSecurity) {
    try {
      launches.push(startSecurityBot({ token: securityToken }));
    } catch (error) {
      if (displayCli) {
        cliStatus.setPhase('Startup failed');
      }
      throw error;
    }
  } else if (displayCli) {
    cliStatus.setSection('security', {
      title: 'Security Bot',
      status: 'skipped',
      metrics: [],
    });
  }

  if (startPokemon) {
    if (ENABLE_POKEMON_BOT && pokemonToken) {
      try {
        launches.push(startPokemonBot({ token: pokemonToken }));
      } catch (error) {
        log('error', 'Pokémon bot failed to launch', error instanceof Error ? { error } : { error: String(error) });
        if (displayCli) {
          cliStatus.setSection('pokemon', {
            title: 'Pokémon Bot',
            status: 'failed to launch',
            metrics: [[
              'error',
              error instanceof Error ? error.message || 'unknown' : String(error),
            ]],
          });
        }
        throw error;
      }
    } else if (displayCli) {
      if (ENABLE_POKEMON_BOT && !pokemonToken) {
        log('warn', 'POKEMON_BOT_TOKEN missing; Pokémon bot will not start.', {});
        cliStatus.setSection('pokemon', {
          title: 'Pokémon Bot',
          status: 'skipped (missing token)',
          metrics: [],
        });
      } else {
        cliStatus.setSection('pokemon', {
          title: 'Pokémon Bot',
          status: POKEMON_BOT_AUTO_DISABLED
            ? 'disabled (missing token)'
            : 'disabled (ENABLE_POKEMON_BOT=false)',
          metrics: [],
        });
        if (!POKEMON_BOT_AUTO_DISABLED) {
          log('info', 'Pokémon bot disabled via ENABLE_POKEMON_BOT=false.', {});
        }
      }
    }
  } else if (displayCli) {
    cliStatus.setSection('pokemon', {
      title: 'Pokémon Bot',
      status: 'skipped',
      metrics: [],
    });
  }

  return Promise.all(launches);
}

function boot(options = {}) {
  const env = process.env.NODE_ENV || 'development';
  const skipForTests = options.skipForTests ?? (env === 'test' && options.force !== true);
  if (skipForTests) {
    return Promise.resolve({ skipped: true });
  }

  const {
    displayCli = true,
    startSecurity = true,
    startPokemon = ENABLE_POKEMON_BOT,
    securityToken = SECURITY_BOT_TOKEN,
    pokemonToken = POKEMON_BOT_TOKEN,
    exitOnFailure = true,
  } = options;

  const startup = startAllBots({
    displayCli,
    startSecurity,
    startPokemon,
    securityToken,
    pokemonToken,
  });

  if (exitOnFailure) {
    startup.catch((error) => {
      if (displayCli) {
        cliStatus.setPhase('Startup failed');
      }
      log('error', 'Startup failed', error instanceof Error ? { error } : { error: String(error) });
      process.exit(1);
    });
  }

  return startup;
}

const entryHref = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entryHref && import.meta.url === entryHref) {
  boot().catch((error) => {
    log('error', 'Startup failed', error instanceof Error ? { error } : { error: String(error) });
    process.exit(1);
  });
}

export { startAllBots, boot };

export default { startAllBots, boot };
