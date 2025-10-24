'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = process.cwd();
const has = (rel) => fs.existsSync(path.join(ROOT, rel));
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env: process.env });

function copyBootstrap() {
  const bootstrapDir = path.join(ROOT, 'data', 'bootstrap');
  const distData = path.join(ROOT, 'dist', 'data');
  const distMeta = path.join(ROOT, 'dist', 'meta');
  const files = ['dex.min.json', 'moves.min.json'];

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

(function main() {
  const needDex = !has('dist/data/dex.min.json');
  const needMoves = !has('dist/data/moves.min.json');

  if (needDex || needMoves) {
    console.log('ensure-data: snapshot missing -> attempting fetch:snapshot…');
    let fetched = false;
    try {
      run('npm run fetch:snapshot');
      fetched = has('dist/data/dex.min.json') && has('dist/data/moves.min.json');
    } catch (e) {
      console.warn('ensure-data: fetch:snapshot failed or not configured:', e?.message || e);
    }

    if (!fetched) {
      console.log('ensure-data: trying local build via build-data…');
      try {
        run('node scripts/build-data.js');
      } catch (e) {
        console.warn('ensure-data: build-data failed (likely no PokeAPI dataset available).');
      }
    }

    if (!has('dist/data/dex.min.json') || !has('dist/data/moves.min.json')) {
      copyBootstrap();
    }

    try { run('node scripts/build-assets-manifest.js'); } catch {}
  } else {
    console.log('ensure-data: snapshot present.');
  }

  // Always run preflight at the end to fail fast if something is truly wrong.
  run('node scripts/preflight.js');
})();
