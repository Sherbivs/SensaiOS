#!/usr/bin/env tsx
/**
 * preflight.ts - Pre-flight validation for bot startup
 *
 * PURPOSE:
 *   Fail fast when critical bits are missing before starting the bot.
 *   Validates token availability and required data files.
 *
 * RUNTIME REQUIREMENTS:
 *   - A token for the security bot: SECURITY_BOT_TOKEN or BOT_TOKEN
 *   - Snapshot data for commands that load dex at startup
 *
 * USAGE:
 *   npx tsx scripts/preflight.ts
 *
 * EXIT CODES:
 *   0 - All checks passed
 *   1 - Missing required files or token
 */

import { scopedLogger } from '../src/observability/envelope/console.js';
import fs from 'node:fs';
import path from 'node:path';

const ROOT: string = process.cwd();
const log = scopedLogger('scripts.preflight');

const REQUIRED_FILES: readonly string[] = [
  'dist/data/dex.min.json',
  'dist/data/moves.min.json',
] as const;

const OPTIONAL_FALLBACKS: ReadonlyMap<string, string> = new Map([
  ['dist/meta/version.json', 'data/bootstrap/version.json'],
]);

const FALLBACK_SOURCES: ReadonlyMap<string, string> = new Map([
  ['dist/data/dex.min.json', 'data/bootstrap/dex.min.json'],
  ['dist/data/moves.min.json', 'data/bootstrap/moves.min.json'],
]);

/**
 * Copy fallback file if it exists
 */
function copyFallback(relTarget: string): boolean {
  const fallback = FALLBACK_SOURCES.get(relTarget);
  if (!fallback) return false;

  const src = path.join(ROOT, fallback);
  if (!fs.existsSync(src)) return false;

  const dest = path.join(ROOT, relTarget);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  log.warn('fallback', 'Missing build artifact; bootstrapped fallback', {
    target: relTarget,
    fallback,
  });
  return true;
}

/**
 * Ensure optional fallback files are in place
 */
function ensureOptionalFallbacks(): void {
  for (const [target, fallback] of OPTIONAL_FALLBACKS.entries()) {
    const dest = path.join(ROOT, target);
    if (fs.existsSync(dest)) continue;
    const src = path.join(ROOT, fallback);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

/**
 * Exit with error message
 */
function fail(msg: string): never {
  log.error('preflight', 'Preflight failed', { error: msg });
  process.exit(1);
}

function main(): void {
  const token = (process.env.SECURITY_BOT_TOKEN || process.env.BOT_TOKEN || '').trim();
  if (!token) {
    fail('Missing SECURITY_BOT_TOKEN (or BOT_TOKEN)');
  }

  let missingFiles = REQUIRED_FILES.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));

  if (missingFiles.length > 0) {
    let patched = false;
    for (const rel of missingFiles) {
      patched = copyFallback(rel) || patched;
    }
    if (patched) {
      missingFiles = REQUIRED_FILES.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
    }
  }

  if (missingFiles.length > 0) {
    const allowMissing = String(
      process.env.DISABLE_SNAPSHOT_PRECHECK || process.env.SNAPSHOT_OPTIONAL || ''
    )
      .trim()
      .toLowerCase();

    if (allowMissing === '1' || allowMissing === 'true' || allowMissing === 'yes') {
      log.warn('missing-artifacts', 'Missing build artifacts but proceeding due to override', {
        missing: missingFiles,
        override: 'DISABLE_SNAPSHOT_PRECHECK/SNAPSHOT_OPTIONAL',
      });
    } else {
      fail(
        `Missing build artifacts: ${missingFiles.join(
          ', '
        )}. Run \`npm run build:data\` (and optionally \`npm run build:assets\`).`
      );
    }
  }

  ensureOptionalFallbacks();

  log.info('preflight', 'Preflight OK');
}

main();
