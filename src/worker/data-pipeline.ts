import { buildData } from "../data_pipeline/index.js";
import { runWorker } from "../shared/worker-runtime.js";
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

type PipelineResult = {
  version: string;
  updatedAt: string | null;
  counts: Record<string, number>;
  runAt: string;
};

let lastSuccess: PipelineResult | null = null;
let lastError: { message: string; runAt: string } | null = null;

async function runPipeline(reason: string): Promise<void> {
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
  } catch (error) {
    log.error("worker.pipeline.error", error, { reason });
    lastError = {
      message: error instanceof Error ? error.message : String(error),
      runAt: new Date().toISOString(),
    };
  }
}

await runWorker("data-pipeline", async (ctx) => {
  log.info("worker.pipeline.start", {
    intervalMs: PIPELINE_INTERVAL_MS,
    jitterMs: PIPELINE_JITTER_MS,
    runOnBoot: RUN_ON_BOOT,
  });

  if (RUN_ON_BOOT) {
    await runPipeline("boot");
  }

  const healthHandle = ctx.runRepeating(
    async () => {
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
        await runPipeline("interval");
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
