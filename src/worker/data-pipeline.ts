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
  } catch (error) {
    log.error("worker.pipeline.error", error, { reason });
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

  if (PIPELINE_INTERVAL_MS > 0) {
    const handle = ctx.runRepeating(
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
    ctx.onShutdown(() => handle.stop());
  }

  await ctx.waitForShutdown();
});
