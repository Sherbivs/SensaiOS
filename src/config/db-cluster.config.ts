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
