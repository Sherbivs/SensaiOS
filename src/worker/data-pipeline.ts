import { buildData } from "../data_pipeline/index.js";
import { runWorker, type WorkerMetrics } from "../shared/worker-runtime.js";
import { log } from "../shared/log.js";
import {
  DATA_PIPELINE_INTERVAL_MS,
  DATA_PIPELINE_INTERVAL_JITTER_MS,
  DATA_PIPELINE_RUN_ON_BOOT,
} from "../config/env.js";

const PIPELINE_INTERVAL_MS = DATA_PIPELINE_INTERVAL_MS;
const PIPELINE_JITTER_MS = DATA_PIPELINE_INTERVAL_JITTER_MS;
const RUN_ON_BOOT = DATA_PIPELINE_RUN_ON_BOOT;
const HEALTH_INTERVAL_MS = Math.max(PIPELINE_INTERVAL_MS || 300_000, 300_000);
const PIPELINE_STALE_WARN_SECONDS = Math.max(3_600, Number(process.env.DATA_PIPELINE_STALE_WARN_SECONDS ?? 14_400));
const PIPELINE_STALE_ALERT_SECONDS = Math.max(PIPELINE_STALE_WARN_SECONDS, Number(process.env.DATA_PIPELINE_STALE_ALERT_SECONDS ?? 28_800));

type PipelineResult = {
  version: string;
  updatedAt: string | null;
  counts: Record<string, number>;
  runAt: string;
};

let lastSuccess: PipelineResult | null = null;
let lastError: { message: string; runAt: string } | null = null;

async function runPipeline(metrics: WorkerMetrics, reason: string): Promise<void> {
  const startedAt = Date.now();
  try {
    const result = await buildData();
    log.info("worker.pipeline.success", {
      reason,
      version: result.manifest.version,
      updatedAt: result.manifest.updatedAt,
      counts: result.counts,
      outputs: result.outputs.length,
    });
    lastSuccess = {
      version: result.manifest.version,
      updatedAt: result.manifest.updatedAt ?? null,
      counts: result.counts,
      runAt: new Date().toISOString(),
    };
    lastError = null;
    metrics.incrementCounter("pipeline.success", 1);
    metrics.recordSuccess("data-pipeline", { durationMs: Date.now() - startedAt });
  } catch (error) {
    log.error("worker.pipeline.error", error, { reason });
    lastError = {
      message: error instanceof Error ? error.message : String(error),
      runAt: new Date().toISOString(),
    };
    metrics.incrementCounter("pipeline.failed", 1);
    metrics.recordFailure("data-pipeline", error, { durationMs: Date.now() - startedAt });
  }
}

await runWorker("data-pipeline", async (ctx) => {
  log.info("worker.pipeline.start", {
    intervalMs: PIPELINE_INTERVAL_MS,
    jitterMs: PIPELINE_JITTER_MS,
    runOnBoot: RUN_ON_BOOT,
  });

  if (RUN_ON_BOOT) {
    await runPipeline(ctx.metrics, "boot");
  }

  const healthHandle = ctx.runRepeating(
    async () => {
      let staleSeconds = Number.POSITIVE_INFINITY;
      if (lastSuccess) {
        staleSeconds = Math.round((Date.now() - new Date(lastSuccess.runAt).getTime()) / 1000);
      }
      const gaugeValue = Number.isFinite(staleSeconds) ? staleSeconds : PIPELINE_STALE_ALERT_SECONDS + 1;
      ctx.metrics.setGauge("pipeline.stale_seconds", gaugeValue, {
        warn: PIPELINE_STALE_WARN_SECONDS,
        alert: PIPELINE_STALE_ALERT_SECONDS,
      });
      log.info("worker.pipeline.health", {
        intervalMs: PIPELINE_INTERVAL_MS,
        lastSuccess,
        lastError,
      });
    },
    {
      intervalMs: HEALTH_INTERVAL_MS,
      runImmediately: true,
      label: "pipeline-health",
    },
  );
  ctx.onShutdown(() => healthHandle.stop());

  if (PIPELINE_INTERVAL_MS > 0) {
    const intervalHandle = ctx.runRepeating(
      async () => {
        await runPipeline(ctx.metrics, "interval");
      },
      {
        intervalMs: PIPELINE_INTERVAL_MS,
        jitterMs: PIPELINE_JITTER_MS,
        runImmediately: false,
        label: "data-pipeline",
      },
    );
    ctx.onShutdown(() => intervalHandle.stop());
  }

  await ctx.waitForShutdown();
});
