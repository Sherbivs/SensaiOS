// Backwards-compatible entry for the security role-healing bot
// Prefer starting via src/index.ts which manages both bots.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { startSecurityBot, client } from './src/bot/main.js';

const entryHref = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entryHref && import.meta.url === entryHref) {
  startSecurityBot().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[Security Bot] Startup failed:', error);
    process.exit(1);
  });
}

export { startSecurityBot, client };

export default { startSecurityBot, client };
