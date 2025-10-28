import { initializePokemonCache, refreshPokemonCache, getCacheMetadata } from "../services/pokemonService.js";
import { runWorker, type WorkerMetrics } from "../shared/worker-runtime.js";
import { log } from "../shared/log.js";
import { CACHE_WORKER_INTERVAL_MS, CACHE_WORKER_INTERVAL_JITTER_MS } from "../config/env.js";

const REFRESH_INTERVAL_MS = CACHE_WORKER_INTERVAL_MS;
const REFRESH_JITTER_MS = CACHE_WORKER_INTERVAL_JITTER_MS;
const HEALTH_INTERVAL_MS = Math.max(REFRESH_INTERVAL_MS || 300_000, 300_000);
const CACHE_STALE_WARN_SECONDS = Math.max(300, Number(process.env.CACHE_STALE_WARN_SECONDS ?? 600));
const CACHE_STALE_ALERT_SECONDS = Math.max(CACHE_STALE_WARN_SECONDS, Number(process.env.CACHE_STALE_ALERT_SECONDS ?? 1_800));

async function runManualRefresh(metrics: WorkerMetrics, reason: string): Promise<void> {
  const startedAt = Date.now();
  try {
    const result = await refreshPokemonCache({ reason });
    log.info("worker.cache_refreshed", {
      reason,
      total: result.total,
      lastFetchedAt: result.lastFetchedAt?.toISOString?.() ?? null,
    });
    metrics.incrementCounter("refresh.success", 1);
    metrics.recordSuccess("cache-refresh", { durationMs: Date.now() - startedAt });
  } catch (error) {
    log.error("worker.cache_refresh_failed", error, { reason });
    metrics.incrementCounter("refresh.failed", 1);
    metrics.recordFailure("cache-refresh", error, { durationMs: Date.now() - startedAt });
  }
}

await runWorker("cache-refresh", async (ctx) => {
  log.info("worker.cache.start", {
    intervalMs: REFRESH_INTERVAL_MS,
    jitterMs: REFRESH_JITTER_MS,
  });

  try {
    const initStarted = Date.now();
    const init = await initializePokemonCache();
    const meta = getCacheMetadata();
    log.info("worker.cache.initialized", {
      total: init.total,
      lastFetchedAt: init.lastFetchedAt?.toISOString?.() ?? meta.lastFetchedAt?.toISOString?.() ?? null,
      cron: meta.cron,
      timezone: meta.timezone,
    });
    ctx.metrics.setGauge("cache.total_records", init.total);
    ctx.metrics.recordSuccess("cache-initialization", { durationMs: Date.now() - initStarted });
  } catch (error) {
    log.error("worker.cache.init_failed", error);
    ctx.metrics.recordFailure("cache-initialization", error);
    process.exitCode = 1;
    throw error;
  }

  const healthHandle = ctx.runRepeating(
    async () => {
      const meta = getCacheMetadata();
      const now = Date.now();
      const ageSeconds = meta.lastFetchedAt ? Math.round((now - meta.lastFetchedAt.getTime()) / 1000) : Number.POSITIVE_INFINITY;
      const staleValue = Number.isFinite(ageSeconds) ? ageSeconds : CACHE_STALE_ALERT_SECONDS + 1;
      ctx.metrics.setGauge("cache.stale_seconds", staleValue, {
        warn: CACHE_STALE_WARN_SECONDS,
        alert: CACHE_STALE_ALERT_SECONDS,
      });
      ctx.metrics.setGauge("cache.total_records", meta.total);
      log.info("worker.cache.health", {
        total: meta.total,
        lastFetchedAt: meta.lastFetchedAt?.toISOString?.() ?? null,
        lastFetchAttemptAt: meta.lastFetchAttemptAt?.toISOString?.() ?? null,
        cron: meta.cron,
        timezone: meta.timezone,
        intervalMs: REFRESH_INTERVAL_MS,
      });
    },
    {
      intervalMs: HEALTH_INTERVAL_MS,
      runImmediately: true,
      label: "cache-health",
    },
  );
  ctx.onShutdown(() => healthHandle.stop());

  if (REFRESH_INTERVAL_MS > 0) {
    const refreshHandle = ctx.runRepeating(
      async () => {
        await runManualRefresh(ctx.metrics, "interval");
      },
      {
        intervalMs: REFRESH_INTERVAL_MS,
        jitterMs: REFRESH_JITTER_MS,
        runImmediately: false,
        label: "cache-interval-refresh",
      },
    );
    ctx.onShutdown(() => refreshHandle.stop());
  }

  await ctx.waitForShutdown();
});
