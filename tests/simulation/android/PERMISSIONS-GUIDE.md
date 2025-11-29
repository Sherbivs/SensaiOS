# Android Permissions Implementation Guide

**Date:** November 29, 2025  
**Feature:** Comprehensive Android Permission Handling  
**Status:** ✅ Complete

---

## 📋 Overview

This implementation ensures the Android app properly requests all necessary permissions from the Android OS, following best practices and guidelines from the official Android documentation.

## 🔐 Permissions Declared

### 1. Network Permissions (Normal - Auto-granted)

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
```

**Purpose:** Database connectivity (PostgreSQL), future API calls  
**Required:** API 1+  
**Runtime Permission:** ❌ No (automatically granted at install)

### 2. Foreground Service Permissions

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" android:minSdkVersion="34" />
```

**Purpose:** TestRunnerService, ReportGeneratorService  
**Required:** API 28+ (FOREGROUND_SERVICE), API 34+ (FOREGROUND_SERVICE_DATA_SYNC)  
**Runtime Permission:** ❌ No  
**Note:** Android 14+ requires specific foreground service type declaration

### 3. Notification Permission (Dangerous - Runtime Required on API 33+)

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

**Purpose:** Show test progress notifications from TestRunnerService  
**Required:** API 33+ (Android 13+)  
**Runtime Permission:** ✅ YES (must request at runtime on Android 13+)  
**Fallback:** On Android 12 and below, no permission needed

### 4. Optional Permissions

```xml
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.VIBRATE" />
```

**Purpose:**  
- WAKE_LOCK: Keep device awake during long test runs
- VIBRATE: Notification alerts

**Runtime Permission:** ❌ No  

---

## 🏗️ Implementation Components

### 1. AndroidManifest.xml Updates

**Changes Made:**
- ✅ Added all required permissions with comments
- ✅ Declared TestRunnerService with `foregroundServiceType="dataSync"`
- ✅ Declared ReportGeneratorService with `foregroundServiceType="dataSync"`
- ✅ Added proper API level annotations

**File:** `app/src/main/AndroidManifest.xml`

### 2. PermissionHandler.kt (345 lines)

Centralized permission management system with:

**Features:**
- ✅ Check all required permissions
- ✅ Check individual permissions
- ✅ Request all permissions with rationale dialog
- ✅ Request individual permissions
- ✅ Specialized notification permission request
- ✅ Get denied permissions list
- ✅ Get user-friendly permission descriptions
- ✅ Extension functions for easy checking

**API:**
```kotlin
class PermissionHandler(activity: FragmentActivity)

// Check permissions
fun areAllPermissionsGranted(): Boolean
fun isPermissionGranted(permission: String): Boolean
fun getDeniedPermissions(): List<String>

// Request permissions
fun requestAllPermissions(
    onGranted: () -> Unit,
    onDenied: (List<String>) -> Unit = {},
    showRationale: Boolean = true
)

fun requestPermission(
    permission: String,
    onGranted: () -> Unit,
    onDenied: () -> Unit = {},
    showRationale: Boolean = true
)

fun requestNotificationPermission(
    onGranted: () -> Unit,
    onDenied: () -> Unit = {}
)

// Utility
fun getPermissionDescriptions(permissions: List<String>): List<String>

// Extension functions
fun Context.hasPermission(permission: String): Boolean
fun Context.hasNotificationPermission(): Boolean
fun Context.hasAllRequiredPermissions(): Boolean
```

**File:** `app/src/main/java/com/infinitygauntlet/simulation/utils/PermissionHandler.kt`

### 3. TestRunnerService.kt Updates

**Changes Made:**
- ✅ Updated `startForeground()` call to specify service type on Android 14+
- ✅ Added conditional logic for `FOREGROUND_SERVICE_TYPE_DATA_SYNC`

**Code:**
```kotlin
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
    startForeground(
        NOTIFICATION_ID,
        notification,
        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
    )
} else {
    startForeground(NOTIFICATION_ID, notification)
}
```

### 4. Integration Example

**File:** `app/src/main/java/com/infinitygauntlet/simulation/PermissionIntegrationExample.kt`

Complete integration examples showing:
- Request permissions on app startup
- Request permissions before specific operations
- Handle permission denial gracefully
- Use extension functions

---

## 🚀 Integration Guide

### Pattern 1: Request All Permissions on Startup (Recommended)

```kotlin
class MainActivity : AppCompatActivity() {
    
    private lateinit var permissionHandler: PermissionHandler
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        permissionHandler = PermissionHandler(this)
        permissionHandler.requestAllPermissions(
            onGranted = {
                // All permissions granted, initialize app
                initializeApp()
            },
            onDenied = { deniedPermissions ->
                // Show warning, but still initialize
                showPermissionWarning(deniedPermissions)
                initializeApp()
            }
        )
    }
}
```

### Pattern 2: Request Permission Before Specific Operation

```kotlin
private fun startTestExecution() {
    permissionHandler.requestNotificationPermission(
        onGranted = {
            // Permission granted, start tests
            startService(Intent(this, TestRunnerService::class.java))
        },
        onDenied = {
            // Permission denied, show warning
            AlertDialog.Builder(this)
                .setTitle("Notification Permission Denied")
                .setMessage("You won't see test progress updates.")
                .setPositiveButton("Continue Anyway") { _, _ ->
                    startService(Intent(this, TestRunnerService::class.java))
                }
                .setNegativeButton("Cancel", null)
                .show()
        }
    )
}
```

### Pattern 3: Check Permission Before Operation

```kotlin
import com.infinitygauntlet.simulation.utils.hasNotificationPermission

private fun startTests() {
    if (hasNotificationPermission()) {
        // Safe to show notifications
        startService(Intent(this, TestRunnerService::class.java))
    } else {
        // Request permission first
        permissionHandler.requestNotificationPermission(
            onGranted = { startTests() }
        )
    }
}
```

---

## 📱 Android Version Compatibility

### API 24-32 (Android 7.0 - 12.1)
- ✅ All permissions auto-granted except dangerous permissions
- ✅ Notifications work without runtime permission
- ✅ Foreground services require FOREGROUND_SERVICE permission (auto-granted)

### API 33 (Android 13)
- ✅ POST_NOTIFICATIONS requires runtime permission
- ✅ System shows permission dialog
- ✅ User can grant/deny notifications
- ✅ App must handle denial gracefully

### API 34+ (Android 14+)
- ✅ POST_NOTIFICATIONS still requires runtime permission
- ✅ Foreground services require type declaration
- ✅ Must specify `FOREGROUND_SERVICE_TYPE_DATA_SYNC`
- ✅ `startForeground()` requires service type parameter

---

## 🔍 Permission Types Explained

### Normal Permissions (Auto-granted)
No runtime request needed, granted at install time:
- INTERNET
- ACCESS_NETWORK_STATE
- ACCESS_WIFI_STATE
- FOREGROUND_SERVICE
- FOREGROUND_SERVICE_DATA_SYNC
- WAKE_LOCK
- VIBRATE

### Dangerous Permissions (Runtime Request Required)
Must request at runtime on Android 6.0+ (API 23+):
- POST_NOTIFICATIONS (API 33+)
- READ_EXTERNAL_STORAGE (if added)
- WRITE_EXTERNAL_STORAGE (if added)
- CAMERA (if added)
- RECORD_AUDIO (if added)

### Special Permissions (Settings Navigation Required)
Cannot be requested via standard runtime permission API:
- SCHEDULE_EXACT_ALARM
- SYSTEM_ALERT_WINDOW
- MANAGE_EXTERNAL_STORAGE
- (None currently used by app)

---

## ⚠️ Important Notes

### 1. Notification Permission (Android 13+)

**Best Practice:**
- Request when user is about to start tests (contextual)
- Show clear rationale explaining why needed
- Handle denial gracefully (allow tests without notifications)

**Bad Practice:**
- ❌ Request immediately on app launch
- ❌ Block functionality if denied
- ❌ Repeatedly request after denial

### 2. Foreground Service Type (Android 14+)

**Required:**
- Must declare `foregroundServiceType` in manifest
- Must pass service type to `startForeground()` on API 34+
- Must use appropriate type (dataSync for our use case)

**Available Types:**
- camera
- connectedDevice
- dataSync ← **We use this**
- health
- location
- mediaPlayback
- mediaProjection
- microphone
- phoneCall
- remoteMessaging
- shortService
- specialUse
- systemExempted

### 3. Permission Rationale

**When to Show:**
- When `shouldShowRequestPermissionRationale()` returns true
- Means user previously denied permission
- Show explanation before requesting again

**What to Include:**
- Clear explanation of why permission is needed
- What features require this permission
- What happens if permission is denied

---

## 🧪 Testing Checklist

### Manual Testing

- [ ] **Android 7.0-12.1 (API 24-32)**
  - [ ] App launches successfully
  - [ ] Notifications work without permission request
  - [ ] TestRunnerService starts in foreground
  - [ ] No permission dialogs shown

- [ ] **Android 13 (API 33)**
  - [ ] Permission dialog appears for POST_NOTIFICATIONS
  - [ ] App works if permission granted
  - [ ] App works if permission denied (no notifications)
  - [ ] Rationale dialog shows if denied and requested again

- [ ] **Android 14+ (API 34+)**
  - [ ] Permission dialog appears for POST_NOTIFICATIONS
  - [ ] Foreground service starts with dataSync type
  - [ ] No crashes when starting TestRunnerService
  - [ ] Service shows in notification area

### Unit Testing

```kotlin
@Test
fun testPermissionHandler_allPermissionsGranted() {
    // Mock all permissions as granted
    every { 
        ContextCompat.checkSelfPermission(any(), any()) 
    } returns PackageManager.PERMISSION_GRANTED
    
    val handler = PermissionHandler(mockActivity)
    assertTrue(handler.areAllPermissionsGranted())
}

@Test
fun testPermissionHandler_somePermissionsDenied() {
    // Mock POST_NOTIFICATIONS as denied
    every { 
        ContextCompat.checkSelfPermission(any(), Manifest.permission.POST_NOTIFICATIONS) 
    } returns PackageManager.PERMISSION_DENIED
    
    val handler = PermissionHandler(mockActivity)
    assertFalse(handler.areAllPermissionsGranted())
    assertEquals(1, handler.getDeniedPermissions().size)
}
```

---

## 📚 References

### Official Documentation
- [Request runtime permissions](https://developer.android.com/training/permissions/requesting)
- [Notification runtime permission](https://developer.android.com/develop/ui/views/notifications/notification-permission)
- [Foreground services](https://developer.android.com/develop/background-work/services/foreground-services)
- [Permission best practices](https://developer.android.com/training/permissions/usage-notes)

### Permission Categories
- [Normal permissions list](https://developer.android.com/reference/android/Manifest.permission)
- [Dangerous permissions list](https://developer.android.com/guide/topics/permissions/overview#dangerous_permissions)
- [Special permissions](https://developer.android.com/guide/topics/permissions/overview#special_permissions)

### Foreground Service Types (Android 14+)
- [Foreground service types](https://developer.android.com/about/versions/14/changes/fgs-types-required)
- [ServiceInfo constants](https://developer.android.com/reference/android/content/pm/ServiceInfo)

---

## 📊 Summary

### Files Created/Modified

| File | Lines | Status | Purpose |
|------|-------|--------|---------|
| AndroidManifest.xml | +30 | ✅ Modified | Added permissions + service declarations |
| PermissionHandler.kt | 345 | ✅ Created | Centralized permission management |
| PermissionIntegrationExample.kt | 150 | ✅ Created | Integration examples |
| TestRunnerService.kt | +8 | ✅ Modified | Added foreground service type |
| PERMISSIONS-GUIDE.md | 450 | ✅ Created | This documentation |

**Total:** 5 files, ~983 lines

### Permissions Summary

| Permission | Type | Required API | Runtime Request | Status |
|------------|------|--------------|-----------------|--------|
| INTERNET | Normal | 1+ | ❌ | ✅ Declared |
| ACCESS_NETWORK_STATE | Normal | 1+ | ❌ | ✅ Declared |
| ACCESS_WIFI_STATE | Normal | 1+ | ❌ | ✅ Declared |
| FOREGROUND_SERVICE | Normal | 28+ | ❌ | ✅ Declared |
| FOREGROUND_SERVICE_DATA_SYNC | Normal | 34+ | ❌ | ✅ Declared |
| POST_NOTIFICATIONS | Dangerous | 33+ | ✅ | ✅ Declared + Handler |
| WAKE_LOCK | Normal | 1+ | ❌ | ✅ Declared |
| VIBRATE | Normal | 1+ | ❌ | ✅ Declared |

### Features Implemented

✅ Comprehensive permission declarations in manifest  
✅ Runtime permission request handler (PermissionHandler)  
✅ Android 13+ notification permission support  
✅ Android 14+ foreground service type support  
✅ Permission rationale dialogs  
✅ Extension functions for easy permission checking  
✅ Integration examples for MainActivity  
✅ Graceful handling of permission denial  
✅ Complete documentation with best practices  

---

## ✅ Verification Checklist

- [x] All permissions declared in AndroidManifest.xml
- [x] Runtime permission handler implemented
- [x] Notification permission handling (API 33+)
- [x] Foreground service type specified (API 34+)
- [x] Service declarations added to manifest
- [x] Extension functions for easy checking
- [x] Integration examples provided
- [x] Documentation complete
- [x] Follows Android best practices
- [x] Backward compatible (API 24+)

---

**Status:** ✅ **READY FOR INTEGRATION**  
**Next Step:** Integrate PermissionHandler into MainActivity onCreate()  
**Testing:** Manual testing on Android 13+ and 14+ devices/emulators
