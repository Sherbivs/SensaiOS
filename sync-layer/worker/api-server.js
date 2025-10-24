'use strict';
/**
 * Lightweight Express API exposing cached data for Discord bots.
 */

import express from 'express';
import fs from 'fs/promises';

const app = express();
const PORT = process.env.PORT || 3000;

async function readIndex() {
  const raw = await fs.readFile('./sync-layer/data/index.json', 'utf8');
  return JSON.parse(raw);
}

app.get('/pokemon/:name', async (req, res) => {
  try {
    const index = await readIndex();
    const name = req.params.name.toLowerCase();
    const data = index.pokemon[name];
    if (!data) return res.status(404).json({ error: 'not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/meta', async (_req, res) => {
  try {
    const meta = await fs.readFile('./sync-layer/data/meta.json', 'utf8');
    res.type('json').send(meta);
  } catch {
    res.status(404).json({ error: 'meta not found' });
  }
});

app.listen(PORT, () => console.log(`🔗 Sync-layer API online on port ${PORT}`));
