const dotenv = require('dotenv');

dotenv.config();

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

// Feature flags and role governance
const ROLE_PERMISSIONS_AUDIT = toBool(process.env.ROLE_PERMISSIONS_AUDIT);
const ROLE_PERMISSIONS_REMEDIATE = toBool(process.env.ROLE_PERMISSIONS_REMEDIATE);
const ROLE_PERMISSION_POLICY = (process.env.ROLE_PERMISSION_POLICY || 'standard').toLowerCase();
const ROLE_PERMISSION_SNAPSHOT_UPDATE = process.env.ROLE_PERMISSION_SNAPSHOT_UPDATE === undefined
  ? true
  : toBool(process.env.ROLE_PERMISSION_SNAPSHOT_UPDATE);

// Alert destinations
const ALERT_WEBHOOK_URL = (process.env.ALERT_WEBHOOK_URL || '').trim();
const ALERT_CHANNEL_ID = (process.env.ALERT_CHANNEL_ID || '').trim();
const ALERT_USER_ID = (process.env.ALERT_USER_ID || '').trim();
const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();

// Role assignment defaults
const DEFAULT_ROLE_NAME = 'Trainer';
const ROLE_NAME = (process.env.ROLE_NAME || DEFAULT_ROLE_NAME).trim();
const ROLE_ID = (process.env.ROLE_ID || '').trim();

// Backfill/automation tuning
const BACKFILL_CONCURRENCY = Math.max(1, toNumber(process.env.BACKFILL_CONCURRENCY, 8));
const BACKFILL_DELAY_MS = Math.max(0, toNumber(process.env.BACKFILL_DELAY_MS, 20));
const BACKFILL_INTERVAL_MIN = Math.max(0, toNumber(process.env.BACKFILL_INTERVAL_MIN, 0));
const ROLE_REMEDIATION_INTERVAL_MIN = Math.max(0, toNumber(process.env.ROLE_REMEDIATION_INTERVAL_MIN, 0));
const CACHE_TTL_HOURS = Math.max(1, toNumber(process.env.CACHE_TTL_HOURS, 24));
const OPS_REPORT_INTERVAL_MIN = Math.max(0, toNumber(process.env.OPS_REPORT_INTERVAL_MIN, 0));

// Standards enforcement
const STANDARD_ENFORCE_ALL = toBool(process.env.STANDARD_ENFORCE_ALL);
const UNLISTED_PERMISSIONS = toList(process.env.UNLISTED_PERMISSIONS, {
  fallback: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AddReactions', 'UseExternalEmojis', 'EmbedLinks', 'AttachFiles'],
});
const STANDARD_EXEMPT_ROLES = new Set(toList(process.env.STANDARD_EXEMPT_ROLES));
const STANDARD_ALL_PERMS_ROLES = new Set(toList(process.env.STANDARD_ALL_PERMS_ROLES));

module.exports = {
  CLI_DEBUG_MODE,
  ROLE_PERMISSIONS_AUDIT,
  ROLE_PERMISSIONS_REMEDIATE,
  ROLE_PERMISSION_POLICY,
  ROLE_PERMISSION_SNAPSHOT_UPDATE,
  ALERT_WEBHOOK_URL,
  ALERT_CHANNEL_ID,
  ALERT_USER_ID,
  BOT_TOKEN,
  DEFAULT_ROLE_NAME,
  ROLE_NAME,
  ROLE_ID,
  BACKFILL_CONCURRENCY,
  BACKFILL_DELAY_MS,
  BACKFILL_INTERVAL_MIN,
  ROLE_REMEDIATION_INTERVAL_MIN,
  CACHE_TTL_HOURS,
  OPS_REPORT_INTERVAL_MIN,
  STANDARD_ENFORCE_ALL,
  UNLISTED_PERMISSIONS,
  STANDARD_EXEMPT_ROLES,
  STANDARD_ALL_PERMS_ROLES,
};
