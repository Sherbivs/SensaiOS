/**
 * Database Cluster Configuration Schema
 * 
 * Standardized configuration for multi-node database clusters with support
 * for master-slave replication, read replicas, worker nodes, and analytics nodes.
 * 
 * @module config/db-cluster.config
 */

export type NodeRole = 'MASTER' | 'PROD' | 'REPLICA' | 'WORKER' | 'ANALYTICS' | 'STAGING';
export type NodePurpose = 'READ_WRITE' | 'READ_ONLY' | 'WRITE_ONLY' | 'ANALYTICS';
export type NodeHealth = 'HEALTHY' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN';
export type ReplicationStrategy = 'MASTER_SLAVE' | 'MULTI_MASTER' | 'PEER_TO_PEER';
export type LoadBalancingStrategy = 'ROUND_ROBIN' | 'LEAST_CONNECTIONS' | 'WEIGHTED' | 'RANDOM';

/**
 * Database node configuration
 */
export interface DatabaseNode {
  /** Unique identifier (e.g., "MASTER_1", "PROD_1", "REPLICA_1") */
  id: string;
  
  /** Node role in the cluster */
  role: NodeRole;
  
  /** Instance number (1-based) for horizontal scaling */
  instance: number;
  
  /** PostgreSQL connection URL */
  url: string;
  
  /** Node purpose/capability */
  purpose: NodePurpose;
  
  /** Priority for load balancing (lower = higher priority) */
  priority: number;
  
  /** Health check interval in milliseconds */
  healthCheckInterval: number;
  
  /** Maximum connection retry attempts */
  maxRetries: number;
  
  /** Query timeout in milliseconds */
  timeout: number;
  
  /** Connection pool configuration */
  poolSize: {
    min: number;
    max: number;
  };
  
  /** Node capabilities */
  capabilities: {
    canWrite: boolean;
    canRead: boolean;
    canMigrate: boolean;
    canReplicate: boolean;
  };
  
  /** Optional metadata */
  metadata?: {
    region?: string;
    provider?: string;
    diskSize?: string;
    description?: string;
  };
}

/**
 * Replication configuration
 */
export interface ReplicationConfig {
  /** Replication strategy */
  strategy: ReplicationStrategy;
  
  /** Sync interval in milliseconds */
  interval: number;
  
  /** Batch size for bulk operations */
  batchSize: number;
  
  /** Enable/disable replication */
  enabled: boolean;
  
  /** Maximum replication lag tolerance in seconds */
  maxLagSeconds: number;
  
  /** Conflict resolution strategy */
  conflictResolution: 'MASTER_WINS' | 'LATEST_WINS' | 'MANUAL';
}

/**
 * Failover configuration
 */
export interface FailoverConfig {
  /** Enable/disable automatic failover */
  enabled: boolean;
  
  /** Allow automatic failover without manual approval */
  automatic: boolean;
  
  /** Health check interval in milliseconds */
  healthCheckInterval: number;
  
  /** Number of consecutive failures before marking node as offline */
  failureThreshold: number;
  
  /** Wait time before attempting recovery in milliseconds */
  recoveryWaitTime: number;
  
  /** Automatic promotion of replicas to master */
  autoPromoteReplica: boolean;
}

/**
 * Load balancing configuration
 */
export interface LoadBalancingConfig {
  /** Load balancing strategy */
  strategy: LoadBalancingStrategy;
  
  /** Enable/disable load balancing */
  enabled: boolean;
  
  /** Weights for weighted load balancing (node ID -> weight) */
  weights?: Record<string, number>;
  
  /** Sticky session configuration */
  stickySession?: {
    enabled: boolean;
    ttlSeconds: number;
  };
}

/**
 * Complete cluster configuration
 */
export interface ClusterConfig {
  /** All nodes in the cluster */
  nodes: DatabaseNode[];
  
  /** Replication settings */
  replication: ReplicationConfig;
  
  /** Failover settings */
  failover: FailoverConfig;
  
  /** Load balancing settings */
  loadBalancing: LoadBalancingConfig;
  
  /** Global timeout for all operations */
  globalTimeout?: number;
  
  /** Enable verbose logging */
  debug?: boolean;
}

/**
 * Default configuration for 2-node cluster (current state)
 */
export const DEFAULT_2_NODE_CONFIG: ClusterConfig = {
  nodes: [
    {
      id: 'MASTER_1',
      role: 'MASTER',
      instance: 1,
      url: process.env.MASTER_1_DATABASE_URL || process.env.PROD_DATABASE_URL || '',
      purpose: 'READ_WRITE',
      priority: 1,
      healthCheckInterval: 30000, // 30s
      maxRetries: 3,
      timeout: 30000, // 30s
      poolSize: {
        min: 2,
        max: 10,
      },
      capabilities: {
        canWrite: true,
        canRead: true,
        canMigrate: true,
        canReplicate: true,
      },
      metadata: {
        region: 'us-virginia',
        provider: 'render',
        description: 'Master database - Render-managed PostgreSQL',
      },
    },
    {
      id: 'PROD_1',
      role: 'PROD',
      instance: 1,
      url: process.env.PROD_1_DATABASE_URL || process.env.PROD_DATABASE_URL || '',
      purpose: 'READ_ONLY',
      priority: 2,
      healthCheckInterval: 30000, // 30s
      maxRetries: 3,
      timeout: 10000, // 10s (faster timeout for local)
      poolSize: {
        min: 5,
        max: 20,
      },
      capabilities: {
        canWrite: false,
        canRead: true,
        canMigrate: false,
        canReplicate: false,
      },
      metadata: {
        region: 'local',
        provider: 'render-node',
        diskSize: '2GB',
        description: 'Production runtime - replicated from master',
      },
    },
  ],
  replication: {
    strategy: 'MASTER_SLAVE',
    interval: 300000, // 5 minutes
    batchSize: 1000,
    enabled: true,
    maxLagSeconds: 60,
    conflictResolution: 'MASTER_WINS',
  },
  failover: {
    enabled: true,
    automatic: false, // Manual approval required for now
    healthCheckInterval: 30000, // 30s
    failureThreshold: 3,
    recoveryWaitTime: 60000, // 1 minute
    autoPromoteReplica: false,
  },
  loadBalancing: {
    strategy: 'ROUND_ROBIN',
    enabled: true,
  },
  globalTimeout: 30000,
  debug: process.env.NODE_ENV !== 'production',
};
