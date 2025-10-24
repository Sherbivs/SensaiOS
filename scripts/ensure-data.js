'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const has = (rel) => fs.existsSync(path.join(process.cwd(), rel));
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env: process.env });

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

    try { run('node scripts/build-assets-manifest.js'); } catch {}
  } else {
    console.log('ensure-data: snapshot present.');
  }

  // Always run preflight at the end to fail fast if something is truly wrong.
  run('node scripts/preflight.js');
})();
