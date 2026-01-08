/**
 * security-bot.ts - Backwards-compatible entry for the security role-healing bot
 *
 * Prefer starting via src/index.ts which manages both bots.
 *
 * @module security-bot
 */

// LOGGER FIRST — Import logging before any other modules for observability-first boot
import { scopedLogger } from './src/observability/envelope/console.js';
const log = scopedLogger('security-bot');

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { startSecurityBot, client } from './src/bot/main.js';

const entryHref: string | null = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (entryHref && import.meta.url === entryHref) {
  log.info('startup', 'Initializing security bot');
  startSecurityBot().catch((error: unknown) => {
    log.error('startup', 'Startup failed', { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  });
}

export { startSecurityBot, client };

export default { startSecurityBot, client };
