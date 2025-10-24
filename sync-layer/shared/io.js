'use strict';
import fs from 'fs/promises';

const INDEX_PATH = './sync-layer/data/index.json';
const UPDATES_PATH = './sync-layer/data/updates.json';

export async function readIndex() {
  const raw = await fs.readFile(INDEX_PATH, 'utf8');
  return JSON.parse(raw);
}

export async function readUpdates() {
  try {
    const raw = await fs.readFile(UPDATES_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function writeIndex(index) {
  await fs.writeFile(INDEX_PATH, JSON.stringify(index, null, 2));
}

export async function writeUpdates(updates) {
  await fs.writeFile(UPDATES_PATH, JSON.stringify(updates, null, 2));
}

export async function appendDelta(delta) {
  const updates = await readUpdates();
  updates.push({ ...delta, ts: Date.now() });
  await writeUpdates(updates);
}

export async function commitIndex(mergeFn) {
  const index = await readIndex();
  const updates = await readUpdates();
  const merged = await mergeFn(index, updates);
  await writeIndex(merged);
  await writeUpdates([]);
  return merged;
}
