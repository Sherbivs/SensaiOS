# Android App Architecture - Integration Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ANDROID APP                                 │
│                    Infinity Gauntlet Simulation                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         MainActivity.kt                             │
│                       (ComponentActivity)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  onCreate() {                                                       │
│    • permissionHandler = PermissionHandler(this)                   │
│    • requestRequiredPermissions()                                  │
│    • setContent { MainScreen() }                                   │
│  }                                                                  │
│                                                                     │
│  onResume() {                                                       │
│    • Re-check permissions                                          │
│  }                                                                  │
│                                                                     │
│  ┌───────────────────────────────────────────────────┐            │
│  │         Permission Request Flow                    │            │
│  ├───────────────────────────────────────────────────┤            │
│  │                                                    │            │
│  │  requestRequiredPermissions()                     │            │
│  │           ↓                                        │            │
│  │  PermissionHandler.requestAllPermissions()        │            │
│  │           ↓                                        │            │
│  │  [System Permission Dialog]                       │            │
│  │           ↓                                        │            │
│  │  onGranted() → Toast + App Ready                  │            │
│  │  onDenied() → Toast + Limited Features            │            │
│  │                                                    │            │
│  └───────────────────────────────────────────────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
                    [Jetpack Compose UI]
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        Navigation System                            │
│                      (Bottom Nav + NavGraph)                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  • Home Screen                                                      │
│  • Chat Screen ← Database commands work here                       │
│  • Settings Screen                                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                       ChatViewModel.kt                              │
│                         (@HiltViewModel)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Properties:                                                        │
│    • chatRepository: ChatRepository                                │
│    • channelRepository: ChannelRepository                          │
│    • databaseHandler: DatabaseCommandHandler ← NEW                 │
│                                                                     │
│  ┌───────────────────────────────────────────────────┐            │
│  │           Message Processing Flow                  │            │
│  ├───────────────────────────────────────────────────┤            │
│  │                                                    │            │
│  │  sendMessage(content)                             │            │
│  │           ↓                                        │            │
│  │  Insert user message to chat                      │            │
│  │           ↓                                        │            │
│  │  Is /db command?                                  │            │
│  │      ↓ YES        ↓ NO                            │            │
│  │  handleDatabase   simulateBotResponse()           │            │
│  │  Command()                                        │            │
│  │      ↓                                             │            │
│  │  Show "DatabaseBot is typing..."                  │            │
│  │      ↓                                             │            │
│  │  withContext(Dispatchers.IO) {                    │            │
│  │    databaseHandler.processCommand()               │            │
│  │  }                                                 │            │
│  │      ↓                                             │            │
│  │  Insert bot message with results                  │            │
│  │      ↓                                             │            │
│  │  Display ASCII table in chat                      │            │
│  │                                                    │            │
│  └───────────────────────────────────────────────────┘            │
│                                                                     │
│  onCleared() {                                                      │
│    • databaseHandler.cleanup() ← Close connections                │
│  }                                                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                   DatabaseCommandHandler.kt                         │
│                     (Database Query Processor)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  processCommand(command: String): String                           │
│           ↓                                                         │
│  Parse command (list, status, tables, query, preset, help)        │
│           ↓                                                         │
│  Execute via DatabaseConnectionManager                             │
│           ↓                                                         │
│  Format results as ASCII table                                     │
│           ↓                                                         │
│  Return formatted string                                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                 DatabaseConnectionManager.kt                        │
│                   (PostgreSQL JDBC Manager)                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Features:                                                          │
│    • Connection pooling (cache connections)                        │
│    • Auto-retry (3 attempts with 1s delay)                         │
│    • Health checks (testConnection)                                │
│    • Query execution (executeQuery)                                │
│    • Table introspection (getTableInfo)                            │
│    • Timeout handling (10s connect, 30s query)                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        Database Layer                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │  PRODUCTION DB   │  │  ON-PREMISE DEV  │  │  ON-PREMISE EXP │ │
│  │  (Render)        │  │  (localhost:5543)│  │  (localhost:5544)│ │
│  ├──────────────────┤  ├──────────────────┤  ├─────────────────┤ │
│  │ • User           │  │ • User           │  │ • User          │ │
│  │ • Species        │  │ • Species        │  │ • Species       │ │
│  │ • BusMessage     │  │ • BusMessage     │  │ • BusMessage    │ │
│  │ • ChatMessage    │  │ • ChatMessage    │  │ • ChatMessage   │ │
│  │ • ...            │  │ • ...            │  │ • ...           │ │
│  └──────────────────┘  └──────────────────┘  └─────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════
                        PERMISSION SYSTEM
═══════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────┐
│                      PermissionHandler.kt                           │
│                  (Runtime Permission Manager)                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Android System Permissions:                                        │
│                                                                     │
│  ┌──────────────────────────────────────────────┐                 │
│  │  Normal Permissions (Auto-Granted)           │                 │
│  ├──────────────────────────────────────────────┤                 │
│  │  ✅ INTERNET                                 │                 │
│  │  ✅ ACCESS_NETWORK_STATE                     │                 │
│  │  ✅ ACCESS_WIFI_STATE                        │                 │
│  │  ✅ FOREGROUND_SERVICE                       │                 │
│  │  ✅ FOREGROUND_SERVICE_DATA_SYNC (API 34+)   │                 │
│  │  ✅ WAKE_LOCK                                │                 │
│  │  ✅ VIBRATE                                  │                 │
│  └──────────────────────────────────────────────┘                 │
│                                                                     │
│  ┌──────────────────────────────────────────────┐                 │
│  │  Dangerous Permissions (Runtime Request)     │                 │
│  ├──────────────────────────────────────────────┤                 │
│  │  ⚠️ POST_NOTIFICATIONS (API 33+ / Android 13)│                 │
│  └──────────────────────────────────────────────┘                 │
│                                                                     │
│  Methods:                                                           │
│    • requestAllPermissions()                                       │
│    • requestNotificationPermission()                               │
│    • areAllPermissionsGranted(): Boolean                           │
│    • getPermissionDescriptions(): List<String>                     │
│                                                                     │
│  Extension Functions:                                               │
│    • Context.hasNotificationPermission(): Boolean                  │
│    • Context.hasAllRequiredPermissions(): Boolean                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════
                          DATA MODELS
═══════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────┐
│                      DatabaseModels.kt                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  • DatabaseConfig - Database connection info                       │
│  • QueryResult - Query execution result                            │
│  • DatabaseStatus - Connection health status                       │
│  • TableInfo - Table metadata                                      │
│  • ColumnInfo - Column metadata                                    │
│  • ForeignKeyInfo - Foreign key metadata                           │
│  • QueryPreset - Pre-built query definitions                       │
│                                                                     │
│  All Parcelable for Android Intent passing                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     DatabasePresets.kt                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  3 Database Configurations:                                         │
│    • PRODUCTION (Render cloud)                                     │
│    • ON_PREMISE_DEV (localhost:55433)                              │
│    • ON_PREMISE_EXPERIMENT (localhost:55434)                       │
│                                                                     │
│  10 Query Presets:                                                  │
│    1. list_tables - Show all tables                                │
│    2. table_counts - Count rows in major tables                    │
│    3. database_size - Show database size                           │
│    4. postgres_version - Show PostgreSQL version                   │
│    5. species_count - Count Pokémon species                        │
│    6. user_count - Count registered users                          │
│    7. recent_migrations - Show recent migrations                   │
│    8. table_sizes - Show table sizes                               │
│    9. index_usage - Show index usage statistics                    │
│   10. active_connections - Show active connections                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════
                       INTEGRATION SUMMARY
═══════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────┐
│                      WHAT WAS INTEGRATED                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ✅ MainActivity.kt                                                 │
│     • PermissionHandler initialization                             │
│     • Permission request flow                                      │
│     • onResume() re-check                                          │
│     • Graceful denial handling                                     │
│     • Toast notifications                                          │
│                                                                     │
│  ✅ ChatViewModel.kt                                                │
│     • DatabaseCommandHandler initialization                        │
│     • /db command detection                                        │
│     • handleDatabaseCommand() method                               │
│     • DatabaseBot typing indicator                                 │
│     • IO thread execution                                          │
│     • Cleanup in onCleared()                                       │
│     • Updated /help command                                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         USER EXPERIENCE                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  App Launch:                                                        │
│    1. App starts                                                    │
│    2. Permission dialog appears (Android 13+)                      │
│    3. User grants/denies permissions                               │
│    4. Toast notification shows status                              │
│    5. App continues (with or without permissions)                  │
│                                                                     │
│  Chat Usage:                                                        │
│    1. Open Chat screen                                             │
│    2. Type: /help (see all commands)                               │
│    3. Type: /db status prod                                        │
│    4. "DatabaseBot is typing..." appears                           │
│    5. Query executes (500-1000ms)                                  │
│    6. Results appear as ASCII table                                │
│    7. Continue chatting normally                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════
                         DOCUMENTATION
═══════════════════════════════════════════════════════════════════════

• INTEGRATION-COMPLETE.md (600+ lines) - Complete integration guide
• PERMISSIONS-GUIDE.md (450 lines) - Complete permission docs
• PERMISSIONS-QUICK-REFERENCE.md (100 lines) - Quick permission reference
• DATABASE-CONNECTIVITY-GUIDE.md (585 lines) - Complete database docs
• DATABASE-QUICK-REFERENCE.md (65 lines) - Quick database reference
• DATABASE-IMPLEMENTATION-SUMMARY.md (350 lines) - Implementation summary

═══════════════════════════════════════════════════════════════════════
                      NEXT STEPS
═══════════════════════════════════════════════════════════════════════

1. Build and run app on Android device/emulator (API 33+ recommended)
2. Grant permissions when prompted
3. Navigate to Chat screen
4. Type /help to see all commands
5. Test database commands:
   - /db list
   - /db status prod
   - /db tables prod
   - /db query prod SELECT COUNT(*) FROM "User"
6. Verify features:
   - Permission dialog appears
   - DatabaseBot typing indicator shows
   - Query results appear as ASCII tables
   - No crashes on errors

═══════════════════════════════════════════════════════════════════════
Status: ✅ INTEGRATION COMPLETE - READY FOR TESTING
═══════════════════════════════════════════════════════════════════════
```
