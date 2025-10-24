'use strict';
export function log(...args) {
  console.log('[sync-layer]', ...args);
}

export function warn(...args) {
  console.warn('[sync-layer]', ...args);
}

export function error(...args) {
  console.error('[sync-layer]', ...args);
}
