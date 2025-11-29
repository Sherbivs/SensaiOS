# Database Connectivity Guide - Android App

## Overview

The Infinity Gauntlet Android app now includes **full PostgreSQL database connectivity** for querying all project databases:

- **Production (Render)** - Cloud-hosted PostgreSQL in Virginia
- **On-Premise Dev (55433)** - Local development mirror
- **On-Premise Experiment (55434)** - Migration testing cluster

## 🏗️ Architecture

```
Android App
    ↓
DatabaseCommandHandler
    ↓
DatabaseConnectionManager (Connection Pool)
    ↓
PostgreSQL JDBC Driver
    ↓
┌─────────────────────────────────────────┐
│ Production (Render)                     │
│ dpg-d3vd8h7diees73et3i3g-a.virginia... │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ On-Premise Dev (localhost:55433)        │
│ Store/onpremise-dev-primary/            │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ On-Premise Experiment (localhost:55434) │
│ Store/onpremise-dev-primary-experiment/ │
└─────────────────────────────────────────┘
```

## 📦 Components

### 1. DatabaseModels.kt
Data models for database operations:
- **DatabaseConfig** - Connection configuration
- **QueryResult** - SQL query results
- **DatabaseStatus** - Connection health/metadata
- **TableInfo** - Schema information
- **QueryPreset** - Predefined queries

### 2. DatabasePresets.kt
Predefined database configurations and queries:
- **Database Presets:**
  - `PRODUCTION` - Render cloud database
  - `ON_PREMISE_DEV` - Local dev database (55433)
  - `ON_PREMISE_EXPERIMENT` - Local experiment database (55434)

- **Query Presets:**
  - `LIST_TABLES` - Show all tables
  - `TABLE_COUNTS` - Row counts per table
  - `DATABASE_SIZE` - Database size in MB
  - `POSTGRES_VERSION` - PostgreSQL version
  - `SPECIES_COUNT` - Pokémon species count
  - `USER_COUNT` - User count
  - `RECENT_MIGRATIONS` - Last 5 migrations
  - And more...

### 3. DatabaseConnectionManager.kt
PostgreSQL connection manager with:
- **Connection pooling** - Reuse connections efficiently
- **Auto-retry logic** - 3 attempts with 1s delay
- **Health checks** - Test connectivity
- **Query execution** - Execute SQL and map results
- **Schema inspection** - Get table metadata
- **Thread-safe operations** - Coroutines on IO dispatcher

### 4. DatabaseCommandHandler.kt
Chat interface command processor:
- Process `/db` commands
- Format results as ASCII tables
- Handle errors gracefully
- Provide helpful feedback

## 🚀 Usage in Chat Interface

### Available Commands

#### 1. List All Databases
```
/db list
```
Shows all available databases with IDs and descriptions.

**Example Output:**
```
📊 Available Databases:

1. ☁️ Production (Render)
   ID: prod
   Type: PROD_RENDER
   Description: Render-managed production database (Virginia region)

2. 💻 On-Premise Dev (55433)
   ID: onpremise_dev
   Type: DEV_PRIMARY
   Description: Workstation development database (production mirror)

3. 🧪 On-Premise Experiment (55434)
   ID: onpremise_experiment
   Type: DEV_EXPERIMENT
   Description: Migration testing database (isolated experiments)
```

#### 2. Check Database Status
```
/db status [database_id]
```

**Examples:**
```
/db status prod
/db status onpremise_dev
```

**Example Output:**
```
🔍 Checking Production (Render)...

✅ Status: Connected
📦 Version: PostgreSQL 16.3 (Ubuntu 16.3-1.pgdg22.04+1)
💾 Size: 45.2 MB
📊 Tables: 23
⚡ Latency: 87ms
```

#### 3. List Tables
```
/db tables [database_id]
```

**Example:**
```
/db tables prod
```

**Example Output:**
```
📋 Tables in Production (Render):

| Schema | Table                    | Row Count |
|--------|--------------------------|-----------|
| public | Species                  | 151       |
| public | User                     | 42        |
| public | TrainerProfile           | 42        |
| public | Pokemon                  | 128       |
| public | Move                     | 344       |
...

Total: 23 tables
```

#### 4. Execute Custom Query
```
/db query [database_id] [sql]
```

**Examples:**
```
/db query prod SELECT COUNT(*) FROM "User"
/db query prod SELECT * FROM "Species" LIMIT 5
/db query onpremise_dev SELECT name, type FROM "Species" WHERE type = 'FIRE'
```

**Example Output:**
```
✅ Query executed successfully (92ms)

Rows: 1
Columns: 1

| COUNT |
|-------|
| 42    |
```

#### 5. Execute Preset Query
```
/db preset [preset_id] [database_id]
```

**Examples:**
```
/db preset species_count prod
/db preset database_size prod
/db preset table_counts onpremise_dev
```

**Example Output:**
```
🔧 Running: Species Count
📝 Description: Count Pokémon species in database

✅ Success (45ms)

| Species Count |
|---------------|
| 151           |
```

#### 6. List Query Presets
```
/db preset
```

Shows all available preset queries organized by category.

**Example Output:**
```
🔧 Available Query Presets:

SCHEMA:
  • list_tables - List All Tables
    Show all tables in the public schema
  • recent_migrations - Recent Migrations
    Show last 5 Prisma migrations

DATA:
  • table_counts - Table Row Counts
    Count rows in each table
  • species_count - Species Count
    Count Pokémon species in database
  • user_count - User Count
    Count users in database

STATISTICS:
  • database_size - Database Size
    Show database size in MB
  • table_sizes - Table Sizes
    Show size of each table
...

💡 Usage:
   /db preset [preset_id] [database_id]

Example:
   /db preset species_count prod
```

#### 7. Show Help
```
/db help
```

Displays complete command reference.

## 🔧 Integration Points

### ChatViewModel Integration

To integrate database commands into the chat interface, update `ChatViewModel.kt`:

```kotlin
import com.infinitygauntlet.simulation.database.DatabaseCommandHandler

class ChatViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
    private val channelRepository: ChannelRepository
) : ViewModel() {
    
    private val databaseHandler = DatabaseCommandHandler()
    
    fun sendMessage(content: String) {
        viewModelScope.launch {
            try {
                // Check if message is a database command
                if (databaseHandler.isDatabaseCommand(content)) {
                    // Process database command
                    val response = databaseHandler.processCommand(content)
                    
                    // Add user message
                    val userMessage = ChatMessage(
                        id = generateId(),
                        content = content,
                        sender = "User",
                        timestamp = System.currentTimeMillis(),
                        isFromUser = true
                    )
                    addMessageToState(userMessage)
                    
                    // Add bot response
                    val botMessage = ChatMessage(
                        id = generateId(),
                        content = response,
                        sender = "Infinity Gauntlet AI",
                        timestamp = System.currentTimeMillis(),
                        isFromUser = false
                    )
                    addMessageToState(botMessage)
                    
                } else {
                    // Regular message handling
                    val message = ChatMessage(
                        id = generateId(),
                        content = content,
                        sender = "User",
                        timestamp = System.currentTimeMillis(),
                        isFromUser = true
                    )
                    chatRepository.insertMessage(message)
                    addMessageToState(message)
                    
                    // Simulate AI response
                    simulateAiResponse(content)
                }
                
            } catch (e: Exception) {
                _errorState.value = "Failed to send message: ${e.message}"
            }
        }
    }
    
    override fun onCleared() {
        super.onCleared()
        databaseHandler.cleanup()  // Close connections
    }
}
```

### Activity Integration

For standalone database viewer activity:

```kotlin
class DatabaseViewerActivity : AppCompatActivity() {
    
    private lateinit var handler: DatabaseCommandHandler
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handler = DatabaseCommandHandler()
        
        lifecycleScope.launch {
            // List databases on startup
            val databases = DatabasePresets.getAllDatabases()
            databases.forEach { db ->
                val status = handler.processCommand("/db status ${db.id}")
                Log.d("DatabaseViewer", status)
            }
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        handler.cleanup()
    }
}
```

## 📱 Requirements

### Dependencies (Already Added)

```gradle
// PostgreSQL JDBC Driver
implementation("org.postgresql:postgresql:42.7.1")
```

### Permissions (Already Added)

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

### Network Security (Already Configured)

The app allows HTTPS connections to Render cloud and HTTP/HTTPS to localhost for on-premise databases.

## 🔒 Security

### Connection URLs

Database URLs are hardcoded in `DatabasePresets.kt` for demonstration purposes. For production:

1. **Use BuildConfig or Environment Variables:**
```kotlin
val PRODUCTION = DatabaseConfig(
    id = "prod",
    name = "Production (Render)",
    url = BuildConfig.PROD_DATABASE_URL,  // From gradle
    type = DatabaseType.PROD_RENDER,
    description = "Render-managed production database",
    isActive = true
)
```

2. **Or use local.properties:**
```properties
# local.properties (gitignored)
prod.database.url=postgresql://user:pass@host/db
```

3. **Or use Android Keystore:**
For maximum security, store credentials in Android Keystore.

## 🧪 Testing

### Test Database Connectivity

```kotlin
@Test
fun testProductionConnection() = runBlocking {
    val manager = DatabaseConnectionManager()
    val status = manager.testConnection(DatabasePresets.PRODUCTION)
    
    assertTrue(status.isConnected)
    assertNotNull(status.version)
    assertTrue(status.tableCount > 0)
}

@Test
fun testQueryExecution() = runBlocking {
    val manager = DatabaseConnectionManager()
    val result = manager.executeQuery(
        DatabasePresets.PRODUCTION,
        "SELECT COUNT(*) FROM \"User\""
    )
    
    assertTrue(result.success)
    assertEquals(1, result.rowCount)
    assertTrue(result.rows[0][0].toInt() > 0)
}
```

## 📊 Performance

### Connection Pooling

The `DatabaseConnectionManager` maintains a cache of active connections:

- **Cache lifetime:** Connection remains cached until closed
- **Validation:** Connections validated before reuse (5s timeout)
- **Automatic retry:** 3 attempts with 1s delay
- **Timeout settings:**
  - Connection timeout: 10s
  - Query timeout: 30s

### Memory Usage

- **Typical query:** ~50KB per QueryResult (100 rows × 5 columns)
- **Connection overhead:** ~2MB per active connection
- **Max cached connections:** 3 (one per database)
- **Total overhead:** ~6-8MB when all databases connected

## 🐛 Troubleshooting

### "Connection refused" for On-Premise Databases

**Problem:** Cannot connect to localhost:55433 or localhost:55434

**Solution:**
1. Ensure PostgreSQL clusters are running:
```bash
npm run ops:status-onpremise-dbs
```

2. Bootstrap databases if needed:
```bash
npm run ops:bootstrap-onpremise-dev
npm run ops:bootstrap-onpremise-experiment
```

3. Check ports are listening:
```bash
netstat -an | findstr 55433
netstat -an | findstr 55434
```

### "ClassNotFoundException: org.postgresql.Driver"

**Problem:** PostgreSQL JDBC driver not found

**Solution:**
1. Verify dependency in `build.gradle.kts`:
```gradle
implementation("org.postgresql:postgresql:42.7.1")
```

2. Sync Gradle files
3. Clean and rebuild project

### Query Timeout

**Problem:** Large queries timeout after 30s

**Solution:**
Increase timeout in `DatabaseConnectionManager`:
```kotlin
private const val QUERY_TIMEOUT_SEC = 60  // Increase to 60s
```

### SSL Certificate Errors (Production)

**Problem:** SSL certificate validation fails for Render database

**Solution:**
Add SSL parameters to connection URL:
```kotlin
url = "postgresql://host/db?sslmode=require&sslfactory=org.postgresql.ssl.NonValidatingFactory"
```

## 📚 Resources

### Documentation
- [PostgreSQL JDBC Driver](https://jdbc.postgresql.org/)
- [Render PostgreSQL](https://render.com/docs/databases)
- [Android Network Operations](https://developer.android.com/training/basics/network-ops)

### Project Files
- `DatabaseModels.kt` - Data models
- `DatabasePresets.kt` - Database configs and query presets
- `DatabaseConnectionManager.kt` - Connection management
- `DatabaseCommandHandler.kt` - Chat command processing

### Related Guides
- `docs/operations-bible/02-database-operations.md` - Database URL selection logic
- `docs/WORKSTATION-GAMEPLAY-SETUP.md` - Local database setup
- `docs/dual-onpremise-database-guide.md` - Dual database architecture

## 🎯 Next Steps

1. **Integrate into ChatViewModel** - Add database command handling
2. **Add Database Tab** - Create dedicated database viewer screen
3. **Implement Query History** - Save executed queries
4. **Add Export Options** - Export results to CSV/JSON
5. **Create Query Builder** - Visual query construction
6. **Add Favorites** - Save frequently used queries

---

**Last Updated:** November 29, 2025
**Status:** ✅ Ready for Integration
**Components:** 4 files (~1,200 lines)
