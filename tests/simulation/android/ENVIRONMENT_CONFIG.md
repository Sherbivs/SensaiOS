# Environment Configuration

## Auto-Generated Configuration

This file documents the environment-based configuration for the Android test app.

**Generated:** 2025-11-29 06:45:37

---

## Network Configuration

- **Local IP:** 192.168.23.83
- **Port:** 3000
- **Base URL:** http://192.168.23.83:3000/api
- **Timeout:** 10000ms

---

## Environment Settings

- **Environment:** development
- **Timezone:** America/New_York
- **Test Mode:** true
- **Logging:** true

---

## Backend Information

- **Database Host:** dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com
- **Database Name:** infinity_gauntlet_db

---

## Files Updated

1. **AppConfig.kt** - Central configuration object
   - Location: `app/src/main/kotlin+java/com/infinitygauntlet/simulation/config/AppConfig.kt`
   - Contains all hardcoded configuration values
   - Auto-generated from environment variables

2. **ApiClient.kt** - HTTP client configuration
   - Location: `app/src/main/kotlin+java/com/infinitygauntlet/simulation/network/ApiClient.kt`
   - Updated with current local IP

---

## Updating Configuration

To regenerate configuration after environment changes:

```powershell
.\generate-android-config.ps1
```

To preview changes without applying:

```powershell
.\generate-android-config.ps1 -DryRun
```

To use a different environment file:

```powershell
.\generate-android-config.ps1 -EnvFile "path\to\custom.env"
```

---

## Security Notes

⚠️ **Sensitive data handling:**
- Full credentials are NEVER included in Android app
- Only non-sensitive metadata (hostnames, database names) included
- Bot tokens are truncated to first 20 characters for identification only
- All configuration is hardcoded (Android apps can't load .env files)

✅ **Safe for commit:**
- AppConfig.kt is safe to commit (no credentials)
- Contains only connection endpoints and feature flags
- Actual secrets remain in `secrets/Infinity-Gauntlet.env`

---

**Last Updated:** 2025-11-29 06:45:37
