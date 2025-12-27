/**
 * Envelope Serializer — JSON & CLI Output Formatting
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * Converts envelopes to/from various output formats
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Formats:
 *   • JSON — Machine-readable, full fidelity
 *   • JSONL — Newline-delimited JSON (for log streaming)
 *   • Compact — Single-line human-readable summary
 *   • Pretty — Multi-line formatted output
 *   • Structured — Key-value pairs for CLI tools
 * 
 * @module observability/envelope/serializer
 */

import {
  type UniversalEnvelope,
  type LogEnvelope as _LogEnvelope,
  type MetricEnvelope as _MetricEnvelope,
  type AlertEnvelope as _AlertEnvelope,
  ObservationKind,
  LogLevel,
  AlertSeverity as _AlertSeverity,
  isLogEnvelope as _isLogEnvelope,
  isMetricEnvelope as _isMetricEnvelope,
  isAlertEnvelope as _isAlertEnvelope,
  isOutputEnvelope as _isOutputEnvelope,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// FORMAT TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Output format options
 */
export type OutputFormat = 'json' | 'jsonl' | 'compact' | 'pretty' | 'structured';

/**
 * Serialization options
 */
export interface SerializeOptions {
  /** Output format */
  format?: OutputFormat;
  /** Pretty-print JSON (for 'json' format) */
  indent?: number;
  /** Include null/undefined values */
  includeEmpty?: boolean;
  /** Colorize output (for terminal) */
  colorize?: boolean;
  /** Timestamp format */
  timestampFormat?: 'iso' | 'unix' | 'relative' | 'time-only';
  /** Maximum data payload length before truncation */
  maxDataLength?: number;
  /** Fields to exclude from output */
  excludeFields?: string[];
}

/**
 * Default serialization options
 */
const DEFAULT_OPTIONS: Required<SerializeOptions> = {
  format: 'compact',
  indent: 2,
  includeEmpty: false,
  colorize: false,
  timestampFormat: 'time-only',
  maxDataLength: 200,
  excludeFields: [],
};

// ═══════════════════════════════════════════════════════════════════════════
// ANSI COLOR CODES (for terminal output)
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  
  // Log levels
  debug: '\x1b[36m',    // Cyan
  info: '\x1b[32m',     // Green
  warn: '\x1b[33m',     // Yellow
  error: '\x1b[31m',    // Red
  fatal: '\x1b[35m',    // Magenta
  
  // Components
  timestamp: '\x1b[90m', // Gray
  component: '\x1b[34m', // Blue
  message: '\x1b[37m',   // White
  data: '\x1b[36m',      // Cyan
  correlation: '\x1b[90m', // Gray
} as const;

/**
 * Get color for log level
 */
function getLevelColor(level: string): string {
  switch (level) {
    case LogLevel.DEBUG: return COLORS.debug;
    case LogLevel.INFO: return COLORS.info;
    case LogLevel.WARN: return COLORS.warn;
    case LogLevel.ERROR: return COLORS.error;
    case LogLevel.FATAL: return COLORS.fatal;
    default: return COLORS.reset;
  }
}

/**
 * Get emoji for log level
 */
function getLevelEmoji(level: string): string {
  switch (level) {
    case LogLevel.DEBUG: return '🔍';
    case LogLevel.INFO: return '📘';
    case LogLevel.WARN: return '⚠️';
    case LogLevel.ERROR: return '❌';
    case LogLevel.FATAL: return '💀';
    default: return '📝';
  }
}

/**
 * Get emoji for observation kind
 */
function getKindEmoji(kind: string): string {
  switch (kind) {
    case ObservationKind.LOG: return '📝';
    case ObservationKind.METRIC: return '📊';
    case ObservationKind.EVENT: return '⚡';
    case ObservationKind.TRACE: return '🔗';
    case ObservationKind.ALERT: return '🚨';
    case ObservationKind.OUTPUT: return '💬';
    default: return '📦';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMESTAMP FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format timestamp based on option
 */
function formatTimestamp(iso: string, format: SerializeOptions['timestampFormat']): string {
  const date = new Date(iso);
  
  switch (format) {
    case 'iso':
      return iso;
    case 'unix':
      return String(Math.floor(date.getTime() / 1000));
    case 'relative':
      return formatRelativeTime(date);
    case 'time-only':
    default:
      return date.toLocaleTimeString('en-US', { hour12: false });
  }
}

/**
 * Format relative time (e.g., "2s ago", "5m ago")
 */
function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  
  if (diff < 1000) return 'now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA TRUNCATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Truncate and stringify data payload
 */
function truncateData(data: unknown, maxLength: number): string {
  if (data === undefined || data === null) return '';
  
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

// ═══════════════════════════════════════════════════════════════════════════
// SERIALIZATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Serialize envelope to string
 */
export function serialize<T>(
  envelope: UniversalEnvelope<T>,
  options: SerializeOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  switch (opts.format) {
    case 'json':
      return serializeJson(envelope, opts);
    case 'jsonl':
      return serializeJsonl(envelope, opts);
    case 'compact':
      return serializeCompact(envelope, opts);
    case 'pretty':
      return serializePretty(envelope, opts);
    case 'structured':
      return serializeStructured(envelope, opts);
    default:
      return serializeCompact(envelope, opts);
  }
}

/**
 * Serialize to full JSON
 */
function serializeJson<T>(
  envelope: UniversalEnvelope<T>,
  opts: Required<SerializeOptions>
): string {
  const filtered = opts.includeEmpty
    ? envelope
    : removeEmpty(envelope);
  
  return JSON.stringify(filtered, null, opts.indent);
}

/**
 * Serialize to JSONL (single line, no indent)
 */
function serializeJsonl<T>(
  envelope: UniversalEnvelope<T>,
  opts: Required<SerializeOptions>
): string {
  const filtered = opts.includeEmpty
    ? envelope
    : removeEmpty(envelope);
  
  return JSON.stringify(filtered);
}

/**
 * Serialize to compact single-line format
 * 
 * Format: [TIME] LEVEL COMPONENT.OPERATION: MESSAGE {data} (correlationId)
 * Example: [14:32:05] INFO database.query: Query executed {sql: "SELECT..."} (abc123)
 */
function serializeCompact<T>(
  envelope: UniversalEnvelope<T>,
  opts: Required<SerializeOptions>
): string {
  const { colorize } = opts;
  const c = colorize ? COLORS : { reset: '', dim: '', bold: '', timestamp: '', component: '', message: '', data: '', correlation: '', debug: '', info: '', warn: '', error: '', fatal: '' };
  
  const time = formatTimestamp(envelope.timestamp, opts.timestampFormat);
  const level = envelope.level.toUpperCase().padEnd(5);
  const levelColor = colorize ? getLevelColor(envelope.level) : '';
  const component = `${envelope.source.component}.${envelope.source.operation}`;
  const data = envelope.data ? ` ${c.data}${truncateData(envelope.data, opts.maxDataLength)}${c.reset}` : '';
  const corrId = envelope.correlation.id.slice(0, 8);
  
  return `${c.timestamp}[${time}]${c.reset} ${levelColor}${level}${c.reset} ${c.component}${component}${c.reset}: ${c.message}${envelope.message}${c.reset}${data} ${c.correlation}(${corrId})${c.reset}`;
}

/**
 * Serialize to pretty multi-line format
 */
function serializePretty<T>(
  envelope: UniversalEnvelope<T>,
  opts: Required<SerializeOptions>
): string {
  const { colorize } = opts;
  const c = colorize ? COLORS : { reset: '', dim: '', bold: '', timestamp: '', component: '', message: '', data: '', correlation: '', debug: '', info: '', warn: '', error: '', fatal: '' };
  
  const lines: string[] = [];
  const emoji = getLevelEmoji(envelope.level);
  const kindEmoji = getKindEmoji(envelope.kind);
  const levelColor = colorize ? getLevelColor(envelope.level) : '';
  
  // Header line
  lines.push(`${kindEmoji} ${levelColor}${c.bold}${envelope.level.toUpperCase()}${c.reset} ${c.dim}${formatTimestamp(envelope.timestamp, 'iso')}${c.reset}`);
  
  // Source
  lines.push(`   ${c.component}${envelope.source.service}${c.reset} → ${c.bold}${envelope.source.component}.${envelope.source.operation}${c.reset}`);
  
  // Message
  lines.push(`   ${emoji} ${envelope.message}`);
  
  // Data (if present)
  if (envelope.data) {
    const dataStr = JSON.stringify(envelope.data, null, 2)
      .split('\n')
      .map((line, i) => i === 0 ? `   ${c.data}Data: ${line}` : `   ${line}`)
      .join('\n');
    lines.push(`${dataStr}${c.reset}`);
  }
  
  // Error (if present)
  if (envelope.error) {
    lines.push(`   ${c.error}Error: ${envelope.error.message}${c.reset}`);
    if (envelope.error.stack) {
      const stackLines = envelope.error.stack.split('\n').slice(0, 3);
      lines.push(`   ${c.dim}${stackLines.join('\n   ')}${c.reset}`);
    }
  }
  
  // Metrics (if present)
  if (envelope.metrics) {
    const metricsStr = Object.entries(envelope.metrics)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    lines.push(`   ${c.dim}Metrics: ${metricsStr}${c.reset}`);
  }
  
  // Correlation
  lines.push(`   ${c.correlation}Correlation: ${envelope.correlation.id}${envelope.correlation.parent ? ` (parent: ${envelope.correlation.parent})` : ''}${c.reset}`);
  
  return lines.join('\n');
}

/**
 * Serialize to structured key=value format (for grep/awk/jq)
 * 
 * Format: timestamp=X level=Y component=Z operation=W message="M" correlation=C
 */
function serializeStructured<T>(
  envelope: UniversalEnvelope<T>,
  _opts: Required<SerializeOptions>
): string {
  const pairs: string[] = [
    `timestamp=${envelope.timestamp}`,
    `level=${envelope.level}`,
    `kind=${envelope.kind}`,
    `service=${envelope.source.service}`,
    `component=${envelope.source.component}`,
    `operation=${envelope.source.operation}`,
    `message="${envelope.message.replace(/"/g, '\\"')}"`,
    `correlation=${envelope.correlation.id}`,
  ];
  
  if (envelope.correlation.parent) {
    pairs.push(`parent=${envelope.correlation.parent}`);
  }
  
  if (envelope.data) {
    pairs.push(`data=${JSON.stringify(envelope.data)}`);
  }
  
  if (envelope.error) {
    pairs.push(`error="${envelope.error.message.replace(/"/g, '\\"')}"`);
    if (envelope.error.code) {
      pairs.push(`error_code=${envelope.error.code}`);
    }
  }
  
  if (envelope.metrics) {
    for (const [key, value] of Object.entries(envelope.metrics)) {
      pairs.push(`metric_${key}=${value}`);
    }
  }
  
  if (envelope.tags && envelope.tags.length > 0) {
    pairs.push(`tags=${envelope.tags.join(',')}`);
  }
  
  return pairs.join(' ');
}

// ═══════════════════════════════════════════════════════════════════════════
// DESERIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse JSON string to envelope
 */
export function deserialize<T = unknown>(json: string): UniversalEnvelope<T> {
  const parsed = JSON.parse(json);
  
  // Validate required fields
  if (!parsed.id || !parsed.timestamp || !parsed.kind || !parsed.level) {
    throw new Error('Invalid envelope: missing required fields (id, timestamp, kind, level)');
  }
  
  if (!parsed.source?.service || !parsed.source?.component || !parsed.source?.operation) {
    throw new Error('Invalid envelope: missing source fields');
  }
  
  if (!parsed.correlation?.id) {
    throw new Error('Invalid envelope: missing correlation.id');
  }
  
  if (!parsed.message) {
    throw new Error('Invalid envelope: missing message');
  }
  
  return parsed as UniversalEnvelope<T>;
}

/**
 * Try to parse JSON, return null on failure
 */
export function tryDeserialize<T = unknown>(json: string): UniversalEnvelope<T> | null {
  try {
    return deserialize<T>(json);
  } catch {
    return null;
  }
}

/**
 * Parse JSONL (multiple envelopes, one per line)
 */
export function deserializeJsonl<T = unknown>(jsonl: string): UniversalEnvelope<T>[] {
  return jsonl
    .split('\n')
    .filter(line => line.trim())
    .map(line => deserialize<T>(line));
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Serialize multiple envelopes
 */
export function serializeMany<T>(
  envelopes: UniversalEnvelope<T>[],
  options: SerializeOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  if (opts.format === 'json') {
    // For JSON, wrap in array
    return JSON.stringify(envelopes, null, opts.indent);
  }
  
  // For other formats, one per line
  return envelopes
    .map(env => serialize(env, opts))
    .join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Remove null/undefined values from object
 */
function removeEmpty<T extends object>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    
    if (typeof value === 'object' && !Array.isArray(value)) {
      const cleaned = removeEmpty(value as object);
      if (Object.keys(cleaned).length > 0) {
        result[key] = cleaned;
      }
    } else {
      result[key] = value;
    }
  }
  
  return result as Partial<T>;
}

/**
 * Create a configured serializer function
 */
export function createSerializer(defaultOptions: SerializeOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...defaultOptions };
  
  return {
    serialize: <T>(envelope: UniversalEnvelope<T>, overrides?: SerializeOptions) =>
      serialize(envelope, { ...opts, ...overrides }),
    
    serializeMany: <T>(envelopes: UniversalEnvelope<T>[], overrides?: SerializeOptions) =>
      serializeMany(envelopes, { ...opts, ...overrides }),
    
    deserialize,
    tryDeserialize,
    deserializeJsonl,
  };
}

/**
 * Pre-configured serializers for common use cases
 */
export const serializers = {
  /** JSON with 2-space indent */
  json: createSerializer({ format: 'json', indent: 2 }),
  
  /** JSONL for log streaming */
  jsonl: createSerializer({ format: 'jsonl' }),
  
  /** Compact single-line with colors */
  console: createSerializer({ format: 'compact', colorize: true }),
  
  /** Compact single-line without colors (for files) */
  file: createSerializer({ format: 'compact', colorize: false }),
  
  /** Pretty multi-line with colors */
  pretty: createSerializer({ format: 'pretty', colorize: true }),
  
  /** Structured for grep/awk/jq */
  structured: createSerializer({ format: 'structured' }),
};
