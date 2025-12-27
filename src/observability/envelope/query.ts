/**
 * Envelope Query — Filter, Search, and Analyze Logs
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * Query DSL for filtering envelopes by level, time, component, correlation
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Usage:
 * ```typescript
 * import { query, where, and, or } from './query.js';
 * 
 * // Simple filter
 * const errors = query(logs).level('error').execute();
 * 
 * // Complex filter
 * const dbErrors = query(logs)
 *   .level('error', 'fatal')
 *   .component('database')
 *   .since('5m')
 *   .execute();
 * 
 * // With correlation tracing
 * const trace = query(logs)
 *   .correlation('abc-123')
 *   .includeChildren()
 *   .execute();
 * ```
 * 
 * @module observability/envelope/query
 */

import {
  type UniversalEnvelope,
  LogLevel,
  ObservationKind,
  isLogEnvelope as _isLogEnvelope,
  isAlertEnvelope as _isAlertEnvelope,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// QUERY TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Filter predicate function
 */
export type FilterPredicate<T = unknown> = (envelope: UniversalEnvelope<T>) => boolean;

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort field options
 */
export type SortField = 'timestamp' | 'level' | 'component' | 'operation';

/**
 * Time range specification
 */
export interface TimeRange {
  start?: Date | string;
  end?: Date | string;
}

/**
 * Query result with metadata
 */
export interface QueryResult<T = unknown> {
  /** Matching envelopes */
  items: UniversalEnvelope<T>[];
  /** Total count before limit */
  total: number;
  /** Query execution time in ms */
  executionTimeMs: number;
  /** Applied filters summary */
  filters: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// TIME PARSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse relative time string to Date
 * 
 * Supports: 5s, 10m, 2h, 1d, 1w
 */
export function parseRelativeTime(relative: string): Date {
  const match = relative.match(/^(\d+)(s|m|h|d|w)$/);
  if (!match) {
    throw new Error(`Invalid relative time: ${relative}. Use format: 5s, 10m, 2h, 1d, 1w`);
  }
  
  const [, amount, unit] = match;
  const ms = parseInt(amount, 10) * {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  }[unit]!;
  
  return new Date(Date.now() - ms);
}

/**
 * Parse time to Date (handles ISO string, Date, or relative)
 */
function parseTime(time: Date | string): Date {
  if (time instanceof Date) return time;
  
  // Check if relative time
  if (/^\d+[smhdw]$/.test(time)) {
    return parseRelativeTime(time);
  }
  
  // Assume ISO string
  return new Date(time);
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTER BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create level filter
 */
export function levelFilter(...levels: string[]): FilterPredicate {
  const levelSet = new Set(levels.map(l => l.toLowerCase()));
  return (env) => levelSet.has(env.level.toLowerCase());
}

/**
 * Create kind filter
 */
export function kindFilter(...kinds: string[]): FilterPredicate {
  const kindSet = new Set(kinds.map(k => k.toLowerCase()));
  return (env) => kindSet.has(env.kind.toLowerCase());
}

/**
 * Create component filter (supports wildcards)
 */
export function componentFilter(pattern: string): FilterPredicate {
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
    return (env) => regex.test(env.source.component);
  }
  return (env) => env.source.component.toLowerCase() === pattern.toLowerCase();
}

/**
 * Create operation filter (supports wildcards)
 */
export function operationFilter(pattern: string): FilterPredicate {
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
    return (env) => regex.test(env.source.operation);
  }
  return (env) => env.source.operation.toLowerCase() === pattern.toLowerCase();
}

/**
 * Create service filter
 */
export function serviceFilter(service: string): FilterPredicate {
  return (env) => env.source.service.toLowerCase() === service.toLowerCase();
}

/**
 * Create message search filter (case-insensitive contains)
 */
export function messageFilter(search: string): FilterPredicate {
  const lower = search.toLowerCase();
  return (env) => env.message.toLowerCase().includes(lower);
}

/**
 * Create regex message filter
 */
export function messageRegexFilter(pattern: string | RegExp): FilterPredicate {
  const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
  return (env) => regex.test(env.message);
}

/**
 * Create time range filter
 */
export function timeFilter(range: TimeRange): FilterPredicate {
  const start = range.start ? parseTime(range.start) : undefined;
  const end = range.end ? parseTime(range.end) : undefined;
  
  return (env) => {
    const time = new Date(env.timestamp);
    if (start && time < start) return false;
    if (end && time > end) return false;
    return true;
  };
}

/**
 * Create "since" filter (last N time units)
 */
export function sinceFilter(relative: string): FilterPredicate {
  const start = parseRelativeTime(relative);
  return (env) => new Date(env.timestamp) >= start;
}

/**
 * Create correlation filter
 */
export function correlationFilter(id: string): FilterPredicate {
  return (env) => env.correlation.id === id;
}

/**
 * Create correlation trace filter (includes children)
 */
export function correlationTraceFilter(id: string): FilterPredicate {
  return (env) => 
    env.correlation.id === id || 
    env.correlation.parent === id ||
    env.correlation.trace === id;
}

/**
 * Create tag filter (envelope has any of the specified tags)
 */
export function tagFilter(...tags: string[]): FilterPredicate {
  const tagSet = new Set(tags.map(t => t.toLowerCase()));
  return (env) => env.tags?.some(t => tagSet.has(t.toLowerCase())) ?? false;
}

/**
 * Create data field filter (checks if data has specific field value)
 */
export function dataFilter(field: string, value: unknown): FilterPredicate {
  return (env) => {
    if (!env.data || typeof env.data !== 'object') return false;
    return (env.data as Record<string, unknown>)[field] === value;
  };
}

/**
 * Create error filter (only envelopes with errors)
 */
export function hasErrorFilter(): FilterPredicate {
  return (env) => env.error !== undefined;
}

/**
 * Create error code filter
 */
export function errorCodeFilter(code: string): FilterPredicate {
  return (env) => env.error?.code === code;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBINATORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Combine filters with AND
 */
export function and(...filters: FilterPredicate[]): FilterPredicate {
  return (env) => filters.every(f => f(env));
}

/**
 * Combine filters with OR
 */
export function or(...filters: FilterPredicate[]): FilterPredicate {
  return (env) => filters.some(f => f(env));
}

/**
 * Negate a filter
 */
export function not(filter: FilterPredicate): FilterPredicate {
  return (env) => !filter(env);
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fluent query builder for envelopes
 */
export class EnvelopeQuery<T = unknown> {
  private filters: FilterPredicate<T>[] = [];
  private filterDescriptions: string[] = [];
  private sortField: SortField = 'timestamp';
  private sortDirection: SortDirection = 'desc';
  private limitCount?: number;
  private offsetCount = 0;
  
  constructor(private envelopes: UniversalEnvelope<T>[]) {}
  
  // ─── Filter Methods ────────────────────────────────────────────────────────
  
  /**
   * Filter by log level(s)
   */
  level(...levels: (keyof typeof LogLevel)[]): this {
    const normalizedLevels = levels.map(l => LogLevel[l] || l.toLowerCase());
    this.filters.push(levelFilter(...normalizedLevels) as FilterPredicate<T>);
    this.filterDescriptions.push(`level IN (${normalizedLevels.join(', ')})`);
    return this;
  }
  
  /**
   * Filter by observation kind(s)
   */
  kind(...kinds: (keyof typeof ObservationKind)[]): this {
    const normalizedKinds = kinds.map(k => ObservationKind[k] || k.toLowerCase());
    this.filters.push(kindFilter(...normalizedKinds) as FilterPredicate<T>);
    this.filterDescriptions.push(`kind IN (${normalizedKinds.join(', ')})`);
    return this;
  }
  
  /**
   * Filter by component (supports wildcards)
   */
  component(pattern: string): this {
    this.filters.push(componentFilter(pattern) as FilterPredicate<T>);
    this.filterDescriptions.push(`component LIKE '${pattern}'`);
    return this;
  }
  
  /**
   * Filter by operation (supports wildcards)
   */
  operation(pattern: string): this {
    this.filters.push(operationFilter(pattern) as FilterPredicate<T>);
    this.filterDescriptions.push(`operation LIKE '${pattern}'`);
    return this;
  }
  
  /**
   * Filter by service
   */
  service(name: string): this {
    this.filters.push(serviceFilter(name) as FilterPredicate<T>);
    this.filterDescriptions.push(`service = '${name}'`);
    return this;
  }
  
  /**
   * Filter by message content (case-insensitive contains)
   */
  message(search: string): this {
    this.filters.push(messageFilter(search) as FilterPredicate<T>);
    this.filterDescriptions.push(`message CONTAINS '${search}'`);
    return this;
  }
  
  /**
   * Filter by message regex
   */
  messageRegex(pattern: string | RegExp): this {
    this.filters.push(messageRegexFilter(pattern) as FilterPredicate<T>);
    this.filterDescriptions.push(`message MATCHES '${pattern}'`);
    return this;
  }
  
  /**
   * Filter by time range
   */
  between(start: Date | string, end: Date | string): this {
    this.filters.push(timeFilter({ start, end }) as FilterPredicate<T>);
    this.filterDescriptions.push(`timestamp BETWEEN '${start}' AND '${end}'`);
    return this;
  }
  
  /**
   * Filter by "since" (last N time units)
   */
  since(relative: string): this {
    this.filters.push(sinceFilter(relative) as FilterPredicate<T>);
    this.filterDescriptions.push(`timestamp >= NOW - ${relative}`);
    return this;
  }
  
  /**
   * Filter by after time
   */
  after(time: Date | string): this {
    this.filters.push(timeFilter({ start: time }) as FilterPredicate<T>);
    this.filterDescriptions.push(`timestamp > '${time}'`);
    return this;
  }
  
  /**
   * Filter by before time
   */
  before(time: Date | string): this {
    this.filters.push(timeFilter({ end: time }) as FilterPredicate<T>);
    this.filterDescriptions.push(`timestamp < '${time}'`);
    return this;
  }
  
  /**
   * Filter by correlation ID
   */
  correlation(id: string): this {
    this.filters.push(correlationFilter(id) as FilterPredicate<T>);
    this.filterDescriptions.push(`correlation.id = '${id}'`);
    return this;
  }
  
  /**
   * Filter by correlation ID including children
   */
  correlationTrace(id: string): this {
    this.filters.push(correlationTraceFilter(id) as FilterPredicate<T>);
    this.filterDescriptions.push(`correlation IN TREE('${id}')`);
    return this;
  }
  
  /**
   * Filter by tags
   */
  tags(...tags: string[]): this {
    this.filters.push(tagFilter(...tags) as FilterPredicate<T>);
    this.filterDescriptions.push(`tags CONTAINS ANY (${tags.join(', ')})`);
    return this;
  }
  
  /**
   * Filter by data field value
   */
  data(field: string, value: unknown): this {
    this.filters.push(dataFilter(field, value) as FilterPredicate<T>);
    this.filterDescriptions.push(`data.${field} = ${JSON.stringify(value)}`);
    return this;
  }
  
  /**
   * Filter to only envelopes with errors
   */
  hasError(): this {
    this.filters.push(hasErrorFilter() as FilterPredicate<T>);
    this.filterDescriptions.push(`error IS NOT NULL`);
    return this;
  }
  
  /**
   * Filter by error code
   */
  errorCode(code: string): this {
    this.filters.push(errorCodeFilter(code) as FilterPredicate<T>);
    this.filterDescriptions.push(`error.code = '${code}'`);
    return this;
  }
  
  /**
   * Custom filter predicate
   */
  where(predicate: FilterPredicate<T>): this {
    this.filters.push(predicate);
    this.filterDescriptions.push(`CUSTOM PREDICATE`);
    return this;
  }
  
  // ─── Sort & Pagination ─────────────────────────────────────────────────────
  
  /**
   * Sort by field
   */
  sortBy(field: SortField, direction: SortDirection = 'desc'): this {
    this.sortField = field;
    this.sortDirection = direction;
    return this;
  }
  
  /**
   * Sort ascending by timestamp (oldest first)
   */
  oldest(): this {
    return this.sortBy('timestamp', 'asc');
  }
  
  /**
   * Sort descending by timestamp (newest first)
   */
  newest(): this {
    return this.sortBy('timestamp', 'desc');
  }
  
  /**
   * Limit results
   */
  limit(count: number): this {
    this.limitCount = count;
    return this;
  }
  
  /**
   * Offset results (for pagination)
   */
  offset(count: number): this {
    this.offsetCount = count;
    return this;
  }
  
  /**
   * Paginate (convenience for limit + offset)
   */
  page(pageNum: number, pageSize: number): this {
    this.limitCount = pageSize;
    this.offsetCount = (pageNum - 1) * pageSize;
    return this;
  }
  
  // ─── Execution ─────────────────────────────────────────────────────────────
  
  /**
   * Execute query and return results
   */
  execute(): QueryResult<T> {
    const startTime = performance.now();
    
    // Apply filters
    let results = this.envelopes;
    for (const filter of this.filters) {
      results = results.filter(filter);
    }
    
    const total = results.length;
    
    // Sort
    results = this.applySorting(results);
    
    // Pagination
    if (this.offsetCount > 0) {
      results = results.slice(this.offsetCount);
    }
    if (this.limitCount !== undefined) {
      results = results.slice(0, this.limitCount);
    }
    
    return {
      items: results,
      total,
      executionTimeMs: performance.now() - startTime,
      filters: this.filterDescriptions,
    };
  }
  
  /**
   * Execute and return just the items
   */
  toArray(): UniversalEnvelope<T>[] {
    return this.execute().items;
  }
  
  /**
   * Execute and return first item
   */
  first(): UniversalEnvelope<T> | undefined {
    return this.limit(1).toArray()[0];
  }
  
  /**
   * Execute and return count
   */
  count(): number {
    return this.execute().total;
  }
  
  /**
   * Check if any match
   */
  exists(): boolean {
    return this.count() > 0;
  }
  
  // ─── Aggregation ───────────────────────────────────────────────────────────
  
  /**
   * Group by field and count
   */
  groupBy(field: 'level' | 'kind' | 'component' | 'operation' | 'service'): Map<string, number> {
    const results = this.toArray();
    const groups = new Map<string, number>();
    
    for (const env of results) {
      const value = field === 'service' || field === 'component' || field === 'operation'
        ? env.source[field]
        : env[field];
      
      groups.set(value, (groups.get(value) || 0) + 1);
    }
    
    return groups;
  }
  
  /**
   * Get unique values for a field
   */
  distinct(field: 'level' | 'kind' | 'component' | 'operation' | 'service'): string[] {
    return [...this.groupBy(field).keys()];
  }
  
  // ─── Internal ──────────────────────────────────────────────────────────────
  
  private applySorting(items: UniversalEnvelope<T>[]): UniversalEnvelope<T>[] {
    const sorted = [...items].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      
      switch (this.sortField) {
        case 'timestamp':
          aVal = new Date(a.timestamp).getTime();
          bVal = new Date(b.timestamp).getTime();
          break;
        case 'level':
          aVal = a.level;
          bVal = b.level;
          break;
        case 'component':
          aVal = a.source.component;
          bVal = b.source.component;
          break;
        case 'operation':
          aVal = a.source.operation;
          bVal = b.source.operation;
          break;
        default:
          return 0;
      }
      
      if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    return sorted;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a query builder for envelopes
 * 
 * @example
 * const errors = query(logs).level('ERROR').since('1h').toArray();
 * const dbLogs = query(logs).component('database').newest().limit(100).toArray();
 */
export function query<T = unknown>(envelopes: UniversalEnvelope<T>[]): EnvelopeQuery<T> {
  return new EnvelopeQuery(envelopes);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Quick filter for errors
 */
export function errors<T = unknown>(envelopes: UniversalEnvelope<T>[]): UniversalEnvelope<T>[] {
  return query(envelopes).level('ERROR', 'FATAL').toArray();
}

/**
 * Quick filter for recent logs
 */
export function recent<T = unknown>(
  envelopes: UniversalEnvelope<T>[],
  since = '5m',
  limit = 100
): UniversalEnvelope<T>[] {
  return query(envelopes).since(since).newest().limit(limit).toArray();
}

/**
 * Quick search in messages
 */
export function search<T = unknown>(
  envelopes: UniversalEnvelope<T>[],
  term: string
): UniversalEnvelope<T>[] {
  return query(envelopes).message(term).toArray();
}

/**
 * Trace a correlation chain
 */
export function trace<T = unknown>(
  envelopes: UniversalEnvelope<T>[],
  correlationId: string
): UniversalEnvelope<T>[] {
  return query(envelopes).correlationTrace(correlationId).oldest().toArray();
}
