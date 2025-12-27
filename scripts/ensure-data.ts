#!/usr/bin/env tsx
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
import { scopedLogger } from '../src/observability/envelope/console.js';

const ROOT: string = process.cwd();
const log = scopedLogger('scripts.ensure-data');

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
    log.warn('bootstrap', 'Using bundled bootstrap snapshot', {
      source: 'data/bootstrap'
    });
  }
  return copied;
}

function main(): void {
  const needDex = !has('dist/data/dex.min.json');
  const needMoves = !has('dist/data/moves.min.json');

  if (needDex || needMoves) {
    log.info('snapshot', 'Snapshot missing; attempting fetch', {
      command: 'npm run fetch:snapshot'
    });
    let fetched = false;

    try {
      run('npm run fetch:snapshot');
      fetched = has('dist/data/dex.min.json') && has('dist/data/moves.min.json');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      log.warn('snapshot', 'fetch:snapshot failed or not configured', { error: message });
    }

    if (!fetched) {
      log.info('snapshot', 'Trying local build via build-data', {
        command: 'npx tsx scripts/build-data.ts'
      });
      try {
        run('npx tsx scripts/build-data.ts');
      } catch {
        log.warn('snapshot', 'build-data failed (likely no PokeAPI dataset available)', {
          command: 'npx tsx scripts/build-data.ts'
        });
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
    log.info('snapshot', 'Snapshot present', {
      dex: 'dist/data/dex.min.json',
      moves: 'dist/data/moves.min.json'
    });
  }

  // Always run preflight at the end to fail fast if something is truly wrong.
  run('npx tsx scripts/preflight.ts');
}

main();
