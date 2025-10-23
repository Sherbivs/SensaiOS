const LOG_LABEL = Object.freeze({
  success: 'SUCCESS',
  info: 'INFO',
  warn: 'WARN',
  detail: 'DETAIL',
  error: 'ERROR'
});

function normalizeContext(context) {
  if (context instanceof Map) {
    return Object.fromEntries(context.entries());
  }
  if (context instanceof Set) {
    return Array.from(context.values());
  }
  return context;
}

function log(level, message, context, { debugMode = false } = {}) {
  const timestamp = new Date().toISOString();
  const label = LOG_LABEL[level] || LOG_LABEL.info;
  const writer = level === 'error' ? console.error : console.log;

  writer(`[${timestamp}] [${label}] ${message}`);
  if (!context) {
    return;
  }

  const normalized = normalizeContext(context);

  if (debugMode) {
    if (typeof normalized === 'string') {
      writer(`    ${normalized}`);
      return;
    }

    try {
      const serialized = JSON.stringify(normalized, null, 2);
      serialized.split('\n').forEach(line => writer(`    ${line}`));
      return;
    } catch {
      writer(`    ${String(normalized)}`);
      return;
    }
  }

  if (Array.isArray(normalized)) {
    normalized.forEach(item => writer(`    ${item}`));
    return;
  }

  if (normalized && typeof normalized === 'object') {
    for (const [key, value] of Object.entries(normalized)) {
      writer(`    ${key}: ${value}`);
    }
    return;
  }

  writer(`    ${normalized}`);
}

function report(title, meta = {}, level = 'info') {
  const heading = `=== ${title} ===`;
  const timestamp = new Date().toISOString();
  const label = level.toUpperCase();
  const writer = level === 'error' ? console.error : console.log;
  writer(`[${timestamp}] [${label}] ${heading}`);
  if (meta && typeof meta === 'object') {
    try {
      for (const [key, value] of Object.entries(meta)) {
        writer(`    ${key}: ${value}`);
      }
    } catch {}
  }
}

module.exports = {
  LOG_LABEL,
  log,
  report,
};
