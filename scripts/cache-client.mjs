import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { formatStatus } from '../src/utils/output-formatter.js';

const CACHE_DIR = process.env.CACHE_DIR || './data/cache';
const RAW = (process.env.GITHUB_RAW_URL || '').replace(/\/$/, '');

const filePath = (name) => path.join(CACHE_DIR, name);
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function readLocal() {
  const [dataBuffer, metaBuffer] = await Promise.all([
    readFile(filePath('pokemon.json')),
    readFile(filePath('meta.json')),
  ]);
  const meta = JSON.parse(metaBuffer.toString('utf8'));
  if (meta.checksum?.value !== sha256(dataBuffer)) {
    throw new Error('Local cache checksum mismatch');
  }
  return JSON.parse(dataBuffer.toString('utf8'));
}

async function readGitHub() {
  if (!RAW) throw new Error('GITHUB_RAW_URL not configured');
  const [metaRes, dataRes] = await Promise.all([
    fetch(`${RAW}/meta.json`),
    fetch(`${RAW}/pokemon.json`),
  ]);
  if (!metaRes.ok || !dataRes.ok) throw new Error('GitHub cache not reachable');
  const meta = await metaRes.json();
  const dataBuffer = Buffer.from(await dataRes.arrayBuffer());
  if (meta.checksum?.value !== sha256(dataBuffer)) {
    throw new Error('GitHub cache checksum mismatch');
  }
  return JSON.parse(dataBuffer.toString('utf8'));
}

async function readFromAPIAndRebuild() {
  const { main: fetchPokemon } = await import('./fetch_pokemon.mjs');
  await fetchPokemon();
  return readLocal();
}

export async function getPokemonData() {
  try {
    return await readLocal();
  } catch (error) {
    console.log(formatStatus(`Local cache unavailable: ${error instanceof Error ? error.message : error}`, 'note'));
  }

  try {
    return await readGitHub();
  } catch (error) {
    console.log(formatStatus(`GitHub cache unavailable: ${error instanceof Error ? error.message : error}`, 'note'));
  }

  return readFromAPIAndRebuild();
}
