// Backwards-compatible entry for the security role-healing bot
// Prefer starting via src/index.js which manages both bots.
module.exports = require('./src/bot/main.js');
// Deprecated entry; kept for backwards compatibility with existing deployment scripts
const { startSecurityBot } = require('./src/bot/main');

startSecurityBot().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[Security Bot] Startup failed:', error);
  process.exit(1);
});
