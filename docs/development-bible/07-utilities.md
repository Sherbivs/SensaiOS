# Section 7: Utilities

[← Back to INDEX](INDEX.md) | [← Previous: Console Tooling](06-console-tooling.md)

---

**Philosophy**: "Utilities are the building blocks—simple, tested, composable."

**Purpose**: DateTime helpers, timezone standardization, admin implementation patterns.

## 7.1 DateTime Helpers

### Core Utilities

**Module:** `src/utils/datetime.ts`

**Functions:**
```typescript
import {
  getCurrentTimestampUTC,    // ISO 8601 UTC timestamp
  formatDuration,            // Human-readable duration (e.g., "2h 34m")
  parseTimestamp,            // Parse ISO string to Date
  addDuration,               // Add duration to date
  compareDates,              // Compare two dates
  formatRelativeTime         // "2 hours ago", "in 3 days"
} from "../utils/datetime.js";
```

### Usage Examples

**Current Timestamp:**
```typescript
const now = getCurrentTimestampUTC();
// Output: "2025-11-10T12:34:56.789Z"
```

**Duration Formatting:**
```typescript
const uptimeMs = 9125000; // 2h 32m 5s
const formatted = formatDuration(uptimeMs);
// Output: "2h 32m 5s"

// With options
formatDuration(uptimeMs, { precision: 2 });
// Output: "2h 32m"
```

**Relative Time:**
```typescript
const eventTime = new Date("2025-11-10T10:00:00Z");
const relative = formatRelativeTime(eventTime);
// Output: "2 hours ago" (if current time is 12:00:00)

// Future events
const futureEvent = new Date("2025-11-10T15:00:00Z");
formatRelativeTime(futureEvent);
// Output: "in 3 hours"
```

**Adding Duration:**
```typescript
const now = new Date();
const in30Minutes = addDuration(now, { minutes: 30 });
const tomorrow = addDuration(now, { days: 1 });
const nextWeek = addDuration(now, { weeks: 1 });
```

### Timezone Considerations

**Always use UTC internally:**
```typescript
// ✅ GOOD: Store in UTC
const timestamp = new Date().toISOString(); // "2025-11-10T12:34:56.789Z"

// ❌ BAD: Store in local timezone
const timestamp = new Date().toString(); // "Mon Nov 10 2025 07:34:56 GMT-0500"
```

**Display in user timezone:**
```typescript
// Convert UTC to user's local time for display
function formatForUser(utcTimestamp: string): string {
  const date = new Date(utcTimestamp);
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

formatForUser("2025-11-10T12:34:56Z");
// Output: "Nov 10, 2025, 7:34 AM" (EST)
```

## 7.2 Timezone Standardization

### Best Practices

**1. Database Storage:**
```typescript
// ✅ GOOD: Store as UTC ISO strings
const timestamp = new Date().toISOString();
await prisma.event.create({
  data: { timestamp }
});

// ✅ GOOD: Use PostgreSQL timestamptz
// Prisma schema:
// createdAt  DateTime  @default(now()) @db.Timestamptz
```

**2. API Responses:**
```typescript
// ✅ GOOD: Return UTC timestamps
return {
  timestamp: event.timestamp.toISOString(),
  // Include timezone info if needed
  timezone: "UTC"
};
```

**3. Log Timestamps:**
```typescript
// ✅ GOOD: UTC timestamps in logs
log.info("Battle completed", {
  timestamp: new Date().toISOString(),
  battleId: battle.id
});
```

### Common Pitfalls

**❌ Mixing Timezones:**
```typescript
// BAD: Comparing dates in different timezones
const userDate = new Date("2025-11-10T12:00:00-05:00"); // EST
const serverDate = new Date("2025-11-10T12:00:00Z");    // UTC
if (userDate > serverDate) { /* Wrong! */ }

// GOOD: Convert both to UTC first
const userDateUTC = new Date(userDate.toISOString());
const serverDateUTC = new Date(serverDate.toISOString());
if (userDateUTC > serverDateUTC) { /* Correct */ }
```

**❌ Ignoring DST:**
```typescript
// BAD: Hardcoded timezone offsets
const offset = -5; // Always EST, wrong during DST

// GOOD: Use Intl.DateTimeFormat
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York'
});
```

## 7.3 Admin Implementation Patterns

### Command Structure

**Discord Admin Commands:** `/ops [subcommand] [options]`

**Implementation Pattern:**
```typescript
// src/bot/ops/admin.ts
export async function executeOpsCommand(interaction: CommandInteraction) {
  // 1. Permission check
  if (!isAdmin(interaction.user.id)) {
    await interaction.reply({
      content: "❌ Admin only command",
      ephemeral: true
    });
    return;
  }

  // 2. Route to subcommand
  const subcommand = interaction.options.getSubcommand();
  
  switch (subcommand) {
    case 'stats':
      await executeStatsCommand(interaction);
      break;
    case 'error':
      await executeErrorCommand(interaction);
      break;
    case 'cache':
      await executeCacheCommand(interaction);
      break;
    case 'state':
      await executeStateCommand(interaction);
      break;
    default:
      await interaction.reply({
        content: `❌ Unknown subcommand: ${subcommand}`,
        ephemeral: true
      });
  }
}
```

### Permission Checking

```typescript
// src/bot/ops/permissions.ts
const ADMIN_USER_IDS = [
  "123456789012345678",  // DripTVDD
  "987654321098765432"   // Other admin
];

export function isAdmin(userId: string): boolean {
  return ADMIN_USER_IDS.includes(userId);
}

export function isGuildOwner(interaction: CommandInteraction): boolean {
  return interaction.guild?.ownerId === interaction.user.id;
}

export function hasAdminRole(interaction: CommandInteraction): boolean {
  const member = interaction.member as GuildMember;
  return member.permissions.has('Administrator');
}
```

### Paginated Responses

```typescript
// src/bot/ops/pagination.ts
export async function sendPaginatedResponse(
  interaction: CommandInteraction,
  items: any[],
  formatPage: (items: any[]) => string,
  itemsPerPage = 10
) {
  const pages = chunk(items, itemsPerPage);
  let currentPage = 0;

  const getMessage = () => ({
    content: formatPage(pages[currentPage]),
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('previous')
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(currentPage === 0),
        new ButtonBuilder()
          .setCustomId('next')
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(currentPage === pages.length - 1)
      )
    ]
  });

  const reply = await interaction.reply({
    ...getMessage(),
    ephemeral: true,
    fetchReply: true
  });

  const collector = reply.createMessageComponentCollector({
    time: 60000 // 1 minute timeout
  });

  collector.on('collect', async (buttonInteraction) => {
    if (buttonInteraction.customId === 'previous') {
      currentPage--;
    } else if (buttonInteraction.customId === 'next') {
      currentPage++;
    }

    await buttonInteraction.update(getMessage());
  });
}
```

### Error Dashboard Example

```typescript
// src/bot/ops/error-dashboard.ts
async function executeErrorCommand(interaction: CommandInteraction) {
  const filter = interaction.options.getString('filter') || 'all';
  const type = interaction.options.getString('type') || 'summary';
  
  const tracker = ErrorTracker.getInstance();
  const errors = tracker.getErrors({ filter });

  if (type === 'summary') {
    const summary = generateErrorSummary(errors);
    await interaction.reply({
      content: summary,
      ephemeral: true
    });
  } else if (type === 'detailed') {
    await sendPaginatedResponse(
      interaction,
      errors,
      (pageErrors) => formatErrorDetails(pageErrors),
      5 // 5 errors per page
    );
  }
}
```

---

[← Back to INDEX](INDEX.md) | [← Previous: Console Tooling](06-console-tooling.md)