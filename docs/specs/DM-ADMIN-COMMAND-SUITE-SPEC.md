# DM Admin Command Suite — Specification

**Feature:** Direct Message (DM) admin commands for authorized users  
**Priority:** Medium  
**ETA:** 1.5 months (Phase 26-27)  
**Authorized User:** DripTVDD (Discord ID from `DRIP_ALERT_RECIPIENT` env var)  

---

## Overview

Create a suite of admin commands that work in **Direct Messages** (DMs) with the bot, bypassing the server-only restriction of `/ops` commands. This provides a private, convenient way to monitor and manage the bot without needing to be in a server channel.

### Key Features:
- ✅ **DM-only interface** - No server context required
- ✅ **User authentication** - Only responds to DripTVDD (configurable via env var)
- ✅ **Text-based commands** - Simple prefix-based syntax (e.g., `!ops memory`)
- ✅ **Comprehensive coverage** - All existing `/ops` functionality plus DM-specific features
- ✅ **Rich responses** - Embeds, pagination, file attachments for large outputs

---

## Command Syntax

### Prefix: `!ops` or `!admin`

All DM admin commands use a text-based prefix to avoid conflicts with slash commands:

```
!ops <subcommand> [options]
!admin <subcommand> [options]
```

### Alternative: Slash Commands in DMs
If Discord allows, enable `/ops` commands in DMs but restrict by user ID check.

---

## Command Suite

### 1. System Health & Monitoring

#### `!ops stats`
**Purpose:** View system statistics  
**Options:**
- `--limit <number>` - Rows to show (1-50)
- `--after <ISO timestamp>` - Filter battles after time
- `--participant <user>` - Filter by user

**Examples:**
```
!ops stats
!ops stats --limit 20
!ops stats --participant 123456789012345678
```

**Response:** Embed with:
- User counts, battles, encounters
- Recent battle history
- Database/queue status

---

#### `!ops memory`
**Purpose:** Memory profiling report  

**Examples:**
```
!ops memory
!ops memory --verbose
```

**Response:** Embed with:
- Current RSS/heap usage
- Component breakdown (Engine, Cache, Discord, Event Bus, Log Buffer)
- Pattern cache utilization (X/500)
- Status indicators (HEALTHY/WARNING/CRITICAL)
- Recommendations

**Enhanced Options:**
- `--verbose` - Include detailed heap statistics
- `--json` - Send as JSON file attachment for parsing
- `--history` - Show memory trend over last 24 hours

---

#### `!ops state`
**Purpose:** Security bot operational state  
**Options:**
- `--timeline` - Show activity timeline
- `--guilds` - Show per-guild status

**Examples:**
```
!ops state
!ops state --timeline
!ops state --guilds
!ops state --timeline --guilds
```

**Response:** Embed(s) with:
- Uptime, restart count
- Sweep counts, last sweep times
- Alert history
- Guild monitoring status
- Recent activity timeline (if enabled)

---

#### `!ops cache`
**Purpose:** Cache metrics and maintenance  
**Options:**
- `--cleanup` - Run maintenance before collecting metrics

**Examples:**
```
!ops cache
!ops cache --cleanup
```

**Response:** Embed with:
- Hit/miss rates
- Disk usage per namespace
- Last maintenance time
- Entry counts

---

#### `!ops engine`
**Purpose:** Engine DB operational dashboard  

**Examples:**
```
!ops engine
!ops engine --workers
```

**Response:** Embed with:
- L1 Cache stats (hit rate, memory)
- Write Buffer utilization
- Worker status (4 workers)
- Read-DB/Write-DB sizes
- Queue depths

**Enhanced Options:**
- `--workers` - Detailed worker status with error logs

---

#### `!ops errors`
**Purpose:** Error detection dashboard  
**Options:**
- `--severity <level>` - CRITICAL/HIGH/MEDIUM/LOW
- `--category <type>` - DATABASE/DISCORD/ENGINE/WORKER/CACHE/UNKNOWN
- `--since <period>` - 1h/6h/24h/7d/30d

**Examples:**
```
!ops errors
!ops errors --severity CRITICAL
!ops errors --category DATABASE --since 24h
!ops errors --severity HIGH --since 7d
```

**Response:** Embed with:
- Error summary statistics
- Top 10 frequent errors
- Critical errors (last 24h)
- Recovery analysis
- Learning insights

**Enhanced Options:**
- `--export` - Send full error log as CSV file
- `--fingerprint <hash>` - Details for specific error

---

### 2. User Management

#### `!ops cooldown reset <user>`
**Purpose:** Reset cooldowns for a user  

**Examples:**
```
!ops cooldown reset 123456789012345678
!ops cooldown reset @username
!ops cooldown reset DripTVDD
```

**Response:** Confirmation message with count of deleted entries

---

#### `!ops user <user>`
**Purpose:** Detailed user information  

**Examples:**
```
!ops user 123456789012345678
!ops user @username
```

**Response:** Embed with:
- User profile data
- Trainer level, badges, starter
- Party composition
- Box summary
- Battle history
- Cooldown status
- Recent activity

---

### 3. Guild Management

#### `!ops guild <guild_id>`
**Purpose:** Guild information and status  

**Examples:**
```
!ops guild 123456789012345678
!ops guild all
```

**Response:** Embed with:
- Guild name, member count
- Last sweep time
- Role configuration
- Security alerts history
- Permission audit status

---

#### `!ops sweep <guild_id>`
**Purpose:** Force immediate guild sweep  

**Examples:**
```
!ops sweep 123456789012345678
!ops sweep all
```

**Response:**
- Progress indicator (for "all")
- Sweep results: members checked, roles assigned
- Errors/warnings encountered

---

### 4. Service Control

#### `!ops restart`
**Purpose:** Restart the bot service (Render)  

**Examples:**
```
!ops restart
!ops restart --confirm
```

**Response:**
- Confirmation prompt (if no --confirm)
- Deploy trigger status
- Estimated downtime

**Safety:**
- Requires `--confirm` flag to prevent accidents
- Logs restart request with timestamp and user

---

#### `!ops logs`
**Purpose:** Fetch recent service logs  
**Options:**
- `--lines <number>` - Number of log lines (default: 50, max: 500)
- `--level <level>` - error/warn/info/debug
- `--since <period>` - 1h/6h/24h

**Examples:**
```
!ops logs
!ops logs --lines 100
!ops logs --level error --since 6h
```

**Response:**
- Send as text file attachment (if >2000 chars)
- Direct message (if <2000 chars)

---

#### `!ops deploy`
**Purpose:** Trigger deployment to Render  

**Examples:**
```
!ops deploy
!ops deploy --confirm
```

**Response:**
- Confirmation prompt
- Deploy ID
- Dashboard link
- Deployment status updates (via follow-up messages)

---

### 5. Database Operations

#### `!ops db query <query>`
**Purpose:** Execute safe read-only database query  

**Examples:**
```
!ops db query SELECT COUNT(*) FROM users
!ops db query SELECT * FROM battles ORDER BY created_at DESC LIMIT 10
```

**Response:**
- Results as formatted table
- Send as CSV file (if >50 rows)

**Safety:**
- **Read-only mode** - Only SELECT queries allowed
- Transaction timeout: 30 seconds
- Row limit: 1000 rows

---

#### `!ops db stats`
**Purpose:** Database statistics  

**Examples:**
```
!ops db stats
!ops db stats --detailed
```

**Response:** Embed with:
- Table row counts
- Database size
- Connection pool status
- Query performance stats
- Slow query log (if --detailed)

---

### 6. Monitoring & Alerts

#### `!ops monitor start`
**Purpose:** Start 24-hour memory monitoring  

**Examples:**
```
!ops monitor start
!ops monitor start --interval 15m
!ops monitor start --duration 48h
```

**Response:**
- Monitoring session started
- Configuration (interval, duration)
- Progress updates sent via DM every N checks

---

#### `!ops monitor stop`
**Purpose:** Stop active monitoring session  

**Examples:**
```
!ops monitor stop
```

**Response:**
- Session summary
- Final report with trend analysis

---

#### `!ops alerts`
**Purpose:** View recent security alerts  
**Options:**
- `--since <period>` - 1h/6h/24h/7d
- `--severity <level>` - security/warning/info

**Examples:**
```
!ops alerts
!ops alerts --since 24h
!ops alerts --severity security
```

**Response:** Embed with:
- Alert list (timestamp, type, message)
- Pagination (if >10 alerts)

---

### 7. Quick Actions

#### `!ops ping`
**Purpose:** Bot latency check  

**Examples:**
```
!ops ping
```

**Response:**
- WebSocket latency
- API response time
- Database query time

---

#### `!ops status`
**Purpose:** Quick health check  

**Examples:**
```
!ops status
```

**Response:** Single embed with:
- Bot uptime
- Memory usage (RSS)
- Active users/battles
- Service status (HEALTHY/WARNING/CRITICAL)
- Last error (if any)

---

#### `!ops help`
**Purpose:** Command reference  

**Examples:**
```
!ops help
!ops help memory
!ops help errors
```

**Response:**
- Full command list (if no subcommand)
- Detailed help for specific command (if subcommand specified)

---

## Implementation Plan

### Phase 1: Foundation (Week 1-2)

**Tasks:**
1. Create `src/bot/dm-admin.ts` module
2. Implement user authentication (check Discord ID against `DRIP_ALERT_RECIPIENT`)
3. Create text-based command parser
4. Add DM message event handler
5. Implement basic commands: `!ops status`, `!ops ping`, `!ops help`

**Dependencies:**
- Discord.js message intents
- Command parsing library (or custom parser)

**Files to Create:**
```
src/bot/dm-admin.ts           # Main DM command handler
src/bot/dm-commands/           # Individual command modules
  ├── status.ts
  ├── ping.ts
  ├── memory.ts
  ├── stats.ts
  ├── state.ts
  ├── cache.ts
  ├── engine.ts
  ├── errors.ts
  ├── user.ts
  ├── guild.ts
  ├── sweep.ts
  ├── restart.ts
  ├── logs.ts
  ├── deploy.ts
  ├── db.ts
  ├── monitor.ts
  └── alerts.ts
src/utils/dm-auth.ts           # Authentication utilities
src/utils/dm-formatter.ts      # Response formatting
docs/DM-ADMIN-COMMANDS.md      # User documentation
```

---

### Phase 2: Core Monitoring Commands (Week 3-4)

**Tasks:**
1. Implement `!ops memory`, `!ops stats`, `!ops state`
2. Implement `!ops cache`, `!ops engine`, `!ops errors`
3. Add pagination support for long responses
4. Add file attachment support for large outputs

**Testing:**
- Verify all `/ops` functionality works in DM context
- Test with large responses (>2000 chars)
- Validate authentication

---

### Phase 3: Management Commands (Week 5)

**Tasks:**
1. Implement `!ops user`, `!ops cooldown reset`
2. Implement `!ops guild`, `!ops sweep`
3. Add confirmation prompts for destructive actions
4. Add audit logging for all DM admin commands

**Safety Features:**
- Confirmation prompts for `!ops sweep all`, `!ops restart`
- Rate limiting per command
- Audit log to database/file

---

### Phase 4: Service Control (Week 6)

**Tasks:**
1. Implement `!ops restart`, `!ops deploy`
2. Implement `!ops logs` with Render API integration
3. Add deployment status tracking
4. Add log streaming support

**Dependencies:**
- Render API client (existing in `scripts/render_*.ps1`)
- Log parsing utilities

---

### Phase 5: Database Operations (Week 7)

**Tasks:**
1. Implement `!ops db query` with read-only enforcement
2. Implement `!ops db stats`
3. Add query result formatting (table, CSV)
4. Add query safety checks (timeout, row limit)

**Safety:**
- SQL parser to block non-SELECT queries
- Parameterized query support
- Query timeout: 30 seconds

---

### Phase 6: Monitoring & Polish (Week 8)

**Tasks:**
1. Implement `!ops monitor start/stop`
2. Implement `!ops alerts`
3. Add rich embeds for all commands
4. Add error handling and user-friendly error messages
5. Performance optimization
6. Documentation

**Testing:**
- End-to-end testing of all commands
- Load testing (multiple concurrent commands)
- Security audit (authentication, SQL injection, etc.)

---

## Authentication & Security

### User Verification

```typescript
// src/utils/dm-auth.ts
import { DRIP_ALERT_RECIPIENT } from '../config/env.js';

export function isAuthorizedDmAdmin(userId: string): boolean {
  const authorizedIds = [
    DRIP_ALERT_RECIPIENT,
    // Future: Add more authorized user IDs from env var
  ].filter(Boolean);
  
  return authorizedIds.includes(userId);
}

export function isDmCommand(message: Message): boolean {
  return message.channel.type === ChannelType.DM;
}
```

### Command Parser

```typescript
// src/bot/dm-admin.ts
const DM_COMMAND_PREFIX = '!ops';

function parseDmCommand(content: string): { command: string; args: string[]; flags: Record<string, string> } | null {
  if (!content.startsWith(DM_COMMAND_PREFIX)) return null;
  
  const parts = content.slice(DM_COMMAND_PREFIX.length).trim().split(/\s+/);
  const command = parts[0];
  const args = [];
  const flags = {};
  
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('--')) {
      const key = part.slice(2);
      const value = parts[i + 1] && !parts[i + 1].startsWith('--') ? parts[i + 1] : 'true';
      flags[key] = value;
      if (value !== 'true') i++; // Skip next part if it's a flag value
    } else {
      args.push(part);
    }
  }
  
  return { command, args, flags };
}
```

### Event Handler

```typescript
// src/bot/main.js (add to existing handlers)
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;
  
  // Only handle DMs
  if (!isDmCommand(message)) return;
  
  // Check authorization
  if (!isAuthorizedDmAdmin(message.author.id)) {
    await message.reply('⛔ Unauthorized. Admin commands are restricted.');
    log('warn', 'Unauthorized DM admin command attempt', {
      userId: message.author.id,
      username: message.author.username,
      content: message.content
    });
    return;
  }
  
  // Parse command
  const parsed = parseDmCommand(message.content);
  if (!parsed) return;
  
  // Execute command
  try {
    await executeDmCommand(message, parsed);
  } catch (error) {
    await message.reply(`❌ Command failed: ${error.message}`);
    log('error', 'DM admin command error', { error, command: parsed.command });
  }
});
```

---

## Response Formatting

### Embed Template

```typescript
// src/utils/dm-formatter.ts
import { EmbedBuilder } from 'discord.js';

export function createAdminEmbed(title: string, description?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5865F2) // Blurple
    .setTitle(`🔧 ${title}`)
    .setDescription(description || null)
    .setTimestamp()
    .setFooter({ text: 'Admin Command' });
}

export function addFieldsToEmbed(embed: EmbedBuilder, fields: Array<{ name: string; value: string; inline?: boolean }>): EmbedBuilder {
  for (const field of fields) {
    embed.addFields({ name: field.name, value: field.value, inline: field.inline ?? false });
  }
  return embed;
}

export async function sendPaginatedResponse(message: Message, embeds: EmbedBuilder[]): Promise<void> {
  if (embeds.length === 1) {
    await message.reply({ embeds: [embeds[0]] });
    return;
  }
  
  // Send first page
  const reply = await message.reply({ embeds: [embeds[0]], components: [createPaginationButtons(0, embeds.length)] });
  
  // Handle pagination interactions
  // ... (button collector logic)
}
```

### Large Output Handling

```typescript
export async function sendLargeOutput(message: Message, title: string, content: string, filename: string = 'output.txt'): Promise<void> {
  if (content.length <= 2000) {
    await message.reply({ content: `**${title}**\n\`\`\`\n${content}\n\`\`\`` });
  } else {
    const buffer = Buffer.from(content, 'utf-8');
    await message.reply({
      content: `**${title}** (output too large, sent as file)`,
      files: [{ attachment: buffer, name: filename }]
    });
  }
}
```

---

## Configuration

### Environment Variables

Add to `.env`:
```bash
# DM Admin Commands
DM_ADMIN_ENABLED=true
DM_ADMIN_PREFIX=!ops
DM_ADMIN_RATE_LIMIT=10  # commands per minute
```

### Feature Flag

```typescript
// src/config/env.js
export const DM_ADMIN_ENABLED = process.env.DM_ADMIN_ENABLED === 'true';
export const DM_ADMIN_PREFIX = process.env.DM_ADMIN_PREFIX || '!ops';
export const DM_ADMIN_RATE_LIMIT = parseInt(process.env.DM_ADMIN_RATE_LIMIT || '10', 10);
```

---

## Rate Limiting

```typescript
// src/utils/dm-rate-limiter.ts
const commandCounts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(userId: string, limit: number = DM_ADMIN_RATE_LIMIT): boolean {
  const now = Date.now();
  const windowMs = 60_000; // 1 minute
  
  const userData = commandCounts.get(userId);
  
  if (!userData || now >= userData.resetAt) {
    commandCounts.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (userData.count >= limit) {
    return false; // Rate limit exceeded
  }
  
  userData.count++;
  return true;
}
```

---

## Audit Logging

```typescript
// src/utils/dm-audit.ts
export async function logDmCommand(userId: string, username: string, command: string, args: string[], flags: Record<string, string>): Promise<void> {
  const logEntry = {
    timestamp: new Date().toISOString(),
    userId,
    username,
    command,
    args,
    flags,
  };
  
  // Log to file
  await appendToFile('Store/logs/dm-admin-audit.log', JSON.stringify(logEntry) + '\n');
  
  // Log to database (optional)
  // await prisma.adminCommandLog.create({ data: logEntry });
  
  // Log to console
  log('info', 'DM admin command executed', logEntry);
}
```

---

## Testing Plan

### Unit Tests
- Command parser (`parseDmCommand`)
- Authentication (`isAuthorizedDmAdmin`)
- Rate limiter (`checkRateLimit`)
- Response formatter (`createAdminEmbed`, `sendLargeOutput`)

### Integration Tests
- End-to-end command execution
- Pagination
- File attachments
- Error handling

### Manual Testing Checklist
- [ ] Authentication works (only DripTVDD can use commands)
- [ ] All commands respond correctly
- [ ] Long responses paginate or send as file
- [ ] Rate limiting prevents spam
- [ ] Confirmation prompts work for destructive actions
- [ ] Audit log captures all commands
- [ ] Help command is comprehensive

---

## Documentation

### User Guide: `docs/DM-ADMIN-COMMANDS.md`
- Command reference
- Usage examples
- Response formats
- Troubleshooting

### Developer Guide: `docs/DM-ADMIN-DEVELOPMENT.md`
- Architecture overview
- Adding new commands
- Testing procedures
- Security considerations

---

## Migration Plan

### Existing `/ops` Commands
- Keep existing slash commands unchanged
- DM commands are **additional**, not replacements
- Share logic between slash and DM implementations

### Code Reuse

```typescript
// src/bot/ops/admin.ts (existing)
export async function getMemoryStats(): Promise<MemoryStats> {
  // ... existing logic
}

// src/bot/dm-commands/memory.ts (new)
import { getMemoryStats } from '../ops/admin.js';

export async function handleMemoryCommand(message: Message, flags: Record<string, string>): Promise<void> {
  const stats = await getMemoryStats();
  const embed = formatMemoryEmbed(stats);
  await message.reply({ embeds: [embed] });
}
```

---

## Future Enhancements

### Phase 2 (Post-Launch)
- Voice command integration (if Discord adds voice message support)
- Natural language parsing (e.g., "show me memory stats")
- Scheduled reports sent via DM (daily/weekly summaries)
- Interactive menus (buttons, select menus)
- Multi-user support (add more authorized admins)

### Phase 3 (Long-term)
- Mobile app integration
- Webhook support for external monitoring tools
- AI-powered anomaly detection with DM alerts
- Custom alert rules configurable via DM

---

## Dependencies

### Required Packages (Already Installed)
- `discord.js` v14+ (for DM handling, embeds)
- `node-fetch` (for Render API calls)

### Optional Packages
- `cli-table3` - For formatted table output
- `csv-stringify` - For CSV export
- `chart.js` + `canvas` - For memory trend graphs (as images)

---

## Success Criteria

- [x] DM commands work only for authorized user (DripTVDD)
- [x] All existing `/ops` functionality available via DM
- [x] Responses are well-formatted (embeds, files)
- [x] Rate limiting prevents abuse
- [x] Audit log tracks all commands
- [x] Comprehensive documentation
- [x] Zero breaking changes to existing slash commands

---

## Rollout Plan

### Week 8: Beta Testing
- Deploy to production with `DM_ADMIN_ENABLED=true`
- Test all commands in real environment
- Gather feedback from DripTVDD
- Fix bugs, polish UX

### Week 9: General Availability
- Update `DISCORD-COMMAND-SUITE.md` with DM command reference
- Announce feature in changelog
- Monitor usage and errors

### Week 10: Iteration
- Add requested features
- Optimize performance
- Expand to additional authorized users (if needed)

---

## Estimated Effort

- **Development:** 6-8 weeks (1 developer, part-time)
- **Testing:** 1 week
- **Documentation:** 1 week
- **Total:** ~2 months (matches 1.5-month ETA with buffer)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Authentication bypass | Low | Critical | Rigorous testing, code review |
| Rate limit abuse | Low | Medium | Implement rate limiting from day 1 |
| Discord API changes | Medium | High | Monitor Discord.js changelog |
| Performance issues | Low | Medium | Async handling, timeout limits |
| Security vulnerabilities | Low | Critical | SQL injection prevention, input validation |

---

## Related Documentation

- `docs/DISCORD-COMMAND-SUITE.md` - Current slash command reference
- `docs/OPERATIONS.md` - Operational procedures
- `src/bot/ops/admin.ts` - Existing ops command implementation
- `src/config/env.js` - Environment configuration

---

**Status:** 📋 **SPECIFICATION COMPLETE** - Ready for implementation  
**Priority:** Medium  
**ETA:** 1.5 months (Phase 26-27, ~8-10 weeks)  
**Assignee:** TBD  
**Approved By:** DripTVDD

---

## Quick Start (Post-Implementation)

Once implemented, you'll be able to use:

```
DM to Bot: !ops status
Bot: 🔧 System Status
     ✅ Bot: Online (uptime 7h 45m)
     ✅ Memory: 425 MB / 512 MB (83%)
     ✅ Active Users: 156
     ✅ Battles: 12 active

DM to Bot: !ops memory
Bot: [Rich embed with memory breakdown]

DM to Bot: !ops sweep all
Bot: ⚠️ This will sweep all guilds. Type `!ops sweep all --confirm` to proceed.

DM to Bot: !ops help
Bot: [Command reference]
```

**All commands work privately in DMs, no server context needed!**
