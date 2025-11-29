# Android App Integration - Testing Checklist

## Pre-Testing Setup

### Environment
- [ ] Android Studio installed (latest version)
- [ ] Android SDK installed (API 33+ recommended)
- [ ] Android device or emulator available
- [ ] USB debugging enabled (for physical device)
- [ ] Project synced and built successfully

### Build
- [ ] Run: Build → Clean Project
- [ ] Run: Build → Rebuild Project
- [ ] Verify: No build errors in Build Output
- [ ] Verify: No lint warnings in Problems panel
- [ ] Install app on device/emulator

---

## Permission System Testing

### First Launch (Android 13+)
- [ ] **Launch app**
- [ ] **Expected:** Permission dialog appears immediately
- [ ] **Contains:** "Allow Infinity Gauntlet to send you notifications?"
- [ ] **Grant permission**
- [ ] **Expected:** Toast message "All permissions granted - App ready!"
- [ ] **Verify:** App loads normally to main screen

### First Launch - Deny Permission
- [ ] **Uninstall and reinstall app**
- [ ] **Launch app**
- [ ] **Expected:** Permission dialog appears
- [ ] **Deny permission**
- [ ] **Expected:** Toast message listing denied permission(s)
- [ ] **Verify:** App continues to load (limited features)
- [ ] **Verify:** No crash

### App Resume
- [ ] **Background app** (press Home button)
- [ ] **Return to app**
- [ ] **Expected:** No permission dialog if already granted
- [ ] **Or:** Permission dialog appears if not all granted
- [ ] **Verify:** App state preserved

### Permission Re-request
- [ ] **Deny permission on first launch**
- [ ] **Return to app later**
- [ ] **Expected:** Permission dialog appears again in onResume()
- [ ] **Grant permission this time**
- [ ] **Expected:** Toast "All permissions granted - App ready!"

### Rationale Dialog
- [ ] **Deny permission once**
- [ ] **Launch app again**
- [ ] **Expected:** Rationale dialog appears first
- [ ] **Explains:** Why permission is needed
- [ ] **Contains:** "OK" button to proceed to system dialog
- [ ] **Verify:** Can still grant permission after rationale

### Android 7-12 (API 24-32)
- [ ] **Test on Android 12 or lower**
- [ ] **Expected:** No permission dialog (auto-granted)
- [ ] **Verify:** App launches directly to main screen
- [ ] **Verify:** All features work

---

## Database Command Testing

### Basic Chat Functionality
- [ ] **Navigate to Chat screen**
- [ ] **Type:** "Hello"
- [ ] **Expected:** Message appears in chat
- [ ] **Verify:** No errors

### Help Command
- [ ] **Type:** `/help`
- [ ] **Expected:** Bot responds with command list
- [ ] **Verify:** Includes both game commands AND database commands
- [ ] **Verify:** Database commands listed:
  - `/db list`
  - `/db status <db>`
  - `/db tables <db>`
  - `/db query <db> <sql>`
  - `/db preset <name> <db>`
  - `/db help`

### Database List Command
- [ ] **Type:** `/db list`
- [ ] **Expected:** "DatabaseBot is typing..." appears
- [ ] **Expected:** Bot responds with list of 3 databases
- [ ] **Verify:** Contains:
  - Production (Render) - virginia-postgres.render.com
  - On-Premise Dev - localhost:55433
  - On-Premise Experiment - localhost:55434
- [ ] **Verify:** ASCII table formatting
- [ ] **Verify:** Timing ~500-1000ms

### Database Status Command
- [ ] **Type:** `/db status prod`
- [ ] **Expected:** "DatabaseBot is typing..." appears
- [ ] **Expected:** Connection test result
- [ ] **Verify:** Shows connection status (✅ Connected or ❌ Failed)
- [ ] **Verify:** Shows sample row counts (User, Species, BusMessage)
- [ ] **Verify:** Shows query execution time
- [ ] **Optional:** Test offline - `/db status dev` (should show error if PostgreSQL not running)

### Database Tables Command
- [ ] **Type:** `/db tables prod`
- [ ] **Expected:** "DatabaseBot is typing..." appears
- [ ] **Expected:** ASCII table with table names and row counts
- [ ] **Verify:** Contains major tables:
  - User
  - Species
  - Move
  - Type
  - BusMessage
  - ChatMessage
  - Channel
- [ ] **Verify:** Row counts displayed
- [ ] **Verify:** Formatted as ASCII table

### Database Query Command
- [ ] **Type:** `/db query prod SELECT COUNT(*) FROM "User"`
- [ ] **Expected:** "DatabaseBot is typing..." appears
- [ ] **Expected:** ASCII table with count result
- [ ] **Verify:** Shows column header "count"
- [ ] **Verify:** Shows count value
- [ ] **Verify:** ASCII box drawing characters

### Query with Results
- [ ] **Type:** `/db query prod SELECT * FROM "User" LIMIT 5`
- [ ] **Expected:** "DatabaseBot is typing..." appears
- [ ] **Expected:** ASCII table with up to 5 rows
- [ ] **Verify:** Shows column headers (id, discordId, etc.)
- [ ] **Verify:** Shows data rows
- [ ] **Verify:** Properly formatted
- [ ] **Verify:** Truncated to 20 rows max if more data

### Query with Error
- [ ] **Type:** `/db query prod SELECT * FROM NonExistentTable`
- [ ] **Expected:** "DatabaseBot is typing..." appears
- [ ] **Expected:** Error message in chat
- [ ] **Verify:** Contains error description
- [ ] **Verify:** No app crash
- [ ] **Verify:** Can continue using chat

### Database Preset Command
- [ ] **Type:** `/db preset species_count prod`
- [ ] **Expected:** "DatabaseBot is typing..." appears
- [ ] **Expected:** Count of Pokémon species
- [ ] **Verify:** Shows number
- [ ] **Verify:** Formatted as table

### All Presets
Test each preset:
- [ ] `/db preset list_tables prod`
- [ ] `/db preset table_counts prod`
- [ ] `/db preset database_size prod`
- [ ] `/db preset postgres_version prod`
- [ ] `/db preset species_count prod`
- [ ] `/db preset user_count prod`
- [ ] `/db preset recent_migrations prod`
- [ ] `/db preset table_sizes prod`
- [ ] `/db preset index_usage prod`
- [ ] `/db preset active_connections prod`

### Database Help Command
- [ ] **Type:** `/db help`
- [ ] **Expected:** Bot responds with database command help
- [ ] **Verify:** Lists all 7 commands
- [ ] **Verify:** Shows usage examples
- [ ] **Verify:** Shows database shortcuts (prod, dev, exp)

### Invalid Database Command
- [ ] **Type:** `/db invalid`
- [ ] **Expected:** Error message
- [ ] **Verify:** Helpful error (suggests /db help)
- [ ] **Verify:** No crash

### Invalid Database Name
- [ ] **Type:** `/db status invalid`
- [ ] **Expected:** Error message
- [ ] **Verify:** Lists valid databases
- [ ] **Verify:** No crash

---

## Integration Testing

### Permissions + Database
- [ ] **Launch app fresh** (uninstall/reinstall)
- [ ] **Grant notification permission**
- [ ] **Navigate to Chat**
- [ ] **Type:** `/db status prod`
- [ ] **Expected:** Database query works
- [ ] **Verify:** No permission-related errors

### Permissions + Test Execution
- [ ] **Grant notification permission**
- [ ] **Start test execution**
- [ ] **Expected:** Foreground service starts
- [ ] **Expected:** Notification appears
- [ ] **Verify:** Test runs successfully
- [ ] **Verify:** Progress updates in notification

### Multiple Database Commands
- [ ] **Type:** `/db list`
- [ ] **Wait for response**
- [ ] **Type:** `/db status prod`
- [ ] **Wait for response**
- [ ] **Type:** `/db tables prod`
- [ ] **Expected:** All commands execute successfully
- [ ] **Verify:** Responses in correct order
- [ ] **Verify:** No errors or crashes

### Game Commands + Database Commands
- [ ] **Type:** `/starter`
- [ ] **Expected:** Bot responds with starter choices
- [ ] **Type:** `/db status prod`
- [ ] **Expected:** DatabaseBot responds with status
- [ ] **Verify:** Both command types work together
- [ ] **Verify:** No interference between bots

---

## Error Handling

### Network Error
- [ ] **Disable network (airplane mode)**
- [ ] **Type:** `/db status prod`
- [ ] **Expected:** Error message about connection failure
- [ ] **Verify:** App doesn't crash
- [ ] **Enable network**
- [ ] **Retry command**
- [ ] **Expected:** Works now

### Database Timeout
- [ ] **Type:** `/db query prod SELECT pg_sleep(5); SELECT 1;`
- [ ] **Expected:** Query executes (may be slow)
- [ ] **Verify:** App remains responsive
- [ ] **Verify:** Result eventually appears

### Malformed Query
- [ ] **Type:** `/db query prod SELECT FROM`
- [ ] **Expected:** SQL syntax error message
- [ ] **Verify:** Error message in chat
- [ ] **Verify:** No app crash

### Missing Arguments
- [ ] **Type:** `/db status` (missing database)
- [ ] **Expected:** Error message about missing database
- [ ] **Verify:** Helpful error message

---

## Performance Testing

### Response Time
- [ ] **Type:** `/db status prod`
- [ ] **Start timer** when message sent
- [ ] **Stop timer** when response appears
- [ ] **Expected:** 500-1500ms typical
- [ ] **Verify:** UI remains responsive

### Large Result Set
- [ ] **Type:** `/db query prod SELECT * FROM "Species"`
- [ ] **Expected:** Result truncated to 20 rows
- [ ] **Verify:** Message displays "(showing first 20 rows)"
- [ ] **Verify:** No lag or freeze

### Multiple Rapid Commands
- [ ] **Type 3 commands quickly:**
  - `/db list`
  - `/db status prod`
  - `/db tables prod`
- [ ] **Expected:** All execute
- [ ] **Expected:** Responses in order
- [ ] **Verify:** No race conditions
- [ ] **Verify:** No crashes

---

## Memory & Cleanup

### Memory Leak Check
- [ ] **Open Chat screen**
- [ ] **Execute 10+ database commands**
- [ ] **Background and restore app multiple times**
- [ ] **Monitor:** Android Studio Profiler → Memory
- [ ] **Verify:** Memory usage stable (no leaks)

### Connection Cleanup
- [ ] **Execute database commands**
- [ ] **Exit app completely**
- [ ] **Check:** No lingering connections in PostgreSQL
- [ ] **Verify:** onCleared() cleanup worked

---

## Device/API Level Matrix

### Android 14+ (API 34+)
- [ ] **Permission dialog** - Works
- [ ] **Foreground service** - Works with dataSync type
- [ ] **Database commands** - All work
- [ ] **Notifications** - Work after permission granted

### Android 13 (API 33)
- [ ] **Permission dialog** - Works (POST_NOTIFICATIONS)
- [ ] **Foreground service** - Works (no type needed)
- [ ] **Database commands** - All work
- [ ] **Notifications** - Work after permission granted

### Android 12 (API 32)
- [ ] **No permission dialog** - Auto-granted
- [ ] **Foreground service** - Works
- [ ] **Database commands** - All work
- [ ] **Notifications** - Work automatically

### Android 7-11 (API 24-30)
- [ ] **No permission dialog** - Auto-granted
- [ ] **Foreground service** - Works
- [ ] **Database commands** - All work
- [ ] **Notifications** - Work automatically

---

## Edge Cases

### Permission Permanently Denied
- [ ] **Deny permission**
- [ ] **Check "Don't ask again"**
- [ ] **Restart app**
- [ ] **Expected:** No permission dialog (permanently denied)
- [ ] **Verify:** App continues with limited features
- [ ] **Note:** User must go to Settings to grant

### App Killed During Database Query
- [ ] **Execute long query** `/db query prod SELECT pg_sleep(10); SELECT 1;`
- [ ] **Kill app** (swipe from recent apps)
- [ ] **Expected:** Query connection closed
- [ ] **Restart app**
- [ ] **Expected:** New query works

### Invalid Database Credentials
- [ ] **Modify DatabasePresets.kt** (temporarily)
- [ ] **Set invalid password**
- [ ] **Execute** `/db status prod`
- [ ] **Expected:** Authentication error
- [ ] **Verify:** Error message displayed
- [ ] **Restore correct credentials**

---

## Regression Testing

### Existing Features Still Work
- [ ] **Home screen** - Loads correctly
- [ ] **Chat screen** - Loads correctly
- [ ] **Settings screen** - Loads correctly
- [ ] **Bottom navigation** - Works
- [ ] **Game commands** - Still work (/starter, /home, etc.)
- [ ] **Message reactions** - Still work
- [ ] **Message editing** - Still works
- [ ] **Channel switching** - Still works

---

## Final Verification

### Code Quality
- [ ] **No build errors**
- [ ] **No lint warnings**
- [ ] **No deprecation warnings**
- [ ] **All imports resolved**

### Documentation
- [ ] **INTEGRATION-COMPLETE.md** - Complete
- [ ] **PERMISSIONS-GUIDE.md** - Complete
- [ ] **DATABASE-CONNECTIVITY-GUIDE.md** - Complete
- [ ] **ARCHITECTURE-DIAGRAM.md** - Complete
- [ ] **All quick references** - Complete

### Integration Points
- [ ] **MainActivity** - PermissionHandler integrated
- [ ] **ChatViewModel** - DatabaseCommandHandler integrated
- [ ] **AndroidManifest.xml** - All permissions declared
- [ ] **TestRunnerService** - Android 14+ compliance
- [ ] **Cleanup** - All connections closed properly

---

## ✅ SUCCESS CRITERIA

All tests above should pass with:
- ✅ No crashes
- ✅ No memory leaks
- ✅ Graceful error handling
- ✅ User-friendly messages
- ✅ Responsive UI
- ✅ Proper cleanup
- ✅ Works on Android 7-14+

---

## 📝 Test Results Log

### Date: ___________
### Tester: ___________
### Device: ___________
### Android Version: ___________

### Overall Results:
- [ ] All permission tests passed
- [ ] All database tests passed
- [ ] All integration tests passed
- [ ] All error handling tests passed
- [ ] All performance tests passed
- [ ] All edge case tests passed
- [ ] All regression tests passed

### Issues Found:
1. _________________________________
2. _________________________________
3. _________________________________

### Notes:
_________________________________
_________________________________
_________________________________

---

**Status:** Ready for Testing  
**Total Checklist Items:** 150+  
**Estimated Testing Time:** 2-3 hours (comprehensive)  
**Quick Smoke Test:** 15-20 minutes (essential features only)
