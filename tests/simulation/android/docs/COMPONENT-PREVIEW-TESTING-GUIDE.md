# Component Preview Testing Guide

## Overview
This guide provides step-by-step instructions for testing all 16 Week 3 Material 3 components in Android Studio's preview system.

**File Location:** `app/src/main/java/com/infinitygauntlet/simulation/ui/components/ComponentPreviews.kt`

**Total Previews:** 16 preview functions covering all custom components

**Estimated Testing Time:** 30-60 minutes

---

## Prerequisites

1. **Android Studio Hedgehog or newer** (with Compose preview support)
2. **Project compiled successfully** (0 errors, 1 expected Kapt warning)
3. **Preview panel enabled** (View → Tool Windows → Split or Design)

---

## Testing Procedure

### Step 1: Open ComponentPreviews.kt

1. Navigate to: `app/src/main/java/com/infinitygauntlet/simulation/ui/components/ComponentPreviews.kt`
2. Enable **Split** view mode (Code + Preview side-by-side)
3. Wait for preview panel to initialize and render

### Step 2: Test Each Preview Category

Test all 16 previews systematically. Check each preview for:
- ✅ **Renders without errors** (no red error boxes)
- ✅ **Components visible** (not blank/white screen)
- ✅ **Proper spacing** (using Spacing tokens: Small, Medium, Large)
- ✅ **Correct colors** (Material 3 color scheme applied)
- ✅ **Icons display** (AutoMirrored icons for RTL support)
- ✅ **Text readable** (Typography tokens applied)

---

## Preview Testing Checklist

### Category 1: Buttons (3 previews)

#### 1.1 ButtonsPreview (Light Theme)
**Function:** `ButtonsPreview()`  
**Line:** ~23  
**Components Tested:**
- [x] PrimaryButton
- [x] SecondaryButton
- [x] OutlinedActionButton
- [x] TextActionButton
- [x] ElevatedActionButton

**Test Criteria:**
- All 5 button variants render
- Vertical spacing consistent (Spacing.Small)
- Colors match light theme (primary, secondary, outline)
- Text legible and properly sized

**Expected Result:** 5 buttons stacked vertically with proper Material 3 styling

#### 1.2 ButtonsDarkPreview (Dark Theme)
**Function:** `ButtonsDarkPreview()`  
**Line:** ~38  
**Components Tested:**
- [x] PrimaryButton (dark)
- [x] SecondaryButton (dark)
- [x] OutlinedActionButton (dark)

**Test Criteria:**
- Dark theme applied correctly
- Colors inverted from light theme
- Sufficient contrast for readability

**Expected Result:** 3 buttons with dark theme colors

#### 1.3 IconButtonsPreview
**Function:** `IconButtonsPreview()`  
**Line:** ~50  
**Components Tested:**
- [x] IconActionButton (Add icon)
- [x] FilledIconButton (Edit icon)
- [x] PrimaryFAB (Add icon)

**Test Criteria:**
- All 3 icon buttons render
- Icons visible and properly sized
- Horizontal spacing consistent (Spacing.Small)

**Expected Result:** 3 icon buttons in a row (standard, filled, FAB)

---

### Category 2: Cards (3 previews)

#### 2.1 CardsPreview
**Function:** `CardsPreview()`  
**Line:** ~72  
**Components Tested:**
- [x] TestScenarioCard
- [x] PokemonCard

**Test Criteria:**
- Both cards render with elevation
- TestScenarioCard shows title, description, status badge
- PokemonCard shows name, types, level, HP bar
- Vertical spacing between cards (Spacing.Medium)

**Expected Result:** 2 cards stacked vertically

**Sample Data:**
- TestScenarioCard: "Login Test", "Verify user can log in...", status "PASSED"
- PokemonCard: "Pikachu", Electric type, level 25, HP 80/100

#### 2.2 ResultCardPreview
**Function:** `ResultCardPreview()`  
**Line:** ~92  
**Components Tested:**
- [x] ResultCard

**Test Criteria:**
- Card displays statistics: passed (15), failed (2), skipped (3), duration (2m 34s)
- Color-coded status indicators
- Proper padding (Spacing.Medium)

**Expected Result:** Single card with test result statistics

---

### Category 3: Text Fields (1 preview)

#### 3.1 TextFieldsPreview
**Function:** `TextFieldsPreview()`  
**Line:** ~106  
**Components Tested:**
- [x] OutlinedInputField
- [x] SearchField

**Test Criteria:**
- Both text fields render with proper outline
- Label and placeholder text visible
- Search icon appears in SearchField
- Interactive state works (can type in Interactive Mode)

**Expected Result:** 2 text fields stacked vertically

**Interactive Test (Optional):**
1. Enable Interactive Mode in preview panel
2. Click text fields and verify cursor appears
3. Type text and verify input reflects

---

### Category 4: Chips (1 preview)

#### 4.1 ChipsPreview
**Function:** `ChipsPreview()`  
**Line:** ~129  
**Components Tested:**
- [x] AssistActionChip
- [x] FilterSelectionChip
- [x] StatusChip
- [x] PokemonTypeChip

**Test Criteria:**
- All 4 chip types render in wrapped layout
- FilterSelectionChip has selection state (toggle on/off)
- StatusChip shows "PASSED" with appropriate color
- PokemonTypeChip shows "fire" with fire-type color

**Expected Result:** 4 chips in a FlowRow layout

**Interactive Test (Optional):**
1. Enable Interactive Mode
2. Click FilterSelectionChip and verify visual state change

---

### Category 5: Progress Indicators (1 preview)

#### 5.1 ProgressPreview
**Function:** `ProgressPreview()`  
**Line:** ~147  
**Components Tested:**
- [x] LinearProgressWithLabel
- [x] CircularProgressWithLabel
- [x] HPBar

**Test Criteria:**
- LinearProgressWithLabel: 65% progress, "Loading" label
- CircularProgressWithLabel: 75% progress
- HPBar: 80/100 HP with green color (>50%)
- Vertical spacing consistent (Spacing.Large)

**Expected Result:** 3 progress indicators stacked vertically

---

### Category 6: Badges (1 preview)

#### 6.1 BadgesPreview
**Function:** `BadgesPreview()`  
**Line:** ~160  
**Components Tested:**
- [x] StatusBadgeText (PASSED, FAILED, RUNNING)
- [x] LevelBadge
- [x] NewBadge
- [x] BetaBadge
- [x] BadgedContent (with NotificationBadge)

**Test Criteria:**
- 7 badge types render in FlowRow
- Status badges color-coded (green PASSED, red FAILED, blue RUNNING)
- LevelBadge shows "Lv 25"
- NotificationBadge shows count "5" on icon

**Expected Result:** 7 badges in wrapped rows

---

### Category 7: Lists (1 preview)

#### 7.1 ListItemsPreview
**Function:** `ListItemsPreview()`  
**Line:** ~187  
**Components Tested:**
- [x] SectionHeader
- [x] StandardListItem
- [x] ItemDivider
- [x] TestScenarioListItem

**Test Criteria:**
- SectionHeader: "Test Scenarios" with proper typography
- StandardListItem: headline, supporting text, leading/trailing icons
- ItemDivider: thin gray line separator
- TestScenarioListItem: name, description, status badge, clickable

**Expected Result:** Section header, 2 list items with divider

---

### Category 8: Pokemon Components (2 previews)

#### 8.1 PokemonComponentsPreview
**Function:** `PokemonComponentsPreview()`  
**Line:** ~214  
**Components Tested:**
- [x] PokemonHPBar
- [x] PokemonStatBar
- [x] PokemonTypeBadge (fire, water, electric)
- [x] PokemonTeamSlot

**Test Criteria:**
- PokemonHPBar: 85/100 HP with proper color gradient
- PokemonStatBar: Attack 120/255 with bar fill
- 3 PokemonTypeBadges with correct type colors
- PokemonTeamSlot: "Charizard", level 50, HP 150/200, not fainted

**Expected Result:** 4 Pokemon-themed components stacked

#### 8.2 BattleMoveButtonPreview
**Function:** `BattleMoveButtonPreview()`  
**Line:** ~246  
**Components Tested:**
- [x] BattleMoveButton (Flamethrower - fire type)
- [x] BattleMoveButton (Hydro Pump - water type)

**Test Criteria:**
- Both move buttons render with type colors
- Move names, types, PP counts visible
- Flamethrower: 15/15 PP (full)
- Hydro Pump: 5/10 PP (half)

**Expected Result:** 2 move buttons stacked

---

### Category 9: Empty States (2 previews)

#### 9.1 EmptyStatesPreview
**Function:** `EmptyStatesPreview()`  
**Line:** ~268  
**Components Tested:**
- [x] EmptyStateWithAction

**Test Criteria:**
- Icon (TestTube) displays
- Title: "No Tests Found"
- Message: "Start by creating your first test scenario"
- Action button: "Create Test"
- Centered layout with proper spacing

**Expected Result:** Centered empty state with icon, text, button

#### 9.2 ErrorStatePreview
**Function:** `ErrorStatePreview()`  
**Line:** ~281  
**Components Tested:**
- [x] ErrorState

**Test Criteria:**
- Error icon displays
- Title: "Something Went Wrong"
- Message: "Unable to load test results..."
- Retry button visible

**Expected Result:** Centered error state with retry button

---

### Category 10: Navigation (2 previews)

#### 10.1 TopAppBarPreview
**Function:** `TopAppBarPreview()`  
**Line:** ~293  
**Components Tested:**
- [x] SmallTopBar

**Test Criteria:**
- Title: "Test Scenarios"
- Navigation icon (Menu) on left
- Action icons (Search, MoreVert) on right
- Material 3 top app bar styling

**Expected Result:** Top app bar with title and icons

#### 10.2 BottomNavigationPreview
**Function:** `BottomNavigationPreview()`  
**Line:** ~310  
**Components Tested:**
- [x] BottomNavBar

**Test Criteria:**
- 4 navigation items: Home, Tests, Pokemon, Settings
- Icons display for each item
- "Home" selected (highlighted)
- Labels visible below icons

**Expected Result:** Bottom navigation bar with 4 items

---

### Category 11: Surfaces (1 preview)

#### 11.1 SurfacesPreview
**Function:** `SurfacesPreview()`  
**Line:** ~330  
**Components Tested:**
- [x] ElevatedSurface
- [x] OutlinedSurface
- [x] StatusSurface

**Test Criteria:**
- ElevatedSurface: shadow/elevation visible
- OutlinedSurface: border visible
- StatusSurface: "PASSED" status with green background
- All contain text with proper padding

**Expected Result:** 3 surfaces stacked with different styles

---

### Category 12: Combined Showcase (1 preview)

#### 12.1 ComponentShowcasePreview
**Function:** `ComponentShowcasePreview()`  
**Line:** ~363  
**Components Tested:**
- [x] Multiple components in single preview

**Test Criteria:**
- Headline: "Material 3 Components"
- PrimaryButton renders
- TestScenarioCard renders
- 3 StatusChips render
- LinearProgressWithLabel renders
- All components properly spaced

**Expected Result:** Comprehensive showcase of multiple components

---

## Step 3: Theme Testing

### Light Theme Verification
1. All light theme previews should use Material 3 light color scheme
2. Background: light/white colors
3. Text: dark colors for contrast
4. Primary button: filled with primary color

### Dark Theme Verification
1. Open any `*DarkPreview` function
2. Verify dark theme applied:
   - Background: dark/black colors
   - Text: light colors for contrast
   - Primary button: filled with primary color (adjusted for dark theme)

### Dynamic Color (Optional)
1. On Android 12+ devices, dynamic color can be enabled
2. Colors will adapt to system wallpaper
3. Not tested in previews (requires device/emulator)

---

## Step 4: Interactive Mode Testing (Optional)

Android Studio allows interactive preview mode for testing user interactions:

### Enable Interactive Mode
1. Click "Interactive" button in preview toolbar
2. Components become clickable/typeable

### Test Interactions
- **Buttons:** Click and verify no crashes
- **Text Fields:** Click, type text, verify input
- **Chips:** Toggle FilterSelectionChip and verify state change
- **Interactive components** respond as expected

**Note:** Interactive mode uses in-memory state. Changes don't persist.

---

## Known Issues & Limitations

### Expected Behaviors
1. **Preview Rendering Time:** 5-10 seconds for initial render
2. **Memory Usage:** Multiple previews may consume 500MB-1GB RAM
3. **Refresh Required:** After code changes, click "Refresh" button

### Non-Issues (Expected)
1. **Kapt Warning:** "Kapt doesn't support language version 2.0+" is expected
2. **Preview-Only Components:** Some components may not work in actual app (need ViewModel integration)
3. **Static Data:** All previews use hardcoded sample data

---

## Troubleshooting

### Preview Not Rendering
**Symptoms:** Blank preview panel or "No preview found"

**Solutions:**
1. Click "Build & Refresh" button in preview toolbar
2. Rebuild project: Build → Rebuild Project
3. Invalidate caches: File → Invalidate Caches / Restart

### Preview Showing Errors
**Symptoms:** Red error box in preview

**Solutions:**
1. Check error message in preview panel
2. Verify compilation successful: `.\gradlew.bat compileDebugKotlin`
3. Check imports are correct (no red underlines in code)
4. Verify @Preview annotation parameters valid

### Preview Too Slow
**Symptoms:** >30 seconds to render

**Solutions:**
1. Close other preview panels (File → Close All But This)
2. Increase Android Studio memory: Help → Edit Custom VM Options → `-Xmx4096m`
3. Disable interactive mode
4. Test fewer previews at once (comment out some @Preview annotations)

### Components Not Visible
**Symptoms:** Preview renders but components not visible

**Solutions:**
1. Check `showBackground = true` in @Preview annotation
2. Verify InfinityGauntletTheme wrapper present
3. Check component colors match theme (light vs dark)
4. Increase preview heightDp if content cut off: `@Preview(heightDp = 600)`

---

## Acceptance Criteria

✅ **All 16 previews render without errors**  
✅ **Light and dark themes display correctly**  
✅ **All components visible and properly styled**  
✅ **Spacing consistent using Spacing tokens**  
✅ **Colors match Material 3 theme**  
✅ **Icons display (AutoMirrored for RTL)**  
✅ **Typography applied correctly**  
✅ **Interactive mode works (optional)**  
✅ **No compilation errors**  
✅ **Preview panel responsive (<10s render time)**  

---

## Testing Results Documentation

After completing all tests, document results:

### Success Case (Expected)
```
✅ Component Preview Testing - PASSED

Total Previews Tested: 16
Passed: 16
Failed: 0
Warnings: 0

All components render correctly in light and dark themes.
No visual issues detected.
Interactive mode functional (tested on FilterSelectionChip, TextFields).

Tested by: [Your Name]
Date: [Test Date]
Android Studio Version: [Version]
```

### Failure Case (If Issues Found)
```
⚠️ Component Preview Testing - ISSUES FOUND

Total Previews Tested: 16
Passed: 14
Failed: 2
Warnings: 1

Issues:
1. BadgesPreview - NotificationBadge count not visible (line 175)
   - Expected: "5" count on badge
   - Actual: Badge renders but count text missing
   - Action: Check BadgedContent implementation

2. PokemonHPBar - Color incorrect (line 220)
   - Expected: Green color for HP >50%
   - Actual: Red color displayed
   - Action: Verify HPBar color logic

Warnings:
1. ErrorStatePreview - Icon appears pixelated (line 285)
   - Not critical, but check icon size/resolution

Tested by: [Your Name]
Date: [Test Date]
```

---

## Next Steps After Testing

### If All Tests Pass ✅
1. Mark Task 1 as completed in todo list
2. Proceed to Task 2: Add Missing DAO Methods
3. Document testing completion in WEEK-4-ACTION-PLAN.md

### If Issues Found ⚠️
1. Document each issue with screenshot
2. Create fix tasks in todo list
3. Address critical issues before proceeding
4. Re-test after fixes applied

---

## Additional Resources

- **Material 3 Design Guidelines:** https://m3.material.io/
- **Compose Preview Documentation:** https://developer.android.com/jetpack/compose/tooling/previews
- **Component Source Files:** `app/src/main/java/com/infinitygauntlet/simulation/ui/components/*.kt`
- **Theme Configuration:** `app/src/main/java/com/infinitygauntlet/simulation/ui/theme/Theme.kt`
- **Design Tokens:** `app/src/main/java/com/infinitygauntlet/simulation/ui/theme/Spacing.kt`

---

**Document Version:** 1.0  
**Last Updated:** November 29, 2025  
**Status:** Ready for Testing
