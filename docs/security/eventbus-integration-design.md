# Security Bot EventBus Integration Design

**Status:** Design Phase  
**Priority:** HIGH  
**Created:** 2025-12-01  
**Owner:** System Architect

---

## Executive Summary

Convert the security bot from direct Discord.js event handling to centralized EventBus integration, enabling:
- **Correlation tracking** across all security operations
- **Pattern-based event routing** for coordinated attack detection
- **Centralized logging** with replay capability
- **Backpressure management** during high-load scenarios

---

## Current Architecture

### Discord.js Event Handlers (Direct)
```javascript
// src/bot/main.js
client.once(Events.ClientReady, async () => {
  // Initialize state, baselines, sweeps
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Handle slash commands
});

client.on(Events.GuildCreate, () => {
  // Update guild count
});

client.on(Events.GuildDelete, () => {
  // Update guild count
});
```

### Security Operations (No EventBus)
- **Role changes:** Direct Discord API → roleArchive
- **Permission drift:** integrityVerifier → manual alerting
- **Threat detection:** threatDetector → console logs
- **Guild sweeps:** setInterval → no correlation tracking

**Problems:**
1. No correlation IDs (can't trace operation chains)
2. No event replay (debugging coordination attacks)
3. No backpressure control (overwhelms during mass role changes)
4. Fragmented logging (console, Drip alerts, role archive)

---

## Proposed Architecture

### Event Flow
```
Discord.js Event → EventBus.emit() → Pattern Subscribers
                                    ↓
                    ┌───────────────┴───────────────┐
                    │                               │
                    ↓                               ↓
            Security Modules              Centralized Logger
            (baselines, threats,          (structured logs,
             integrity, response)          correlation IDs)
```

### Event Topics (Namespace Design)

#### **1. Security Operations** (`security.*`)
```typescript
'security.baseline.generated'      // Baseline refresh complete
'security.baseline.failed'         // Baseline generation error
'security.threat.detected'         // Threat identified
'security.threat.resolved'         // Threat cleared
'security.integrity.check'         // Integrity verification started
'security.integrity.passed'        // No drift detected
'security.integrity.failed'        // Drift/corruption found
'security.response.triggered'      // Automated response action
'security.response.completed'      // Response action finished
```

#### **2. Role Management** (`role.*`)
```typescript
'role.changed'                     // Role permissions modified
'role.created'                     // New role added
'role.deleted'                     // Role removed
'role.drift.detected'              // Permission drift identified
'role.reverted'                    // Unauthorized change reverted
```

#### **3. Guild Operations** (`guild.*`)
```typescript
'guild.sweep.started'              // Guild sweep initiated
'guild.sweep.completed'            // Guild sweep finished
'guild.member.fetched'             // Member data retrieved
'guild.joined'                     // Bot added to guild
'guild.left'                       // Bot removed from guild
```

#### **4. Alert System** (`alert.*`)
```typescript
'alert.critical'                   // Critical severity alert
'alert.high'                       // High severity alert
'alert.medium'                     // Medium severity alert
'alert.low'                        // Low severity alert
'alert.drip.sent'                  // Drip notification sent
'alert.drip.failed'                // Drip notification failed
```

---

## Implementation Plan

### Phase 1: Non-Breaking Integration Layer (Week 1)

**Objective:** Add EventBus alongside existing code without breaking functionality.

#### Step 1.1: Create EventBus Adapter
```javascript
// src/bot/eventbus-adapter.js

import { EventBus } from '../shared/event-bus.js';

const bus = EventBus.getInstance();

/**
 * Emit security event with automatic correlation tracking
 */
export function emitSecurityEvent(topic, payload, options = {}) {
  return bus.emit(`security.${topic}`, {
    ...payload,
    timestamp: new Date().toISOString(),
    source: 'security-bot',
  }, {
    emitter: 'security-bot',
    ...options,
  });
}

/**
 * Emit role change event
 */
export function emitRoleEvent(topic, roleData, options = {}) {
  return bus.emit(`role.${topic}`, {
    roleId: roleData.id,
    roleName: roleData.name,
    guildId: roleData.guild.id,
    guildName: roleData.guild.name,
    permissions: roleData.permissions.toArray(),
    timestamp: new Date().toISOString(),
  }, {
    emitter: 'security-bot',
    ...options,
  });
}

/**
 * Emit guild operation event
 */
export function emitGuildEvent(topic, guildData, options = {}) {
  return bus.emit(`guild.${topic}`, {
    guildId: guildData.id,
    guildName: guildData.name,
    timestamp: new Date().toISOString(),
  }, {
    emitter: 'security-bot',
    ...options,
  });
}

/**
 * Emit alert event (replaces Drip alert TODOs)
 */
export function emitAlert(severity, message, data = {}, options = {}) {
  return bus.emit(`alert.${severity}`, {
    message,
    data,
    timestamp: new Date().toISOString(),
  }, {
    emitter: 'security-bot',
    priority: severity === 'critical' ? 'high' : 'normal',
    ...options,
  });
}
```

#### Step 1.2: Subscribe to Events (Logger Integration)
```javascript
// src/bot/eventbus-subscriptions.js

import { EventBus } from '../shared/event-bus.js';
import { log } from './main.js';

const bus = EventBus.getInstance();

/**
 * Initialize all EventBus subscriptions for security bot
 */
export function initializeEventBusSubscriptions() {
  // Log all security events
  bus.subscribe('security.**', (event) => {
    log('info', `[EventBus] ${event.topic}`, {
      correlationId: event.correlationId,
      payload: event.payload,
    });
  }, { priority: 10 });
  
  // Log all alerts
  bus.subscribe('alert.*', (event) => {
    const level = event.topic.split('.')[1]; // critical, high, medium, low
    log(level === 'critical' || level === 'high' ? 'error' : 'warn', 
        `[Alert] ${event.payload.message}`, {
      correlationId: event.correlationId,
      severity: level,
      data: event.payload.data,
    });
  }, { priority: 5 });
  
  // Track role changes
  bus.subscribe('role.changed', (event) => {
    log('info', '[Role Change] Detected', {
      correlationId: event.correlationId,
      roleId: event.payload.roleId,
      roleName: event.payload.roleName,
      guildName: event.payload.guildName,
    });
  }, { priority: 0 });
  
  // Track guild sweeps
  bus.subscribe('guild.sweep.*', (event) => {
    const action = event.topic.split('.')[2]; // started, completed
    log('info', `[Guild Sweep] ${action}`, {
      correlationId: event.correlationId,
      guildName: event.payload.guildName,
    });
  }, { priority: 0 });
}
```

#### Step 1.3: Integrate into Existing Code (Non-Breaking)
```javascript
// src/bot/main.js (example integration)

import { emitSecurityEvent, emitRoleEvent, emitGuildEvent } from './eventbus-adapter.js';
import { initializeEventBusSubscriptions } from './eventbus-subscriptions.js';

client.once(Events.ClientReady, async () => {
  // Initialize EventBus subscriptions
  initializeEventBusSubscriptions();
  
  // Existing code...
  botState = await initializeState();
  
  // NEW: Emit baseline generation event
  emitSecurityEvent('baseline.generated', {
    confidence: baselines.confidenceLevel,
    dataPoints: baselines.dataPointCount,
  });
  
  // Existing code continues...
});
```

### Phase 2: Drip Alert Centralization (Week 2)

**Objective:** Replace 4 Drip alert TODOs with EventBus-based alert dispatcher.

#### Implementation
```javascript
// src/bot/alert-dispatcher.js

import { EventBus } from '../shared/event-bus.js';
import { DRIP_ALERT_RECIPIENT } from '../config/env.js';

const bus = EventBus.getInstance();

/**
 * Centralized alert dispatcher (replaces Drip alert TODOs)
 */
export function initializeAlertDispatcher() {
  // Subscribe to all alerts
  bus.subscribe('alert.*', async (event) => {
    const severity = event.topic.split('.')[1];
    const { message, data } = event.payload;
    
    // Route to Drip alerts based on severity
    if (severity === 'critical' || severity === 'high') {
      await sendDripAlert(severity, message, data, event.correlationId);
    }
    
    // Also log to console (existing behavior)
    console.log(`[Alert ${severity}] ${message}`, data);
  }, {
    priority: 10, // High priority for alerts
    maxQueueSize: 500, // Prevent alert flooding
  });
}

/**
 * Send Drip alert via DM
 */
async function sendDripAlert(severity, message, data, correlationId) {
  if (!DRIP_ALERT_RECIPIENT) return;
  
  try {
    const user = await client.users.fetch(DRIP_ALERT_RECIPIENT);
    const emoji = severity === 'critical' ? '🚨' : '⚠️';
    
    await user.send({
      content: `${emoji} **${severity.toUpperCase()} ALERT**\n${message}`,
      embeds: [{
        color: severity === 'critical' ? 0xFF0000 : 0xFF8C00,
        fields: [
          { name: 'Correlation ID', value: correlationId, inline: true },
          { name: 'Timestamp', value: new Date().toISOString(), inline: true },
          ...Object.entries(data).map(([key, value]) => ({
            name: key,
            value: String(value),
            inline: true,
          })),
        ],
      }],
    });
    
    // Emit success event
    bus.emit('alert.drip.sent', {
      severity,
      recipient: DRIP_ALERT_RECIPIENT,
      correlationId,
    }, {
      emitter: 'alert-dispatcher',
      parentCorrelationId: correlationId,
    });
  } catch (error) {
    // Emit failure event
    bus.emit('alert.drip.failed', {
      severity,
      error: error.message,
      correlationId,
    }, {
      emitter: 'alert-dispatcher',
      parentCorrelationId: correlationId,
    });
  }
}
```

**Replace TODOs:**
1. `src/bot/state/roleArchive.js:171` → `emitAlert('high', 'Role archive HMAC verification failed', data)`
2. `src/bot/state/roleArchive.js:387` → `emitAlert('medium', 'Unauthorized role change detected', data)`
3. `src/bot/state/threatResponse.js:491` → `emitAlert('critical', 'Threat response triggered', data)`
4. `src/bot/main.js:2579, 2588` → `emitAlert('critical'/'high', message, data)`

### Phase 3: Correlation Tracking (Week 3)

**Objective:** Add correlation IDs to all security operations for tracing.

#### Example: Role Change Chain
```javascript
// 1. Discord role update detected
const correlationId = emitRoleEvent('changed', role);

// 2. Integrity check triggered (child event)
emitSecurityEvent('integrity.check', { roleId: role.id }, {
  parentCorrelationId: correlationId,
});

// 3. Threat detected (grandchild event)
emitSecurityEvent('threat.detected', {
  roleId: role.id,
  severity: 'HIGH',
  reason: 'Unauthorized permission escalation',
}, {
  parentCorrelationId: correlationId, // Traces back to original change
});

// 4. Response triggered (great-grandchild event)
emitSecurityEvent('response.triggered', {
  action: 'revert',
  roleId: role.id,
}, {
  parentCorrelationId: correlationId, // Full operation chain visible
});
```

**Event Replay for Debugging:**
```javascript
// Get all events related to specific role change
const bus = EventBus.getInstance();
const events = bus.replay('security.**', sinceLast5Minutes);
console.log(events.filter(e => e.correlationId.startsWith(targetCorrelationId)));
```

### Phase 4: Performance Optimization (Week 4)

**Objective:** Tune EventBus for production load.

#### Backpressure Configuration
```javascript
// High-frequency events (role changes during mass updates)
bus.subscribe('role.changed', handler, {
  maxQueueSize: 10000, // Handle burst of role changes
  priority: 5,
});

// Low-frequency events (baseline generation)
bus.subscribe('security.baseline.generated', handler, {
  maxQueueSize: 100,
  priority: 10, // Process baselines first
});
```

#### Monitoring
```javascript
// Expose EventBus stats via /ops command
const stats = bus.getStats();
console.log({
  eventsEmitted: stats.eventsEmitted,
  subscriptionsActive: stats.subscriptionsActive,
  backpressureEvents: stats.backpressureEvents,
  averageHandlerLatency: stats.averageHandlerLatency,
});
```

---

## Migration Strategy

### Week 1: Non-Breaking Integration
- ✅ Add EventBus adapter
- ✅ Add subscriptions for logging
- ✅ Emit events alongside existing code
- ✅ No changes to existing behavior

### Week 2: Drip Alert Centralization
- ✅ Replace 4 TODO stubs
- ✅ Centralize alert routing
- ✅ Add correlation IDs to alerts

### Week 3: Full Integration
- ✅ Add correlation tracking to all operations
- ✅ Enable event replay for debugging
- ✅ Remove redundant logging code

### Week 4: Optimization & Monitoring
- ✅ Tune backpressure limits
- ✅ Add EventBus stats to /ops command
- ✅ Performance benchmarking

---

## Benefits

### 1. **Correlation Tracking**
- Trace entire operation chains (role change → threat detection → response)
- Debug coordinated attacks by replaying related events

### 2. **Centralized Logging**
- All security events flow through one system
- Structured logs with correlation IDs
- Event replay for post-mortem analysis

### 3. **Backpressure Management**
- Prevent memory leaks during mass role changes
- Queue limits per subscriber
- Graceful degradation under load

### 4. **Pattern-Based Routing**
- Subscribe to `security.**` for all security events
- Subscribe to `alert.critical` for urgent-only
- Flexible event filtering

### 5. **Alert Centralization**
- Replace 4 Drip alert TODOs with single dispatcher
- Consistent alert formatting
- Correlation IDs in all alerts

---

## Risk Mitigation

### 1. **Non-Breaking Changes**
- Phase 1 adds EventBus alongside existing code
- No removal of working functionality
- Gradual migration over 4 weeks

### 2. **Performance Impact**
- EventBus adds <1ms overhead per event
- Backpressure prevents memory leaks
- Monitoring via `/ops eventbus` command

### 3. **Testing Strategy**
- Unit tests for adapter functions
- Integration tests for event chains
- Load testing for backpressure limits

---

## Next Steps

1. ✅ Review and approve design
2. ⏳ Create `src/bot/eventbus-adapter.js` (Phase 1.1)
3. ⏳ Create `src/bot/eventbus-subscriptions.js` (Phase 1.2)
4. ⏳ Integrate into `client.once(Events.ClientReady)` (Phase 1.3)
5. ⏳ Test non-breaking integration
6. ⏳ Proceed to Phase 2 (Drip alert centralization)

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-01  
**Status:** READY FOR IMPLEMENTATION
