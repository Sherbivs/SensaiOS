# 🎯 QUICK REFERENCE - Hardcoded Credentials Setup

## One-Line Summary
Android APK now contains ALL production credentials hardcoded for testing.

## Files Created
- **AppConfig.kt** - All credentials (Discord, Render, DB, SSH)
- **SECURITY_NOTICE.md** - Security warnings and guidelines
- **HARDCODED_CREDENTIALS_SUMMARY.md** - Complete documentation
- **regenerate-config.ps1** - Helper for IP changes
- **.gitignore** - Updated to exclude credentials

## Quick Start
\\\powershell
.\start-dev-server.ps1           # Start server
.\build-android.ps1 -Install     # Build & install
# Run app, execute 143 tests
\\\

## Credentials Embedded in APK
- Discord Bot Token: MTQzMDcwMjAyOTM5MDQ4MzUyNg.Gc5C1A.YXM3MM68EgWkEfCGyWCfItOQP6tGnUDkjy8rHI
- Render API Key: rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp
- PostgreSQL Password: a7PECaiuqXiJCMpeDze8tlpEbxB68Sy2
- Database: dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com
- Dev Server: http://192.168.23.83:3000

## Security Rules
🔴 NEVER distribute APK to other users  
🔴 NEVER upload to Google Play / public repos  
🔴 ONLY use on YOUR personal devices  
🔴 MANDATORY: Rotate credentials after testing  

## When IP Changes
\\\powershell
.\regenerate-config.ps1          # Auto-detect new IP
.\build-android.ps1 -Install     # Rebuild with new IP
\\\

## Post-Testing Checklist
- [ ] Rotate Discord bot token (discord.com/developers)
- [ ] Rotate Render API key (dashboard.render.com)
- [ ] Change PostgreSQL password (Render dashboard)
- [ ] Delete AppConfig.kt
- [ ] Review security logs

## Troubleshooting
**Can't connect?**
- Check server running: \.\start-dev-server.ps1\
- Verify firewall: \Get-NetFirewallRule -Name "Infinity-Gauntlet-Dev-Server"\
- Check IP: \.\regenerate-config.ps1\

**Wrong credentials?**
- Update main .env file
- Regenerate: \.\regenerate-config.ps1\
- Rebuild: \.\build-android.ps1 -Install\

## Why Hardcoded?
Android apps CANNOT access files on dev machine. Configuration MUST be compiled into APK.

## Risk Level
**HIGH** if APK distributed. APK can be decompiled to extract ALL credentials in plain text.

## Mitigation
Single-user testing only + mandatory credential rotation after testing.

---
Generated: 2025-11-29
Purpose: Android Platform Testing (143 test scenarios)
Distribution: PROHIBITED
