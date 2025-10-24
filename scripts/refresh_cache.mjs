import { main as fetchPokemon } from './fetch_pokemon.mjs';
import { replicate } from './replicate_to_repo.mjs';
import * as lock from './util_lock.mjs';

async function refresh() {
  await lock.acquire();
  try {
    await fetchPokemon();
    await replicate();
    console.log('✅ Refresh complete.');
  } finally {
    await lock.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  refresh().catch((error) => {
    console.error('refresh_cache failed:', error);
    process.exit(1);
  });
}
