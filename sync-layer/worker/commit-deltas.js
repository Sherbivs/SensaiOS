'use strict';
/**
 * Render Background Worker — Delta Committer
 * Applies Discord-side updates back into the canonical index.
 */

import fs from 'fs/promises';
import path from 'path';
import { commitIndex } from '../shared/io.js';

const META_PATH = path.join('./sync-layer/data', 'meta.json');

function ensurePlayer(index, userId) {
  index.players = index.players || {};
  if (!index.players[userId]) {
    index.players[userId] = { party: [], history: [] };
  }
  return index.players[userId];
}

function applyDelta(index, delta) {
  const { userId, action, payload = {}, ts = Date.now() } = delta;
  if (!userId || !action) return false;
  const player = ensurePlayer(index, userId);
  player.history.push({ action, payload, ts });

  switch (action) {
    case 'catch': {
      const name = payload.pokemon?.toLowerCase();
      if (!name) return true;
      if (!player.party.includes(name)) {
        player.party.push(name);
      }
      return true;
    }
    case 'release': {
      const name = payload.pokemon?.toLowerCase();
      if (!name) return true;
      const before = player.party.length;
      player.party = player.party.filter(p => p !== name);
      return before !== player.party.length;
    }
    case 'rename': {
      const { oldName, newName } = payload;
      if (!oldName || !newName) return true;
      player.party = player.party.map(p => (p === oldName.toLowerCase() ? newName.toLowerCase() : p));
      return true;
    }
    default:
      return true;
  }
}

async function updateMeta(entries) {
  const now = new Date().toISOString();
  const meta = { updated: now, entries };
  await fs.writeFile(META_PATH, JSON.stringify(meta, null, 2));
}

async function mergeIndex(index, updates) {
  if (!updates.length) {
    return index;
  }

  let changed = false;
  for (const delta of updates) {
    changed = applyDelta(index, delta) || changed;
  }

  if (changed) {
    await updateMeta(Object.keys(index.pokemon || {}).length);
  }

  return index;
}

commitIndex(mergeIndex)
  .then(() => console.log('✅ Deltas committed.'))
  .catch(err => {
    console.error('❌ Failed to commit deltas', err);
    process.exitCode = 1;
  });
