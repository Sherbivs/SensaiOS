import { refresh } from './refresh_cache.mjs';

refresh().catch((error) => {
  console.error('refresh_cache_gh_only failed:', error);
  process.exit(1);
});
