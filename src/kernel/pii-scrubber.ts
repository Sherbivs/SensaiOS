/**
 * Kernel PII Scrubber
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * SENSITIVE DATA PROTECTION FOR KERNEL LOGGING
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Automatically scrubs Personally Identifiable Information (PII) from log
 * entries before they are sent to external destinations (Loki, Discord, etc.).
 * 
 * WHAT IT SCRUBS:
 * - Discord User IDs (17-19 digit snowflakes)
 * - Discord Tokens (bot tokens, user tokens)
 * - Email addresses
 * - IP addresses (IPv4 and IPv6)
 * - API keys and secrets (common patterns)
 * - Database connection strings (URLs with credentials)
 * - JWT tokens
 * - Credit card numbers (basic patterns)
 * - Phone numbers (various formats)
 * 
 * CONFIGURABLE:
 * - Enable/disable specific scrubber rules
 * - Add custom patterns
 * - Preserve partial data for debugging (e.g., "123***789")
 * - Allowlist specific values that look like PII but aren't
 * 
 * INTEGRATION:
 * - Used by kernel-output-plugins.ts before external dispatch
 * - Can be used standalone for any string scrubbing
 * 
 * @module kernel/pii-scrubber
 */

import type { KernelLogEntry } from './kernel-logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * PII category for classification
 */
export type PIICategory = 
  | 'discord_id'
  | 'discord_token'
  | 'email'
  | 'ip_address'
  | 'api_key'
  | 'database_url'
  | 'jwt'
  | 'credit_card'
  | 'phone'
  | 'custom';

/**
 * Scrubber rule definition
 */
export interface ScrubberRule {
  /** Rule name for identification */
  name: string;
  
  /** PII category */
  category: PIICategory;
  
  /** Regex pattern to match */
  pattern: RegExp;
  
  /** Replacement string or function */
  replacement: string | ((match: string) => string);
  
  /** Whether this rule is enabled */
  enabled: boolean;
  
  /** Description for documentation */
  description: string;
}

/**
 * Scrubber statistics
 */
export interface ScrubberStats {
  /** Total strings processed */
  stringsProcessed: number;
  
  /** Total matches scrubbed */
  matchesScrubbed: number;
  
  /** Matches by category */
  matchesByCategory: Record<PIICategory, number>;
  
  /** Last scrub time */
  lastScrubTime: string | null;
}

/**
 * Scrubber configuration
 */
export interface ScrubberConfig {
  /** Enable/disable entire scrubber */
  enabled: boolean;
  
  /** Preserve partial data for debugging (e.g., first/last 3 chars) */
  preservePartial: boolean;
  
  /** Number of chars to preserve at start/end when preservePartial is true */
  preserveChars: number;
  
  /** Values to allowlist (won't be scrubbed even if they match patterns) */
  allowlist: Set<string>;
  
  /** Enabled categories (others are disabled) */
  enabledCategories: Set<PIICategory>;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const defaultConfig: ScrubberConfig = {
  enabled: true,
  preservePartial: true,
  preserveChars: 3,
  allowlist: new Set(),
  enabledCategories: new Set([
    'discord_id',
    'discord_token',
    'email',
    'ip_address',
    'api_key',
    'database_url',
    'jwt',
    'credit_card',
    'phone',
  ]),
};

// Current config (mutable)
let config: ScrubberConfig = { ...defaultConfig };

// ============================================================================
// STATISTICS
// ============================================================================

const stats: ScrubberStats = {
  stringsProcessed: 0,
  matchesScrubbed: 0,
  matchesByCategory: {
    discord_id: 0,
    discord_token: 0,
    email: 0,
    ip_address: 0,
    api_key: 0,
    database_url: 0,
    jwt: 0,
    credit_card: 0,
    phone: 0,
    custom: 0,
  },
  lastScrubTime: null,
};

// ============================================================================
// BUILT-IN SCRUBBER RULES
// ============================================================================

/**
 * Create a partial mask for a value
 * e.g., "1234567890" -> "123****890" with preserveChars=3
 */
function partialMask(value: string, category: PIICategory): string {
  if (!config.preservePartial || value.length <= config.preserveChars * 2) {
    return `[${category.toUpperCase()}_REDACTED]`;
  }
  const start = value.slice(0, config.preserveChars);
  const end = value.slice(-config.preserveChars);
  return `${start}***${end}`;
}

const builtInRules: ScrubberRule[] = [
  // ─── Discord ─────────────────────────────────────────────────────────────
  {
    name: 'discord_user_id',
    category: 'discord_id',
    // Discord snowflakes are 17-19 digits
    pattern: /\b[0-9]{17,19}\b/g,
    replacement: (match) => partialMask(match, 'discord_id'),
    enabled: true,
    description: 'Discord user/guild/channel IDs (snowflakes)',
  },
  {
    name: 'discord_bot_token',
    category: 'discord_token',
    // Bot tokens: Base64.Base64.Base64 pattern
    pattern: /[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/g,
    replacement: '[DISCORD_TOKEN_REDACTED]',
    enabled: true,
    description: 'Discord bot tokens',
  },
  {
    name: 'discord_webhook_url',
    category: 'discord_token',
    pattern: /https:\/\/discord\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+/g,
    replacement: '[DISCORD_WEBHOOK_REDACTED]',
    enabled: true,
    description: 'Discord webhook URLs',
  },
  
  // ─── Email ───────────────────────────────────────────────────────────────
  {
    name: 'email_address',
    category: 'email',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: (match) => {
      const [local, domain] = match.split('@');
      if (config.preservePartial && local.length > 2) {
        return `${local[0]}***@${domain}`;
      }
      return '[EMAIL_REDACTED]';
    },
    enabled: true,
    description: 'Email addresses',
  },
  
  // ─── IP Addresses ────────────────────────────────────────────────────────
  {
    name: 'ipv4_address',
    category: 'ip_address',
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    replacement: (match) => {
      if (config.preservePartial) {
        const octets = match.split('.');
        return `${octets[0]}.${octets[1]}.***.***`;
      }
      return '[IP_REDACTED]';
    },
    enabled: true,
    description: 'IPv4 addresses',
  },
  {
    name: 'ipv6_address',
    category: 'ip_address',
    // Simplified IPv6 pattern
    pattern: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
    replacement: '[IPV6_REDACTED]',
    enabled: true,
    description: 'IPv6 addresses',
  },
  
  // ─── API Keys & Secrets ──────────────────────────────────────────────────
  {
    name: 'api_key_generic',
    category: 'api_key',
    // Common API key patterns: long alphanumeric strings with key indicators
    pattern: /(?:api[_-]?key|apikey|secret|token|password|auth)[=:]["']?[A-Za-z0-9_-]{16,}["']?/gi,
    replacement: '[API_KEY_REDACTED]',
    enabled: true,
    description: 'Generic API keys and secrets',
  },
  {
    name: 'render_api_key',
    category: 'api_key',
    pattern: /rnd_[A-Za-z0-9]{32}/g,
    replacement: '[RENDER_API_KEY_REDACTED]',
    enabled: true,
    description: 'Render API keys',
  },
  {
    name: 'github_token',
    category: 'api_key',
    pattern: /gh[pousr]_[A-Za-z0-9]{36,}/g,
    replacement: '[GITHUB_TOKEN_REDACTED]',
    enabled: true,
    description: 'GitHub tokens (PAT, OAuth, etc.)',
  },
  
  // ─── Database URLs ───────────────────────────────────────────────────────
  {
    name: 'postgres_url',
    category: 'database_url',
    // postgresql://user:password@host:port/database
    pattern: /postgres(?:ql)?:\/\/[^:]+:[^@]+@[^\s]+/gi,
    replacement: '[DATABASE_URL_REDACTED]',
    enabled: true,
    description: 'PostgreSQL connection strings',
  },
  {
    name: 'mongodb_url',
    category: 'database_url',
    pattern: /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@[^\s]+/gi,
    replacement: '[MONGODB_URL_REDACTED]',
    enabled: true,
    description: 'MongoDB connection strings',
  },
  {
    name: 'redis_url',
    category: 'database_url',
    pattern: /redis:\/\/[^:]*:[^@]+@[^\s]+/gi,
    replacement: '[REDIS_URL_REDACTED]',
    enabled: true,
    description: 'Redis connection strings',
  },
  
  // ─── JWT Tokens ──────────────────────────────────────────────────────────
  {
    name: 'jwt_token',
    category: 'jwt',
    // JWT: header.payload.signature (base64url encoded)
    pattern: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
    replacement: '[JWT_REDACTED]',
    enabled: true,
    description: 'JWT tokens',
  },
  
  // ─── Credit Cards ────────────────────────────────────────────────────────
  {
    name: 'credit_card',
    category: 'credit_card',
    // Basic credit card patterns (Visa, MC, Amex, Discover)
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    replacement: (match) => {
      if (config.preservePartial) {
        return `****-****-****-${match.slice(-4)}`;
      }
      return '[CARD_REDACTED]';
    },
    enabled: true,
    description: 'Credit card numbers',
  },
  
  // ─── Phone Numbers ───────────────────────────────────────────────────────
  {
    name: 'phone_us',
    category: 'phone',
    // US phone formats: (555) 555-5555, 555-555-5555, 5555555555
    pattern: /\b(?:\+?1[-.\s]?)?(?:\([0-9]{3}\)|[0-9]{3})[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    replacement: (match) => {
      if (config.preservePartial) {
        return match.replace(/[0-9]/g, (_, i) => i < 3 ? _ : '*');
      }
      return '[PHONE_REDACTED]';
    },
    enabled: true,
    description: 'US phone numbers',
  },
];

// Custom rules added at runtime
const customRules: ScrubberRule[] = [];

// ============================================================================
// SCRUBBER API
// ============================================================================

/**
 * Scrub PII from a string
 * 
 * @param input - String to scrub
 * @returns Scrubbed string
 */
export function scrubString(input: string): string {
  if (!config.enabled || !input) {
    return input;
  }
  
  stats.stringsProcessed++;
  let result = input;
  
  // Apply all enabled rules
  const allRules = [...builtInRules, ...customRules];
  
  for (const rule of allRules) {
    if (!rule.enabled) continue;
    if (!config.enabledCategories.has(rule.category)) continue;
    
    // Reset regex lastIndex for global patterns
    rule.pattern.lastIndex = 0;
    
    const matches = result.match(rule.pattern);
    if (matches) {
      for (const match of matches) {
        // Check allowlist
        if (config.allowlist.has(match)) continue;
        
        // Apply replacement
        const replacement = typeof rule.replacement === 'function'
          ? rule.replacement(match)
          : rule.replacement;
        
        result = result.replace(match, replacement);
        stats.matchesScrubbed++;
        stats.matchesByCategory[rule.category]++;
      }
    }
  }
  
  stats.lastScrubTime = new Date().toISOString();
  return result;
}

/**
 * Scrub PII from an object (deep)
 * 
 * @param obj - Object to scrub
 * @returns New object with scrubbed values
 */
export function scrubObject<T>(obj: T): T {
  if (!config.enabled) {
    return obj;
  }
  
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return scrubString(obj) as T;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => scrubObject(item)) as T;
  }
  
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = scrubObject(value);
    }
    return result as T;
  }
  
  return obj;
}

/**
 * Scrub PII from a kernel log entry
 * Creates a new entry with scrubbed message and data
 * 
 * @param entry - Log entry to scrub
 * @returns New entry with scrubbed values
 */
export function scrubLogEntry(entry: KernelLogEntry): KernelLogEntry {
  if (!config.enabled) {
    return entry;
  }
  
  return {
    ...entry,
    message: scrubString(entry.message),
    data: entry.data ? scrubObject(entry.data) : undefined,
    error: entry.error ? {
      ...entry.error,
      message: scrubString(entry.error.message),
      stack: entry.error.stack ? scrubString(entry.error.stack) : undefined,
    } : undefined,
  };
}

// ============================================================================
// CONFIGURATION API
// ============================================================================

/**
 * Update scrubber configuration
 */
export function configureScrubber(updates: Partial<ScrubberConfig>): void {
  config = { ...config, ...updates };
}

/**
 * Reset scrubber to default configuration
 */
export function resetScrubberConfig(): void {
  config = { ...defaultConfig };
}

/**
 * Enable a specific PII category
 */
export function enableCategory(category: PIICategory): void {
  config.enabledCategories.add(category);
}

/**
 * Disable a specific PII category
 */
export function disableCategory(category: PIICategory): void {
  config.enabledCategories.delete(category);
}

/**
 * Add a value to the allowlist
 */
export function allowlistValue(value: string): void {
  config.allowlist.add(value);
}

/**
 * Remove a value from the allowlist
 */
export function removeFromAllowlist(value: string): void {
  config.allowlist.delete(value);
}

/**
 * Add a custom scrubber rule
 */
export function addCustomRule(rule: ScrubberRule): void {
  customRules.push(rule);
}

/**
 * Remove a custom rule by name
 */
export function removeCustomRule(name: string): boolean {
  const index = customRules.findIndex(r => r.name === name);
  if (index >= 0) {
    customRules.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * Enable or disable a built-in rule by name
 */
export function setRuleEnabled(name: string, enabled: boolean): boolean {
  const rule = builtInRules.find(r => r.name === name) ?? customRules.find(r => r.name === name);
  if (rule) {
    rule.enabled = enabled;
    return true;
  }
  return false;
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

/**
 * Get current scrubber configuration
 */
export function getScrubberConfig(): ScrubberConfig {
  return { ...config };
}

/**
 * Get scrubber statistics
 */
export function getScrubberStats(): ScrubberStats {
  return { ...stats };
}

/**
 * Get all rules (built-in and custom)
 */
export function getAllRules(): ScrubberRule[] {
  return [...builtInRules, ...customRules];
}

/**
 * Reset scrubber statistics
 */
export function resetScrubberStats(): void {
  stats.stringsProcessed = 0;
  stats.matchesScrubbed = 0;
  stats.lastScrubTime = null;
  for (const key of Object.keys(stats.matchesByCategory) as PIICategory[]) {
    stats.matchesByCategory[key] = 0;
  }
}

// ============================================================================
// OUTPUT PLUGIN WRAPPER
// ============================================================================

/**
 * Create a scrubbing wrapper for an output plugin
 * All log entries are scrubbed before being passed to the wrapped plugin
 */
export function createScrubbingPlugin(
  basePlugin: import('./kernel-output-plugins.js').KernelOutputPlugin
): import('./kernel-output-plugins.js').KernelOutputPlugin {
  return {
    ...basePlugin,
    name: `${basePlugin.name}-scrubbed`,
    
    write(entry: KernelLogEntry): Promise<void> | void {
      const scrubbedEntry = scrubLogEntry(entry);
      return basePlugin.write(scrubbedEntry);
    },
  };
}
