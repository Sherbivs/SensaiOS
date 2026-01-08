/**
 * SensaiOS Concurrency Module
 * 
 * Advisory lock management with deadlock prevention and monitoring.
 * 
 * @module sensaios/concurrency
 */

export {
  LockManager,
  getLockManager,
  shutdownLockManager,
  type LockScope,
  type LockDomain,
  type LockRequest,
  type ActiveLock,
  type LockResult,
  type LockStats,
  type LockConfig,
} from './lock-manager.js';
