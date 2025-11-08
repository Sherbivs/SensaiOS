const envTruthy = (value) => {
  if (value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const runtimeEnv = (process.env.NODE_ENV ?? '').toLowerCase();
const isProdRuntime = runtimeEnv === 'production' || runtimeEnv === 'prod';

let dotenv = null;
try {
  ({ default: dotenv } = await import('dotenv'));
} catch {
  dotenv = null;
}

if (dotenv?.config) {
  const overrideCandidates = [process.env.IG_ENV_FILE, process.env.DOTENV_CONFIG_PATH]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);

  const allowRepoFallback = envTruthy(process.env.IG_ALLOW_REPO_ENV ?? process.env.ALLOW_REPO_ENV);

  let loaded = false;
  for (const candidate of overrideCandidates) {
    const result = dotenv.config({ path: candidate });
    if (!result?.error) {
      loaded = true;
      break;
    }
  }

  if (!loaded) {
    if (!isProdRuntime || allowRepoFallback) {
      const result = dotenv.config();
      if (!result?.error) {
        loaded = true;
      }
    } else {
      console.info('[env] Skipping repository .env fallback because NODE_ENV=production. Set IG_ALLOW_REPO_ENV=1 to override.');
    }
  }
}

const aliasEnv = (sourceKey, targetKey, predicate = true) => {
  if (!predicate) return;
  if (process.env[targetKey]) return;
  const value = process.env[sourceKey];
  if (value !== undefined && value !== null && String(value).trim() !== '') {
    process.env[targetKey] = value;
  }
};

// Alias environment-specific RENDER_DB_* variables based on NODE_ENV
aliasEnv('PROD_RENDER_DB_INTERNAL_URL', 'RENDER_DB_INTERNAL_URL', isProdRuntime);
aliasEnv('PROD_RENDER_DB_EXTERNAL_URL', 'RENDER_DB_EXTERNAL_URL', isProdRuntime);

aliasEnv('DEV_RENDER_DB_INTERNAL_URL', 'RENDER_DB_INTERNAL_URL', !isProdRuntime);
aliasEnv('DEV_RENDER_DB_EXTERNAL_URL', 'RENDER_DB_EXTERNAL_URL', !isProdRuntime);

const argv = Array.isArray(process.argv) ? process.argv : [];

const toBool = (value) => {
  if (value === undefined) return false;
  return value === '1' || String(value).toLowerCase() === 'true';
};

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
};

const toList = (value, { fallback = [], map = (item) => item.trim(), filter = Boolean } = {}) => {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map(map)
    .filter(filter);
};

const CLI_DEBUG_MODE = toBool(process.env.CLI_DEBUG_MODE) || argv.includes('--debug-cli') || argv.includes('--cli-debug');

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// Feature flags and role governance (forced on for continuous monitoring)
const ROLE_PERMISSIONS_AUDIT = true;
const ROLE_PERMISSIONS_REMEDIATE = true;
const ROLE_PERMISSION_POLICY = (process.env.ROLE_PERMISSION_POLICY || 'standard').toLowerCase();
const ROLE_PERMISSION_SNAPSHOT_UPDATE = process.env.ROLE_PERMISSION_SNAPSHOT_UPDATE === undefined
  ? true
  : toBool(process.env.ROLE_PERMISSION_SNAPSHOT_UPDATE);

// Alert destinations
const ALERT_WEBHOOK_URL = (process.env.ALERT_WEBHOOK_URL || '').trim();
const ALERT_CHANNEL_ID = (process.env.ALERT_CHANNEL_ID || '').trim();
const ALERT_USER_ID = (process.env.ALERT_USER_ID || '').trim();
const SECURITY_BOT_TOKEN = (process.env.SECURITY_BOT_TOKEN || process.env.BOT_TOKEN || '').trim();
const rawEnableSecurityBot = process.env.ENABLE_SECURITY_BOT;
const ENABLE_SECURITY_BOT = rawEnableSecurityBot === undefined
  ? Boolean(SECURITY_BOT_TOKEN)
  : toBool(rawEnableSecurityBot);
const POKEMON_BOT_TOKEN = (process.env.POKEMON_BOT_TOKEN || process.env.POKEMON_TOKEN || '').trim();
const rawEnablePokemonBot = process.env.ENABLE_POKEMON_BOT;
const ENABLE_POKEMON_BOT = rawEnablePokemonBot === undefined
  ? Boolean(POKEMON_BOT_TOKEN)
  : toBool(rawEnablePokemonBot);
const POKEMON_BOT_AUTO_DISABLED = rawEnablePokemonBot === undefined && !ENABLE_POKEMON_BOT;
const BOT_TOKEN = SECURITY_BOT_TOKEN;
const ENABLE_CONTINUOUS_SWEEP = process.env.ENABLE_CONTINUOUS_SWEEP === undefined
  ? true
  : toBool(process.env.ENABLE_CONTINUOUS_SWEEP);
const rawEnableDbAutoSync = process.env.ENABLE_DB_AUTO_SYNC;
const ENABLE_DB_AUTO_SYNC = rawEnableDbAutoSync === undefined
  ? true  // Enable by default to keep DEV/PROD databases synchronized
  : toBool(rawEnableDbAutoSync);

// Role assignment defaults
const DEFAULT_ROLE_NAME = 'Trainer';
const ROLE_NAME = (process.env.ROLE_NAME || DEFAULT_ROLE_NAME).trim();
const ROLE_ID = (process.env.ROLE_ID || '').trim();

// Backfill/automation tuning
const resolveIntervalSeconds = (secondsEnv, minutesEnv, { fallbackSeconds, minSeconds, allowZero = false }) => {
  const normalize = (value, minValue) => {
    if (allowZero && Number(value) === 0) {
      return 0;
    }
    return Math.max(minValue, Number(value));
  };

  if (secondsEnv !== undefined) {
    const seconds = toNumber(secondsEnv, fallbackSeconds);
    return normalize(seconds, minSeconds);
  }
  if (minutesEnv !== undefined) {
    const fallbackMinutes = fallbackSeconds / 60;
    const minMinutes = minSeconds / 60;
    const minutes = toNumber(minutesEnv, fallbackMinutes);
    return normalize(minutes, minMinutes) * 60;
  }
  return fallbackSeconds;
};

const BACKFILL_CONCURRENCY = Math.max(1, toNumber(process.env.BACKFILL_CONCURRENCY, 8));
const BACKFILL_DELAY_MS = Math.max(0, toNumber(process.env.BACKFILL_DELAY_MS, 20));
const BACKFILL_INTERVAL_SECONDS = resolveIntervalSeconds(
  process.env.BACKFILL_INTERVAL_SECONDS,
  process.env.BACKFILL_INTERVAL_MIN,
  { fallbackSeconds: 62, minSeconds: 10 }
);
const ROLE_REMEDIATION_INTERVAL_SECONDS = resolveIntervalSeconds(
  process.env.ROLE_REMEDIATION_INTERVAL_SECONDS,
  process.env.ROLE_REMEDIATION_INTERVAL_MIN,
  { fallbackSeconds: 50, minSeconds: 15 }
);
const CACHE_TTL_HOURS = Math.max(1, toNumber(process.env.CACHE_TTL_HOURS, 24));
const OPS_REPORT_INTERVAL_SECONDS = resolveIntervalSeconds(
  process.env.OPS_REPORT_INTERVAL_SECONDS,
  process.env.OPS_REPORT_INTERVAL_MIN,
  { fallbackSeconds: 55, minSeconds: 20, allowZero: true }
);

const BACKFILL_INTERVAL_MIN = BACKFILL_INTERVAL_SECONDS / 60;
const ROLE_REMEDIATION_INTERVAL_MIN = ROLE_REMEDIATION_INTERVAL_SECONDS / 60;
const OPS_REPORT_INTERVAL_MIN = OPS_REPORT_INTERVAL_SECONDS / 60;

const CACHE_WORKER_INTERVAL_MS = Math.max(0, toNumber(process.env.CACHE_WORKER_INTERVAL_MS, 0));
const CACHE_WORKER_INTERVAL_JITTER_MS = Math.max(0, toNumber(process.env.CACHE_WORKER_INTERVAL_JITTER_MS, 30000));

const DATA_PIPELINE_INTERVAL_MS = Math.max(0, toNumber(process.env.DATA_PIPELINE_INTERVAL_MS, 0));
const DATA_PIPELINE_INTERVAL_JITTER_MS = Math.max(0, toNumber(process.env.DATA_PIPELINE_INTERVAL_JITTER_MS, 60000));
const DATA_PIPELINE_RUN_ON_BOOT = process.env.DATA_PIPELINE_RUN_ON_BOOT === undefined
  ? true
  : toBool(process.env.DATA_PIPELINE_RUN_ON_BOOT);

// Standards enforcement
const STANDARD_ENFORCE_ALL = toBool(process.env.STANDARD_ENFORCE_ALL);
const UNLISTED_PERMISSIONS = toList(process.env.UNLISTED_PERMISSIONS, {
  fallback: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AddReactions', 'UseExternalEmojis', 'EmbedLinks', 'AttachFiles'],
});
const STANDARD_EXEMPT_ROLES = new Set(toList(process.env.STANDARD_EXEMPT_ROLES));
const STANDARD_ALL_PERMS_ROLES = new Set(toList(process.env.STANDARD_ALL_PERMS_ROLES));

const DEX_V2_ENABLED = toBool(process.env.DEX_V2_ENABLED);

// Reporting recipients and cadence
const RESTART_DM_RECIPIENT = (process.env.RESTART_DM_RECIPIENT || 'DripTVDD').trim();
const SUMMARY_REPORT_RECIPIENT = (process.env.SUMMARY_REPORT_RECIPIENT || RESTART_DM_RECIPIENT).trim();
const SUMMARY_REPORT_HOUR = clamp(toNumber(process.env.SUMMARY_REPORT_HOUR, 3), 0, 23);
const SUMMARY_REPORT_MINUTE = clamp(toNumber(process.env.SUMMARY_REPORT_MINUTE, 0), 0, 59);
const DRIP_ALERT_RECIPIENT = (process.env.DRIP_ALERT_RECIPIENT || 'DripTVDD').trim();
const DRIP_ALERT_HOUR = clamp(toNumber(process.env.DRIP_ALERT_HOUR, 2), 0, 23);
const DRIP_ALERT_MINUTE = clamp(toNumber(process.env.DRIP_ALERT_MINUTE, 0), 0, 59);
const DRIP_ALERT_TIMEZONE = (process.env.DRIP_ALERT_TIMEZONE || 'America/New_York').trim();

export {
  CLI_DEBUG_MODE,
  ROLE_PERMISSIONS_AUDIT,
  ROLE_PERMISSIONS_REMEDIATE,
  ROLE_PERMISSION_POLICY,
  ROLE_PERMISSION_SNAPSHOT_UPDATE,
  ALERT_WEBHOOK_URL,
  ALERT_CHANNEL_ID,
  ALERT_USER_ID,
  BOT_TOKEN,
  SECURITY_BOT_TOKEN,
  ENABLE_SECURITY_BOT,
  POKEMON_BOT_TOKEN,
  ENABLE_POKEMON_BOT,
  POKEMON_BOT_AUTO_DISABLED,
  ENABLE_CONTINUOUS_SWEEP,
  ENABLE_DB_AUTO_SYNC,
  DEFAULT_ROLE_NAME,
  ROLE_NAME,
  ROLE_ID,
  BACKFILL_CONCURRENCY,
  BACKFILL_DELAY_MS,
  BACKFILL_INTERVAL_SECONDS,
  BACKFILL_INTERVAL_MIN,
  ROLE_REMEDIATION_INTERVAL_SECONDS,
  ROLE_REMEDIATION_INTERVAL_MIN,
  CACHE_TTL_HOURS,
  OPS_REPORT_INTERVAL_SECONDS,
  OPS_REPORT_INTERVAL_MIN,
  CACHE_WORKER_INTERVAL_MS,
  CACHE_WORKER_INTERVAL_JITTER_MS,
  DATA_PIPELINE_INTERVAL_MS,
  DATA_PIPELINE_INTERVAL_JITTER_MS,
  DATA_PIPELINE_RUN_ON_BOOT,
  DEX_V2_ENABLED,
  STANDARD_ENFORCE_ALL,
  UNLISTED_PERMISSIONS,
  STANDARD_EXEMPT_ROLES,
  STANDARD_ALL_PERMS_ROLES,
  RESTART_DM_RECIPIENT,
  SUMMARY_REPORT_RECIPIENT,
  SUMMARY_REPORT_HOUR,
  SUMMARY_REPORT_MINUTE,
  DRIP_ALERT_RECIPIENT,
  DRIP_ALERT_HOUR,
  DRIP_ALERT_MINUTE,
  DRIP_ALERT_TIMEZONE,
};

export default {
  CLI_DEBUG_MODE,
  ROLE_PERMISSIONS_AUDIT,
  ROLE_PERMISSIONS_REMEDIATE,
  ROLE_PERMISSION_POLICY,
  ROLE_PERMISSION_SNAPSHOT_UPDATE,
  ALERT_WEBHOOK_URL,
  ALERT_CHANNEL_ID,
  ALERT_USER_ID,
  BOT_TOKEN,
  SECURITY_BOT_TOKEN,
  ENABLE_SECURITY_BOT,
  POKEMON_BOT_TOKEN,
  ENABLE_POKEMON_BOT,
  POKEMON_BOT_AUTO_DISABLED,
  ENABLE_CONTINUOUS_SWEEP,
  ENABLE_DB_AUTO_SYNC,
  DEFAULT_ROLE_NAME,
  ROLE_NAME,
  ROLE_ID,
  BACKFILL_CONCURRENCY,
  BACKFILL_DELAY_MS,
  BACKFILL_INTERVAL_SECONDS,
  BACKFILL_INTERVAL_MIN,
  ROLE_REMEDIATION_INTERVAL_SECONDS,
  ROLE_REMEDIATION_INTERVAL_MIN,
  CACHE_TTL_HOURS,
  OPS_REPORT_INTERVAL_SECONDS,
  OPS_REPORT_INTERVAL_MIN,
  CACHE_WORKER_INTERVAL_MS,
  CACHE_WORKER_INTERVAL_JITTER_MS,
  DATA_PIPELINE_INTERVAL_MS,
  DATA_PIPELINE_INTERVAL_JITTER_MS,
  DATA_PIPELINE_RUN_ON_BOOT,
  DEX_V2_ENABLED,
  STANDARD_ENFORCE_ALL,
  UNLISTED_PERMISSIONS,
  STANDARD_EXEMPT_ROLES,
  STANDARD_ALL_PERMS_ROLES,
  RESTART_DM_RECIPIENT,
  SUMMARY_REPORT_RECIPIENT,
  SUMMARY_REPORT_HOUR,
  SUMMARY_REPORT_MINUTE,
  DRIP_ALERT_RECIPIENT,
  DRIP_ALERT_HOUR,
  DRIP_ALERT_MINUTE,
  DRIP_ALERT_TIMEZONE,
};
