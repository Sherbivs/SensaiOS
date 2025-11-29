# Gradle Sync Error Fix Guide

## Error Message
```
'org.gradle.api.artifacts.Dependency org.gradle.api.artifacts.dsl.DependencyHandler.module(java.lang.Object)'
```

## Root Cause
This error typically occurs when:
1. Gradle wrapper is missing or outdated
2. Android Studio is using an incompatible Gradle version
3. Cached Gradle files are corrupted

## ✅ Fixes Applied

### 1. Updated Project-Level build.gradle.kts
Changed from deprecated `buildscript` to modern plugins DSL:
```kotlin
plugins {
    id("com.android.application") version "8.1.4" apply false
    id("org.jetbrains.kotlin.android") version "1.9.20" apply false
}
```

### 2. Created Gradle Wrapper Files
- `gradle/wrapper/gradle-wrapper.properties` (Gradle 8.1)
- `gradlew.bat` (Windows wrapper script)

## 🔧 Step-by-Step Fix in Android Studio

### Method 1: Force Gradle Wrapper Download
1. Close Android Studio
2. Delete these folders if they exist:
   - `android/.gradle/`
   - `android/.idea/`
   - `%USERPROFILE%\.gradle\caches\` (optional - nuclear option)
3. Open Android Studio
4. Import project: `File → Open → tests/simulation/android/`
5. When prompted, select: **"Use Gradle wrapper"**
6. Wait for wrapper download and Gradle sync

### Method 2: Manual Gradle Configuration
1. In Android Studio: `File → Settings → Build, Execution, Deployment → Build Tools → Gradle`
2. Select: **"Gradle wrapper (recommended)"**
3. Gradle JDK: **"Embedded JDK (17)"** or **"jbr-17"**
4. Click Apply
5. `File → Sync Project with Gradle Files`

### Method 3: Command Line Wrapper Download
```powershell
# From tests/simulation/android/ directory
# Download Gradle wrapper JAR manually
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/gradle/gradle/master/gradle/wrapper/gradle-wrapper.jar" -OutFile "gradle/wrapper/gradle-wrapper.jar"

# Then sync in Android Studio
```

### Method 4: Invalidate Caches
1. `File → Invalidate Caches...`
2. Check all boxes:
   - Clear file system cache and Local History
   - Clear downloaded shared indexes
   - Clear VCS Log caches and indexes
3. Click **"Invalidate and Restart"**

## 🎯 Expected Result After Fix

You should see in Android Studio:
```
Gradle sync started
Executing tasks: [:app:generateDebugSources] in project /path/to/android

> Task :app:preBuild UP-TO-DATE
> Task :app:preDebugBuild UP-TO-DATE

BUILD SUCCESSFUL in 2m 34s
142 actionable tasks: 142 executed

Gradle sync finished in 2 min 34 sec
```

## 🔍 Troubleshooting

### If sync still fails:

#### Check Java Version
```powershell
java -version
# Should show: openjdk version "17" or higher
```

#### Check Gradle Version
```powershell
cd tests/simulation/android
./gradlew --version  # Linux/Mac
.\gradlew.bat --version  # Windows
```

#### Enable Debug Logging
In Android Studio terminal:
```powershell
.\gradlew --debug --stacktrace
```

#### Check Android Studio Version
- Minimum required: **Android Studio Hedgehog (2023.1.1)** or newer
- Recommended: **Android Studio Iguana (2023.2.1)** or **Jellyfish (2024.1.1)**

### Common Issues:

#### Issue: "Could not find com.android.tools.build:gradle:8.1.4"
**Fix:** Check internet connection, or add explicit repository in settings.gradle.kts

#### Issue: "Unsupported Java version"
**Fix:** In Android Studio settings, select JDK 17 (Embedded JDK)

#### Issue: "Gradle sync failed: Connection timed out"
**Fix:** Configure proxy in gradle.properties if behind corporate firewall:
```properties
systemProp.http.proxyHost=proxy.company.com
systemProp.http.proxyPort=8080
systemProp.https.proxyHost=proxy.company.com
systemProp.https.proxyPort=8080
```

## 📚 Additional Resources

- [Android Gradle Plugin Release Notes](https://developer.android.com/build/releases/gradle-plugin)
- [Gradle Wrapper Documentation](https://docs.gradle.org/current/userguide/gradle_wrapper.html)
- [Migrate to Gradle Plugin 8.0](https://developer.android.com/build/releases/past-releases/agp-8-0-0-release-notes)

## ✨ Quick Checklist

Before syncing, verify:
- [ ] Android Studio Hedgehog or newer installed
- [ ] JDK 17 selected in Android Studio
- [ ] Internet connection active (for dependency download)
- [ ] `gradle/wrapper/gradle-wrapper.properties` exists
- [ ] `settings.gradle.kts` has repository configuration
- [ ] `build.gradle.kts` uses plugins DSL (not buildscript)
- [ ] No `.gradle/` or `.idea/` folders with stale cache

## 🎉 Success Indicators

Sync succeeded if you see:
- ✅ "Gradle sync finished" message (green)
- ✅ Project structure appears in left panel
- ✅ No red underlines in Kotlin files
- ✅ Build variants dropdown populated (debug/release)
- ✅ Green "Run" button enabled

---

**Last Updated:** November 29, 2025  
**Gradle Version:** 8.1  
**AGP Version:** 8.1.4  
**Kotlin Version:** 1.9.20
