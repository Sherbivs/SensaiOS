# Android Permissions Quick Reference

## 📋 Declared Permissions

### Auto-Granted (Normal)
- ✅ INTERNET
- ✅ ACCESS_NETWORK_STATE  
- ✅ ACCESS_WIFI_STATE
- ✅ FOREGROUND_SERVICE
- ✅ FOREGROUND_SERVICE_DATA_SYNC (API 34+)
- ✅ WAKE_LOCK
- ✅ VIBRATE

### Runtime Request Required (Dangerous)
- ⚠️ POST_NOTIFICATIONS (API 33+ / Android 13+)

## 🔧 Quick Integration

### 1. Initialize in Activity
```kotlin
class MainActivity : AppCompatActivity() {
    private lateinit var permissionHandler: PermissionHandler
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        permissionHandler = PermissionHandler(this)
        permissionHandler.requestAllPermissions(
            onGranted = { /* Start app */ },
            onDenied = { /* Show warning */ }
        )
    }
}
```

### 2. Check Permission Before Operation
```kotlin
import com.infinitygauntlet.simulation.utils.hasNotificationPermission

if (hasNotificationPermission()) {
    startService(Intent(this, TestRunnerService::class.java))
} else {
    permissionHandler.requestNotificationPermission(
        onGranted = { startService(...) },
        onDenied = { showWarning() }
    )
}
```

### 3. Extension Functions
```kotlin
// Check notification permission
if (hasNotificationPermission()) { /* ... */ }

// Check any permission
if (hasPermission(Manifest.permission.POST_NOTIFICATIONS)) { /* ... */ }

// Check all required permissions
if (hasAllRequiredPermissions()) { /* ... */ }
```

## 📱 Android Version Behavior

| API Level | Android Version | Behavior |
|-----------|----------------|----------|
| 24-32 | 7.0 - 12.1 | All permissions auto-granted |
| 33 | 13 | POST_NOTIFICATIONS requires runtime request |
| 34+ | 14+ | POST_NOTIFICATIONS + foreground service type |

## 🚀 Common Patterns

### Pattern 1: Request on Startup
Best for: Apps that need permissions immediately
```kotlin
override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    permissionHandler.requestAllPermissions(...)
}
```

### Pattern 2: Request Before Operation
Best for: Permissions needed for specific features
```kotlin
fun startTests() {
    permissionHandler.requestNotificationPermission(...)
}
```

### Pattern 3: Check Then Request
Best for: Optional features
```kotlin
if (!hasNotificationPermission()) {
    permissionHandler.requestNotificationPermission(...)
} else {
    // Proceed
}
```

## 📚 Files

- **AndroidManifest.xml** - Permission declarations
- **PermissionHandler.kt** - Permission management class
- **PermissionIntegrationExample.kt** - Integration examples
- **PERMISSIONS-GUIDE.md** - Complete documentation

## ⚠️ Important Notes

1. **Android 13+**: POST_NOTIFICATIONS is dangerous permission
2. **Android 14+**: Foreground services need type declaration
3. **Best Practice**: Request permissions in context, not on launch
4. **User Experience**: Show rationale before requesting
5. **Graceful Degradation**: App should work without permissions

## ✅ Checklist

- [ ] PermissionHandler initialized in MainActivity
- [ ] Request permissions in onCreate() or before operations
- [ ] Handle onGranted callback
- [ ] Handle onDenied callback
- [ ] Test on Android 13+ device/emulator
- [ ] Test on Android 14+ device/emulator
- [ ] Verify foreground service starts correctly
- [ ] Verify notifications work when permission granted

---

**Status:** ✅ Ready for Integration  
**Documentation:** PERMISSIONS-GUIDE.md (450 lines)
