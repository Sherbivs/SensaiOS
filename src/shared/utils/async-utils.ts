/**
 * Shared async utilities
 * Centralized helpers for asynchronous operations to avoid duplication
 */

/**
 * Simple promise-based delay
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after the specified time
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Delay with random jitter (25% variance)
 * Useful for retry logic to avoid thundering herd
 * @param baseMs - Base delay in milliseconds
 * @returns Promise that resolves after base + jitter time
 */
export function delayWithJitter(baseMs: number): Promise<void> {
  const jitter = baseMs * 0.25 * Math.random();
  const total = baseMs + jitter;
  return new Promise((resolve) => {
    setTimeout(resolve, total);
  });
}

/**
 * Retry an async operation with exponential backoff
 * @param fn - Async function to retry
 * @param options - Retry configuration
 * @returns Result of successful execution
 * @throws Last error if all retries exhausted
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    useJitter?: boolean;
    onRetry?: (error: unknown, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    useJitter = true,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        break; // Last attempt, throw error
      }

      // Calculate backoff delay
      const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      
      if (onRetry) {
        onRetry(error, attempt);
      }

      // Wait before next attempt
      if (useJitter) {
        await delayWithJitter(exponentialDelay);
      } else {
        await delay(exponentialDelay);
      }
    }
  }

  throw lastError;
}

/**
 * Wrap a promise with a timeout
 * @param promise - Promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param timeoutError - Error to throw on timeout
 * @returns Result of promise or timeout error
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError?: Error
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(timeoutError ?? new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Batch async operations with concurrency limit
 * @param items - Array of items to process
 * @param fn - Async function to process each item
 * @param concurrency - Maximum concurrent operations
 * @returns Array of results in original order
 */
export async function batchProcess<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 5
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const queue = items.map((item, index) => ({ item, index }));
  let activeCount = 0;

  return new Promise((resolve, reject) => {
    const processNext = () => {
      if (queue.length === 0 && activeCount === 0) {
        resolve(results);
        return;
      }

      while (activeCount < concurrency && queue.length > 0) {
        const task = queue.shift()!;
        activeCount++;

        fn(task.item, task.index)
          .then((result) => {
            results[task.index] = result;
          })
          .catch(reject)
          .finally(() => {
            activeCount--;
            processNext();
          });
      }
    };

    processNext();
  });
}

/**
 * Debounce an async function (only execute after silence period)
 * @param fn - Async function to debounce
 * @param delayMs - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let timeoutId: NodeJS.Timeout | null = null;
  let latestResolve: ((value: ReturnType<T>) => void) | null = null;
  let latestReject: ((error: unknown) => void) | null = null;

  return (...args: Parameters<T>): Promise<ReturnType<T>> => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    return new Promise((resolve, reject) => {
      latestResolve = resolve;
      latestReject = reject;

      timeoutId = setTimeout(async () => {
        try {
          const result = await fn(...args);
          latestResolve?.(result);
        } catch (error) {
          latestReject?.(error);
        }
      }, delayMs);
    });
  };
}
