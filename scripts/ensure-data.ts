#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * ensure-data.ts - Data orchestration script for bot startup
 *
 * PURPOSE:
 *   Ensure required data files exist before bot startup.
 *   Orchestrates data fetching from multiple sources:
 *   1. Try fetch:snapshot (remote data)
 *   2. Try build-data.ts (local PokeAPI build)
 *   3. Fall back to bootstrap data
 *
 * USAGE:
 *   npx tsx scripts/ensure-data.ts
 *
 * EXIT CODES:
 *   0 - Data files available (from any source)
 *   1 - Preflight check failed
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT: string = process.cwd();

function has(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

function run(cmd: string): void {
  execSync(cmd, { stdio: 'inherit', env: process.env });
}

/**
 * Copy bootstrap data files if available
 */
function copyBootstrap(): boolean {
  const bootstrapDir = path.join(ROOT, 'data', 'bootstrap');
  const distData = path.join(ROOT, 'dist', 'data');
  const distMeta = path.join(ROOT, 'dist', 'meta');
  const files = ['dex.min.json', 'moves.min.json'] as const;

  if (!fs.existsSync(bootstrapDir)) return false;
  let copied = false;

  fs.mkdirSync(distData, { recursive: true });
  fs.mkdirSync(distMeta, { recursive: true });

  for (const file of files) {
    const src = path.join(bootstrapDir, file);
    const dest = path.join(distData, file);
    if (!fs.existsSync(src)) return false;
    fs.copyFileSync(src, dest);
    copied = true;
  }

  const versionSrc = path.join(bootstrapDir, 'version.json');
  if (fs.existsSync(versionSrc)) {
    fs.copyFileSync(versionSrc, path.join(distMeta, 'version.json'));
  }

  if (copied) {
    console.warn('ensure-data: using bundled bootstrap snapshot.');
  }
  return copied;
}

function main(): void {
  const needDex = !has('dist/data/dex.min.json');
  const needMoves = !has('dist/data/moves.min.json');

  if (needDex || needMoves) {
    console.log('ensure-data: snapshot missing -> attempting fetch:snapshot…');
    let fetched = false;

    try {
      run('npm run fetch:snapshot');
      fetched = has('dist/data/dex.min.json') && has('dist/data/moves.min.json');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn('ensure-data: fetch:snapshot failed or not configured:', message);
    }

    if (!fetched) {
      console.log('ensure-data: trying local build via build-data…');
      try {
        run('npx tsx scripts/build-data.ts');
      } catch {
        console.warn('ensure-data: build-data failed (likely no PokeAPI dataset available).');
      }
    }

    if (!has('dist/data/dex.min.json') || !has('dist/data/moves.min.json')) {
      copyBootstrap();
    }

    try {
      run('npx tsx scripts/build-assets-manifest.ts');
    } catch {
      // Silent fail - asset manifest is optional
    }
  } else {
    console.log('ensure-data: snapshot present.');
  }

  // Always run preflight at the end to fail fast if something is truly wrong.
  run('npx tsx scripts/preflight.ts');
}

main();
