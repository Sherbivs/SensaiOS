import { triggerRenderJob } from './render_job_client.mjs';

const [, , reason = 'manual'] = process.argv;

async function main() {
  try {
    const job = await triggerRenderJob({ reason, metadata: { trigger: reason, source: 'manual' } });
    console.log(`Render job queued successfully (id=${job?.id ?? 'unknown'}, reason=${reason}).`);
  } catch (error) {
    console.error('Failed to queue Render job:', error);
    process.exitCode = 1;
  }
}

main();
