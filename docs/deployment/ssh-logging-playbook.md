# Intelligent Logging System - SSH Access Playbook

**Version**: 1.0.0  
**Last Updated**: 2025-11-10  
**Audience**: AI Agents, DevOps Engineers, Developers

---

## Quick Start

```bash
# SSH into Render service
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com

# Navigate to logs directory
cd /Store/logs

# Quick health check
./scripts/log-cli.sh query --level error,fatal --since "15m ago" --limit 10

# Generate session report
./scripts/log-cli.sh report session --since "1h ago"
```

---

## Table of Contents

1. [SSH Access](#ssh-access)
2. [Log CLI Commands](#log-cli-commands)
3. [Common Use Cases](#common-use-cases)
4. [AI Query Patterns](#ai-query-patterns)
5. [Troubleshooting Workflows](#troubleshooting-workflows)
6. [Performance Investigation](#performance-investigation)
7. [AI Continuity Reconstruction](#ai-continuity-reconstruction)
8. [Maintenance Tasks](#maintenance-tasks)
9. [Emergency Procedures](#emergency-procedures)

---

## SSH Access

### Connection Details

```bash
# Service: Infinity-Gauntlet Background Worker (Main Bot)
# Service ID: srv-d3snk2ndiees73cn709g
# Region: Virginia (us-east)
# SSH Endpoint: ssh.virginia.render.com:22

# Authentication: Ed25519 key
# Key Fingerprint: SHA256:HBAu6kfND5/9kOLzOi0OKR01Hh4RbqCIFrBbzjR5bd8
```

### Connect via SSH

```bash
# Standard connection
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com

# With specific key
ssh -i ~/.ssh/render_ed25519 srv-d3snk2ndiees73cn709g@ssh.virginia.render.com

# Execute single command (non-interactive)
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com "cd /Store/logs && ./scripts/log-cli.sh query --level error --limit 5"
```

### Log Directory Structure

```
/Store/logs/
├── current.jsonl              # Active log file (rotated hourly)
├── cache.bin                  # 7MB circular buffer (binary format)
├── index.db                   # SQLite index for fast queries
│
├── hourly/                    # Hourly rotations (last 24 hours)
│   ├── 2025-11-10T14.jsonl.gz
│   ├── 2025-11-10T15.jsonl.gz
│   └── ...
│
├── daily/                     # Daily archives (last 30 days)
│   ├── 2025-11-09.jsonl.gz
│   ├── 2025-11-10.jsonl.gz
│   └── ...
│
├── archive/                   # Compressed archives (90 days)
│   ├── 2025-08.tar.gz
│   ├── 2025-09.tar.gz
│   └── 2025-10.tar.gz
│
├── insights/                  # AI-generated insights
│   ├── 2025-11-10.json
│   └── patterns.json
│
└── emergency/                 # Emergency fallback logs
    ├── fatal-errors.jsonl
    └── critical-events.jsonl
```

---

## Log CLI Commands

### log-cli.sh query

Search and filter logs with powerful query capabilities.

#### Syntax

```bash
./scripts/log-cli.sh query [options] [search_text]
```

#### Options

| Option | Description | Example |
|--------|-------------|---------|
| `--level <levels>` | Filter by log level (comma-separated) | `--level error,fatal` |
| `--category <categories>` | Filter by category | `--category BATTLE,COMMAND` |
| `--since <time>` | Start time (relative or absolute) | `--since "1h ago"` |
| `--until <time>` | End time | `--until "now"` |
| `--limit <n>` | Max results | `--limit 50` |
| `--pattern <regex>` | Regex pattern match on message | `--pattern "Prisma.*Error"` |
| `--filter <jq-expr>` | Custom jq filter | `--filter 'context.operation.duration > 1000'` |
| `--user-id <id>` | Filter by user ID | `--user-id "123456789"` |
| `--guild-id <id>` | Filter by guild ID | `--guild-id "987654321"` |
| `--fingerprint <fp>` | Filter by error fingerprint | `--fingerprint "abc123def456"` |
| `--output <format>` | Output format (text or json) | `--output json` |

#### Examples

```bash
# Find all errors in last hour
./scripts/log-cli.sh query --level error --since "1h ago"

# Find slow database queries
./scripts/log-cli.sh query --category DATABASE --filter 'context.operation.duration > 500'

# Find errors for specific user
./scripts/log-cli.sh query --user-id "123456789" --level error --since "24h ago"

# Search for specific error pattern
./scripts/log-cli.sh query --pattern "PrismaClient.*Error" --since "7d ago"

# Export logs to JSON
./scripts/log-cli.sh query --since "24h ago" --output json > logs.json
```

### log-cli.sh report

Generate AI-optimized reports for various purposes.

#### Report Types

1. **session** - Session summary with statistics
2. **errors** - Error analysis with recommendations
3. **performance** - Performance metrics and bottlenecks
4. **continuity** - AI continuity context for specific user

#### Examples

```bash
# Session summary (last 24 hours)
./scripts/log-cli.sh report session --since "24h ago"

# Error analysis (last 7 days)
./scripts/log-cli.sh report errors --since "7d ago"

# Performance report for battle system
./scripts/log-cli.sh report performance --category BATTLE --since "24h ago"

# User continuity for AI agent
./scripts/log-cli.sh report continuity --user-id "123456789" --since "7d ago" --output json > user-context.json
```

### log-cli.sh pattern

Detect patterns, anomalies, and trends.

#### Pattern Types

1. **anomaly** - Detect anomalies in logs
2. **trends** - Identify trends over time
3. **correlate** - Correlation analysis for errors

#### Examples

```bash
# Detect anomalies in last 24 hours
./scripts/log-cli.sh pattern anomaly --since "24h ago"

# Analyze trends (last 7 days)
./scripts/log-cli.sh pattern trends --since "7d ago"

# Correlate error occurrences
./scripts/log-cli.sh pattern correlate --fingerprint "abc123def456" --since "7d ago"
```

### log-cli.sh context

Reconstruct context for debugging and AI continuity.

#### Context Types

1. **session** - Full session timeline
2. **user** - User journey reconstruction
3. **error** - Error context with surrounding logs

#### Examples

```bash
# Reconstruct session context
./scripts/log-cli.sh context session --session-id "sess_abc123" --output json

# Reconstruct user journey
./scripts/log-cli.sh context user --user-id "123456789" --since "24h ago"

# Get error context (±5 minutes)
./scripts/log-cli.sh context error --fingerprint "abc123def456"
```

---

## Common Use Cases

### 1. "What's wrong right now?"

```bash
# Quick diagnostic
./scripts/log-cli.sh query --level error,fatal --since "15m ago" --limit 20

# Health check
./scripts/log-cli.sh report session --since "1h ago"
```

**Expected Output:**
- List of recent errors
- Error frequency
- Affected systems

### 2. "Why did this command fail?"

```bash
# Find command errors
./scripts/log-cli.sh query --category COMMAND --level error --since "1h ago"

# Get user context
./scripts/log-cli.sh context user --user-id "<user-id>" --since "1h ago"
```

**Expected Output:**
- Command execution logs
- Error messages
- User activity timeline

### 3. "Is the system slow?"

```bash
# Check performance
./scripts/log-cli.sh report performance --since "1h ago"

# Find slow operations
./scripts/log-cli.sh query --category PERFORMANCE --filter 'context.operation.duration > 1000'
```

**Expected Output:**
- Average response times
- P95/P99 latencies
- Slow operations list

### 4. "Did the cache clear work?"

```bash
# Check cache operations
./scripts/log-cli.sh query --category CACHE --since "30m ago"

# Look for cache flush logs
./scripts/log-cli.sh query "cache flush" --since "30m ago"
```

**Expected Output:**
- Cache flush confirmation
- Cache hit/miss rates
- Timestamp of operation

### 5. "What errors are recurring?"

```bash
# Error analysis
./scripts/log-cli.sh report errors --since "7d ago"

# Group by fingerprint
./scripts/log-cli.sh query --level error --output json | jq 'group_by(.context.error.fingerprint)'
```

**Expected Output:**
- Unique error count
- Most frequent errors
- Error patterns
- Recommendations

---

## AI Query Patterns

### Pattern 1: Session Reconstruction

**Goal**: Reconstruct full session context for AI agent continuity.

```bash
# Step 1: Get session summary
./scripts/log-cli.sh report continuity \
  --user-id "<user-id>" \
  --since "24h ago" \
  --output json > session-context.json

# Step 2: Analyze with AI report generator
node tools/ai-report-generator.ts session
```

**Output Structure**:
```json
{
  "sessionId": "sess_abc123",
  "startTime": "2025-11-10T14:00:00.000Z",
  "endTime": "2025-11-10T15:30:00.000Z",
  "duration": 5400,
  "summary": {
    "totalLogs": 1234,
    "byLevel": { "info": 1000, "warn": 200, "error": 34 },
    "byCategory": { "COMMAND": 450, "EVENT": 300, "DATABASE": 200 },
    "errors": [...],
    "performance": { "avgDuration": 125, "p95": 450 }
  },
  "timeline": [...],
  "stateChanges": [...],
  "insights": [...]
}
```

### Pattern 2: Error Context Extraction

**Goal**: Extract full context around an error for debugging.

```bash
# Find error occurrences
./scripts/log-cli.sh query \
  --fingerprint "<error-fingerprint>" \
  --limit 5 \
  --output json

# Get surrounding context
./scripts/log-cli.sh context error --fingerprint "<error-fingerprint>"
```

### Pattern 3: Performance Analysis

**Goal**: Identify performance bottlenecks.

```bash
# Generate performance report
./scripts/log-cli.sh report performance \
  --category DATABASE \
  --since "24h ago"

# Find slow queries
./scripts/log-cli.sh query \
  --category DATABASE \
  --filter 'context.operation.duration > 500' \
  --output json | jq '.[] | {message, duration: .context.operation.duration, timestamp}'
```

### Pattern 4: Anomaly Detection

**Goal**: Detect unusual patterns or spikes.

```bash
# Detect anomalies
./scripts/log-cli.sh pattern anomaly --since "24h ago"

# Analyze error spike
./scripts/log-cli.sh query \
  --level error \
  --since "24h ago" \
  --output json | jq 'group_by(.timestamp[:13]) | map({hour: .[0].timestamp[:13], count: length})'
```

---

## Troubleshooting Workflows

### Workflow 1: Database Connection Issues

```bash
# Step 1: Find database errors
./scripts/log-cli.sh query --category DATABASE --level error --since "1h ago"

# Step 2: Check for connection timeouts
./scripts/log-cli.sh query --pattern "connection.*timeout" --since "1h ago"

# Step 3: Analyze error patterns
./scripts/log-cli.sh report errors --since "24h ago"

# Step 4: Check if pattern matches known issues
./scripts/log-cli.sh pattern correlate --fingerprint "<db-error-fp>" --since "7d ago"
```

**Expected Findings**:
- Connection pool exhaustion
- Query timeouts
- Network issues
- Configuration problems

### Workflow 2: Battle System Failure

```bash
# Step 1: Find battle errors
./scripts/log-cli.sh query --category BATTLE --level error --since "1h ago"

# Step 2: Check performance
./scripts/log-cli.sh report performance --category BATTLE --since "1h ago"

# Step 3: Find user context
./scripts/log-cli.sh context user --user-id "<affected-user>" --since "1h ago"

# Step 4: Identify root cause
./scripts/log-cli.sh query --filter 'category == "BATTLE" and level == "error"' --output json | jq '.[] | {message, error: .context.error}'
```

### Workflow 3: Memory Leak Investigation

```bash
# Step 1: Check memory growth
./scripts/log-cli.sh query --output json | jq '.[] | {timestamp, heapUsed: .context.process.memory.heapUsed}' | tail -100

# Step 2: Find high-memory operations
./scripts/log-cli.sh query --filter 'context.process.memory.heapUsed > 1000000000' --since "24h ago"

# Step 3: Generate optimization report
node tools/ai-report-generator.ts optimize

# Step 4: Check for memory-related errors
./scripts/log-cli.sh query --pattern "memory|heap|allocation" --level error --since "7d ago"
```

---

## Performance Investigation

### Quick Performance Check

```bash
# One-liner performance summary
./scripts/log-cli.sh report performance --since "1h ago" | grep -A 10 "Duration Statistics"
```

### Deep Dive: Slow Operations

```bash
# Find all operations >1s
./scripts/log-cli.sh query \
  --filter 'context.operation.duration > 1000' \
  --since "24h ago" \
  --output json > slow-ops.json

# Analyze slow operations
cat slow-ops.json | jq 'group_by(.context.operation.name) | map({operation: .[0].context.operation.name, count: length, avg: (map(.context.operation.duration) | add / length)})'
```

### Database Query Analysis

```bash
# Find slow queries
./scripts/log-cli.sh query \
  --category DATABASE \
  --filter 'context.operation.duration > 500' \
  --since "24h ago"

# Group by query type
./scripts/log-cli.sh query \
  --category DATABASE \
  --output json | jq 'group_by(.message) | map({query: .[0].message, count: length, avgDuration: (map(.context.operation.duration // 0) | add / length)})'
```

---

## AI Continuity Reconstruction

### Full Session Export

```bash
# Export complete session for AI
./scripts/log-cli.sh report continuity \
  --user-id "<user-id>" \
  --since "7d ago" \
  --output json > user-session-full.json

# Compress and download
gzip user-session-full.json
# Download via scp
scp srv-d3snk2ndiees73cn709g@ssh.virginia.render.com:/Store/logs/user-session-full.json.gz ./
```

### State Change Timeline

```bash
# Extract state changes
./scripts/log-cli.sh query \
  --output json \
  --since "24h ago" | jq '[.[] | select(.data.before or .data.after) | {timestamp, entity: .category, before: .data.before, after: .data.after}]'
```

### Insight Generation

```bash
# Generate AI insights
node tools/ai-report-generator.ts session > insights.json

# Key sections:
# - summary: Overall statistics
# - timeline: Significant events
# - stateChanges: Entity state transitions
# - insights: AI-generated recommendations
```

---

## Maintenance Tasks

### Daily Maintenance

```bash
# Check log storage
ls -lh /Store/logs/current.jsonl
ls -lh /Store/logs/hourly/ | tail -10

# Check rotation status
./scripts/log-cli.sh report session --since "1h ago" | head -20

# Verify no critical errors
./scripts/log-cli.sh query --level fatal --since "24h ago"
```

### Weekly Maintenance

```bash
# Storage cleanup check
node tools/log-rotation.ts stats

# Generate weekly error report
./scripts/log-cli.sh report errors --since "7d ago" > weekly-errors.txt

# Check for memory trends
./scripts/log-cli.sh query --output json --since "7d ago" | jq '[.[] | .context.process.memory.heapUsed] | add / length'
```

### Monthly Maintenance

```bash
# Archive old logs
node tools/log-rotation.ts rotate-monthly

# Generate monthly performance report
./scripts/log-cli.sh report performance --since "30d ago" > monthly-performance.txt

# Review optimization opportunities
node tools/ai-report-generator.ts optimize > monthly-optimizations.json
```

---

## Emergency Procedures

### Procedure 1: System Down

```bash
# Check last 100 logs
tail -100 /Store/logs/current.jsonl | jq '.'

# Find fatal errors
./scripts/log-cli.sh query --level fatal --since "1h ago"

# Check emergency logs
cat /Store/logs/emergency/fatal-errors.jsonl | tail -50

# Generate emergency report
./scripts/log-cli.sh report session --since "1h ago" > emergency-report.txt
```

### Procedure 2: Data Loss Suspected

```bash
# Check database logs
./scripts/log-cli.sh query --category DATABASE --since "1h ago" --limit 100

# Find delete/update operations
./scripts/log-cli.sh query --pattern "DELETE|UPDATE" --category DATABASE --since "1h ago"

# Check for transaction rollbacks
./scripts/log-cli.sh query --pattern "rollback|abort" --since "1h ago"
```

### Procedure 3: Performance Degradation

```bash
# Quick performance snapshot
./scripts/log-cli.sh report performance --since "15m ago"

# Find current slow operations
./scripts/log-cli.sh query --filter 'context.operation.duration > 2000' --since "15m ago"

# Check for resource exhaustion
./scripts/log-cli.sh query --pattern "pool|queue|timeout" --level warn,error --since "15m ago"
```

---

## Best Practices

### For AI Agents

1. **Always use `--output json`** for programmatic processing
2. **Include timestamps** in all queries for temporal analysis
3. **Export full context** when investigating errors (±30 minutes)
4. **Use fingerprints** to track recurring errors
5. **Generate reports** before and after changes for comparison

### For Humans

1. **Start broad, then narrow** (session report → specific query)
2. **Use relative time expressions** ("1h ago" instead of ISO timestamps)
3. **Pipe to less** for large outputs: `./scripts/log-cli.sh query | less`
4. **Save important queries** as shell aliases
5. **Export JSON for complex analysis**: `./scripts/log-cli.sh query --output json | jq '.[] | ...'`

### Performance Tips

1. **Use `--limit`** to avoid overwhelming output
2. **Filter by category** first (indexed, faster)
3. **Use fingerprint** for error-specific queries (indexed)
4. **Avoid full scans** of daily/archive logs unless necessary

---

## Appendix: Log Entry Schema

```typescript
interface LogEntry {
  id: string;                    // UUID
  timestamp: string;             // ISO 8601
  level: LogLevel;               // trace|debug|info|warn|error|fatal
  category: LogCategory;         // COMMAND|EVENT|BATTLE|etc.
  message: string;
  data?: Record<string, any>;
  
  context: {
    service: string;
    process: {
      pid: number;
      uptime: number;
      memory: {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
      };
    };
    user?: { id: string; username?: string };
    guild?: { id: string; name?: string };
    operation?: {
      name: string;
      duration?: number;
      success: boolean;
      retryCount?: number;
    };
    error?: {
      name: string;
      message: string;
      stack: string;
      fingerprint: string;
      cause?: any;
    };
  };
  
  ai: {
    importance: number;          // 0-100
    tags: string[];
    pattern?: string;
    anomaly?: boolean;
    actionable?: boolean;
  };
}
```

---

## Support

- **Documentation**: `/docs/architecture/intelligent-logging-system.md`
- **Architecture**: See main README for system overview
- **Issues**: Report via GitHub issues with `[logging]` tag
- **Emergency Contact**: Check `/ops/CRITICAL.md` for escalation procedures

---

**Document Version**: 1.0.0  
**Last Verified**: 2025-11-10  
**Next Review**: 2025-12-10
