/**
 * PII Scrubber — Sanitize Sensitive Data from Logs
 * 
 * Automatically redacts tokens, emails, IPs, and other sensitive data
 * before it reaches logging systems (Loki, console, files).
 * 
 * Patterns covered:
 * - Discord bot tokens (MTxxxxxx...)
 * - Discord webhook URLs
 * - Email addresses
 * - IPv4 addresses
 * - Database connection strings (postgresql://...)
 * - API keys (common patterns)
 * - Bearer tokens
 * 
 * @module shared/utils/pii-scrubber
 * @since 2025-12-21
 */

// ============================================================================
// PII Pattern Definitions
// ============================================================================

interface PIIPattern {
  name: string;
  regex: RegExp;
  replace: string;
}

/**
 * Patterns to detect and redact sensitive information.
 * Order matters — more specific patterns should come first.
 */
const PII_PATTERNS: PIIPattern[] = [
  // Discord bot tokens (MTxxxxxx.xxxxxx.xxxxx format)
  {
    name: 'discord_token',
    regex: /[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27,}/g,
    replace: '[DISCORD_TOKEN]',
  },
  
  // Discord webhook URLs
  {
    name: 'discord_webhook',
    regex: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/gi,
    replace: '[DISCORD_WEBHOOK]',
  },
  
  // PostgreSQL connection strings
  {
    name: 'postgres_url',
    regex: /postgresql:\/\/[^\s"']+/gi,
    replace: '[DATABASE_URL]',
  },
  
  // Generic database URLs
  {
    name: 'database_url',
    regex: /(mysql|mongodb|redis|postgres):\/\/[^\s"']+/gi,
    replace: '[DATABASE_URL]',
  },
  
  // Bearer tokens
  {
    name: 'bearer_token',
    regex: /Bearer\s+[A-Za-z0-9\-_]+\.?[A-Za-z0-9\-_]*\.?[A-Za-z0-9\-_]*/gi,
    replace: 'Bearer [TOKEN]',
  },
  
  // API keys (common patterns: api_key=xxx, apiKey: xxx, x-api-key: xxx)
  {
    name: 'api_key',
    regex: /(api[_-]?key|apikey|x-api-key)\s*[=:]\s*["']?[\w-]{20,}["']?/gi,
    replace: '$1=[API_KEY]',
  },
  
  // Render API keys (rnd_xxx format)
  {
    name: 'render_api_key',
    regex: /rnd_[A-Za-z0-9]{20,}/g,
    replace: '[RENDER_API_KEY]',
  },
  
  // Email addresses
  {
    name: 'email',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replace: '[EMAIL]',
  },
  
  // IPv4 addresses (but not localhost or private ranges in dev logs)
  {
    name: 'ipv4_public',
    regex: /\b(?!127\.)(?!192\.168\.)(?!10\.)(?!172\.(?:1[6-9]|2\d|3[01])\.)(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replace: '[IP]',
  },
  
  // Discord user IDs (18-19 digit numbers that might be sensitive)
  // Note: Only redact when clearly in a sensitive context
  {
    name: 'sensitive_id',
    regex: /(?:password|secret|token|key|auth)\s*[=:]\s*["']?[A-Za-z0-9\-_]{16,}["']?/gi,
    replace: '[REDACTED_SECRET]',
  },
  
  // AWS-style keys
  {
    name: 'aws_key',
    regex: /AKIA[A-Z0-9]{16}/g,
    replace: '[AWS_ACCESS_KEY]',
  },
  
  // Generic long hex strings that might be secrets (32+ chars)
  {
    name: 'hex_secret',
    regex: /(?:secret|token|key|password)\s*[=:]\s*["']?[0-9a-fA-F]{32,}["']?/gi,
    replace: '[HEX_SECRET]',
  },
];

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Scrub PII from a string.
 * 
 * Applies all registered patterns to redact sensitive information.
 * Safe to call on any string — returns original if no matches.
 * 
 * @param input - String to sanitize
 * @returns Sanitized string with PII redacted
 * 
 * @example
 * ```typescript
 * scrubPII('Token: MTxxxx.xxx.xxx')
 * // Returns: 'Token: [DISCORD_TOKEN]'
 * 
 * scrubPII('Contact: user@example.com')
 * // Returns: 'Contact: [EMAIL]'
 * ```
 */
export function scrubPII(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }
  
  let result = input;
  
  for (const { regex, replace } of PII_PATTERNS) {
    // Create fresh regex instance for each call (stateful global flag)
    const freshRegex = new RegExp(regex.source, regex.flags);
    result = result.replace(freshRegex, replace);
  }
  
  return result;
}

/**
 * Scrub PII from an object recursively.
 * 
 * Walks object/array structures and scrubs all string values.
 * Returns a new object — original is not modified.
 * 
 * @param obj - Object to sanitize
 * @returns New object with all string values sanitized
 */
export function scrubPIIDeep<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return scrubPII(obj) as T;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => scrubPIIDeep(item)) as T;
  }
  
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = scrubPIIDeep(value);
    }
    return result as T;
  }
  
  return obj;
}

/**
 * Check if a string contains potential PII.
 * 
 * Useful for conditional logging or alerting.
 * 
 * @param input - String to check
 * @returns true if PII patterns detected
 */
export function containsPII(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return false;
  }
  
  for (const { regex } of PII_PATTERNS) {
    const freshRegex = new RegExp(regex.source, regex.flags);
    if (freshRegex.test(input)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get all PII pattern names for documentation/debugging.
 */
export function getPIIPatternNames(): string[] {
  return PII_PATTERNS.map(p => p.name);
}

// ============================================================================
// Statistics (for monitoring scrubber effectiveness)
// ============================================================================

interface ScrubStats {
  totalCalls: number;
  totalRedactions: number;
  byPattern: Record<string, number>;
}

const stats: ScrubStats = {
  totalCalls: 0,
  totalRedactions: 0,
  byPattern: {},
};

/**
 * Scrub PII with statistics tracking.
 * 
 * Same as scrubPII but tracks which patterns matched.
 * Use this when you need to monitor scrubber effectiveness.
 */
export function scrubPIIWithStats(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }
  
  stats.totalCalls++;
  let result = input;
  
  for (const { name, regex, replace } of PII_PATTERNS) {
    const freshRegex = new RegExp(regex.source, regex.flags);
    const matches = result.match(freshRegex);
    
    if (matches) {
      stats.totalRedactions += matches.length;
      stats.byPattern[name] = (stats.byPattern[name] || 0) + matches.length;
    }
    
    result = result.replace(freshRegex, replace);
  }
  
  return result;
}

/**
 * Get PII scrubber statistics.
 */
export function getScrubStats(): Readonly<ScrubStats> {
  return { ...stats };
}

/**
 * Reset scrubber statistics.
 */
export function resetScrubStats(): void {
  stats.totalCalls = 0;
  stats.totalRedactions = 0;
  stats.byPattern = {};
}
