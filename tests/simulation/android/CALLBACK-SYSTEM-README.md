# Android App Callback System

## Overview
This system allows the Android simulation app to send test results, logs, and status updates back to your development machine in real-time.

## Architecture

```
┌─────────────────┐         HTTP/JSON          ┌──────────────────┐
│  Android App    │ ────────────────────────> │  Dev Machine     │
│  (Test Runner)  │  • Test Results            │  (Node.js Server)│
│                 │  • Logs                    │                  │
│                 │  • Status Updates          │                  │
└─────────────────┘                            └──────────────────┘
        │                                              │
        │                                              ├─> logs/
        │                                              ├─> test-results/
        │                                              └─> Web Dashboard
        │
        └─> Auto-Discovery (scans network for server)
```

## Setup Instructions

### 1. Start the Development Server

```powershell
cd C:\Users\sherb\StudioProjects\Infinity-Gauntlet\tests\simulation\android
.\start-dev-server.ps1
```

This will:
- ✅ Discover your network IP address
- ✅ Configure Windows Firewall rules
- ✅ Start the Node.js server on port 8080
- ✅ Display configuration instructions
- ✅ Open web dashboard

### 2. Configure Android App

The app will automatically discover the dev server on your network. No manual configuration needed!

**Option A: Auto-Discovery (Recommended)**

The app will scan your local network on startup and find the dev server automatically.

**Option B: Manual Configuration**

If auto-discovery fails, you can manually configure the server URL in the app settings or code.

### 3. Run the Android App

Build and run the app. It will:
1. Scan the local network for the dev server
2. Connect automatically when found
3. Send test results and logs in real-time

## Server Endpoints

### GET /ping
Health check endpoint. Returns server status.

**Response:**
```json
{
  "status": "ok",
  "message": "Dev server is running",
  "timestamp": "2025-11-29T12:00:00.000Z",
  "serverIP": "192.168.1.100"
}
```

### POST /log
Receive log messages from the Android app.

**Request:**
```json
{
  "timestamp": 1732896000000,
  "level": "info",
  "tag": "MainActivity",
  "message": "Test started"
}
```

### POST /test-result
Receive individual test results.

**Request:**
```json
{
  "testId": "test-001",
  "testName": "Starter Pokemon Selection",
  "status": "passed",
  "duration": 1234,
  "timestamp": 1732896000000,
  "message": "Test completed successfully"
}
```

### POST /test-batch
Receive batch test results.

**Request:**
```json
{
  "batchId": "batch-20251129",
  "timestamp": 1732896000000,
  "passed": 120,
  "failed": 3,
  "skipped": 20,
  "totalDuration": 45000,
  "tests": [...]
}
```

### GET /status
Get server status and statistics.

**Response:**
```json
{
  "status": "running",
  "logsReceived": 145,
  "testsReceived": 23,
  "uptime": 3600,
  "timestamp": "2025-11-29T12:00:00.000Z"
}
```

### GET /dashboard
Web-based dashboard showing real-time logs and test results.

Access at: `http://localhost:8080/dashboard`

## Network Requirements

### Firewall Rules
The setup script automatically creates firewall rules for:
- Port 8080 (default, configurable)
- Inbound TCP connections
- All network profiles (Private, Public, Domain)

### Network Configuration
Both the Android device and development machine must be on the **same network**:
- ✅ Same WiFi network
- ✅ Same subnet (e.g., 192.168.1.x)
- ❌ VPN connections may interfere
- ❌ Mobile data won't work

## Android App Integration

### DevServerClient
Main client for server communication.

```kotlin
import com.infinitygauntlet.simulation.network.DevServerClient

// Configure manually
DevServerClient.configure("http://192.168.1.100:8080")
DevServerClient.setEnabled(true)

// Send logs
DevServerClient.sendLog("info", "Test started", "MainActivity")

// Send test result
DevServerClient.sendTestResult(
    testId = "test-001",
    testName = "Starter Selection",
    status = "passed",
    duration = 1234
)
```

### DevServerDiscovery
Automatic server discovery.

```kotlin
import com.infinitygauntlet.simulation.network.DevServerDiscovery
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

GlobalScope.launch {
    val serverUrl = DevServerDiscovery.discover(context)
    if (serverUrl != null) {
        DevServerClient.configure(serverUrl)
        DevServerClient.setEnabled(true)
        // Server found and configured!
    }
}
```

### Extension Functions
Convenient logging shortcuts.

```kotlin
import com.infinitygauntlet.simulation.network.logInfo

// In any Activity or Context
logInfo("User selected Bulbasaur")
logWarn("Network connection unstable")
logError("Test failed: timeout")
```

## Data Storage

### Logs
Stored in: `logs/android-app-YYYY-MM-DD.log`

Format: JSON Lines (one JSON object per line)

```json
{"timestamp":1732896000000,"level":"info","tag":"MainActivity","message":"Test started","receivedAt":"2025-11-29T12:00:00.000Z"}
```

### Test Results
Stored in: `test-results/test-{testId}.json`

Format: JSON

```json
{
  "testId": "test-001",
  "testName": "Starter Pokemon Selection",
  "status": "passed",
  "duration": 1234,
  "timestamp": 1732896000000,
  "receivedAt": "2025-11-29T12:00:00.000Z"
}
```

### Test Batches
Stored in: `test-results/batch-{batchId}.json`

Contains full batch results with all test details.

## Troubleshooting

### Server Not Starting

**Problem:** `node: command not found`
**Solution:** Install Node.js from https://nodejs.org/

**Problem:** Port already in use
**Solution:** Change port with `.\start-dev-server.ps1 -Port 3000`

**Problem:** Firewall rule creation failed
**Solution:** Run PowerShell as Administrator

### Android App Can't Connect

**Problem:** Auto-discovery fails
**Solution:** 
1. Check both devices are on same WiFi network
2. Manually configure the IP address
3. Check Windows Firewall settings

**Problem:** Connection timeout
**Solution:**
1. Verify server is running
2. Check firewall rules: `Get-NetFirewallRule -DisplayName "Infinity-Gauntlet*"`
3. Ping the server from Android: open browser to `http://[IP]:8080/ping`

**Problem:** Wrong IP address
**Solution:** 
1. Find correct IP with `ipconfig` or `Get-NetIPAddress`
2. Update Android app configuration manually

### Performance Issues

**Problem:** Discovery takes too long
**Solution:** Use manual configuration instead of auto-discovery

**Problem:** Too many logs slowing down
**Solution:** Disable logging for non-critical components

## Advanced Configuration

### Custom Port
```powershell
.\start-dev-server.ps1 -Port 3000
```

### Skip Firewall Configuration
```powershell
.\start-dev-server.ps1 -SkipFirewall
```

### Environment Variables
```powershell
$env:PORT = "8080"
node dev-server.js
```

## Security Considerations

### Development Only
⚠️ This system is for **development and testing only**. Do not use in production.

### Network Exposure
The server listens on `0.0.0.0` (all interfaces) to allow Android device connections. This means:
- Any device on your network can connect
- No authentication is required
- Consider using a private network for testing

### Firewall Rules
The setup creates permissive firewall rules. Remove them when done:
```powershell
Remove-NetFirewallRule -DisplayName "Infinity-Gauntlet-Dev-Server-*"
```

## Monitoring

### Web Dashboard
Real-time web interface showing:
- Server statistics
- Recent logs
- Test results
- Auto-refreshes every 5 seconds

Access: `http://localhost:8080/dashboard`

### Command Line
Server logs are printed to the console in real-time with color coding:
- 📝 Blue = Log received
- 🧪 Green = Test result
- ❌ Red = Error

### Log Files
Review stored logs:
```powershell
Get-Content logs\android-app-2025-11-29.log | ConvertFrom-Json | Format-Table
```

## Files Created

```
android/
├── dev-server.js                  # Node.js server
├── start-dev-server.ps1          # Setup and start script
├── dev-server-config.md          # Generated configuration
├── logs/                         # Log storage
│   └── android-app-YYYY-MM-DD.log
├── test-results/                 # Test result storage
│   ├── test-{id}.json
│   └── batch-{id}.json
└── app/src/main/kotlin+java/com/infinitygauntlet/simulation/network/
    ├── DevServerClient.kt        # HTTP client
    └── DevServerDiscovery.kt     # Auto-discovery
```

## Quick Start Checklist

- [ ] Run `.\start-dev-server.ps1`
- [ ] Note the displayed IP address
- [ ] Build and run Android app
- [ ] Verify connection in app logs or dashboard
- [ ] Open dashboard: `http://localhost:8080/dashboard`
- [ ] Run tests and watch results appear in real-time

## Support

For issues or questions:
1. Check server logs in terminal
2. Check Android logcat for connection errors
3. Verify network configuration
4. Review firewall rules

---

**Status:** ✅ Complete and Ready
**Last Updated:** November 29, 2025
