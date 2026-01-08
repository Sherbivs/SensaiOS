/**
 * SensaiOS Storage Module
 * 
 * Database-backed storage primitives including content-addressable storage.
 * 
 * @module sensaios/storage
 */

export {
  ContentAddressableStorage,
  getContentAddressableStorage,
  shutdownContentAddressableStorage,
  type ContentAddressableBlob,
  type IntegrityResult,
  type CASStats,
} from './content-addressable.js';
