'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Fail fast when critical bits are missing
// Runtime requirements:
// - A token for the security bot: SECURITY_BOT_TOKEN or BOT_TOKEN
// - Snapshot data for commands that load dex at startup

const REQUIRED_FILES = [
  'dist/data/dex.min.json',
  'dist/data/moves.min.json',
];

function fail(msg) {
  console.error('❌ Preflight:', msg);
  process.exit(1);
}

(function main() {
  const token = (process.env.SECURITY_BOT_TOKEN || process.env.BOT_TOKEN || '').trim();
  if (!token) {
    fail('Missing SECURITY_BOT_TOKEN (or BOT_TOKEN)');
  }

  const missingFiles = REQUIRED_FILES.filter((rel) => !fs.existsSync(path.join(process.cwd(), rel)));
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

  console.log('✅ Preflight OK');
})();
