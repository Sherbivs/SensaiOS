# Database Commands Quick Reference

## 🔌 Database IDs
- `prod` - Production (Render Cloud)
- `onpremise_dev` - On-Premise Dev (localhost:55433)
- `onpremise_experiment` - On-Premise Experiment (localhost:55434)

## 💬 Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/db list` | List all databases | `/db list` |
| `/db status [id]` | Check connection status | `/db status prod` |
| `/db tables [id]` | List tables with row counts | `/db tables prod` |
| `/db query [id] [sql]` | Execute custom SQL query | `/db query prod SELECT COUNT(*) FROM "User"` |
| `/db preset [preset] [id]` | Execute preset query | `/db preset species_count prod` |
| `/db preset` | List all presets | `/db preset` |
| `/db help` | Show help message | `/db help` |

## 📊 Query Presets

### Schema
- `list_tables` - Show all tables
- `recent_migrations` - Last 5 migrations

### Data
- `table_counts` - Row counts per table
- `species_count` - Pokémon species count
- `user_count` - User count

### Statistics
- `database_size` - Database size in MB
- `table_sizes` - Table sizes
- `index_usage` - Index usage stats

### Diagnostics
- `postgres_version` - PostgreSQL version
- `active_connections` - Connection count

## 🚀 Quick Start

### 1. List Available Databases
```
/db list
```

### 2. Check Production Status
```
/db status prod
```

### 3. Count Species
```
/db preset species_count prod
```

### 4. Custom Query
```
/db query prod SELECT name, type FROM "Species" LIMIT 5
```

## 📚 Documentation
- **DATABASE-CONNECTIVITY-GUIDE.md** - Complete usage guide
- **DATABASE-IMPLEMENTATION-SUMMARY.md** - Implementation details

## 🔧 Integration

Add to ChatViewModel:

```kotlin
private val databaseHandler = DatabaseCommandHandler()

fun sendMessage(content: String) {
    viewModelScope.launch {
        if (databaseHandler.isDatabaseCommand(content)) {
            val response = databaseHandler.processCommand(content)
            addBotMessage(response)
        } else {
            // Regular message handling
        }
    }
}

override fun onCleared() {
    super.onCleared()
    databaseHandler.cleanup()
}
```

---

**Status:** ✅ Ready for Integration  
**Last Updated:** November 29, 2025
