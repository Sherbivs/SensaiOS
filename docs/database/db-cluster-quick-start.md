# Database Cluster Standardization - Quick Start Guide

**For**: Developers implementing the standardization project  
**Date**: 2025-11-07  
**Status**: READY TO START

## What We're Building

Transform the current 2-node database cluster into a standardized, scalable multi-node architecture that supports:
- ✓ Master-slave replication
- ✓ Read replicas
- ✓ Worker databases (background jobs)
- ✓ Analytics databases (heavy queries)
- ✓ Automatic failover
- ✓ Load balancing
- ✓ Health monitoring

## Current vs Future State

### Current (2-Node Cluster)
```
DEV_DATABASE_URL ────> PROD_DATABASE_URL
(Master - Render)      (Local - Render Node)
```

**Problems**:
- Inconsistent naming (DEV, PROD, RENDER_DB_*, DATABASE_LOCAL_URL)
- No automatic failover
- No load balancing
- Hard to add new nodes
- Complex URL selection logic

### Future (Standardized N-Node Cluster)
```
MASTER_1 ───┬───> PROD_1 (Read Primary)
            ├───> REPLICA_1 (Read Replica)
            ├───> WORKER_1 (Background Jobs)
            └───> ANALYTICS_1 (Heavy Queries)
```

**Benefits**:
- Consistent naming: `{ROLE}_{INSTANCE}_DATABASE_URL`
- Automatic health monitoring
- Automatic failover (configurable)
- Load balancing across read replicas
- Easy to add nodes (just set env variable)

## Phase 1: Foundation (Start Here)

### Step 1: Create Directory Structure

```bash
# Create coordinator directories
mkdir -p src/services/db-coordinator
mkdir -p src/config

# Files already created:
# ✓ src/config/db-cluster.config.ts (configuration schema)
# ✓ docs/db-cluster-standardization.md (full project plan)
```

### Step 2: Implement Basic Coordinator

Create `src/services/db-coordinator/coordinator.ts`:

```typescript
import type { ClusterConfig, DatabaseNode, NodeHealth } from '../../config/db-cluster.config.js';
import { PrismaClient } from '@prisma/client';

/**
 * Database Cluster Coordinator
 * 
 * Manages multiple database nodes with health monitoring,
 * automatic failover, and load balancing.
 */
export class DatabaseCoordinator {
  private config: ClusterConfig;
  private clients: Map<string, PrismaClient>;
  private health: Map<string, NodeHealth>;
  
  constructor(config: ClusterConfig) {
    this.config = config;
    this.clients = new Map();
    this.health = new Map();
  }
  
  /**
   * Initialize all database clients
   */
  async initialize(): Promise<void> {
    for (const node of this.config.nodes) {
      if (!node.url) {
        console.warn(`[Coordinator] Node ${node.id} has no URL, skipping`);
        continue;
      }
      
      try {
        const client = new PrismaClient({
          datasources: {
            db: {
              url: node.url,
            },
          },
          log: this.config.debug ? ['query', 'error', 'warn'] : ['error'],
        });
        
        await client.$connect();
        this.clients.set(node.id, client);
        this.health.set(node.id, 'HEALTHY');
        console.log(`[Coordinator] Node ${node.id} connected`);
      } catch (error) {
        console.error(`[Coordinator] Node ${node.id} failed to connect:`, error);
        this.health.set(node.id, 'OFFLINE');
      }
    }
  }
  
  /**
   * Get a client by node ID
   */
  getClient(nodeId: string): PrismaClient | undefined {
    return this.clients.get(nodeId);
  }
  
  /**
   * Get master node client (for writes)
   */
  getMasterClient(): PrismaClient | undefined {
    const masterNode = this.config.nodes.find(n => n.role === 'MASTER');
    return masterNode ? this.clients.get(masterNode.id) : undefined;
  }
  
  /**
   * Get read client (load balanced across healthy read nodes)
   */
  getReadClient(): PrismaClient | undefined {
    const readNodes = this.config.nodes
      .filter(n => n.capabilities.canRead && this.health.get(n.id) === 'HEALTHY')
      .sort((a, b) => a.priority - b.priority);
    
    if (readNodes.length === 0) {
      return undefined;
    }
    
    // Simple round-robin for now
    const node = readNodes[0];
    return this.clients.get(node.id);
  }
  
  /**
   * Get node health status
   */
  getNodeHealth(nodeId: string): NodeHealth {
    return this.health.get(nodeId) || 'UNKNOWN';
  }
  
  /**
   * Get cluster status
   */
  getClusterStatus() {
    const nodes = this.config.nodes.map(node => ({
      id: node.id,
      role: node.role,
      health: this.health.get(node.id) || 'UNKNOWN',
      connected: this.clients.has(node.id),
    }));
    
    return {
      totalNodes: this.config.nodes.length,
      healthyNodes: Array.from(this.health.values()).filter(h => h === 'HEALTHY').length,
      nodes,
    };
  }
  
  /**
   * Disconnect all clients
   */
  async shutdown(): Promise<void> {
    for (const [nodeId, client] of this.clients.entries()) {
      try {
        await client.$disconnect();
        console.log(`[Coordinator] Node ${nodeId} disconnected`);
      } catch (error) {
        console.error(`[Coordinator] Error disconnecting node ${nodeId}:`, error);
      }
    }
    this.clients.clear();
    this.health.clear();
  }
}
```

### Step 3: Update Environment Variables

Add to `secrets/Infinity-Gauntlet.env`:

```bash
# ==========================================
# STANDARDIZED DATABASE CLUSTER (NEW)
# ==========================================

# MASTER NODE (source of truth)
MASTER_1_DATABASE_URL=postgresql://infinity_gauntlet_db_user:a7PECaiuqXiJCMpeDze8tlpEbxB68Sy2@dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com/infinity_gauntlet_db

# PRODUCTION NODE (local on Render Node)
PROD_1_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db

# Keep legacy variables for backwards compatibility (will be removed in Phase 3)
DEV_DATABASE_URL=postgresql://infinity_gauntlet_db_user:a7PECaiuqXiJCMpeDze8tlpEbxB68Sy2@dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com/infinity_gauntlet_db
PROD_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db
```

### Step 4: Test Coordinator Locally

Create `src/services/db-coordinator/coordinator.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseCoordinator } from './coordinator.js';
import { DEFAULT_2_NODE_CONFIG } from '../../config/db-cluster.config.js';

describe('DatabaseCoordinator', () => {
  let coordinator: DatabaseCoordinator;
  
  beforeAll(async () => {
    coordinator = new DatabaseCoordinator(DEFAULT_2_NODE_CONFIG);
    await coordinator.initialize();
  });
  
  afterAll(async () => {
    await coordinator.shutdown();
  });
  
  it('should initialize with 2 nodes', () => {
    const status = coordinator.getClusterStatus();
    expect(status.totalNodes).toBe(2);
  });
  
  it('should have at least one healthy node', () => {
    const status = coordinator.getClusterStatus();
    expect(status.healthyNodes).toBeGreaterThan(0);
  });
  
  it('should get master client', () => {
    const masterClient = coordinator.getMasterClient();
    expect(masterClient).toBeDefined();
  });
  
  it('should get read client', () => {
    const readClient = coordinator.getReadClient();
    expect(readClient).toBeDefined();
  });
});
```

Run test:
```bash
npm test -- src/services/db-coordinator/coordinator.test.ts
```

### Step 5: Integrate with Existing Code

Update `src/shared/prisma.ts` to use coordinator:

```typescript
import { DatabaseCoordinator } from '../services/db-coordinator/coordinator.js';
import { loadClusterConfig } from '../config/db-cluster.config.js';

// Global coordinator instance
let coordinator: DatabaseCoordinator | null = null;

/**
 * Initialize database coordinator
 */
export async function initCoordinator(): Promise<DatabaseCoordinator> {
  if (coordinator) {
    return coordinator;
  }
  
  const config = loadClusterConfig();
  coordinator = new DatabaseCoordinator(config);
  await coordinator.initialize();
  
  return coordinator;
}

/**
 * Get client for specific node
 */
export async function getClient(nodeId: string) {
  const coord = await initCoordinator();
  return coord.getClient(nodeId);
}

/**
 * Get master client (for writes)
 */
export async function getMasterClient() {
  const coord = await initCoordinator();
  return coord.getMasterClient();
}

/**
 * Get read client (load balanced)
 */
export async function getReadClient() {
  const coord = await initCoordinator();
  return coord.getReadClient();
}

/**
 * Get cluster status
 */
export async function getClusterStatus() {
  const coord = await initCoordinator();
  return coord.getClusterStatus();
}

// Backwards compatibility: export default client
export const prisma = await getMasterClient();
```

## Testing Your Changes

### Local Testing

1. **Set environment variables**:
```bash
$env:MASTER_1_DATABASE_URL = "postgresql://..."
$env:PROD_1_DATABASE_URL = "postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db"
```

2. **Run coordinator test**:
```bash
npm test -- src/services/db-coordinator/coordinator.test.ts
```

3. **Test with existing code**:
```bash
npm run build
npm test
```

### Verify Backwards Compatibility

Existing code should still work:
```typescript
import { prisma } from '../shared/prisma.js';

// This should still work (uses master client)
const users = await prisma.user.findMany();
```

New code can use coordinator:
```typescript
import { getMasterClient, getReadClient } from '../shared/prisma.js';

// Write to master
const masterClient = await getMasterClient();
await masterClient.user.create({ data: { ... } });

// Read from fastest node
const readClient = await getReadClient();
const users = await readClient.user.findMany();
```

## Next Steps (After Phase 1)

Once Phase 1 is complete and tested:

1. **Phase 2**: Implement health monitoring
2. **Phase 3**: Add automatic failover
3. **Phase 4**: Add load balancing
4. **Phase 5**: Deploy to production

## Common Issues

### Issue: "Cannot connect to database"
**Solution**: Check environment variables are set correctly
```bash
echo $env:MASTER_1_DATABASE_URL
echo $env:PROD_1_DATABASE_URL
```

### Issue: "Node marked as OFFLINE"
**Solution**: Check database is accessible
```bash
npm run db:cli -- status
```

### Issue: "Tests failing"
**Solution**: Ensure Prisma client regenerated
```bash
npx prisma generate
```

## Getting Help

- **Full project plan**: `docs/db-cluster-standardization.md`
- **Configuration schema**: `src/config/db-cluster.config.ts`
- **Current architecture**: `docs/2-node-cluster-automation.md`

## Success Criteria for Phase 1

- [ ] Coordinator successfully initializes 2 nodes
- [ ] Can get master client for writes
- [ ] Can get read client for reads
- [ ] Cluster status shows both nodes
- [ ] All existing tests still pass
- [ ] Backwards compatibility maintained

Once all criteria met, proceed to Phase 2!
