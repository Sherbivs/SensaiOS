import { main as fetchPokemon } from './fetch_pokemon.mjs';
import { replicate } from './replicate_to_repo_api.mjs';
import * as lock from './util_lock.mjs';

export async function refresh() {
  await lock.acquire();
  try {
    await fetchPokemon();
    await replicate();
    console.log('✅ Refresh complete.');
  } finally {
    await lock.release();
  }
}

export async function main() {
  await refresh();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('refresh_cache failed:', error);
    process.exit(1);
  });
}
