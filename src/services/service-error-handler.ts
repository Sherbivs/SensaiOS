/**
 * Service-Specific Error Handler
 * Purpose: Recognize and enrich service-layer errors (database, cache, API calls)
 * Integrates with ErrorTracker for centralized error capture
 * 
 * @module services/service-error-handler
 */

import { errorTracker, type ErrorContext } from './error-tracker.js';

/// ---- Service Error Types ----

export interface ServiceErrorContext extends ErrorContext {
  queryName?: string;
  queryDuration?: number;
  cacheKey?: string;
  cacheOperation?: string;
  apiEndpoint?: string;
  httpMethod?: string;
  httpStatus?: number;
  retryCount?: number;
}

/// ---- Service Error Handler ----

export class ServiceErrorHandler {
  /**
   * Handle database operation errors
   * Enriches with query context and duration
   */
  async handleDatabaseError(
    error: Error,
    operation: string,
    query?: string,
    duration?: number
  ): Promise<string> {
    const context: ServiceErrorContext = {
      category: 'DATABASE',
      severity: this.classifyDatabaseErrorSeverity(error, operation),
      service: 'database',
      operation,
      queryName: operation,
      queryDuration: duration,
      customData: {
        queryPreview: query ? this.sanitizeQuery(query) : undefined,
        queryLength: query?.length,
        isPrismaError: error.name.includes('Prisma'),
        errorCode: (error as any).code,
      },
    };
    
    return errorTracker.captureError(error, context);
  }
  
  /**
   * Handle cache operation errors
   * Enriches with cache key and operation type
   */
  async handleCacheError(
    error: Error,
    operation: 'get' | 'set' | 'delete' | 'clear' | 'refresh',
    cacheKey?: string
  ): Promise<string> {
    const context: ServiceErrorContext = {
      category: 'CACHE',
      severity: this.classifyCacheErrorSeverity(operation, error),
      service: 'cache',
      operation: `cache-${operation}`,
      cacheKey,
      cacheOperation: operation,
      customData: {
        cacheNamespace: this.extractCacheNamespace(cacheKey),
        errorType: error.name,
        isCorruption: error.message.includes('corrupt') || error.message.includes('invalid'),
      },
    };
    
    return errorTracker.captureError(error, context);
  }
  
  /**
   * Handle external API call errors
   * Enriches with endpoint, method, status code
   */
  async handleAPIError(
    error: Error,
    endpoint: string,
    method: string = 'GET',
    payload?: any
  ): Promise<string> {
    const httpStatus = (error as any).status || (error as any).statusCode;
    
    const context: ServiceErrorContext = {
      category: 'NETWORK',
      severity: this.classifyAPIErrorSeverity(httpStatus, error),
      service: 'api-client',
      operation: 'api-request',
      apiEndpoint: endpoint,
      httpMethod: method,
      httpStatus,
      customData: {
        endpoint,
        method,
        httpStatus,
        hasPayload: !!payload,
        payloadSize: payload ? JSON.stringify(payload).length : 0,
        errorType: error.name,
        isTimeout: error.message.includes('timeout') || error.message.includes('ETIMEDOUT'),
        isNetworkError: error.message.includes('network') || error.message.includes('ECONNREFUSED'),
      },
    };
    
    return errorTracker.captureError(error, context);
  }
  
  /**
   * Handle connection pool errors
   * Critical for database connection management
   */
  async handleConnectionPoolError(
    error: Error,
    poolName: string,
    activeConnections: number,
    maxConnections: number
  ): Promise<string> {
    const context: ServiceErrorContext = {
      category: 'DATABASE',
      severity: 'CRITICAL', // Connection pool issues are critical
      service: 'connection-pool',
      operation: 'connection-management',
      customData: {
        poolName,
        activeConnections,
        maxConnections,
        poolUtilization: (activeConnections / maxConnections) * 100,
        isExhausted: activeConnections >= maxConnections,
        errorType: error.name,
      },
    };
    
    return errorTracker.captureError(error, context);
  }
  
  /**
   * Handle query timeout errors
   * Specific handling for slow queries
   */
  async handleQueryTimeout(
    query: string,
    duration: number,
    timeoutThreshold: number,
    operation: string
  ): Promise<string> {
    const timeoutError = new Error(
      `Query timeout: ${operation} exceeded ${timeoutThreshold}ms (took ${duration}ms)`
    );
    timeoutError.name = 'QueryTimeoutError';
    
    const context: ServiceErrorContext = {
      category: 'DATABASE',
      severity: this.classifyQueryTimeoutSeverity(duration, timeoutThreshold),
      service: 'database',
      operation: 'query-timeout',
      queryName: operation,
      queryDuration: duration,
      customData: {
        queryPreview: this.sanitizeQuery(query),
        duration,
        timeoutThreshold,
        exceedPercentage: ((duration - timeoutThreshold) / timeoutThreshold) * 100,
        queryComplexity: this.estimateQueryComplexity(query),
      },
    };
    
    return errorTracker.captureError(timeoutError, context);
  }
  
  /**
   * Handle rate limit errors
   * Specific to API rate limiting
   */
  async handleRateLimitError(
    endpoint: string,
    retryAfter: number,
    rateLimitScope: 'global' | 'route' | 'user'
  ): Promise<string> {
    const rateLimitError = new Error(
      `Rate limit exceeded for ${endpoint} (scope: ${rateLimitScope}, retry after: ${retryAfter}s)`
    );
    rateLimitError.name = 'RateLimitError';
    
    const context: ServiceErrorContext = {
      category: 'NETWORK',
      severity: 'MEDIUM', // Rate limits are expected
      service: 'api-client',
      operation: 'rate-limit',
      apiEndpoint: endpoint,
      customData: {
        endpoint,
        retryAfter,
        rateLimitScope,
        isGlobalRateLimit: rateLimitScope === 'global',
      },
    };
    
    return errorTracker.captureError(rateLimitError, context);
  }
  
  /**
   * Handle retry exhaustion errors
   * When automatic retry logic gives up
   */
  async handleRetryExhausted(
    error: Error,
    operation: string,
    retryCount: number,
    maxRetries: number
  ): Promise<string> {
    const context: ServiceErrorContext = {
      category: 'NETWORK',
      severity: 'HIGH', // Retry exhaustion means persistent failure
      service: 'retry-handler',
      operation,
      retryCount,
      customData: {
        originalError: error.name,
        originalMessage: error.message,
        retryCount,
        maxRetries,
        gaveUpAfter: this.estimateRetryDuration(retryCount),
      },
    };
    
    return errorTracker.captureError(error, context);
  }
  
  /**
   * Handle validation errors
   * Input validation failures
   */
  async handleValidationError(
    error: Error,
    input: Record<string, any>,
    validationRules: string[]
  ): Promise<string> {
    const context: ServiceErrorContext = {
      category: 'VALIDATION',
      severity: 'LOW', // Validation errors are expected
      service: 'validation',
      operation: 'input-validation',
      customData: {
        inputKeys: Object.keys(input),
        inputSize: JSON.stringify(input).length,
        validationRules,
        ruleCount: validationRules.length,
        errorMessage: error.message,
      },
    };
    
    return errorTracker.captureError(error, context);
  }
  
  /// ---- Private Helpers ----
  
  private classifyDatabaseErrorSeverity(
    error: Error,
    operation: string
  ): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    // Connection errors are CRITICAL
    if (
      error.message.includes('connect') ||
      error.message.includes('ECONNREFUSED') ||
      error.name === 'PrismaClientInitializationError'
    ) {
      return 'CRITICAL';
    }
    
    // Write operations are HIGH (data loss risk)
    if (operation.toLowerCase().includes('create') ||
        operation.toLowerCase().includes('update') ||
        operation.toLowerCase().includes('delete')) {
      return 'HIGH';
    }
    
    // Constraint violations are MEDIUM (expected in some cases)
    if (error.message.includes('constraint') || error.message.includes('unique')) {
      return 'MEDIUM';
    }
    
    // Read operations are MEDIUM (degraded experience)
    return 'MEDIUM';
  }
  
  private classifyCacheErrorSeverity(
    operation: string,
    error: Error
  ): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    // Corruption errors are HIGH (data integrity issue)
    if (error.message.includes('corrupt') || error.message.includes('invalid')) {
      return 'HIGH';
    }
    
    // Cache miss is LOW (expected)
    if (operation === 'get' && error.message.includes('not found')) {
      return 'LOW';
    }
    
    // Clear/refresh failures are MEDIUM (cache can be rebuilt)
    if (operation === 'clear' || operation === 'refresh') {
      return 'MEDIUM';
    }
    
    return 'MEDIUM';
  }
  
  private classifyAPIErrorSeverity(
    httpStatus: number | undefined,
    error: Error
  ): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    if (!httpStatus) {
      // Network errors (no response) are HIGH
      return 'HIGH';
    }
    
    // 5xx errors are CRITICAL (service outage)
    if (httpStatus >= 500) {
      return 'CRITICAL';
    }
    
    // 429 rate limit is MEDIUM (expected)
    if (httpStatus === 429) {
      return 'MEDIUM';
    }
    
    // 4xx errors are MEDIUM (client error, likely fixable)
    if (httpStatus >= 400) {
      return 'MEDIUM';
    }
    
    return 'MEDIUM';
  }
  
  private classifyQueryTimeoutSeverity(
    duration: number,
    threshold: number
  ): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    const exceedPercentage = ((duration - threshold) / threshold) * 100;
    
    // Extreme timeout (>10x) is CRITICAL
    if (exceedPercentage > 1000) {
      return 'CRITICAL';
    }
    
    // Significant timeout (>5x) is HIGH
    if (exceedPercentage > 500) {
      return 'HIGH';
    }
    
    // Moderate timeout (>2x) is MEDIUM
    if (exceedPercentage > 200) {
      return 'MEDIUM';
    }
    
    return 'LOW';
  }
  
  private sanitizeQuery(query: string): string {
    // Remove sensitive data from query preview
    let sanitized = query
      .replace(/password\s*=\s*'[^']*'/gi, "password='[REDACTED]'")
      .replace(/token\s*=\s*'[^']*'/gi, "token='[REDACTED]'");
    
    // Truncate long queries
    if (sanitized.length > 500) {
      sanitized = sanitized.substring(0, 500) + '... [TRUNCATED]';
    }
    
    return sanitized;
  }
  
  private extractCacheNamespace(cacheKey: string | undefined): string | undefined {
    if (!cacheKey) return undefined;
    
    // Extract namespace from keys like "runtime-cache:battles:abc123"
    const parts = cacheKey.split(':');
    return parts.length > 1 ? parts[0] : undefined;
  }
  
  private estimateQueryComplexity(query: string): 'simple' | 'moderate' | 'complex' {
    const lowerQuery = query.toLowerCase();
    
    // Count JOIN operations
    const joinCount = (lowerQuery.match(/join/g) || []).length;
    
    // Count subqueries
    const subqueryCount = (lowerQuery.match(/select.*from.*\(select/g) || []).length;
    
    // Count aggregations
    const aggCount = (lowerQuery.match(/(sum|avg|count|max|min)\(/g) || []).length;
    
    const complexity = joinCount + (subqueryCount * 2) + aggCount;
    
    if (complexity === 0) return 'simple';
    if (complexity <= 3) return 'moderate';
    return 'complex';
  }
  
  private estimateRetryDuration(retryCount: number): string {
    // Assume exponential backoff: 2^n seconds
    const totalSeconds = Array.from({ length: retryCount }, (_, i) => Math.pow(2, i))
      .reduce((sum, delay) => sum + delay, 0);
    
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }
}

// Singleton instance
export const serviceErrorHandler = new ServiceErrorHandler();
