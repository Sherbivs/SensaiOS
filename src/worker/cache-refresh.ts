import { initializePokemonCache, refreshPokemonCache, getCacheMetadata } from "../services/pokemonService.js";
import { runWorker } from "../shared/worker-runtime.js";
import { log } from "../shared/log.js";
import { CACHE_WORKER_INTERVAL_MS, CACHE_WORKER_INTERVAL_JITTER_MS } from "../config/env.js";

const REFRESH_INTERVAL_MS = CACHE_WORKER_INTERVAL_MS;
const REFRESH_JITTER_MS = CACHE_WORKER_INTERVAL_JITTER_MS;

async function runManualRefresh(reason: string): Promise<void> {
  try {
    const result = await refreshPokemonCache({ reason });
    log.info("worker.cache_refreshed", {
      reason,
      total: result.total,
      lastFetchedAt: result.lastFetchedAt?.toISOString?.() ?? null,
    });
  } catch (error) {
    log.error("worker.cache_refresh_failed", error, { reason });
  }
}

await runWorker("cache-refresh", async (ctx) => {
  log.info("worker.cache.start", {
    intervalMs: REFRESH_INTERVAL_MS,
    jitterMs: REFRESH_JITTER_MS,
  });

  try {
    const init = await initializePokemonCache();
    const meta = getCacheMetadata();
    log.info("worker.cache.initialized", {
      total: init.total,
      lastFetchedAt: init.lastFetchedAt?.toISOString?.() ?? meta.lastFetchedAt?.toISOString?.() ?? null,
      cron: meta.cron,
      timezone: meta.timezone,
    });
  } catch (error) {
    log.error("worker.cache.init_failed", error);
    process.exitCode = 1;
    throw error;
  }

  if (REFRESH_INTERVAL_MS > 0) {
    const handle = ctx.runRepeating(
      async () => {
        await runManualRefresh("interval");
      },
      {
        intervalMs: REFRESH_INTERVAL_MS,
        jitterMs: REFRESH_JITTER_MS,
        runImmediately: false,
        label: "cache-interval-refresh",
      },
    );
    ctx.onShutdown(() => handle.stop());
  }

  await ctx.waitForShutdown();
});
