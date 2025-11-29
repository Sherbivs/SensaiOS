# 🚀 Quick Reference Card

## Start Development Server

```powershell
.\start-dev-server.ps1
```

**Your Server URLs:**
- Local: `http://localhost:3000`
- Network: `http://192.168.23.83:3000`
- API Base: `http://192.168.23.83:3000/api`

---

## Test Server Connection

```powershell
# Health check
curl http://192.168.23.83:3000/api/health

# Get stats
curl http://192.168.23.83:3000/api/stats
```

---

## Build & Install Android App

```powershell
# Build and install
.\build-android.ps1 -Install

# Build only
.\build-android.ps1

# Release build
.\build-android.ps1 -Release
```

---

## Verify Setup

```powershell
# Run all setup tests
.\test-setup.ps1
```

---

## Update Android IP (if needed)

```powershell
.\start-dev-server.ps1 -UpdateAndroidConfig
```

Or manually edit:
`app/src/main/kotlin+java/com/infinitygauntlet/simulation/network/ApiClient.kt`

```kotlin
private const val DEV_SERVER_IP = "192.168.23.83"
```

---

## Key Files

| File | Purpose |
|------|---------|
| `start-dev-server.ps1` | Start Node.js API server |
| `dev-server.mjs` | Server implementation |
| `build-android.ps1` | Build Android APK |
| `test-setup.ps1` | Verify configuration |
| `NETWORKING_SETUP.md` | Full documentation |
| `ApiClient.kt` | Android HTTP client |

---

## API Endpoints

```
GET  /api/health          Health check
GET  /api/config          Configuration
POST /api/session         Create session
POST /api/test-result     Submit result
POST /api/command         Execute command
GET  /api/stats           Statistics
```

---

## Troubleshooting

**Connection refused?**
1. Check server is running: `netstat -an | findstr ":3000"`
2. Verify IP in Android app matches: `192.168.23.83`
3. Check firewall: `Get-NetFirewallRule -DisplayName "Infinity-Gauntlet-Dev-Server"`

**Can't reach from Android?**
1. Use `10.0.2.2` for emulator (or actual IP: `192.168.23.83`)
2. Physical device: Must be on same WiFi network
3. Check network security config allows cleartext HTTP

---

## Workflow

1. **Start server**: `.\start-dev-server.ps1`
2. **Build app**: `.\build-android.ps1 -Install`
3. **Open app** on device/emulator
4. **Run tests** in the app
5. **View results** in server terminal and app

---

**Your Local IP:** `192.168.23.83`  
**Server Port:** `3000`  
**Status:** ✅ Ready

---

*Last Updated: November 29, 2025*
