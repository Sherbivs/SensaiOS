import cron from 'node-cron';
import { triggerRenderJob, resolveRenderConfig } from './render_job_client.mjs';

const REFRESH_CRON = process.env.POKE_REFRESH_CRON ?? '0 0 * * 4';
const REFRESH_TZ = process.env.POKE_REFRESH_TZ ?? 'America/New_York';
const RUN_JOB_ON_BOOT = (process.env.POKE_RUN_JOB_ON_BOOT ?? 'true').toLowerCase() !== 'false';

function logConfiguration() {
  try {
    const { serviceId, apiBaseUrl, jobStartCommand } = resolveRenderConfig();
    console.log(
      [
        '🛠️ Render job dispatcher online.',
        `serviceId=${serviceId}`,
        `apiBaseUrl=${apiBaseUrl}`,
        `startCommand=${jobStartCommand}`,
        `schedule=${REFRESH_CRON} (${REFRESH_TZ})`,
        `bootDispatch=${RUN_JOB_ON_BOOT}`,
      ].join(' ')
    );
  } catch (error) {
    console.error('Failed to resolve Render configuration:', error);
    throw error;
  }
}

async function dispatchRefreshJob(reason) {
  try {
    const job = await triggerRenderJob({ reason, metadata: { trigger: reason } });
    console.log(`🚀 Dispatched Pokédex refresh job ${job?.id ?? 'unknown'} (trigger=${reason}).`);
    return job;
  } catch (error) {
    console.error(`❌ Failed to dispatch Pokédex refresh job (trigger=${reason}):`, error);
    throw error;
  }
}

function scheduleRecurringJobs() {
  const task = cron.schedule(
    REFRESH_CRON,
    () => {
      dispatchRefreshJob('scheduled').catch((error) => {
        console.error('Scheduled job dispatch failed:', error);
      });
    },
    { timezone: REFRESH_TZ }
  );

  task.start();
  return task;
}

logConfiguration();

if (RUN_JOB_ON_BOOT) {
  await dispatchRefreshJob('boot').catch((error) => {
    console.error('Boot job dispatch failed:', error);
  });
}

scheduleRecurringJobs();

// Keep the process alive for cron scheduling
setInterval(() => {}, 1 << 30);
