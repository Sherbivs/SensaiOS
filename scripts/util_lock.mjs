import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = process.env.CACHE_DIR || './data/cache';
const LOCK = path.join(CACHE_DIR, '.cache_refresh.lock');

export async function acquire() {
  try {
    await mkdir(path.dirname(LOCK), { recursive: true });
    await writeFile(LOCK, String(process.pid), { flag: 'wx' });
  } catch {
    throw new Error('Refresh already running (lock present).');
  }
}

export async function release() {
  await rm(LOCK, { force: true });
}
