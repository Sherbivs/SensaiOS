import { rm, writeFile } from 'node:fs/promises';

const LOCK = '.cache_refresh.lock';

export async function acquire() {
  try {
    await writeFile(LOCK, String(process.pid), { flag: 'wx' });
  } catch {
    throw new Error('Refresh already running (lock present).');
  }
}

export async function release() {
  await rm(LOCK, { force: true });
}
