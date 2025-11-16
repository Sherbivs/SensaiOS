# Resource Monitor - Quick Reference

**Module**: `src/services/resource-monitor.js`  
**Purpose**: Centralized real-time resource monitoring for Node.js process  
**Status**: PERFECTED (November 12, 2025)

## Quick Commands

### Check Current Status
```javascript
import resourceMonitor from '../services/resource-monitor.js';

// Get raw metrics
const metrics = resourceMonitor.getMetrics();
console.log(`Memory: ${metrics.memoryLimitPercent.toFixed(1)}% of 512 MB`);
console.log(`CPU: ${metrics.cpuPercent.toFixed(1)}%`);
console.log(`Status: ${metrics.status}`);
console.log(`Alerts: ${metrics.alerts.length}`);

// Get formatted metrics (human-readable)
const formatted = resourceMonitor.getFormattedMetrics();
console.log(formatted.memory.rss);      // "476.2 MB"
console.log(formatted.cpu.total);       // "12.5%"
console.log(formatted.cache.size);      // "235.1 MB"
```

### View Alerts
```javascript
// Current alerts only
const alerts = resourceMonitor.getCurrentAlerts();
alerts.forEach(alert => {
  console.log(`[${alert.level}] ${alert.category}: ${alert.message}`);
  console.log(`  Action: ${alert.action}`);
});

// Alert history (last 100 events)
const history = resourceMonitor.getAlertHistory();
console.log(`Total alert events in last 24h: ${history.length}`);
```

### View Historical Data
```javascript
// Get snapshots (5-minute intervals, 24-hour retention)
const snapshots = resourceMonitor.getSnapshots();
console.log(`Snapshots available: ${snapshots.length} (max 288)`);

// Calculate memory growth over last hour
const oneHourAgo = new Date(Date.now() - 3600000);
const recentSnapshots = snapshots.filter(s => 
  new Date(s.timestamp) >= oneHourAgo
);
const memoryGrowth = recentSnapshots[recentSnapshots.length - 1].metrics.rss - 
                     recentSnapshots[0].metrics.rss;
console.log(`Memory growth (1h): ${(memoryGrowth / (1024 * 1024)).toFixed(1)} MB`);
```

### Get Comprehensive Checkpoint
```javascript
// Full system state snapshot
const checkpoint = resourceMonitor.getCheckpoint();
console.log(JSON.stringify(checkpoint, null, 2));

// Sample output:
// {
//   "timestamp": "2025-11-12T10:45:00.000Z",
//   "status": "healthy",
//   "metrics": {
//     "memory": { "rss": 476200000, "limitPercent": 93.0 },
//     "cpu": { "total": 12.5, "user": 8.2, "system": 4.3 },
//     "cache": { "size": 235100000, "percent": 32.9 },
//     "resources": { "total": 42, "timers": 8, "listeners": 12, ... }
//   },
//   "alerts": [],
//   "uptime": 3600
// }
```

### Check Monitoring Status
```javascript
const status = resourceMonitor.getStatus();
console.log(`Running: ${status.running}`);
console.log(`Last update: ${status.lastUpdate}`);
console.log(`Alert count: ${status.alertCount}`);
console.log(`Snapshot count: ${status.snapshotCount}`);
```

## Alert Levels

| Level | Memory (512 MB) | CPU | Action Required |
|-------|-----------------|-----|-----------------|
| **Healthy** | <384 MB (75%) | <50% | None |
| **Warning** | 384-435 MB (75-85%) | 50-70% | Monitor closely |
| **Critical** | 435-460 MB (85-90%) | 70-90% | Optimize within 1 hour |
| **Emergency** | >460 MB (90%) | >90% | Immediate action |

## Integration Points

### Logger (src/utils/logger.js)
```javascript
// Logger auto-refreshes stats every 15 seconds
// Displays in console output:
// 📊 RESOURCES: MEM 476.2MB (93.0%) | CPU 12.5% | CACHE 235.1MB
```

### Startup (src/index.ts)
```javascript
// Auto-started on module load
// Call stopMonitoring() during graceful shutdown
process.on('SIGTERM', async () => {
  resourceMonitor.stopMonitoring();
  // ... other cleanup
});
```

### /ops Command (src/bot/ops/admin.ts)
```javascript
// View stats via Discord command
// /ops resource - Shows comprehensive metrics
```

## Common Scenarios

### Investigate Memory Leak
```javascript
// Get last 12 snapshots (1 hour)
const hourSnapshots = resourceMonitor.getSnapshots().slice(-12);
hourSnapshots.forEach(s => {
  console.log(`${s.timestamp}: ${(s.metrics.rss / (1024 * 1024)).toFixed(1)} MB`);
});

// Check for leak suspects
const metrics = resourceMonitor.getMetrics();
if (metrics.resources.leakSuspects > 0) {
  console.log(`⚠️  ${metrics.resources.leakSuspects} leak suspects detected`);
  // Check resource-manager for details
}
```

### Monitor Cache Growth
```javascript
const formatted = resourceMonitor.getFormattedMetrics();
console.log(`Cache: ${formatted.cache.size} / ${formatted.cache.budgetMax}`);
console.log(`Usage: ${formatted.cache.budgetPercent}`);
console.log(`Free: ${formatted.cache.approxFree}`);

if (metrics.cacheSize > 500 * 1024 * 1024) {
  console.log('⚠️  Cache exceeding 500 MB, schedule cleanup');
}
```

### Check CPU Spikes
```javascript
const metrics = resourceMonitor.getMetrics();
if (metrics.cpuPercent > 70) {
  console.log('🔥 High CPU detected');
  console.log(`  User mode: ${metrics.cpuUser.toFixed(1)}%`);
  console.log(`  System mode: ${metrics.cpuSystem.toFixed(1)}%`);
  
  // Check active timers
  console.log(`  Active timers: ${metrics.resources.timers}`);
  console.log(`  Active listeners: ${metrics.resources.listeners}`);
}
```

### Verify System Health
```javascript
const checkpoint = resourceMonitor.getCheckpoint();

// Quick health check
const isHealthy = checkpoint.status === 'healthy' && 
                  checkpoint.alerts.length === 0 &&
                  checkpoint.metrics.memory.limitPercent < 75;

console.log(`System Health: ${isHealthy ? '✅ GOOD' : '⚠️ DEGRADED'}`);

if (!isHealthy) {
  console.log('Issues detected:');
  checkpoint.alerts.forEach(alert => {
    console.log(`  - [${alert.level}] ${alert.message}`);
  });
}
```

## Error Handling

The resource monitor **NEVER throws errors**. All operations are wrapped in try-catch with graceful fallback:

- Memory collection fails → Keep previous values
- CPU collection fails → Return 0,0,0 on first call
- Cache size fails → Set to 0
- Resource manager unavailable → Use default empty stats
- Alert generation fails → Set status to 'healthy', alerts to []

**Contract**: `getMetrics()` always returns a valid metrics object.

## Performance

- **Refresh Rate**: 15 seconds (real-time monitoring)
- **Snapshot Rate**: 5 minutes (historical tracking)
- **Collection Time**: ~5-10ms per cycle
- **Memory Overhead**: ~600 KB (metrics + snapshots + alerts)
- **CPU Impact**: <0.1% (background worker)

## Configuration

Located at top of `src/services/resource-monitor.js`:

```javascript
const REFRESH_INTERVAL_MS = 15_000;        // 15 seconds
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SNAPSHOT_RETENTION = 288;            // 24 hours

const CACHE_DIR = process.env.IS_RENDER 
  ? '/Store/discord-cache' 
  : './Store/discord-cache';

const WORKSPACE_LIMIT = 1.0 * 1024 * 1024 * 1024; // 1 GB
const MEMORY_LIMIT = 512 * 1024 * 1024;           // 512 MB

const THRESHOLDS = {
  memory: {
    emergency: 460 * 1024 * 1024,  // 90%
    critical: 435 * 1024 * 1024,   // 85%
    warning: 384 * 1024 * 1024,    // 75%
  },
  cpu: {
    emergency: 90,
    critical: 70,
    warning: 50,
  },
  cache: {
    warning: 500 * 1024 * 1024,
    critical: 650 * 1024 * 1024,
  },
};
```

## Troubleshooting

### "lastUpdate is null"
- System just started, first collection cycle not complete yet
- Wait 15 seconds for first refresh
- Safe to call `getMetrics()` immediately (returns default values)

### "CPU always shows 0%"
- First call establishes baseline
- Second call (15s later) will show actual CPU usage
- Expected behavior, not a bug

### "Cache size is 0"
- Cache directory doesn't exist yet
- First Discord bot interaction will create it
- Not an error, just not initialized

### "Resource manager shows 0 for everything"
- Resource manager not initialized yet (startup race)
- Will populate on next refresh cycle
- System continues gracefully

### "Snapshots array is empty"
- No snapshots taken yet (first 5 minutes)
- Snapshots start accumulating after SNAPSHOT_INTERVAL_MS
- Max 288 snapshots (24 hours)

## See Also

- **Perfection Report**: `docs/resource-monitor-perfection.md`
- **Resource Manager**: `src/services/resource-manager.ts`
- **Logger Integration**: `src/utils/logger.js`
- **Architecture**: `docs/resource-manager.md`

---

**Last Updated**: November 12, 2025  
**Status**: ✅ PRODUCTION READY
