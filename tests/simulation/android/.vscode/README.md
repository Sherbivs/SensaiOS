# VS Code Android Test Environment

## 🚀 Quick Start

### Prerequisites
- Java JDK 17 (configured in settings.json)
- Android SDK (configured in settings.json)
- ADB (Android Debug Bridge) in PATH

### Recommended Extensions
VS Code will prompt you to install recommended extensions. Install:
- **Java Extension Pack** (vscjava.vscode-java-pack)
- **Gradle for Java** (vscjava.vscode-gradle)
- **Kotlin Language** (mathiasfrohlich.kotlin or fwcd.kotlin)

## 📋 Available Tasks

Press `Ctrl+Shift+P` → `Tasks: Run Task` or `Ctrl+Shift+B` for build tasks.

### Build Tasks
- **🧹 Clean Project** - Clean build artifacts
- **🔨 Build Debug APK** (Default) - Build debug version
- **🔨 Build Release APK** - Build release version
- **🔄 Clean + Build** - Clean then build (recommended after major changes)

### Test Tasks
- **🧪 Run Unit Tests** (Default) - Run local JVM tests
- **🧪 Run Instrumented Tests** - Run on-device tests (requires connected device/emulator)
- **🔍 Lint Check** - Run Android Lint analysis

### Install & Deploy
- **📦 Install Debug APK** - Install to connected device
- **🚀 Build + Install + Run** - Complete deployment workflow

### Utilities
- **📊 Gradle Dependencies** - View dependency tree
- **📱 List Connected Devices** - Show ADB devices
- **🗑️ Uninstall App** - Remove app from device

## ⌨️ Keyboard Shortcuts

- `Ctrl+Shift+B` - Run default build task (Build Debug APK)
- `Ctrl+Shift+T` - Run default test task (Run Unit Tests)

## 🐛 Debugging

### Setup Android Debug
1. Build and install debug APK
2. Run app on device/emulator
3. Press `F5` or go to Run & Debug panel
4. Select "🐛 Debug Android App"
5. Attach to running process

## 📁 Project Structure

```
android/
├── app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/infinitygauntlet/simulation/
│   │   │   │   ├── presentation/    # ViewModels with Hilt
│   │   │   │   │   ├── chat/
│   │   │   │   │   ├── report/
│   │   │   │   │   └── test/
│   │   │   │   ├── domain/          # Business logic
│   │   │   │   │   ├── models/
│   │   │   │   │   └── repository/
│   │   │   │   ├── data/            # Data layer
│   │   │   │   │   ├── local/
│   │   │   │   │   └── repository/
│   │   │   │   └── di/              # Dependency Injection
│   │   │   └── res/
│   │   ├── test/                    # Unit tests
│   │   └── androidTest/             # Instrumented tests
│   └── build.gradle.kts
└── .vscode/                         # VS Code configuration
```

## 🔧 Common Commands

### Via VS Code Tasks (Recommended)
Use the task runner for best integration with VS Code.

### Via Terminal
```powershell
# Clean build
./gradlew clean

# Build debug
./gradlew assembleDebug

# Build and install
./gradlew installDebug

# Run tests
./gradlew test

# Run lint
./gradlew lint
```

## 🎯 Testing Workflow

### 1. Unit Tests (Fast - No Device)
```
Task: 🧪 Run Unit Tests
```
Tests business logic without Android dependencies.

### 2. Instrumented Tests (Slow - Requires Device)
```
Task: 🧪 Run Instrumented Tests
```
Tests UI and Android-specific code on real device/emulator.

### 3. Lint Analysis
```
Task: 🔍 Lint Check
```
Checks code quality and potential bugs.

## 🚨 Troubleshooting

### KAPT Errors
If you see "Could not load module" errors:
1. Run `🧹 Clean Project`
2. Check for duplicate class files
3. Run `🔄 Clean + Build`

### Gradle Sync Issues
1. `Ctrl+Shift+P` → `Java: Clean Java Language Server Workspace`
2. Restart VS Code
3. Run `📊 Gradle Dependencies` to verify

### Device Not Found
1. Run `📱 List Connected Devices`
2. Enable USB debugging on device
3. Trust computer on device prompt

### Build Too Slow
- Close other applications
- Increase Gradle memory in `gradle.properties`:
  ```
  org.gradle.jvmargs=-Xmx2048m
  ```

## 📊 Test Reports

After running tests, find reports at:
- Unit tests: `app/build/reports/tests/testDebugUnitTest/index.html`
- Instrumented tests: `app/build/reports/androidTests/connected/index.html`
- Lint: `app/build/reports/lint-results.html`

## 🎓 Tips

1. **Use Tasks** - They're configured with proper error matching
2. **Clean Often** - Run clean after major code changes
3. **Check Devices** - Ensure device is connected before instrumented tests
4. **Read Logs** - Terminal output shows detailed error messages
5. **Incremental Builds** - Don't clean unless necessary for faster builds

## 🔗 Resources

- [Android Developer Docs](https://developer.android.com)
- [Gradle User Guide](https://docs.gradle.org/current/userguide/userguide.html)
- [Kotlin Documentation](https://kotlinlang.org/docs/home.html)
- [Hilt Documentation](https://dagger.dev/hilt/)

---

**Last Updated:** November 29, 2025
