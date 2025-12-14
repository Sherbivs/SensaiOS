# Android Test Environment Setup Guide

## ⚠️ Prerequisites Installation Required

Your system needs the following tools configured before you can build/test Android apps.

## 📦 Required Software

### 1. Java Development Kit (JDK 17)

**Download:**
- [Oracle JDK 17](https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html)
- [Microsoft OpenJDK 17](https://learn.microsoft.com/en-us/java/openjdk/download#openjdk-17)

**Install Location:** `C:\Program Files\Java\jdk-17\`

**Set JAVA_HOME:**
```powershell
# In PowerShell (as Administrator)
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Java\jdk-17", "Machine")
```

**Verify:**
```powershell
java -version
```

### 2. Android SDK

**Option A: Install Android Studio (Recommended)**
- Download: [https://developer.android.com/studio](https://developer.android.com/studio)
- Install Android Studio
- Open Android Studio → Settings → Android SDK
- SDK Location will be: `C:\Users\sherb\AppData\Local\Android\Sdk`

**Option B: Command Line Tools Only**
- Download: [https://developer.android.com/studio#command-tools](https://developer.android.com/studio#command-tools)
- Extract to `C:\Android\Sdk\`

**Set ANDROID_HOME:**
```powershell
# In PowerShell (as Administrator)
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "C:\Users\sherb\AppData\Local\Android\Sdk", "Machine")
```

**Add to PATH:**
```powershell
# In PowerShell (as Administrator)
$androidPath = "$env:ANDROID_HOME\platform-tools"
$currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
[Environment]::SetEnvironmentVariable("Path", "$currentPath;$androidPath", "Machine")
```

**Verify:**
```powershell
adb version
```

### 3. Gradle (Included with Project)

The project includes Gradle wrapper (`gradlew`), so no separate installation needed.

## 🔧 Quick Setup Script

Run this PowerShell script as **Administrator**:

```powershell
# setup-android-env.ps1

Write-Host "🔧 Setting up Android development environment..." -ForegroundColor Cyan

# Check Java
$javaHome = "C:\Program Files\Java\jdk-17"
if (Test-Path $javaHome) {
    Write-Host "✅ Found Java at: $javaHome" -ForegroundColor Green
    [Environment]::SetEnvironmentVariable("JAVA_HOME", $javaHome, "Machine")
    Write-Host "✅ Set JAVA_HOME" -ForegroundColor Green
} else {
    Write-Host "❌ Java not found at: $javaHome" -ForegroundColor Red
    Write-Host "   Download from: https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html" -ForegroundColor Yellow
}

# Check Android SDK
$androidHome = "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk"
if (Test-Path $androidHome) {
    Write-Host "✅ Found Android SDK at: $androidHome" -ForegroundColor Green
    [Environment]::SetEnvironmentVariable("ANDROID_HOME", $androidHome, "Machine")
    Write-Host "✅ Set ANDROID_HOME" -ForegroundColor Green
    
    # Add platform-tools to PATH
    $platformTools = "$androidHome\platform-tools"
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    if ($currentPath -notlike "*$platformTools*") {
        [Environment]::SetEnvironmentVariable("Path", "$currentPath;$platformTools", "Machine")
        Write-Host "✅ Added platform-tools to PATH" -ForegroundColor Green
    }
} else {
    Write-Host "❌ Android SDK not found at: $androidHome" -ForegroundColor Red
    Write-Host "   Download Android Studio: https://developer.android.com/studio" -ForegroundColor Yellow
}

Write-Host "`n🔄 Restart PowerShell/VS Code to apply changes" -ForegroundColor Cyan
```

## 📝 Manual Setup Steps

### Step 1: Install Java JDK 17
1. Download JDK 17 from Oracle or Microsoft
2. Install to default location: `C:\Program Files\Java\jdk-17\`
3. Verify installation

### Step 2: Install Android SDK
1. Download Android Studio
2. Run installer
3. Complete setup wizard
4. Note SDK location (usually `C:\Users\YourName\AppData\Local\Android\Sdk`)

### Step 3: Set Environment Variables
1. Press `Win + X` → System → Advanced system settings
2. Click "Environment Variables"
3. Under "System variables", click "New":
   - Variable name: `JAVA_HOME`
   - Variable value: `C:\Program Files\Java\jdk-17`
4. Click "New" again:
   - Variable name: `ANDROID_HOME`
   - Variable value: `C:\Users\sherb\AppData\Local\Android\Sdk`
5. Edit "Path" variable, add new entry:
   - `%ANDROID_HOME%\platform-tools`
6. Click OK to save

### Step 4: Restart Everything
1. Close all PowerShell/terminal windows
2. Close VS Code
3. Reopen VS Code
4. Open new terminal in VS Code

### Step 5: Verify Setup
```powershell
java -version
# Should show: java version "17.x.x"

adb version
# Should show: Android Debug Bridge version x.x.x

cd C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet\tests\simulation\android
.\gradlew --version
# Should show Gradle version info
```

## 🧪 Test Your Setup

After setup, run this command:
```powershell
cd C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet\tests\simulation\android
.\gradlew clean assembleDebug
```

If successful, you'll see:
```
BUILD SUCCESSFUL in Xs
```

## 🎯 Next Steps After Setup

1. **Install VS Code Extensions**
   - Open VS Code in the `android/` directory
   - Accept the prompt to install recommended extensions
   - Restart VS Code

2. **First Build**
   - Press `Ctrl+Shift+B`
   - Select "🔨 Build Debug APK"
   - Wait for dependencies to download (first build is slow)

3. **Connect Device**
   - Enable USB debugging on your Android device
   - Connect via USB
   - Run task: "📱 List Connected Devices"
   - Should see your device listed

4. **Install & Test**
   - Run task: "🚀 Build + Install + Run"
   - App should install and open on your device

## 🚨 Common Issues

### "JAVA_HOME is not set"
- Ensure Java is installed
- Set JAVA_HOME environment variable
- Restart terminal/VS Code

### "Android SDK not found"
- Install Android Studio OR command line tools
- Set ANDROID_HOME environment variable
- Add platform-tools to PATH

### "adb: command not found"
- Add `%ANDROID_HOME%\platform-tools` to PATH
- Restart terminal

### "Gradle build fails"
- Run `.\gradlew clean`
- Delete `.gradle` folder in project
- Restart VS Code

## 📚 Resources

- [Java JDK Download](https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html)
- [Android Studio](https://developer.android.com/studio)
- [Android SDK Setup](https://developer.android.com/studio/install)
- [ADB Documentation](https://developer.android.com/studio/command-line/adb)

---

**Next:** After completing setup, see `.vscode/README.md` for testing workflow.
