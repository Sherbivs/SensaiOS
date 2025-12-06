/**
 * Data Pool Services
 * ==================
 *
 * Central data ingestion layer for Discord entity capture.
 * Exports the DataPoolService for syncing guilds, members, and roles
 * to the security database.
 *
 * @module services/data-pool
 */

export {
  DataPoolService,
  getDataPoolService,
  resetDataPoolService,
  type SyncStatus,
  type SyncResult,
  type GuildStats,
} from './data-pool-service.js';
