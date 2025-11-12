# Datetime Utilities - Eastern Time (EST/EDT)

**Purpose**: Centralized datetime formatting utilities for consistent Eastern Time display across all user-facing timestamps.

**Location**: `src/shared/datetime.js`

## Overview

All user-facing timestamps in the Infinity Gauntlet application should display in Eastern Time (America/New_York timezone), which automatically handles EST (Eastern Standard Time) and EDT (Eastern Daylight Time) transitions.

**Why Eastern Time?**
- Primary user base is in Eastern timezone
- Discord bot serves primarily EST/EDT users
- Consistent user experience across all notifications and reports

## Functions

### `toEasternString(date, options)`

Convert any date to Eastern Time locale string with full date and time.

**Parameters:**
- `date` - Date object, timestamp (number), or ISO string
- `options` - (Optional) Intl.DateTimeFormat options to override defaults

**Returns:** Formatted string (e.g., "11/12/2025, 8:21:32 PM")

**Example:**
```javascript
import { toEasternString } from '../shared/datetime.js';

const now = new Date();
console.log(toEasternString(now));
// Output: "11/12/2025, 8:21:32 PM"

// Custom options
console.log(toEasternString(now, { weekday: 'long' }));
// Output: "Tuesday, 11/12/2025, 8:21:32 PM"
```

### `toEasternTime(date)`

Format time only in Eastern Time (no date portion).

**Parameters:**
- `date` - Date object, timestamp (number), or ISO string

**Returns:** Time string (e.g., "8:21:32 PM")

**Example:**
```javascript
import { toEasternTime } from '../shared/datetime.js';

const now = new Date();
console.log(toEasternTime(now));
// Output: "8:21:32 PM"
```

### `toEasternDate(date)`

Format date only in Eastern Time (no time portion).

**Parameters:**
- `date` - Date object, timestamp (number), or ISO string

**Returns:** Date string (e.g., "11/12/2025")

**Example:**
```javascript
import { toEasternDate } from '../shared/datetime.js';

const now = new Date();
console.log(toEasternDate(now));
// Output: "11/12/2025"
```

### `toEasternShort(date)`

Format date and time in Eastern Time without seconds.

**Parameters:**
- `date` - Date object, timestamp (number), or ISO string

**Returns:** Short format string (e.g., "11/12/2025, 8:21 PM")

**Example:**
```javascript
import { toEasternShort } from '../shared/datetime.js';

const now = new Date();
console.log(toEasternShort(now));
// Output: "11/12/2025, 8:21 PM"
```

### `toEasternLong(date)`

Format date and time in Eastern Time with weekday.

**Parameters:**
- `date` - Date object, timestamp (number), or ISO string

**Returns:** Long format string (e.g., "Tuesday, 11/12/2025, 8:21:32 PM")

**Example:**
```javascript
import { toEasternLong } from '../shared/datetime.js';

const now = new Date();
console.log(toEasternLong(now));
// Output: "Tuesday, 11/12/2025, 8:21:32 PM"
```

### `nowEastern()`

Get current date/time formatted in Eastern Time.

**Returns:** Current timestamp string (e.g., "11/12/2025, 8:21:32 PM")

**Example:**
```javascript
import { nowEastern } from '../shared/datetime.js';

console.log(nowEastern());
// Output: "11/12/2025, 8:21:32 PM"
```

### `getEasternTimezoneAbbr(date)`

Get timezone abbreviation for a given date (EST or EDT).

**Parameters:**
- `date` - (Optional) Date object, timestamp (number), or ISO string (defaults to now)

**Returns:** Timezone abbreviation string ("EST" or "EDT")

**Example:**
```javascript
import { getEasternTimezoneAbbr } from '../shared/datetime.js';

// Winter date
const winter = new Date('2025-01-15');
console.log(getEasternTimezoneAbbr(winter));
// Output: "EST"

// Summer date
const summer = new Date('2025-07-15');
console.log(getEasternTimezoneAbbr(summer));
// Output: "EDT"
```

## Usage Patterns

### Security Bot Restart Notification

```javascript
import { toEasternString } from '../shared/datetime.js';

const message = `🛡️ Security Monitor - System Status Report\n`;
message += `Restarted at ${toEasternString(new Date())}\n`;
// Output: "Restarted at 11/12/2025, 8:21:32 PM"
```

### Daily Summary Reports

```javascript
import { toEasternDate, toEasternTime } from '../shared/datetime.js';

const generatedAt = new Date();
const headerDate = toEasternDate(generatedAt);
const headerTime = toEasternTime(generatedAt);
const header = `Daily Security Summary — ${headerDate} @ ${headerTime}`;
// Output: "Daily Security Summary — 11/12/2025 @ 8:21:32 PM"
```

### Timeline Events

```javascript
import { toEasternString } from '../shared/datetime.js';

const timestamp = toEasternString(new Date(event.timestamp), {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: undefined,
});
// Output: "Nov 12, 8:21 PM"
```

## Migration Guide

**Old Code (UTC):**
```javascript
const timestamp = new Date().toLocaleString();
// Output: "11/12/2025, 1:21:32 AM" (UTC - wrong for users)
```

**New Code (Eastern Time):**
```javascript
import { toEasternString } from '../shared/datetime.js';
const timestamp = toEasternString(new Date());
// Output: "11/12/2025, 8:21:32 PM" (EST/EDT - correct for users)
```

## Files Updated

The following files have been updated to use Eastern Time formatting:

1. **src/bot/Main.js**
   - `notifyServiceRestart()` - Restart notification timestamps
   - `formatSummaryReport()` - Daily summary report timestamps
   - `formatDateWithRelative()` - Date formatting with relative time

2. **src/bot/state/timeline.js**
   - `formatTimelineEvent()` - Timeline event timestamps

3. **Additional files to update** (as needed):
   - `src/bot/dripAlerts.js` - Alert timestamps
   - Any other user-facing timestamp displays

## Testing

When testing timezone functionality:

1. **Local Development**: System uses local timezone for Intl.DateTimeFormat, but specifies America/New_York
2. **Production (Render)**: Uses UTC system time but formats to Eastern Time via timezone conversion
3. **Verification**: Check that timestamps match Eastern Time (UTC-5 in winter, UTC-4 in summer)

**Test Cases:**
```javascript
import { toEasternString, getEasternTimezoneAbbr } from '../shared/datetime.js';

// Test winter date (EST)
const winterDate = new Date('2025-01-15T18:00:00Z'); // 1 PM EST
console.log(toEasternString(winterDate)); // Should show "1/15/2025, 1:00:00 PM"
console.log(getEasternTimezoneAbbr(winterDate)); // Should show "EST"

// Test summer date (EDT)
const summerDate = new Date('2025-07-15T18:00:00Z'); // 2 PM EDT
console.log(toEasternString(summerDate)); // Should show "7/15/2025, 2:00:00 PM"
console.log(getEasternTimezoneAbbr(summerDate)); // Should show "EDT"
```

## Best Practices

1. **Always use these utilities** for user-facing timestamps
2. **Store timestamps as UTC** in the database (Date objects, ISO strings)
3. **Convert to Eastern Time** only for display
4. **Use appropriate format** for context:
   - Full timestamps: `toEasternString()` or `toEasternLong()`
   - Time only: `toEasternTime()`
   - Date only: `toEasternDate()`
   - Compact: `toEasternShort()`
5. **Document timezone** in user-facing messages when ambiguous

## Troubleshooting

**Issue**: Timestamps showing wrong time
- **Cause**: Using `toLocaleString()` without timezone parameter (defaults to UTC on Render)
- **Solution**: Use `toEasternString()` or equivalent function

**Issue**: Timezone abbreviation showing wrong value
- **Cause**: DST transition edge case
- **Solution**: `getEasternTimezoneAbbr()` handles this automatically

**Issue**: Import errors in CommonJS files
- **Cause**: Mixing ES6 imports with CommonJS
- **Solution**: Use `require()` for CommonJS files, `import` for ES modules
