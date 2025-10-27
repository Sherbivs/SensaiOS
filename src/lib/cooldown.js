// In-memory cooldowns; suitable for a single running instance
const store = new Map(); // key -> timestamp (ms)

function keyFor(userId, commandName) {
  return `${userId}:${commandName}`;
}

/**
 * Returns { ok: boolean, waitMs: number }
 * If on cooldown, ok=false and waitMs=remaining.
 */
function checkAndSet(userId, commandName, cooldownMs = 2000) {
  const now = Date.now();
  const key = keyFor(userId, commandName);
  const until = store.get(key) || 0;
  if (now < until) return { ok: false, waitMs: until - now };
  store.set(key, now + cooldownMs);
  return { ok: true, waitMs: 0 };
}

export { checkAndSet };

export default { checkAndSet };
