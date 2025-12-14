# Android VS Code - Quick Reference

## 🚀 Most Used Commands

### Build & Deploy
```
Ctrl+Shift+B          → Build Debug APK (default)
Tasks: 🔄 Clean + Build → Full rebuild after major changes
Tasks: 🚀 Build + Install + Run → Complete workflow
```

### Testing
```
Ctrl+Shift+T          → Run Unit Tests (default)
Tasks: 🧪 Run Instrumented Tests → On-device tests
Tasks: 🔍 Lint Check → Code quality check
```

### Quick Actions
```
Ctrl+Shift+P → Tasks: Run Task → Show all tasks
F5 → Debug Android App
```

## 📋 All Available Tasks

| Icon | Task | Description |
|------|------|-------------|
| 🧹 | Clean Project | Remove build artifacts |
| 🔨 | Build Debug APK | Build debug version |
| 🔨 | Build Release APK | Build release version |
| 🧪 | Run Unit Tests | JVM tests (fast) |
| 🧪 | Run Instrumented Tests | Device tests (slow) |
| 📦 | Install Debug APK | Install to device |
| 🔄 | Clean + Build | Clean then build |
| 🚀 | Build + Install + Run | Full deployment |
| 📊 | Gradle Dependencies | View dependencies |
| 🔍 | Lint Check | Code analysis |
| 📱 | List Connected Devices | ADB devices |
| 🗑️ | Uninstall App | Remove from device |

## 🎯 Common Workflows

### First Time Setup
1. Install Java JDK 17
2. Run: `.vscode/setup-android-env.ps1 -Fix` (as Admin)
3. Restart VS Code
4. Install recommended extensions
5. `Ctrl+Shift+B` to build

### Daily Development
1. Make code changes
2. `Ctrl+Shift+B` to build
3. Fix any errors
4. Connect device
5. Run: `📦 Install Debug APK`

### After Git Pull
1. Run: `🧹 Clean Project`
2. Run: `🔨 Build Debug APK`

### Before Commit
1. Run: `🔍 Lint Check`
2. Run: `🧪 Run Unit Tests`
3. Fix any issues
4. Commit

### Release Build
1. Run: `🧹 Clean Project`
2. Run: `🔨 Build Release APK`
3. Test on device
4. APK at: `app/build/outputs/apk/release/`

## 🚨 Troubleshooting

### KAPT Errors
```
Tasks: 🧹 Clean Project
Delete duplicate class files
Tasks: 🔄 Clean + Build
```

### Gradle Issues
```
Ctrl+Shift+P → Java: Clean Java Language Server Workspace
Restart VS Code
Tasks: 📊 Gradle Dependencies (to verify)
```

### Device Not Found
```
Tasks: 📱 List Connected Devices
Enable USB debugging on device
Trust computer on device
```

### Build Too Slow
```
Close other apps
Increase Gradle memory in gradle.properties:
org.gradle.jvmargs=-Xmx2048m
```

## 📊 Test Reports

After running tests, open in browser:
- **Unit Tests**: `app/build/reports/tests/testDebugUnitTest/index.html`
- **Instrumented**: `app/build/reports/androidTests/connected/index.html`
- **Lint**: `app/build/reports/lint-results.html`

## 🔧 Environment Variables

Required in PATH or set in `.vscode/settings.json`:
- `JAVA_HOME` → `C:\Program Files\Java\jdk-17`
- `ANDROID_HOME` → `C:\Users\sherb\AppData\Local\Android\Sdk`

## 📚 More Help

- **Full Guide**: `.vscode/README.md`
- **Setup Steps**: `.vscode/SETUP.md`
- **Run Setup Check**: `.vscode/setup-android-env.ps1 -Check`

## 💡 Pro Tips

1. **Use tasks** - They have proper error matching
2. **Clean after major changes** - Prevents weird errors
3. **Check devices first** - Before instrumented tests
4. **Read terminal output** - Shows detailed errors
5. **Incremental builds** - Don't clean unless needed

---

**Quick Help**: Press `Ctrl+Shift+P` → Type "task" → See all available tasks
