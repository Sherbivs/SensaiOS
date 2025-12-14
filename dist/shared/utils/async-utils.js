/**
 * Shared async utilities
 * Centralized helpers for asynchronous operations to avoid duplication
 */
/**
 * Simple promise-based delay
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after the specified time
 */
export function delay(ms) {
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
export function delayWithJitter(baseMs) {
    const jitter = baseMs * 0.25 * Math.random();
    const total = baseMs + jitter;
    return new Promise((resolve) => {
        setTimeout(resolve, total);
    });
}
