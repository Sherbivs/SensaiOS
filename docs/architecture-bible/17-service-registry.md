# Section 17: Service Registry Architecture

[← Back to INDEX](INDEX.md) | [← Previous: Boot Sequence](16-boot-sequence.md)

---

**Philosophy**: "Decouple services through dependency injection—explicit dependencies, predictable initialization, graceful shutdown."

**Purpose**: Centralized service discovery and lifecycle management with dependency graph resolution, health monitoring, and coordinated shutdown.

**Source**: `src/shared/service-registry.ts` (820 lines)

**Called From**: `src/index.ts` Phase 1 (Foundation Services) — first major initialization step after pre-boot

## 17.1 Core Concepts

### 17.1.1 Problem Statement

**Before Service Registry**:
- Services directly imported each other (tight coupling)
- No control over initialization order
- No visibility into service health
- Difficult to coordinate shutdown (resource leaks)
- Hard to test (circular dependencies, mocking challenges)

**After Service Registry**:
- Centralized service discovery (loose coupling via DI)
- Enforced initialization order via dependency graph
- Automated health monitoring with status transitions
- Coordinated graceful shutdown (reverse init order)
- Easy testing (mock services via registry)

### 17.1.2 Design Patterns

**Singleton Pattern**: Single ServiceRegistry instance per process.

```typescript
export class ServiceRegistry {
  private static instance: ServiceRegistry | null = null;
  
  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }
}
```

**Factory Pattern**: Services created via factory functions (lazy initialization).

```typescript
export type ServiceFactory = (dependencies: ServiceDependencies) => any | Promise<any>;

// Example factory
const engineCacheFactory: ServiceFactory = async (deps) => {
  return new EngineCache(deps.engineReadDb);
};
```

**Dependency Injection**: Services declare dependencies, registry resolves them.

```typescript
serviceRegistry.register({
  name: 'engine-cache',
  factory: engineCacheFactory,
  dependencies: ['engine-read-db'], // DI via registry
  startupOrder: 30,
});
```

## 17.2 Service Lifecycle

### 17.2.1 Status States

**State Machine**:

```
registered → initializing → healthy
                ↓              ↓
             error         degraded → healthy (recovery)
                ↓              ↓
            shutdown ← ← ← ← ← ← 
```

**Status Definitions**:

| Status | Meaning | Transitions |
| --- | --- | --- |
| `registered` | Service config stored, not yet initialized | → `initializing` (init starts) |
| `initializing` | Factory running, instance being created | → `healthy` (success), → `error` (failure), → `degraded` (timeout 5min) |
| `healthy` | Service operational, health checks passing | → `degraded` (health check fails), → `shutdown` (graceful shutdown) |
| `degraded` | Health checks failing, but instance exists | → `healthy` (recovery), → `error` (critical failure), → `shutdown` (forced) |
| `error` | Initialization failed or critical runtime error | → `shutdown` (cleanup) |
| `shutdown` | Service stopped, resources released | (terminal state) |

### 17.2.2 Initialization Flow

**Step 1: Registration** (before `initializeAll`)

```typescript
serviceRegistry.register({
  name: 'resource-manager',
  factory: resourceManagerFactory,
  startupOrder: 10, // Init early (low numbers first)
  dependencies: [], // No dependencies
  healthCheck: (instance) => instance.isHealthy(),
  healthCheckInterval: 60_000, // 1 minute
  shutdown: async (instance) => await instance.cleanup(),
});
```

**Step 2: Dependency Graph Resolution**

```typescript
// Registry builds graph:
{
  'resource-manager': [],
  'error-tracker': ['resource-manager'],
  'engine-cache': ['engine-read-db'],
  'engine-read-db': []
}

// Topological sort produces initialization order:
['resource-manager', 'engine-read-db', 'error-tracker', 'engine-cache', ...]
```

**Step 3: Circular Dependency Detection**

```typescript
// INVALID: Circular dependency detected
serviceA.dependencies = ['serviceB'];
serviceB.dependencies = ['serviceA'];

// Throws: "Circular dependency detected: serviceA -> serviceB -> serviceA"
```

**Step 4: Sequential Initialization** (follows resolved order)

```typescript
for (const serviceName of initializationOrder) {
  // Mark as initializing
  metadata.status = 'initializing';
  metadata.initializationStartedAt = new Date();
  
  // Resolve dependencies
  const deps = resolveDependencies(metadata.config.dependencies);
  
  // Call factory
  const instance = await metadata.config.factory(deps);
  
  // Mark as healthy
  metadata.instance = instance;
  metadata.status = 'healthy';
  metadata.stats.initializedAt = new Date();
}
```

**Initialization Timeout**: Services stuck in `initializing` for >5 minutes transition to `degraded`.

## 17.3 Dependency Injection

### 17.3.1 Dependency Declaration

**Example Service with Dependencies**:

```typescript
// Service depends on error-tracker and resource-manager
serviceRegistry.register({
  name: 'engine-write-buffer',
  factory: async (deps) => {
    const { errorTracker, resourceManager } = deps;
    return new EngineWriteBuffer({
      errorTracker,    // Injected dependency
      resourceManager, // Injected dependency
    });
  },
  dependencies: ['error-tracker', 'resource-manager'],
  startupOrder: 40,
});
```

### 17.3.2 Dependency Resolution

**Resolution Logic**:

```typescript
private resolveDependencies(dependencies: string[]): ServiceDependencies {
  const resolved: ServiceDependencies = {};
  
  for (const depName of dependencies) {
    const depMetadata = this.services.get(depName);
    
    if (!depMetadata) {
      throw new Error(`Dependency '${depName}' not found in registry`);
    }
    
    if (depMetadata.status !== 'healthy') {
      throw new Error(`Dependency '${depName}' is not healthy (status: ${depMetadata.status})`);
    }
    
    resolved[depName] = depMetadata.instance; // Inject instance
  }
  
  return resolved;
}
```

**Safety**: Dependencies MUST be `healthy` before dependent service can initialize.

### 17.3.3 Startup Order

**Priority Rules**:

1. **startupOrder number** (lower = earlier): `10` initializes before `50`
2. **Dependency graph**: Dependencies always initialize before dependents
3. **Topological sort**: Ensures safe initialization order even with complex graphs

**Example Order** (9 services registered in `src/index.ts`):

```typescript
// startupOrder 10
1. resource-manager (no dependencies)

// startupOrder 20
2. error-tracker (depends on resource-manager)

// startupOrder 30
3. engine-read-db (no dependencies)
4. engine-cache (depends on engine-read-db)

// startupOrder 40
5. engine-write-db (depends on error-tracker)
6. engine-write-buffer (depends on error-tracker, resource-manager)

// startupOrder 50
7. error-learning (depends on error-tracker)
8. resource-monitor (depends on resource-manager)
9. cache-facade (depends on error-tracker)
```

**Result**: Dependencies always ready when dependent service initializes.

## 17.4 Health Monitoring

### 17.4.1 Health Check Configuration

**Health Check Function**:

```typescript
healthCheck: (instance) => {
  // Return true if healthy, false if degraded
  return instance.isHealthy?.() ?? true;
}
```

**Automatic Scheduling**:

```typescript
// Default: 60 seconds
healthCheckInterval: 60_000,

// Custom: 30 seconds
healthCheckInterval: 30_000,
```

### 17.4.2 Health Check Execution

**Flow**:

```
Timer Fires → runHealthCheck()
   ↓
Check health function result
   ↓
   ├─ true → status = 'healthy' (or keep 'healthy')
   │         log recovery if was 'degraded'
   │
   └─ false → status = 'degraded' (if was 'healthy')
              stats.healthCheckFailures++
              log warning
```

**Special Case: Initialization Timeout**:

```typescript
if (metadata.status === 'initializing') {
  const initElapsed = Date.now() - metadata.initializationStartedAt.getTime();
  const timeout = 5 * 60 * 1000; // 5 minutes
  
  if (initElapsed > timeout) {
    // Timeout exceeded - mark as degraded
    metadata.status = 'degraded';
    log.warn("Service initialization timeout", { serviceName, initElapsed });
  } else {
    // Still within window - keep as 'initializing'
    log.info("Service still initializing", { serviceName, remainingMs: timeout - initElapsed });
  }
}
```

**Logger Auto-Refresh Delay**: Logger health checks disabled for first 10-20s after boot to avoid false "degraded" warnings during Service Registry initialization. See [Section 16: Boot Sequence](16-boot-sequence.md) § Phase 1.

### 17.4.3 Health Status API

**Get Health for Single Service**:

```typescript
const health = serviceRegistry.getHealth('engine-cache');
// Returns:
// {
//   name: 'engine-cache',
//   status: 'healthy',
//   uptime: 3600000,
//   lastHealthCheck: Date,
//   lastHealthCheckPassed: true,
//   healthCheckFailures: 0
// }
```

**Get Health for All Services**:

```typescript
const allHealth = serviceRegistry.getAllHealth();
// Returns:
// {
//   'resource-manager': { status: 'healthy', uptime: 3600000, ... },
//   'error-tracker': { status: 'healthy', uptime: 3600000, ... },
//   'engine-cache': { status: 'degraded', uptime: 3600000, healthCheckFailures: 3, ... },
//   ...
// }
```

**Registry Status Summary**:

```typescript
const status = serviceRegistry.getStatus();
// Returns:
// {
//   isInitialized: true,
//   isShuttingDown: false,
//   serviceCount: 9,
//   healthyCount: 8,
//   degradedCount: 1,
//   errorCount: 0
// }
```

## 17.5 Graceful Shutdown

### 17.5.1 Shutdown Order

**Reverse Initialization Order**: Services shut down in reverse of initialization order.

```
Initialization:  A → B → C → D
Shutdown:        D → C → B → A
```

**Why Reverse?**
- Dependencies shut down AFTER services that depend on them
- Prevents "dependency not available" errors during shutdown
- Safe resource cleanup without cascading failures

### 17.5.2 Shutdown Flow

**Trigger**: Process signals (SIGTERM, SIGINT) → automatic shutdown.

```typescript
private setupShutdownHandlers(): void {
  const handleShutdown = async (signal: string) => {
    log.info(`Received ${signal}, initiating graceful shutdown`);
    
    try {
      await this.shutdownAll();
      process.exit(0);
    } catch (error) {
      log.error('Shutdown failed', error);
      process.exit(1);
    }
  };
  
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}
```

**Shutdown Sequence**:

```typescript
async shutdownAll() {
  // 1. Stop all health checks
  for (const metadata of this.services.values()) {
    if (metadata.healthCheckTimer) {
      clearInterval(metadata.healthCheckTimer);
    }
  }
  
  // 2. Shutdown services in reverse order
  const shutdownOrder = [...this.initializationOrder].reverse();
  
  for (const serviceName of shutdownOrder) {
    await this.shutdownService(serviceName);
  }
}
```

**Per-Service Shutdown**:

```typescript
private async shutdownService(serviceName: string) {
  const metadata = this.services.get(serviceName);
  
  if (metadata.config.shutdown) {
    await metadata.config.shutdown(metadata.instance);
  }
  
  metadata.status = 'shutdown';
  metadata.stats.shutdownAt = new Date();
}
```

**Error Handling**: If one service shutdown fails, continue with remaining services (best-effort cleanup).

### 17.5.3 Shutdown Safety

**Idempotency**: Calling `shutdownAll()` multiple times is safe (guard flag `isShuttingDown`).

**Partial Shutdown**: If initialization fails midway, `shutdownAll()` cleans up any partially initialized services.

**Resource Cleanup**: Services implement cleanup logic in shutdown functions:

```typescript
// Example: EngineWriteBuffer shutdown
shutdown: async (instance) => {
  // Flush pending writes
  await instance.flush();
  
  // Close database connections
  await instance.close();
  
  // Clear timers
  instance.clearTimers();
}
```

## 17.6 Production Configuration (src/index.ts)

### 17.6.1 Registered Services

**9 Core Services** (as of 2025-11-19):

```typescript
const serviceRegistry = ServiceRegistry.getInstance();

// startupOrder 10
serviceRegistry.register({
  name: 'resource-manager',
  factory: () => new ResourceManager(),
  startupOrder: 10,
  dependencies: [],
  healthCheck: (instance) => instance.isHealthy(),
  shutdown: async (instance) => await instance.cleanup(),
});

// startupOrder 20
serviceRegistry.register({
  name: 'error-tracker',
  factory: (deps) => new ErrorTracker(deps['resource-manager']),
  startupOrder: 20,
  dependencies: ['resource-manager'],
  healthCheck: (instance) => instance.isOperational(),
});

// startupOrder 30
serviceRegistry.register({
  name: 'engine-read-db',
  factory: () => EngineReadDb.getInstance(),
  startupOrder: 30,
  healthCheck: (instance) => instance.isConnected(),
});

serviceRegistry.register({
  name: 'engine-cache',
  factory: (deps) => new EngineCache(deps['engine-read-db']),
  startupOrder: 30,
  dependencies: ['engine-read-db'],
  healthCheck: (instance) => instance.isCacheLoaded(),
});

// startupOrder 40
serviceRegistry.register({
  name: 'engine-write-db',
  factory: (deps) => EngineWriteDb.getInstance(deps['error-tracker']),
  startupOrder: 40,
  dependencies: ['error-tracker'],
  healthCheck: (instance) => instance.isConnected(),
  shutdown: async (instance) => await instance.close(),
});

serviceRegistry.register({
  name: 'engine-write-buffer',
  factory: (deps) => new EngineWriteBuffer(deps['error-tracker'], deps['resource-manager']),
  startupOrder: 40,
  dependencies: ['error-tracker', 'resource-manager'],
  healthCheck: (instance) => instance.isHealthy(),
  shutdown: async (instance) => await instance.flush(),
});

// startupOrder 50
serviceRegistry.register({
  name: 'error-learning',
  factory: (deps) => new ErrorLearningService(deps['error-tracker']),
  startupOrder: 50,
  dependencies: ['error-tracker'],
});

serviceRegistry.register({
  name: 'resource-monitor',
  factory: (deps) => new ResourceMonitor(deps['resource-manager']),
  startupOrder: 50,
  dependencies: ['resource-manager'],
  healthCheck: (instance) => instance.isMonitoring(),
});

serviceRegistry.register({
  name: 'cache-facade',
  factory: (deps) => new CacheFacade(deps['error-tracker']),
  startupOrder: 50,
  dependencies: ['error-tracker'],
  healthCheck: (instance) => instance.isReady(),
});

// Initialize all services
await serviceRegistry.initializeAll();
```

### 17.6.2 Service Retrieval

**Get Service Instance**:

```typescript
// In application code
import { ServiceRegistry } from '../shared/service-registry.js';

const serviceRegistry = ServiceRegistry.getInstance();
const engineCache = serviceRegistry.get('engine-cache');

// Use service
const pokemon = await engineCache.getPokemon(25); // Pikachu
```

**Type-Safe Retrieval**:

```typescript
const engineCache = serviceRegistry.get<EngineCache>('engine-cache');
// TypeScript knows engineCache is EngineCache type
```

## 17.7 Performance Characteristics

### 17.7.1 Initialization Timing

**Phase 1 (Service Registry)**: ~150ms production, ~100ms workstation

**Breakdown**:
- Service registration: <1ms per service (~9ms total)
- Dependency graph resolution: ~10ms
- Circular dependency detection: ~5ms
- Sequential initialization: ~130ms (varies by service factory complexity)
- Health check setup: <5ms

**See Also**: [Section 16: Boot Sequence](16-boot-sequence.md) § Phase 1 for complete timing breakdown.

### 17.7.2 Runtime Overhead

**Memory Footprint**:
- ServiceRegistry metadata: ~100 KB (9 services × ~10 KB each)
- Service instances: Varies by service (~50-200 MB total)
- Health check timers: 9 timers × ~100 bytes = <1 KB

**CPU Overhead**:
- Health checks: 9 services × 1 check/minute = 9 checks/minute (~0.1% CPU)
- Status queries: O(1) lookups via Map (<1μs)
- Dependency resolution: O(n) graph traversal (once at init, <10ms)

### 17.7.3 Scalability

**Service Count**: Tested with 9 services, designed for 50+ services.

**Dependency Depth**: Supports arbitrary depth (tested with 3-level chains).

**Initialization Parallelism**: Services with no dependencies could parallelize in future (currently sequential for predictability).

## 17.8 Error Handling

### 17.8.1 Initialization Failures

**Behavior**: If any service initialization fails, registry shuts down all partially initialized services.

```typescript
try {
  await serviceRegistry.initializeAll();
} catch (error) {
  log.error('Service initialization failed', error);
  // Registry automatically calls shutdownAll()
  process.exit(1);
}
```

**Example Error**: Missing dependency

```
Error: Service 'engine-cache' depends on 'engine-read-db' which is not registered
```

### 17.8.2 Runtime Failures

**Health Check Failures**: Service transitions to `degraded` state, but continues running.

**Critical Failures**: Service transitions to `error` state, shutdown may be required.

**Isolation**: One service failure doesn't cascade to others (each health check isolated).

## 17.9 Testing Patterns

### 17.9.1 Mock Services

**Pattern**: Register mock services for testing.

```typescript
// test.ts
import { ServiceRegistry } from '../shared/service-registry.js';

beforeEach(() => {
  ServiceRegistry.resetInstance(); // Clear singleton
  
  const registry = ServiceRegistry.getInstance();
  
  registry.register({
    name: 'engine-cache',
    factory: () => ({
      getPokemon: vi.fn().mockResolvedValue({ id: 25, name: 'Pikachu' }),
      isCacheLoaded: () => true,
    }),
    startupOrder: 10,
  });
  
  await registry.initializeAll();
});
```

### 17.9.2 Dependency Injection Testing

**Pattern**: Inject test dependencies via registry.

```typescript
// Register mock dependency
registry.register({
  name: 'error-tracker',
  factory: () => ({
    track: vi.fn(),
    isOperational: () => true,
  }),
  startupOrder: 10,
});

// Service under test receives mock
registry.register({
  name: 'service-under-test',
  factory: (deps) => new ServiceUnderTest(deps['error-tracker']),
  dependencies: ['error-tracker'],
  startupOrder: 20,
});

await registry.initializeAll();

const service = registry.get('service-under-test');
// service.errorTracker is the mock
```

## 17.10 Future Enhancements

### 17.10.1 Parallel Initialization

**Opportunity**: Services with no inter-dependencies could initialize in parallel.

```typescript
// Current: Sequential
for (const serviceName of initializationOrder) {
  await initializeService(serviceName);
}

// Future: Parallel batches
const batches = groupByDependencyLevel(initializationOrder);
for (const batch of batches) {
  await Promise.all(batch.map(name => initializeService(name)));
}
```

**Benefit**: Reduce Phase 1 timing from ~150ms to ~50-80ms (3x faster).

### 17.10.2 Service Hot Reload

**Opportunity**: Reload service instances without full restart.

```typescript
await serviceRegistry.reload('engine-cache');
// Shuts down old instance, creates new instance, updates dependencies
```

**Use Case**: Configuration changes, code updates without downtime.

### 17.10.3 Service Metrics Dashboard

**Opportunity**: Web UI showing service health, dependencies, timing.

```
GET /ops/services
→ {
    "resource-manager": { status: "healthy", uptime: 3600000, ... },
    "error-tracker": { status: "degraded", healthCheckFailures: 3, ... },
    ...
  }
```

**See Also**: [Section 10: Discord Bot](10-discord-bot.md) § `/ops` commands for admin interface.

---

**See Also**:
- [Section 16: Boot Sequence](16-boot-sequence.md) — Complete boot flow including Service Registry initialization
- [Section 6: Error System](06-error-system.md) — Error tracking service integration
- [Section 13: Performance](13-performance.md) — Optimization strategies including registry parallelization
- [Section 11: Safety Guarantees](11-safety-guarantees.md) — Logger auto-refresh delay during registry init

---

[← Back to INDEX](INDEX.md) | [← Previous: Boot Sequence](16-boot-sequence.md)
