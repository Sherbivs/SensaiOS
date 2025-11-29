# Android App ↔ Dev Server Communication Setup

## Overview

This setup allows the Android test app to communicate with a local Node.js development server running on your machine. The server simulates the Infinity Gauntlet backend, handling test results, bot commands, and session management.

---

## 🚀 Quick Start

### 1. Start the Development Server

```powershell
# Navigate to android directory
cd C:\Users\sherb\StudioProjects\Infinity-Gauntlet\tests\simulation\android

# Start server (automatically configures everything)
.\start-dev-server.ps1
```

The script will:
- ✅ Detect your local IP address
- ✅ Configure Windows Firewall rules
- ✅ Start the Node.js server on port 3000
- ✅ Display connection URLs

### 2. Update Android App Configuration

**Option A: Automatic (Recommended)**
```powershell
.\start-dev-server.ps1 -UpdateAndroidConfig
```

**Option B: Manual**

Edit `app/src/main/kotlin+java/com/infinitygauntlet/simulation/network/ApiClient.kt`:

```kotlin
private const val DEV_SERVER_IP = "YOUR_LOCAL_IP"  // e.g., "192.168.1.100"
private const val DEV_SERVER_PORT = 3000
```

### 3. Build and Run Android App

```powershell
.\build-android.ps1 -Install
```

Or use Android Studio:
1. Open project
2. Run → Run 'app' (Shift+F10)

---

## 📡 Server Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/config` | App configuration |
| POST | `/api/session` | Create test session |
| GET | `/api/session/:id` | Get session info |
| POST | `/api/test-result` | Submit test result |
| GET | `/api/test-results` | Get all results |
| POST | `/api/command` | Execute bot command |
| GET | `/api/stats` | Server statistics |

---

## 🧪 Testing the Connection

### From PowerShell (on dev machine)

```powershell
# Health check
curl http://localhost:3000/api/health

# Get configuration
curl http://localhost:3000/api/config

# Get statistics
curl http://localhost:3000/api/stats
```

### From Android App

The app includes built-in connection testing:

```kotlin
val apiClient = ApiClient(context)

// Test connection
val result = apiClient.testConnection()
if (result.isSuccess) {
    Log.i("API", "Connected to dev server!")
}
```

### From Android Device/Emulator

**For Emulator:**
- Use `10.0.2.2` instead of `localhost`
- Or use your actual local IP (e.g., `192.168.1.100`)

**For Physical Device:**
- Must be on the same WiFi network
- Use your local IP address (e.g., `192.168.1.100`)

---

## 🔥 Firewall Configuration

### Automatic Setup (Included in start-dev-server.ps1)

The PowerShell script automatically creates a firewall rule:

```powershell
Rule Name: "Infinity-Gauntlet-Dev-Server"
Protocol:  TCP
Ports:     3000-3010
Direction: Inbound
Action:    Allow
Profile:   Private, Domain
```

### Manual Firewall Configuration

If you need to configure manually:

1. Open Windows Defender Firewall
2. Advanced Settings → Inbound Rules → New Rule
3. Rule Type: Port
4. Protocol: TCP, Ports: 3000-3010
5. Action: Allow the connection
6. Profile: Check Private and Domain
7. Name: "Infinity-Gauntlet-Dev-Server"

---

## 🌐 Network Requirements

### For Android Emulator

**Local server URL options:**
- `http://10.0.2.2:3000/api` - Emulator's special alias for host
- `http://localhost:3000/api` - May not work on all emulators
- `http://YOUR_LOCAL_IP:3000/api` - Always works

### For Physical Device

**Requirements:**
1. Device and dev machine on same WiFi network
2. Windows Firewall allows inbound on port 3000
3. Use dev machine's local IP (not localhost)

**Find your local IP:**
```powershell
# Run this in PowerShell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' 
}
```

### Network Security

The Android app is configured to allow HTTP (cleartext) traffic for:
- `localhost` and `127.0.0.1`
- `10.0.2.2` (emulator host alias)
- Local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)

This is configured in `res/xml/network_security_config.xml`.

⚠️ **Security Note:** This configuration is for **development only**. Production builds should use HTTPS.

---

## 📊 Usage Examples

### Create a Test Session

```kotlin
val apiClient = ApiClient(context)

// Create session
val deviceInfo = mapOf(
    "model" to Build.MODEL,
    "androidVersion" to Build.VERSION.RELEASE,
    "appVersion" to "1.0.0"
)

val sessionResult = apiClient.createSession(deviceInfo)
if (sessionResult.isSuccess) {
    val sessionId = sessionResult.getOrNull()
    Log.i("API", "Session ID: $sessionId")
}
```

### Submit Test Results

```kotlin
// Submit a test result
val result = apiClient.submitTestResult(
    testName = "Starter Selection Test",
    status = "passed",
    duration = 1250, // milliseconds
    details = mapOf(
        "selectedStarter" to "Charmander",
        "assertions" to 5
    )
)
```

### Execute Bot Commands

```kotlin
// Execute a command
val commandResult = apiClient.executeCommand(
    command = "/starter",
    channel = "homestead",
    userId = "user123"
)

if (commandResult.isSuccess) {
    val response = commandResult.getOrNull()
    val message = response?.optJSONObject("response")?.optString("message")
    Log.i("API", "Bot response: $message")
}
```

---

## 🐛 Troubleshooting

### "Connection refused" Error

**Possible causes:**
1. Dev server not running
   - **Fix:** Run `.\start-dev-server.ps1`

2. Wrong IP address in Android app
   - **Fix:** Update `ApiClient.kt` with correct local IP
   - Run `.\start-dev-server.ps1 -UpdateAndroidConfig`

3. Firewall blocking connections
   - **Fix:** Run start script as Administrator
   - Or manually configure firewall rule

4. Not on same network (physical device)
   - **Fix:** Connect device to same WiFi as dev machine

### "Unable to resolve host" Error

**Android emulator:**
- Use `10.0.2.2` instead of `localhost`
- Update `DEV_SERVER_IP` in `ApiClient.kt`

**Physical device:**
- Cannot use `localhost` - must use actual IP
- Get IP with: `ipconfig` (Windows) or check start-dev-server output

### Server Starts But No Connections

1. **Check firewall:**
   ```powershell
   Get-NetFirewallRule -DisplayName "Infinity-Gauntlet-Dev-Server"
   ```

2. **Verify server is listening:**
   ```powershell
   netstat -an | findstr ":3000"
   ```
   Should show: `0.0.0.0:3000` or `:::3000`

3. **Test from dev machine:**
   ```powershell
   curl http://localhost:3000/api/health
   ```

4. **Test from same network:**
   ```powershell
   curl http://YOUR_LOCAL_IP:3000/api/health
   ```

### Timeout Errors

- Default timeout: 10 seconds
- Check network latency
- Increase timeout in `ApiClient.kt`:
  ```kotlin
  private const val TIMEOUT_MS = 30000 // 30 seconds
  ```

---

## 📝 Server Features

### Session Management

The server tracks test sessions:
- Creates unique session IDs
- Stores device information
- Associates test results with sessions

### Test Result Storage

All test results are stored in memory:
- Test name and status
- Execution duration
- Custom details/metadata
- Timestamp

### Command Simulation

The server simulates bot command responses:
- `/starter` - Starter selection flow
- `/home` - Home screen navigation
- `/walk` - Wild encounter simulation
- `/heal` - Pokémon healing
- `/battle` - Battle initiation

### Real-time Statistics

Access via `/api/stats`:
- Server uptime
- Total requests processed
- Active sessions count
- Test results summary (passed/failed/pass rate)

---

## 🔧 Advanced Configuration

### Change Server Port

```powershell
.\start-dev-server.ps1 -Port 3001
```

Then update Android app:
```kotlin
private const val DEV_SERVER_PORT = 3001
```

### Multiple Server Instances

Run multiple servers on different ports for parallel testing:

```powershell
# Terminal 1
.\start-dev-server.ps1 -Port 3000

# Terminal 2  
.\start-dev-server.ps1 -Port 3001
```

### Custom Request Logging

The server logs all requests with:
- Timestamp
- Method and path
- Response status
- Color-coded output

---

## 📚 Files Reference

| File | Purpose |
|------|---------|
| `start-dev-server.ps1` | Main setup script |
| `dev-server.mjs` | Node.js API server |
| `app/.../ApiClient.kt` | Android HTTP client |
| `res/xml/network_security_config.xml` | Network security policy |
| `AndroidManifest.xml` | App permissions and config |

---

## ✅ Verification Checklist

Before running tests, verify:

- [ ] Dev server is running (`start-dev-server.ps1`)
- [ ] Firewall rule is active
- [ ] Android app has correct IP in `ApiClient.kt`
- [ ] Device/emulator on same network (if physical device)
- [ ] Can access `http://YOUR_IP:3000/api/health`
- [ ] Android app has INTERNET permission
- [ ] Network security config allows cleartext traffic

---

## 🎯 Next Steps

1. **Start the dev server**
   ```powershell
   .\start-dev-server.ps1 -UpdateAndroidConfig
   ```

2. **Build and install the app**
   ```powershell
   .\build-android.ps1 -Install
   ```

3. **Test the connection**
   - Open the app
   - It will automatically test connectivity on launch
   - Check logcat for connection status

4. **Run tests**
   - Navigate to main screen
   - Tap "Run All Tests"
   - View results in real-time
   - Check server terminal for incoming requests

---

**Last Updated:** November 29, 2025  
**Version:** 1.0  
**Status:** ✅ Ready for testing
