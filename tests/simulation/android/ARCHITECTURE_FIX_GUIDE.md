# Architecture Fix Guide - Data Model Confusion

## Problem Summary

The codebase has **TWO competing architectures** causing 150+ compilation errors:

### Old Architecture (models/)
- `models/TestResult.kt` - Simple data class with properties like:
  - `testName: String`
  - `status: String` (plain string)
  - `durationMs: Long`
  - `failureReason: String?`
  
### New Architecture (domain/models/ + data/local/entities/)
- `domain/models/TestResult.kt` - Domain model with:
  - `scenarioName: String` (renamed from testName)
  - `status: ResultStatus` (enum type)
  - `durationMs: Long`
  - `errorMessage: String?` (renamed from failureReason)
  - `passRate: Float` (computed property)
  
- `data/local/entities/TestResultEntity.kt` - Room database entity

## Root Cause

**150+ errors** occur because:
1. Code files import the OLD model (`models/TestResult`)
2. But reference NEW property names (`scenarioName`, `errorMessage`)
3. Status field changed from `String` → `ResultStatus` enum
4. Computed properties (`passRate`) treated as constructor params

## Fix Strategy

### Option 1: Complete Migration (RECOMMENDED)
**Effort:** 2-3 hours  
**Impact:** Clean architecture, maintainable long-term

#### Steps:
1. **Delete old models** (8 files in `models/` directory)
2. **Update all imports** to use domain models:
   ```kotlin
   // OLD
   import com.infinitygauntlet.simulation.models.TestResult
   
   // NEW
   import com.infinitygauntlet.simulation.domain.models.TestResult
   import com.infinitygauntlet.simulation.domain.models.ResultStatus
   ```

3. **Update property references** in 12 files:
   - `TestResultAdapter.kt` - Change `testName` → `scenarioName`, `failureReason` → `errorMessage`
   - `TestRunnerService.kt` - Update constructor calls, remove computed properties from params
   - `ReportGeneratorService.kt` - Fix constructor signatures
   - `Extensions.kt` - Update property access, fix `status` enum usage
   - `ReportFormatter.kt` - Change property names
   - `TestRunner.kt` - Fix model instantiation

4. **Fix TestScenario model** similarly:
   ```kotlin
   data class TestScenario(
       val id: Long,
       val scenarioId: Long,         // NEW: matches domain model
       val scenarioName: String,     // NEW: renamed from 'name'
       val passed: Int,              // NEW: renamed from 'passedTests'
       val failed: Int,              // NEW: renamed from 'failedTests'
       val skipped: Int,             // NEW: added
       val duration: Long,           // NEW: renamed from 'expectedDurationMs'
       val testName: String,         // Keep for individual test names
       val expectedValue: String,
       val actualValue: String,
       val errorMessage: String
   )
   ```

5. **Update MainActivity.kt**:
   ```kotlin
   // OLD
   class MainActivity : AppCompatActivity()
   
   // NEW (for Hilt view model support)
   class MainActivity : FragmentActivity()
   ```

### Option 2: Quick Rollback (FASTEST)
**Effort:** 30 minutes  
**Impact:** Keeps old architecture, removes new code

#### Steps:
1. **Keep old models** in `models/` directory
2. **Delete new architecture**:
   - Remove `domain/` directory
   - Remove `data/local/entities/` directory
   - Remove `data/local/dao/` directory
   - Remove `data/repositories/` directory
   - Remove `data/mappers/` directory

3. **Remove Room dependencies** from `build.gradle.kts`:
   ```kotlin
   // Comment out again
   // implementation(libs.bundles.room)
   // kapt(libs.room.compiler)
   ```

4. **This gives you a working app with the old architecture**

## Detailed File Changes (Option 1)

### 1. TestResultAdapter.kt
```kotlin
// Change line 55
- binding.testNameText.text = result.testName
+ binding.testNameText.text = result.scenarioName

// Change line 60
- binding.durationText.text = "${result.durationMs}ms"
+ binding.durationText.text = result.formatDuration()

// Change line 73
- when (result.status) {
+ when (result.status) {  // Already ResultStatus enum

// Change lines 94-97
- result.failureReason?.let { reason ->
+ result.errorMessage?.let { reason ->
      binding.errorMessageText.visibility = View.VISIBLE
      binding.errorMessageText.text = reason
-     binding.stackTraceText.text = reason.stackTrace
+     binding.stackTraceText.text = reason  // errorMessage is already a String
  }
```

### 2. TestRunnerService.kt
```kotlin
// Line 181 - Fix TestScenario constructor
TestScenario(
-   startTime,
+   scenarioId = currentScenario.id,
+   scenarioName = currentScenario.name,
+   passed = results.count { it.status == ResultStatus.PASSED },
+   failed = results.count { it.status == ResultStatus.FAILED },
+   skipped = 0,
+   duration = elapsedTime,
+   // Individual test fields (if needed)
+   testName = "",
+   expectedValue = "",
+   actualValue = "",
+   errorMessage = ""
)

// Lines 217-227 - Fix TestResult constructor
TestResult(
-   id = testId,
-   testName = currentScenario.name,
-   status = if (passed) "PASSED" else "FAILED",
-   durationMs = duration,
-   timestamp = startTime,
-   failureReason = if (!passed) exception?.message else null
+   scenarioId = currentScenario.id,
+   scenarioName = currentScenario.name,
+   status = if (passed) ResultStatus.PASSED else ResultStatus.FAILED,
+   durationMs = duration,
+   executionTimestamp = startTime,
+   passedTests = if (passed) 1 else 0,
+   failedTests = if (passed) 0 else 1,
+   errorMessage = exception?.message
)
```

### 3. Extensions.kt
```kotlin
// Line 142 - Use enum
- result.status == "PASSED"
+ result.status == ResultStatus.PASSED

// Line 173 - Fix sumOf ambiguity
- sumOf { it.durationMs }
+ sumOf { it.durationMs.toLong() }

// Line 202 - Use enum comparison
- results.filter { it.status == "PASSED" }
+ results.filter { it.status == ResultStatus.PASSED }

// Line 230 - Add type cast
- sumOf { it.expectedDurationMs }
+ sumOf { scenario.expectedDurationMs.toLong() }
```

### 4. ReportFormatter.kt
```kotlin
// Line 78 - Access computed property
- stats.passedCount
+ stats.passedTests

// Line 84 - Call function (not property)
- stats.averageDuration
+ stats.averageDuration()

// Line 116 - Property rename
- result.testName
+ result.scenarioName

// Line 121 - Property rename
- result.failureReason
+ result.errorMessage
```

### 5. TestRunner.kt
```kotlin
// Line 174-178 - Fix when expression
when (scenario.category) {
    TestCategory.ONBOARDING -> runOnboardingTest(scenario)
    TestCategory.WILD_ENCOUNTERS -> runWildEncounterTest(scenario)
    TestCategory.BATTLE_SYSTEM -> runBattleSystemTest(scenario)
    TestCategory.AI_VALIDATION -> runAIValidationTest(scenario)
    TestCategory.STRESS_TEST -> runStressTest(scenario)
    else -> runGenericTest(scenario)  // Add else branch
}

// Line 188 - Fix TestResult constructor (same as TestRunnerService)
```

## Test Plan

After making changes:

```bash
# 1. Clean build
./gradlew clean

# 2. Rebuild
./gradlew assembleDebug

# 3. Run unit tests
./gradlew testDebugUnitTest

# 4. Expected outcome
✅ 0 compilation errors
✅ App launches successfully
✅ All tests pass
```

## Decision Matrix

| Criteria | Option 1 (Migration) | Option 2 (Rollback) |
|----------|---------------------|---------------------|
| **Compilation Errors** | Fixes all 150+ | Fixes all 150+ |
| **Long-term Maintainability** | ✅ Excellent | ⚠️ Technical debt |
| **Room Database Support** | ✅ Enabled | ❌ Disabled |
| **Time Investment** | 2-3 hours | 30 minutes |
| **Architecture Quality** | ✅ Modern (Clean Architecture) | ⚠️ Legacy (no separation of concerns) |
| **Testability** | ✅ High (repository pattern) | ⚠️ Low (direct model usage) |

## My Recommendation

**Choose Option 1 (Complete Migration)** because:
1. You're already 70% done with the new architecture
2. Room database is valuable for offline support
3. Clean Architecture makes testing easier
4. The codebase is small enough to migrate in one session
5. Avoiding technical debt now saves weeks later

## Next Steps

**Tell me which option you prefer**, and I'll help you execute it:

- **Option 1:** I'll create a detailed refactoring script and help you through each file
- **Option 2:** I'll help you clean up the new architecture files

Either way, we'll get your build working within the hour! 🚀
