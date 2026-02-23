/**
 * src/security-main.ts — Compiled entry point for the security bot Render service.
 *
 * Replaces the root-level `security-bot.ts` which required `npx tsx` (TypeScript
 * interpretation overhead ~50-100 MB).  This file lives inside `src/` so the
 * standard TypeScript build compiles it to `dist/security-main.js`, allowing
 * startup via:
 *
 *   node --max-old-space-size=380 --max-semi-space-size=32 dist/security-main.js
 *
 * The import below resolves to `dist/bot/main.js` at runtime — correct for both
 * the compiled output path and the Render nested-directory layout.
 *
 * @module security-main
 */

// LOGGER FIRST — observability-first boot sequence
import { scopedLogger } from './observability/envelope/console.js';

const log = scopedLogger('security-main');

import { startSecurityBot } from './bot/main.js';

log.info('startup', 'Initializing security bot (compiled entry point)');

startSecurityBot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  log.error('startup', 'Startup failed', { error: message });
  process.exit(1);
});
