# Android Studio Setup Guide

## ⚠️ CRITICAL: Correct Project Path

Android Studio should **ONLY** open the Android project folder, not the parent repository.

### ✅ CORRECT Path to Open:
```
C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet\tests\simulation\android\
```

### ❌ WRONG - Don't open these:
```
C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet\           (root repo)
C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet\tests\    (tests folder)
```

## Setup Steps

### 1. Close Android Studio Completely
- File → Exit
- Or close all windows

### 2. Clean Previous Cache (Optional but Recommended)
Navigate to the Android project folder and delete:
```powershell
cd "C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet\tests\simulation\android"
Remove-Item -Recurse -Force .gradle -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .idea -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force app\build -ErrorAction SilentlyContinue
```

### 3. Open Project in Android Studio

**Option A: From Android Studio Welcome Screen**
1. Open Android Studio
2. Click **"Open"**
3. Navigate to: `C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet\tests\simulation\android`
4. Click **"OK"**

**Option B: From Command Line**
```powershell
cd "C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet\tests\simulation\android"
studio64.exe .
```

**Option C: From File Explorer**
1. Navigate to `tests\simulation\android\` folder
2. Right-click on empty space
3. Select "Open Folder as Android Studio Project" (if available)

### 4. Wait for Gradle Sync

After opening:
1. Android Studio detects `settings.gradle.kts`
2. Downloads Gradle 8.11.1 (~150MB, 2-5 minutes)
3. Downloads dependencies (~500MB, 5-10 minutes first time)
4. Builds project indices
5. Shows "Gradle sync finished" ✅

### 5. Verify Correct Setup

Check the **Project** panel (left sidebar):
```
InfinityGauntlet-Simulation/          ← Root should be this, not "Infinity-Gauntlet"
├── app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/
│   │   │   │   └── com/infinitygauntlet/simulation/
│   │   │   ├── res/
│   │   │   └── AndroidManifest.xml
│   │   └── test/
│   └── build.gradle.kts
├── gradle/
│   └── wrapper/
│       ├── gradle-wrapper.properties
│       └── gradle-wrapper.jar
├── build.gradle.kts
└── settings.gradle.kts
```

**If you see "Infinity-Gauntlet" at the root**, you opened the wrong folder. Close and reopen the correct path.

## Troubleshooting

### Problem: "Compilation is not supported for the following modules: Infinity-Gauntlet"

**Cause:** Android Studio opened the parent repository instead of the Android project folder.

**Solution:**
1. File → Close Project
2. From Welcome Screen: Open → Select `tests\simulation\android\` folder
3. NOT the root `Infinity-Gauntlet\` folder

### Problem: "Could not find com.android.tools.build:gradle:8.7.3"

**Cause:** Gradle hasn't downloaded yet or network issue.

**Solution:**
1. Check internet connection
2. File → Invalidate Caches → Invalidate and Restart
3. Wait for Gradle daemon to download dependencies

### Problem: Gradle sync takes forever

**Cause:** First-time download of Gradle + all dependencies.

**Solution:**
- Be patient (5-10 minutes first time is normal)
- Check download progress in bottom status bar
- If stuck >15 minutes: File → Invalidate Caches → Restart

## After Successful Setup

### Build the Project
1. Build → Make Project (Ctrl+F9)
2. Wait for compilation (1-3 minutes first time)
3. Check for errors in Build output

### Run on Device/Emulator
1. Connect Android device with USB debugging enabled
   - OR -
2. Tools → Device Manager → Create Virtual Device
   - Recommended: Pixel 5 API 35 (Android 15)
3. Click green "Run" button (Shift+F10)
4. Select deployment target
5. Wait for installation and launch

## Expected Behavior

### First Launch
- 5-10 minutes for initial Gradle sync
- ~650MB total downloads (Gradle 8.11.1 + dependencies)
- ~3 minutes for first compilation
- ~30 seconds for app installation

### Subsequent Launches
- <30 seconds for Gradle sync (cached)
- <1 minute for incremental compilation
- <10 seconds for app installation

## Project Information

- **Project Name:** InfinityGauntlet-Simulation
- **Package:** com.infinitygauntlet.simulation
- **Gradle:** 8.11.1 (latest stable)
- **AGP:** 8.7.3 (latest stable)
- **Kotlin:** 2.0.21 (latest with K2 compiler)
- **Target SDK:** 35 (Android 15)
- **Min SDK:** 24 (Android 7.0, covers 95%+ devices)

## Version Information (November 2025)

All dependencies are at their latest stable versions:
- AndroidX Core: 1.15.0
- AppCompat: 1.7.0
- Material Design: 1.12.0
- Lifecycle: 2.8.7
- Navigation: 2.8.5
- Coroutines: 1.9.0

---

**Last Updated:** November 29, 2025
**Status:** ✅ Ready for development
