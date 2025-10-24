import cron from 'node-cron';
import { refresh } from './refresh_cache.mjs';

async function runBootRefresh() {
  try {
    await refresh();
  } catch (error) {
    console.error('Boot refresh failed:', error);
  }
}

const schedule = cron.schedule(
  '0 0 * * 4',
  () => {
    refresh().catch((error) => {
      console.error('Scheduled refresh failed:', error);
    });
  },
  { timezone: 'UTC' }
);

await runBootRefresh();

schedule.start();

console.log('⏰ Pokédex cache worker online. Scheduled refresh: Thursday 00:00 UTC.');

// Keep process alive
setInterval(() => {}, 1 << 30);
