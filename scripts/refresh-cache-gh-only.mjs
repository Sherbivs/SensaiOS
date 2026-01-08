import { refresh } from './refresh_cache.mjs';

refresh().catch((e) => {
  console.log('[HALT] refresh_cache_gh_only did not complete:', e);
  process.exit(1);
});
