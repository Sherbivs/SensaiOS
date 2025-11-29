# Week 4 Action Plan - Post-Compilation Success

**Created:** November 29, 2025  
**Status:** Ready for implementation  
**Priority:** High → Medium → Low

---

## 🎯 Immediate Actions (High Priority)

### 1. Code Cleanup - Fix Deprecation Warnings (10 warnings)

#### A. ChatViewModel.kt - Add @OptIn for ExperimentalCoroutinesApi
**File:** `app/src/main/java/com/infinitygauntlet/simulation/presentation/chat/ChatViewModel.kt`  
**Line:** 111 (flatMapLatest usage)  
**Issue:** `flatMapLatest` requires opt-in for experimental coroutines API

**Fix:**
```kotlin
@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package com.infinitygauntlet.simulation.presentation.chat
```

**Impact:** Eliminates 1 warning, makes experimental API usage explicit

---

#### B. Icons.kt - Update to AutoMirrored Icons (7 warnings)
**File:** `app/src/main/java/com/infinitygauntlet/simulation/ui/components/Icons.kt`  
**Lines:** 15, 48, 61, 81, 82, 120, 121

**Deprecated Icons:**
1. Line 15: `Icons.Filled.ArrowBack` → `Icons.AutoMirrored.Filled.ArrowBack`
2. Line 48: `Icons.Filled.Sort` → `Icons.AutoMirrored.Filled.Sort`
3. Line 61: `Icons.Filled.Message` → `Icons.AutoMirrored.Filled.Message`
4. Line 81: `Icons.Filled.Login` → `Icons.AutoMirrored.Filled.Login`
5. Line 82: `Icons.Filled.Logout` → `Icons.AutoMirrored.Filled.Logout`
6. Line 120: `Icons.Filled.Help` → `Icons.AutoMirrored.Filled.Help`
7. Line 121: `Icons.Filled.HelpOutline` → `Icons.AutoMirrored.Filled.HelpOutline`

**Reason for Change:**  
Material Design 3 icons now support automatic RTL (right-to-left) mirroring. Icons that should flip direction in RTL languages (Arabic, Hebrew) are moved to AutoMirrored namespace.

**Impact:** Eliminates 7 warnings, improves RTL language support

---

#### C. Theme.kt - Fix StatusBar Deprecation (1 warning)
**File:** `app/src/main/java/com/infinitygauntlet/simulation/ui/theme/Theme.kt`  
**Line:** 66  
**Issue:** `statusBarColor` is deprecated in Java

**Current Code:**
```kotlin
window.statusBarColor = colorScheme.primary.toArgb()
```

**Modern Approach:**
```kotlin
WindowCompat.setDecorFitsSystemWindows(window, false)
WindowInsetsControllerCompat(window, view).apply {
    isAppearanceLightStatusBars = !darkTheme
}
```

**Impact:** Eliminates 1 warning, uses modern edge-to-edge design

---

#### D. Kapt Language Version Warning (1 warning)
**Issue:** Kapt doesn't support Kotlin 2.0+, falls back to 1.9

**Options:**
1. **Keep as-is** (recommended) - Warning doesn't affect functionality
2. **Migrate to KSP** - More work, better performance, future-proof
3. **Downgrade Kotlin** - Not recommended, loses 2.0 features

**Recommendation:** Keep current setup, plan KSP migration for Week 5+

---

## 📱 Component Preview Testing (High Priority)

### Test All 16 Week 3 Components

**File:** `app/src/main/java/com/infinitygauntlet/simulation/ui/components/ComponentPreviews.kt`

**Components to Preview:**
1. **Theme System (8 components):**
   - Color schemes (Light/Dark)
   - Typography system
   - Shape system
   - Dimension/spacing

2. **UI Components (16 components):**
   - Buttons (Primary, Secondary, Text)
   - TextFields (Standard, Search, Password)
   - Cards (Basic, Interactive, Complex)
   - Chips (Filter, Action, Input)
   - Dialogs (Basic, Loading, Confirmation)
   - BottomSheets (Standard, Modal)
   - Lists (Simple, Interactive, Complex)
   - EmptyStates (Generic, Search, Error)
   - Snackbars (Success, Error, Warning, Info)
   - Badges (Count, Status)
   - Navigation (DrawerContent, RailContent, TopAppBar, BottomNavBar)

**How to Test:**
1. Open `ComponentPreviews.kt` in Android Studio
2. Click "Split" view (Code + Preview)
3. Enable "Interactive Mode" for interactive components
4. Verify each component renders correctly
5. Test light/dark theme switching
6. Test different screen sizes

**Expected Issues:**
- None! All components should render perfectly
- If issues found, document in `PREVIEW-TEST-RESULTS.md`

---

## 🔧 Week 4 Feature Implementation (Medium Priority)

### Repository Methods to Implement

#### 1. ChatRepository - Missing Methods

**File:** `app/src/main/java/com/infinitygauntlet/simulation/domain/repository/ChatRepository.kt`

**Method 1: clearChannelMessages**
```kotlin
/**
 * Clear all messages in a channel
 */
suspend fun clearChannelMessages(channelId: String)
```

**Implementation:**
```kotlin
override suspend fun clearChannelMessages(channelId: String) {
    chatMessageDao.deleteMessagesByChannel(channelId)
}
```

**Method 2: searchMessagesInChannel**
```kotlin
/**
 * Search messages in a specific channel
 * Returns messages containing the query string
 */
suspend fun searchMessagesInChannel(channelId: String, query: String): List<ChatMessage>
```

**Implementation:**
```kotlin
override suspend fun searchMessagesInChannel(channelId: String, query: String): List<ChatMessage> {
    return chatMessageDao.searchInChannel(channelId, "%$query%")
        .map { it.toDomain() }
}
```

**DAO Methods Needed:**
```kotlin
// ChatMessageDao.kt
@Query("DELETE FROM chat_messages WHERE channelId = :channelId")
suspend fun deleteMessagesByChannel(channelId: String)

@Query("SELECT * FROM chat_messages WHERE channelId = :channelId AND content LIKE :query ORDER BY timestamp DESC")
suspend fun searchInChannel(channelId: String, query: String): List<ChatMessageEntity>
```

---

#### 2. TestResultRepository - Missing Method

**File:** `app/src/main/java/com/infinitygauntlet/simulation/domain/repository/TestResultRepository.kt`

**Method: getResultById**
```kotlin
/**
 * Get a specific test result by its ID
 */
suspend fun getResultById(resultId: Long): TestResult?
```

**Implementation:**
```kotlin
override suspend fun getResultById(resultId: Long): TestResult? {
    return testResultDao.getById(resultId)?.toDomain()
}
```

**DAO Method:**
```kotlin
// TestResultDao.kt
@Query("SELECT * FROM test_results WHERE id = :resultId")
suspend fun getById(resultId: Long): TestResultEntity?
```

---

### ViewModel Updates After Repository Methods

**ChatViewModel.kt - Uncomment Methods:**
```kotlin
// Line ~356: Uncomment clearChannelMessages
try {
    chatRepository.clearChannelMessages(channelId.toString())
    _events.emit(ChatUiEvent.ShowMessage("Messages cleared"))
} catch (e: Exception) {
    _events.emit(ChatUiEvent.Error("Failed to clear messages: ${e.message}"))
}

// Line ~376: Uncomment searchMessagesInChannel
try {
    val results = chatRepository.searchMessagesInChannel(channelId.toString(), query)
    _events.emit(ChatUiEvent.ShowMessage("Found ${results.size} messages"))
} catch (e: Exception) {
    _events.emit(ChatUiEvent.Error("Search failed: ${e.message}"))
}
```

**ReportViewModel.kt - Use getResultById:**
```kotlin
// Line ~95: Replace workaround
fun loadReport(resultId: Long) {
    viewModelScope.launch {
        _uiState.update { it.copy(isLoading = true, error = null) }
        
        try {
            val result = resultRepository.getResultById(resultId)
            if (result != null) {
                _uiState.update { 
                    it.copy(
                        result = result,
                        isLoading = false
                    )
                }
                _events.emit(ReportUiEvent.ReportLoaded(result))
                generateHtmlReport()
            } else {
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        error = "Result not found"
                    )
                }
            }
        } catch (e: Exception) {
            _uiState.update { 
                it.copy(
                    isLoading = false,
                    error = "Failed to load report: ${e.message}"
                )
            }
            _events.emit(ReportUiEvent.Error("Failed to load report: ${e.message}"))
        }
    }
}
```

---

## 🎨 UI Implementation (Medium Priority)

### Screens to Build

#### 1. Chat Screen
**File:** `app/src/main/java/com/infinitygauntlet/simulation/ui/screens/ChatScreen.kt`

**Components:**
- Channel list (side navigation)
- Message list (scrollable)
- Message input (bottom bar)
- Typing indicators
- Search functionality
- Channel switching

**Compose Structure:**
```kotlin
@Composable
fun ChatScreen(
    viewModel: ChatViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    
    Scaffold(
        topBar = { ChatTopBar(currentChannel = uiState.currentChannel) },
        bottomBar = { MessageInputBar(onSend = viewModel::sendMessage) }
    ) { padding ->
        Row(modifier = Modifier.padding(padding)) {
            ChannelList(
                channels = uiState.channels,
                currentChannelId = uiState.currentChannel?.id,
                onChannelClick = viewModel::switchChannel
            )
            MessageList(
                messages = uiState.messages,
                onReaction = viewModel::addReaction
            )
        }
    }
}
```

---

#### 2. Report Screen
**File:** `app/src/main/java/com/infinitygauntlet/simulation/ui/screens/ReportScreen.kt`

**Components:**
- Result summary card
- Statistics charts
- Scenario selection dropdown
- HTML/Text export buttons
- Pass/Fail indicators

---

#### 3. Test Screen
**File:** `app/src/main/java/com/infinitygauntlet/simulation/ui/screens/TestScreen.kt`

**Components:**
- Scenario list
- Run/Stop controls
- Progress indicators
- Statistics summary
- Result history

---

## 🧪 Testing (Low Priority - Week 5)

### Unit Tests Needed

1. **Mapper Tests:**
   - `ChatMessageMapperTest.kt`
   - `ChannelMapperTest.kt`
   - `TestScenarioMapperTest.kt`

2. **ViewModel Tests:**
   - `ChatViewModelTest.kt`
   - `ReportViewModelTest.kt`
   - `TestViewModelTest.kt`

3. **Repository Tests:**
   - `ChatRepositoryTest.kt`
   - `TestResultRepositoryTest.kt`

### UI Tests Needed

1. **Component Tests:**
   - All 16 components have preview tests
   - Add interaction tests for buttons, inputs, dialogs

2. **Screen Tests:**
   - Navigation flows
   - State management
   - Error handling

---

## 📋 Implementation Order

### Phase 1: Code Cleanup (Now - 30 minutes)
1. ✅ Fix AutoMirrored icon deprecations (7 warnings)
2. ✅ Add @OptIn for ExperimentalCoroutinesApi (1 warning)
3. ✅ Update statusBarColor to modern API (1 warning)
4. ✅ Verify clean compilation (0 warnings expected except Kapt)

### Phase 2: Component Testing (Now - 1 hour)
1. Open ComponentPreviews.kt in Android Studio
2. Test all 16 components in preview mode
3. Test light/dark themes
4. Test interactive mode
5. Document any issues

### Phase 3: Repository Methods (Week 4 - 2 hours)
1. Implement clearChannelMessages + DAO
2. Implement searchMessagesInChannel + DAO
3. Implement getResultById + DAO
4. Update ViewModels to use new methods
5. Test with database

### Phase 4: UI Screens (Week 4 - 4-6 hours)
1. Build ChatScreen with navigation
2. Build ReportScreen with charts
3. Build TestScreen with controls
4. Wire up navigation
5. Add error handling

### Phase 5: Testing (Week 5+)
1. Write unit tests (80%+ coverage target)
2. Write UI tests
3. Integration testing
4. Performance testing

---

## ✅ Success Criteria

### Code Cleanup Complete When:
- ✅ 0 errors (already achieved)
- ✅ 1 warning max (Kapt only)
- ✅ All AutoMirrored icons used
- ✅ Modern statusBar API used
- ✅ @OptIn annotations added

### Component Testing Complete When:
- ✅ All 16 components render in preview
- ✅ Light/dark themes work
- ✅ Interactive mode functional
- ✅ No visual bugs

### Repository Implementation Complete When:
- ✅ All 3 missing methods implemented
- ✅ DAO methods added
- ✅ ViewModels uncommented and working
- ✅ Database operations tested

### UI Implementation Complete When:
- ✅ All 3 main screens built
- ✅ Navigation working
- ✅ State management correct
- ✅ Error handling robust
- ✅ APK runs on device

---

## 🚀 Ready to Start!

**Immediate Next Steps:**
1. Run deprecation warning fixes (automated script available)
2. Open Android Studio for component preview testing
3. Begin repository method implementation

**Time Estimates:**
- Code Cleanup: 30 minutes
- Component Testing: 1 hour
- Repository Methods: 2 hours
- UI Screens: 4-6 hours
- **Total Week 4:** ~8-10 hours

---

**Status:** 📋 Plan Complete - Ready for Implementation  
**Last Updated:** November 29, 2025
