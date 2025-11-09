import { log } from '../utils/logger.js';
'use strict';

const {
  cloneOrOpen,
  writeJSON,
  commitAndPush,
  BRANCH,
  CLONE_DIR,
} = require('./gitStore');
const { buildMinimalCache } = require('./pokemonCache');

async function run() {
  const start = Date.now();

  await cloneOrOpen();

  const limit = Number(process.env.POKE_LIMIT || 0);
  const cache = await buildMinimalCache({ limit });

  await writeJSON('data/pokemon.min.json', cache, true);

  const message = `chore(cache): update pokemon cache (${cache.count} mons)`;
  const result = await commitAndPush(message);

  const tookMs = Date.now() - start;
  log.info(
    JSON.stringify(
      {
        branch: BRANCH,
        repoDir: CLONE_DIR,
        pushed: result.pushed,
        tookMs,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  log.error('[cache] failed:', error?.stack || error);
  process.exit(1);
});
