# Discord Bot Observability Patterns — Infinity Gauntlet

> **Created:** 2025-12-28  
> **Status:** AUTHORITATIVE  
> **Purpose:** Discord-specific monitoring patterns and anti-patterns  
> **Audience:** Developers, SREs, AI Agents

---

## 📋 Overview

Discord bots have unique observability challenges:
- **High cardinality risk** — User IDs, guild IDs, channel IDs
- **Ephemeral state** — Bot restarts lose memory
- **Rate limits** — Discord API constraints
- **Gateway events** — WebSocket state machine

This document defines patterns specific to Infinity Gauntlet's Discord bot monitoring.

---

## 1. Cardinality Discipline for Discord

### 1.1 ⚠️ Critical Anti-Pattern: IDs as Labels

**NEVER do this:**
```promql
# ❌ BAD: Explodes cardinality
commands_total{user_id="123456789", guild_id="987654321"}
```

**WHY:** A bot with 10,000 users × 100 guilds × 50 commands = **50 million** unique series. Prometheus/Grafana Cloud will throttle or bill you heavily.

### 1.2 ✅ Correct Pattern: IDs as Log Fields

```logql
# ✅ GOOD: Filter logs by user_id FIELD (not label)
{service="bot"} | json | user_id="123456789"

# ✅ GOOD: Count commands with user as field
{service="bot"} | json | event_type="command" | line_format "{{.command}}"
```

### 1.3 Safe Discord Labels (Low Cardinality)

| Label | Max Values | Safe? | Notes |
|-------|------------|-------|-------|
| `command_name` | ~50 | ✅ | Finite command set |
| `interaction_type` | 5 | ✅ | command, button, select, modal, autocomplete |
| `error_code` | ~20 | ✅ | Discord error codes |
| `shard_id` | ~10 | ✅ | Only if sharding |
| `guild_size_bucket` | 5 | ✅ | small/medium/large/huge/mega |

### 1.4 Dangerous Discord Labels (Avoid)

| Label | Cardinality | Solution |
|-------|-------------|----------|
| `user_id` | Unbounded | Log field only |
| `guild_id` | Growing | Log field, or use `guild_size_bucket` |
| `channel_id` | Unbounded | Log field only |
| `message_id` | Unbounded | Log field only |
| `username` | Unbounded | NEVER use (user-controlled) |

---

## 2. Discord-Specific Metrics

### 2.1 Gateway Health

```promql
# Gauge: WebSocket connection state
discord_gateway_state{shard="0"}
# Values: 0=disconnected, 1=connecting, 2=ready, 3=resuming

# Counter: Gateway reconnections
discord_gateway_reconnects_total{shard="0", reason="heartbeat_timeout"}
discord_gateway_reconnects_total{shard="0", reason="session_invalid"}

# Gauge: Gateway latency (heartbeat ACK)
discord_gateway_latency_ms{shard="0"}

# Histogram: Event processing time
discord_event_duration_seconds{event_type="MESSAGE_CREATE"}
discord_event_duration_seconds{event_type="INTERACTION_CREATE"}
```

### 2.2 Command Metrics

```promql
# Counter: Commands by name and outcome
infinity_gauntlet_commands_total{command="battle", status="success"}
infinity_gauntlet_commands_total{command="battle", status="error"}
infinity_gauntlet_commands_total{command="battle", status="rate_limited"}

# Histogram: Command execution time
infinity_gauntlet_command_duration_seconds{command="battle"}

# Gauge: Commands in flight
infinity_gauntlet_commands_active{command="battle"}
```

### 2.3 Rate Limit Metrics

```promql
# Counter: Rate limit hits
discord_ratelimit_total{endpoint="/channels", bucket="channel_messages"}

# Gauge: Current rate limit state
discord_ratelimit_remaining{bucket="global"}
discord_ratelimit_reset_after_ms{bucket="global"}

# Counter: Requests by endpoint
discord_api_requests_total{endpoint="/channels/:id/messages", method="POST"}
```

### 2.4 Cache Metrics

```promql
# Gauge: Discord.js cache sizes
discord_cache_size{type="guilds"}
discord_cache_size{type="users"}
discord_cache_size{type="channels"}
discord_cache_size{type="messages"}

# Gauge: Cache memory estimate
discord_cache_memory_bytes
```

---

## 3. Bot State Machine

### 3.1 Lifecycle States

```
                    ┌─────────────┐
                    │   OFFLINE   │
                    └──────┬──────┘
                           │ login()
                           ▼
                    ┌─────────────┐
                    │  CONNECTING │
                    └──────┬──────┘
                           │ READY event
                           ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  RESUMING   │◄────│    READY    │────►│  DEGRADED   │
└──────┬──────┘     └─────────────┘     └──────┬──────┘
       │                   ▲                    │
       │                   │ reconnect          │
       │                   │                    │
       └───────────────────┼────────────────────┘
                           │
                    ┌──────┴──────┐
                    │   OFFLINE   │
                    └─────────────┘
                           │ SIGTERM
                           ▼
                    ┌─────────────┐
                    │  SHUTDOWN   │
                    └─────────────┘
```

### 3.2 State Metric

```promql
# Gauge: Current bot state (enum)
discord_bot_state{state="ready"}        1
discord_bot_state{state="connecting"}   0
discord_bot_state{state="degraded"}     0
discord_bot_state{state="offline"}      0
```

### 3.3 State Transitions as Events

```json
{
  "event_type": "bot.state_change",
  "from_state": "connecting",
  "to_state": "ready",
  "duration_ms": 2345,
  "reason": "initial_connect",
  "shard_id": 0
}
```

---

## 4. Infinity Gauntlet Specific

### 4.1 Battle System Metrics

```promql
# Counter: Battle outcomes
battle_completed_total{outcome="player_win"}
battle_completed_total{outcome="opponent_win"}
battle_completed_total{outcome="forfeit"}
battle_completed_total{outcome="timeout"}

# Histogram: Battle duration
battle_duration_seconds

# Gauge: Active battles
battle_active_count

# Counter: Type effectiveness distribution
battle_type_effectiveness_total{effectiveness="super"}
battle_type_effectiveness_total{effectiveness="not_very"}
battle_type_effectiveness_total{effectiveness="immune"}
```

### 4.2 Encounter System Metrics

```promql
# Counter: Encounters by rarity
encounter_spawns_total{rarity="common"}
encounter_spawns_total{rarity="uncommon"}
encounter_spawns_total{rarity="rare"}
encounter_spawns_total{rarity="ultra_rare"}

# Counter: Catch outcomes
catch_attempts_total{outcome="success"}
catch_attempts_total{outcome="fled"}
catch_attempts_total{outcome="broke_free"}

# Histogram: Time to catch
catch_duration_seconds
```

### 4.3 Homestead Channel Metrics

```promql
# Counter: Channel operations
homestead_channel_operations_total{operation="created"}
homestead_channel_operations_total{operation="deleted"}
homestead_channel_operations_total{operation="accessed"}

# Gauge: Active homesteads
homestead_channels_active

# Histogram: Channel creation latency
homestead_channel_creation_seconds
```

### 4.4 Security Bot Metrics

```promql
# Counter: Security sweeps
security_sweeps_total{result="clean"}
security_sweeps_total{result="issues_found"}

# Counter: Permission changes detected
security_permission_changes_total{type="role_added"}
security_permission_changes_total{type="role_removed"}
security_permission_changes_total{type="permission_modified"}

# Counter: Automatic reverts
security_auto_reverts_total{success="true"}
security_auto_reverts_total{success="false"}

# Gauge: Guilds monitored
security_monitored_guilds
```

---

## 5. Logging Patterns

### 5.1 Command Execution Log

```json
{
  "timestamp": "2025-12-28T12:34:56.789Z",
  "level": "info",
  "service": "bot",
  "event_type": "command.executed",
  
  "command": {
    "name": "battle",
    "type": "slash_command",
    "options": {
      "opponent": "123456789"
    }
  },
  
  "context": {
    "user_id": "987654321",
    "guild_id": "555555555",
    "channel_id": "666666666",
    "interaction_id": "777777777"
  },
  
  "execution": {
    "duration_ms": 234,
    "status": "success",
    "deferred": true
  },
  
  "correlation_id": "abc123def456"
}
```

### 5.2 Battle Event Log

```json
{
  "timestamp": "2025-12-28T12:35:00.123Z",
  "level": "info",
  "service": "bot",
  "event_type": "battle.turn",
  
  "battle": {
    "id": "battle-uuid-here",
    "turn_number": 5,
    "phase": "action_selection"
  },
  
  "action": {
    "type": "move",
    "attacker": {
      "trainer_id": "987654321",
      "pokemon": "Pikachu",
      "hp_before": 80,
      "hp_after": 80
    },
    "defender": {
      "trainer_id": "123456789",
      "pokemon": "Charmander",
      "hp_before": 65,
      "hp_after": 20
    },
    "move": "Thunderbolt",
    "damage": 45,
    "effectiveness": "super_effective",
    "critical": false
  },
  
  "correlation_id": "abc123def456"
}
```

### 5.3 Error Log

```json
{
  "timestamp": "2025-12-28T12:35:05.456Z",
  "level": "error",
  "service": "bot",
  "event_type": "error",
  
  "error": {
    "type": "pokemon_not_found",
    "message": "Pokemon with ID 999 not found in dex",
    "code": "DEX_LOOKUP_FAILED",
    "stack": "Error: Pokemon not found\n    at getPokemon (dexpack.js:123)\n    ..."
  },
  
  "context": {
    "user_id": "987654321",
    "command": "battle",
    "pokemon_id": 999
  },
  
  "recovery": {
    "action": "return_error_message",
    "user_notified": true
  },
  
  "correlation_id": "abc123def456"
}
```

---

## 6. Dashboard Panels (Grafana)

### 6.1 Bot Overview Dashboard

| Panel | Type | Query |
|-------|------|-------|
| Bot State | Stat | `discord_bot_state{state="ready"}` |
| Uptime | Stat | `process_start_time_seconds` |
| Connected Guilds | Stat | `discord_cache_size{type="guilds"}` |
| Commands/min | Graph | `rate(infinity_gauntlet_commands_total[1m])` |
| Error Rate | Gauge | Error rate query |
| P95 Latency | Stat | Histogram quantile query |
| Memory Usage | Gauge | `process_resident_memory_bytes` |
| Active Battles | Stat | `battle_active_count` |

### 6.2 Alerts for Discord Bot

| Alert | Condition | Severity | Runbook |
|-------|-----------|----------|---------|
| `BotDisconnected` | `discord_bot_state{state="ready"} == 0` for 2m | Critical | Check gateway, restart bot |
| `HighCommandLatency` | P95 > 2s for 5m | Warning | Check database, check cache |
| `CommandErrorSpike` | Error rate > 5% for 5m | Critical | Check logs, check API |
| `RateLimited` | `rate(discord_ratelimit_total[5m]) > 10` | Warning | Reduce request rate |
| `CacheOverflow` | `discord_cache_size > 10000` | Warning | Increase sweep interval |

---

## 7. LogQL Queries for Discord

### 7.1 User Journey Tracing

```logql
# All events for a specific user (last 1 hour)
{service="bot"} | json | user_id="123456789"

# Follow a correlation ID through the system
{service=~"bot|security"} | json | correlation_id="abc123def456"

# User's command history
{service="bot"} | json | user_id="123456789" | event_type="command.executed"
```

### 7.2 Battle Analysis

```logql
# All events for a specific battle
{service="bot"} | json | battle_id="battle-uuid"

# Battles that went to timeout
{service="bot"} | json | event_type="battle.completed" | outcome="timeout"

# Super-effective hits
{service="bot"} | json | event_type="battle.turn" | effectiveness="super_effective"
```

### 7.3 Error Investigation

```logql
# All errors in last hour
{service="bot", level="error"} | json

# Specific error type
{service="bot"} | json | error_type="pokemon_not_found"

# Errors with stack traces
{service="bot", level="error"} | json | line_format "{{.error.type}}: {{.error.message}}"
```

### 7.4 Security Monitoring

```logql
# All security sweep results
{service="security"} | json | event_type=~"security.*"

# Permission changes detected
{service="security"} | json | event_type="security.permission_change"

# Failed auto-reverts (critical)
{service="security"} | json | event_type="security.revert_failed"
```

---

## 8. Anti-Patterns to Avoid

### 8.1 ❌ Logging User-Controlled Data as Labels

```javascript
// ❌ BAD: username can be anything
logger.info('Command executed', { username: user.username });
metrics.commands_total.labels(user.username).inc();

// ✅ GOOD: use user_id as field, not label
logger.info('Command executed', { 
  user_id: user.id,  // Logged as field
  command: 'battle'  // This can be a label (finite set)
});
```

### 8.2 ❌ Creating Metrics per Guild

```javascript
// ❌ BAD: Creates unbounded series
guildMetrics[guildId] = new prometheus.Counter({
  name: `guild_${guildId}_commands`,
});

// ✅ GOOD: Use guild_id as log field
logger.info('Guild command', { guild_id: guildId, command });
```

### 8.3 ❌ Ignoring Rate Limits in Metrics

```javascript
// ❌ BAD: No rate limit tracking
await channel.send(message);

// ✅ GOOD: Track rate limit state
try {
  await channel.send(message);
  metrics.discord_requests_total.inc({ endpoint: 'channel_message', status: 'success' });
} catch (error) {
  if (error.code === 429) {
    metrics.discord_ratelimit_total.inc({ endpoint: 'channel_message' });
  }
}
```

---

## 9. Implementation Checklist

### 9.1 Before Adding New Metrics

- [ ] Is the label set bounded and finite?
- [ ] Will this metric be used in a dashboard or alert?
- [ ] Is there a corresponding log field for debugging?
- [ ] Has cardinality been estimated?

### 9.2 Before Adding New Log Fields

- [ ] Is the field value deterministic (not user-controlled)?
- [ ] Does it add debugging value?
- [ ] Is it parseable as JSON?
- [ ] Is sensitive data redacted?

### 9.3 For Discord-Specific Features

- [ ] Gateway state transitions logged
- [ ] Rate limits tracked
- [ ] Cache sizes bounded
- [ ] User IDs as fields, not labels

---

**Document Version:** 1.0  
**Cross-References:**
- [Telemetry Contract](./TELEMETRY_CONTRACT.md)
- [Loki Query Suite](../docs/operations-bible/loki-query-suite.md)
- [Discord Cache Management](../docs/operations-bible/09-discord-cache.md)
- [Security Bot Architecture](../docs/architecture-bible/07-security-bot.md)
