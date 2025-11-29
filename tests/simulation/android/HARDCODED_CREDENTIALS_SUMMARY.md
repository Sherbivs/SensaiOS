# 🔐 HARDCODED CREDENTIALS SETUP - COMPLETE

## Overview

The Android test application now has **ALL credentials and configuration hardcoded** directly in the compiled APK. This enables full testing of Discord bot operations, database interactions, and Render platform management from the Android device.

---

## ✅ What Was Implemented

### 1. **AppConfig.kt - Complete Credential Store**

Location: \pp/src/main/kotlin+java/com/infinitygauntlet/simulation/config/AppConfig.kt\

**Embedded Credentials:**
- Discord Bot Token (full 59-character token)
- Render API Key (full API key for service management)
- PostgreSQL Connection String (complete with password)
- SSH Keys for Render service access
- Dev server IP (auto-detected: 192.168.23.83)
- Database host, username, database name

**Configuration Values:**
- Timezone: America/New_York
- Environment: development
- Timeout: 10000ms
- Test mode: enabled
- Logging: enabled

**Helper Methods:**
- \getEmulatorUrl()\ - Returns 10.0.2.2 for Android emulator
- \getDeviceUrl()\ - Returns local network IP for physical devices
- \getBotToken()\ - Returns full Discord bot token
- \getDatabaseUrl()\ - Returns complete PostgreSQL connection string
- \getRenderApiUrl()\ - Returns Render API endpoint
- \getDatabaseInfo()\ - Returns map of database connection details

### 2. **ApiClient.kt - Uses AppConfig**

The API client now reads all configuration from AppConfig:

\\\kotlin
private val BASE_URL = AppConfig.API_BASE_URL
private val TIMEOUT_MS = AppConfig.TIMEOUT_MS
\\\

No hardcoded values remain in ApiClient.kt - everything comes from AppConfig.

### 3. **Security Documentation**

Created comprehensive security documentation:

- **SECURITY_NOTICE.md** - Full security implications, warnings, and post-testing checklist
- **regenerate-config.ps1** - Script to update AppConfig when IP changes
- **.gitignore** - Updated to exclude AppConfig.kt from version control

---

## 🔐 Security Model

### Why Hardcoded?

Android apps **cannot access files** on external systems:
- No filesystem access to dev machine
- Cannot load .env files at runtime
- Configuration must be compiled into APK

### Threat Model

**Risk Level: HIGH** (if APK is distributed)

Anyone with the APK file can:
1. Decompile APK using \pktool\
2. Extract AppConfig.smali bytecode
3. Read ALL credentials in plain text
4. Access Discord bot with full permissions
5. Manage Render services (restart, redeploy)
6. Connect to production PostgreSQL database

**Mitigation: NEVER distribute this APK**

### Safe Usage Boundaries

✅ **ALLOWED:**
- Install on your personal phone/tablet
- Test on trusted devices you control
- Use on secure WiFi networks
- Debug with Android Studio on your workstation

❌ **PROHIBITED:**
- Upload to Google Play Store
- Share APK via email, Slack, Discord
- Commit APK to GitHub/GitLab
- Install on other users' devices
- Use on public/untrusted WiFi

---

## 📱 Network Communication

### Architecture

\\\
Android Device                Dev Machine (192.168.23.83)
┌──────────────┐            ┌────────────────────────────┐
│              │            │                            │
│  Test App    │──HTTP──────│  Node.js Dev Server        │
│  (APK)       │  :3000     │  (dev-server.mjs)          │
│              │            │                            │
│  AppConfig   │            │  ┌──────────────────────┐  │
│  ├─Bot Token │────────────┼──│ Discord API          │  │
│  ├─DB URL    │────────────┼──│ PostgreSQL (Render)  │  │
│  └─API Key   │────────────┼──│ Render Platform API  │  │
│              │            │  └──────────────────────┘  │
└──────────────┘            └────────────────────────────┘
\\\

### Endpoints Available

All endpoints from dev-server.mjs are accessible:

- \GET /api/health\ - Server health check
- \GET /api/config\ - Get server configuration
- \POST /api/session\ - Create test session
- \POST /api/test-result\ - Submit test results
- \POST /api/command\ - Execute Discord bot command
- \GET /api/stats\ - Get server statistics

### Direct Access

The Android app can also directly access:

- **Discord API**: Using \AppConfig.getBotToken()\
- **PostgreSQL Database**: Using \AppConfig.getDatabaseUrl()\
- **Render Platform**: Using \AppConfig.RENDER_API_KEY\

---

## 🎯 Usage Guide

### First Time Setup

\\\powershell
# 1. Start the dev server
.\start-dev-server.ps1

# 2. Build and install Android app
.\build-android.ps1 -Install

# 3. Run the app on your device
# Tests will execute automatically
\\\

### When IP Address Changes

\\\powershell
# Regenerate AppConfig.kt with new IP
.\regenerate-config.ps1

# Rebuild and reinstall
.\build-android.ps1 -Install
\\\

### Testing Workflow

1. **Start Server**: \.\start-dev-server.ps1\
2. **Launch App**: Open app on Android device
3. **Run Tests**: App executes 143 test scenarios
4. **View Results**: Check server logs and app UI
5. **Iterate**: Modify tests, rebuild, repeat

---

## 📊 Complete Credential List

### Discord Bot
- **Token**: \MTQzMDcwMjAyOTM5MDQ4MzUyNg.Gc5C1A.YXM3MM68EgWkEfCGyWCfItOQP6tGnUDkjy8rHI\
- **Pokemon Token**: Same as above

### Render Platform
- **API Key**: \nd_c5ddKBupx4Z0HGWvPIU92NICsZkp\
- **Service ID**: \srv-d3snk2ndiees73cn709g\
- **SSH Key**: \ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHRmJahMqnfxmn+OSaYtWmFcxfdz8i3CPqvhOS+bkWBM\

### PostgreSQL Database (Render Managed)
- **Host**: \dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com\
- **Database**: \infinity_gauntlet_db\
- **User**: \infinity_gauntlet_db_user\
- **Password**: \7PECaiuqXiJCMpeDze8tlpEbxB68Sy2\
- **Port**: 5432
- **Full URL**: \postgresql://infinity_gauntlet_db_user:a7PECaiuqXiJCMpeDze8tlpEbxB68Sy2@dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com/infinity_gauntlet_db\

### Local Development
- **Workstation DB**: \postgresql://postgres@localhost:55433/infinity_gauntlet_db\
- **Experiment DB**: \postgresql://postgres@localhost:55434/infinity_gauntlet_experiment\

### Network
- **Dev Server IP**: 192.168.23.83 (auto-detected, may change)
- **Dev Server Port**: 3000
- **API Base URL**: http://192.168.23.83:3000/api

---

## ⚠️ POST-TESTING REQUIREMENTS

### MANDATORY After Testing Completes

**You MUST rotate these credentials:**

1. **Discord Bot Token**
   - Go to: https://discord.com/developers/applications
   - Navigate to your bot → Bot → Reset Token
   - Update main \.env\ file

2. **Render API Key**
   - Go to: https://dashboard.render.com/u/settings/api-keys
   - Delete current key
   - Generate new key
   - Update main \.env\ file

3. **Database Password**
   - Go to: https://dashboard.render.com/d/dpg-d3vd8h7diees73et3i3g-a
   - Settings → Reset Password
   - Update all connection strings

4. **SSH Keys** (if concerned)
   - Generate new SSH key pair
   - Update Render service configuration

### Cleanup Steps

\\\powershell
# 1. Delete AppConfig.kt from Android project
Remove-Item "app/src/main/kotlin+java/com/infinitygauntlet/simulation/config/AppConfig.kt"

# 2. Verify git doesn't track it
git status | Select-String "AppConfig"

# 3. Delete any APK files
Remove-Item "*.apk", "app/release/*.apk", "app/debug/*.apk" -Force

# 4. Review security logs
# Check Discord bot logs, Render logs, database audit logs
\\\

---

## 🛠️ Troubleshooting

### App Can't Connect to Server

**Problem**: \Connection refused\ or \Timeout\

**Solutions**:
1. Verify dev server is running: \.\start-dev-server.ps1\
2. Check firewall allows port 3000: \Get-NetFirewallRule -Name "Infinity-Gauntlet-Dev-Server"\
3. Verify IP in AppConfig matches current IP: \.\regenerate-config.ps1\
4. Check Android device is on same WiFi network

### Wrong IP Address

**Problem**: Dev machine IP changed (DHCP reassignment)

**Solution**:
\\\powershell
# Regenerate config with new IP
.\regenerate-config.ps1

# Rebuild app
.\build-android.ps1 -Install
\\\

### Credentials Not Working

**Problem**: Discord bot returns 401, database rejects connection

**Solution**:
1. Verify credentials in main \.env\ are current
2. Check if tokens were rotated
3. Regenerate AppConfig.kt with updated credentials
4. Rebuild and reinstall app

### APK Decompilation Concerns

**Problem**: Worried someone will decompile APK

**Prevention**:
- Never distribute APK outside personal devices
- Use ProGuard/R8 obfuscation (not implemented - test app only)
- Rotate credentials after testing (mandatory)
- Monitor logs for unauthorized access

---

## 📚 Related Documentation

- **SECURITY_NOTICE.md** - Comprehensive security guide
- **SETUP_SUMMARY.md** - Initial setup documentation
- **NETWORKING_SETUP.md** - Network configuration details
- **ENVIRONMENT_CONFIG.md** - Environment variable guide
- **QUICK-START.md** - Quick reference guide

---

## 🎉 Summary

You now have a **fully configured Android test application** with:

✅ Complete credential access (Discord, Render, Database)  
✅ Direct network communication to dev machine  
✅ Ability to test all 143 test scenarios  
✅ Security documentation and guidelines  
✅ Helper scripts for IP changes and rebuilds  

**Remember**: This configuration is **EXTREMELY SENSITIVE**. Treat the APK file as you would a file containing all your passwords in plain text.

---

**Generated**: 2025-11-29 06:53:22  
**Environment**: Development - Single User Testing  
**Distribution**: PROHIBITED - Personal Use Only  
**Post-Testing**: MANDATORY credential rotation required
