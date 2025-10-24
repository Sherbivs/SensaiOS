'use strict';
/**
 * Discord-side sync client
 * Reads from the worker’s cache API and writes deltas to updates.json.
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
const UPDATES_PATH = './sync-layer/data/updates.json';

async function getPokemon(name) {
  const r = await fetch(`https://your-worker.onrender.com/pokemon/${name}`);
  if (!r.ok) return null;
  return r.json();
}

async function recordDelta(userId, action, payload) {
  try {
    const prev = await fs.readFile(UPDATES_PATH, 'utf8').catch(() => '[]');
    const arr = JSON.parse(prev);
    arr.push({ userId, action, payload, ts: Date.now() });
    await fs.writeFile(UPDATES_PATH, JSON.stringify(arr, null, 2));
  } catch (err) {
    console.error('Failed to record delta', err);
  }
}

export { getPokemon, recordDelta };
