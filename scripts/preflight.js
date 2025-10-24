'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Fail fast when critical bits are missing
// Runtime requirements:
// - A token for the security bot: SECURITY_BOT_TOKEN or BOT_TOKEN
// - Snapshot data for commands that load dex at startup

const ROOT = process.cwd();

const REQUIRED_FILES = [
  'dist/data/dex.min.json',
  'dist/data/moves.min.json',
];

const OPTIONAL_FALLBACKS = new Map([
  ['dist/meta/version.json', 'data/bootstrap/version.json'],
]);

const FALLBACK_SOURCES = new Map([
  ['dist/data/dex.min.json', 'data/bootstrap/dex.min.json'],
  ['dist/data/moves.min.json', 'data/bootstrap/moves.min.json'],
]);

function copyFallback(relTarget) {
  const fallback = FALLBACK_SOURCES.get(relTarget);
  if (!fallback) return false;

  const src = path.join(ROOT, fallback);
  if (!fs.existsSync(src)) return false;

  const dest = path.join(ROOT, relTarget);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.warn(
    `⚠️  Preflight: Missing ${relTarget}; bootstrapped fallback from ${fallback}.`
  );
  return true;
}

function ensureOptionalFallbacks() {
  for (const [target, fallback] of OPTIONAL_FALLBACKS.entries()) {
    const dest = path.join(ROOT, target);
    if (fs.existsSync(dest)) continue;
    const src = path.join(ROOT, fallback);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function fail(msg) {
  console.error('❌ Preflight:', msg);
  process.exit(1);
}

(function main() {
  const token = (process.env.SECURITY_BOT_TOKEN || process.env.BOT_TOKEN || '').trim();
  if (!token) {
    fail('Missing SECURITY_BOT_TOKEN (or BOT_TOKEN)');
  }

  let missingFiles = REQUIRED_FILES.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
  if (missingFiles.length) {
    let patched = false;
    for (const rel of missingFiles) {
      patched = copyFallback(rel) || patched;
    }
    if (patched) {
      missingFiles = REQUIRED_FILES.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
    }
  }
  if (missingFiles.length) {
    const allowMissing = String(process.env.DISABLE_SNAPSHOT_PRECHECK || process.env.SNAPSHOT_OPTIONAL || '')
      .trim()
      .toLowerCase();
    if (allowMissing === '1' || allowMissing === 'true' || allowMissing === 'yes') {
      console.warn(
        '⚠️  Preflight warning: Missing build artifacts but proceeding due to DISABLE_SNAPSHOT_PRECHECK/ SNAPSHOT_OPTIONAL.'
      );
      console.warn('   Missing:', missingFiles.join(', '));
    } else {
      fail(
        `Missing build artifacts: ${missingFiles.join(
          ', '
        )}. Run \`npm run build:data\` (and optionally \`npm run build:assets\`).`
      );
    }
  }

  ensureOptionalFallbacks();

  console.log('✅ Preflight OK');
})();
