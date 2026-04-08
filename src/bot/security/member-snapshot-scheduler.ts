// Integration for persistent member snapshot updater
// Schedules periodic updates and exposes a manual refresh command for ops/admin

import { Client } from 'discord.js';
import { updateAllGuildSnapshots } from './member-snapshot-updater.js';

let interval: NodeJS.Timeout | null = null;

/** Start periodic snapshot updates (every N ms) */
export function startMemberSnapshotScheduler(client: Client, ms = 1000 * 60 * 60 * 6) {
  if (interval) clearInterval(interval);
  interval = setInterval(() => {
    updateAllGuildSnapshots(client).catch(err => {
      // eslint-disable-next-line no-console
      console.error('[SecurityBot] Member snapshot update failed:', err);
    });
  }, ms);
}

/** Stop the periodic snapshot updater */
export function stopMemberSnapshotScheduler() {
  if (interval) clearInterval(interval);
  interval = null;
}

/** Manual trigger for ops/admin */
export async function manualMemberSnapshotRefresh(client: Client) {
  await updateAllGuildSnapshots(client);
}
