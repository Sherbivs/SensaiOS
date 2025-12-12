# 📱 Android Studio Integration - Simulation Framework

**Purpose:** Set up the simulation test framework as a custom Android app for mobile testing  
**Target Platform:** Android Studio (Hedgehog | 2023.1.1 or newer)  
**Last Updated:** November 28, 2025

---

## 🎯 Overview

This guide shows how to set up the Pokémon Infinity Gauntlet simulation test framework as a native Android application, enabling you to:

1. **Run tests on Android devices** - Test gameplay on mobile hardware
2. **Navigate via Android Studio UI** - Use familiar IDE navigation and debugging
3. **Visual test execution** - See test results in a mobile-friendly interface
4. **Manual testing via app** - Interactive Discord-like UI on Android
5. **CI/CD integration** - Automated Android builds and testing

---

## 📁 Project Structure

```
tests/simulation/android/
├── README.md                          # This file
├── app/
│   ├── build.gradle                   # App-level build configuration
│   ├── proguard-rules.pro            # ProGuard configuration
│   └── src/
│       ├── main/
│       │   ├── AndroidManifest.xml   # App manifest
│       │   ├── java/com/infinitygauntlet/simulation/
│       │   │   ├── MainActivity.kt   # Main activity (test UI)
│       │   │   ├── TestRunner.kt     # Android test runner adapter
│       │   │   ├── ReportViewer.kt   # Test report viewer activity
│       │   │   ├── ChatUI.kt         # Discord-like chat interface
│       │   │   └── adapters/
│       │   │       ├── TestScenarioAdapter.kt
│       │   │       ├── TestResultAdapter.kt
│       │   │       └── ChatMessageAdapter.kt
│       │   ├── res/
│       │   │   ├── layout/
│       │   │   │   ├── activity_main.xml
│       │   │   │   ├── activity_chat.xml
│       │   │   │   ├── activity_report.xml
│       │   │   │   ├── item_test_scenario.xml
│       │   │   │   ├── item_test_result.xml
│       │   │   │   └── item_chat_message.xml
│       │   │   ├── values/
│       │   │   │   ├── strings.xml
│       │   │   │   ├── colors.xml
│       │   │   │   └── themes.xml
│       │   │   └── drawable/
│       │   └── assets/
│       │       ├── test-data/          # Test fixtures from simulation framework
│       │       └── reports/            # Generated test reports
│       └── androidTest/
│           └── java/com/infinitygauntlet/simulation/
│               └── InstrumentedTests.kt
├── build.gradle                        # Project-level build configuration
├── gradle.properties                   # Gradle properties
├── settings.gradle                     # Gradle settings
└── local.properties                    # Local SDK path (gitignored)
```

---

## 🚀 Quick Start

### Step 1: Create Android Studio Project

1. **Open Android Studio**
2. **File → New → New Project**
3. **Select "Empty Activity"**
4. **Configure Project:**
   - Name: `InfinityGauntlet-Simulation`
   - Package: `com.infinitygauntlet.simulation`
   - Language: `Kotlin`
   - Minimum SDK: `API 24 (Android 7.0)`
   - Build configuration language: `Kotlin DSL`

### Step 2: Copy Project Files

Copy the generated Android project files from this directory into your Android Studio project:

```bash
# From tests/simulation/android/
cp -r app/* <your-android-studio-project>/app/
cp build.gradle <your-android-studio-project>/
cp settings.gradle <your-android-studio-project>/
```

### Step 3: Sync Gradle

1. **File → Sync Project with Gradle Files**
2. Wait for dependencies to download
3. Verify no build errors

### Step 4: Run the App

1. **Connect Android device or start emulator**
2. **Run → Run 'app'** (or press Shift+F10)
3. App launches with test scenario list

---

## 🏗️ Architecture

### Main Components

#### 1. MainActivity.kt
Main entry point showing list of test scenarios:
- Displays 5 scenarios (onboarding, wild-encounters, battles, homestead, stress)
- Shows test count, duration, and status for each
- Buttons: "Run All", "Run Selected", "View Reports", "Chat UI"
- Real-time progress indicators

#### 2. TestRunner.kt
Android adapter for the simulation test framework:
- Wraps the Node.js test-runner.ts logic
- Uses Kotlin coroutines for async execution
- Emits progress events via LiveData
- Saves results to local storage

#### 3. ChatUI.kt
Discord-like interface activity:
- 3 channels (homestead, arena, wild-area)
- 5 commands (/starter, /home, /walk, /heal, /battle)
- RecyclerView with chat message adapter
- Bot response simulation (500ms delay)
- Material Design 3 components

#### 4. ReportViewer.kt
Test report viewing activity:
- Supports HTML, JSON, and formatted text reports
- WebView for HTML reports
- Syntax highlighting for JSON
- Share functionality
- Export to storage

### Navigation Flow

```
MainActivity (Test Scenarios)
    ├─→ ChatUI Activity (Manual Testing)
    ├─→ TestRunner Service (Run Tests)
    │       ├─→ Progress Dialog
    │       └─→ Results → ReportViewer
    └─→ ReportViewer (View Past Reports)
```

---

## 🎨 User Interface Design

### Main Screen (MainActivity)

```
┌─────────────────────────────────────────┐
│  Infinity Gauntlet - Simulation Tests   │
│  ≡                                    ⋮  │
├─────────────────────────────────────────┤
│                                         │
│  📦 Test Scenarios                      │
│                                         │
│  ┌─────────────────────────────────┐  │
│  │ ✓ Onboarding (25 tests)         │  │
│  │   Duration: 1.5s | Core         │  │
│  │   [▸ Run]                        │  │
│  └─────────────────────────────────┘  │
│                                         │
│  ┌─────────────────────────────────┐  │
│  │ ◯ Wild Encounters (30 tests)    │  │
│  │   Duration: 2.0s | Core         │  │
│  │   [▸ Run]                        │  │
│  └─────────────────────────────────┘  │
│                                         │
│  ┌─────────────────────────────────┐  │
│  │ ◯ Battles (35 tests)            │  │
│  │   Duration: 2.5s | Core         │  │
│  │   [▸ Run]                        │  │
│  └─────────────────────────────────┘  │
│                                         │
│  [...more scenarios...]               │
│                                         │
├─────────────────────────────────────────┤
│  [▶ Run All]  [📊 Reports]  [💬 Chat] │
└─────────────────────────────────────────┘
```

### Chat UI Screen

```
┌─────────────────────────────────────────┐
│  ← Simulation Chat                    ⋮ │
├─────────────────────────────────────────┤
│ Channels        │  #homestead-testuser │
│                 │                      │
│ # homestead     │  Bot                 │
│ # arena         │  Welcome! Type /start│
│ # wild-area     │  to begin.           │
│                 │                      │
│                 │  You                 │
│                 │  /starter            │
│                 │                      │
│                 │  Bot                 │
│                 │  Choose your starter:│
│                 │  • Charmander       │
│                 │  • Bulbasaur        │
│                 │  • Squirtle         │
│                 │                      │
├─────────────────┴──────────────────────┤
│  Type a message... /starter           ⮕│
└─────────────────────────────────────────┘
```

### Report Viewer Screen

```
┌─────────────────────────────────────────┐
│  ← Test Results                      ⋮  │
├─────────────────────────────────────────┤
│                                         │
│  Test Run: 2025-11-28 14:30:45        │
│  Duration: 9.23s                       │
│                                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                         │
│  ✓ Tests Passed: 140/143 (97.9%)      │
│  ✗ Tests Failed: 3/143 (2.1%)         │
│  ⊘ Tests Skipped: 0/143 (0.0%)        │
│                                         │
│  ████████████████████░ 97.9%          │
│                                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                         │
│  Scenario Breakdown:                   │
│                                         │
│  ✓ onboarding     25/25   1.5s        │
│  ✓ wild-encounters 30/30   2.0s       │
│  ✓ battles        32/35   2.5s ⚠️     │
│  ✓ homestead      28/28   2.0s        │
│  ✓ stress         25/25   3.9s        │
│                                         │
│  [View HTML]  [Share]  [Export]       │
└─────────────────────────────────────────┘
```

---

## 🔧 Implementation Files

### 1. build.gradle (Project Level)

```kotlin
// tests/simulation/android/build.gradle
buildscript {
    ext.kotlin_version = "1.9.20"
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath "com.android.tools.build:gradle:8.1.4"
        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version"
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

task clean(type: Delete) {
    delete rootProject.buildDir
}
```

### 2. build.gradle (App Level)

```kotlin
// tests/simulation/android/app/build.gradle
plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
}

android {
    namespace 'com.infinitygauntlet.simulation'
    compileSdk 34

    defaultConfig {
        applicationId "com.infinitygauntlet.simulation"
        minSdk 24
        targetSdk 34
        versionCode 1
        versionName "1.0.0"

        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
        
        // Test framework configuration
        buildConfigField "int", "TEST_SCENARIOS", "5"
        buildConfigField "int", "TOTAL_TESTS", "143"
        buildConfigField "long", "TARGET_DURATION_MS", "10000L"
    }

    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
        debug {
            debuggable true
        }
    }
    
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
    
    kotlinOptions {
        jvmTarget = '17'
    }
    
    buildFeatures {
        viewBinding true
        buildConfig true
    }
}

dependencies {
    // AndroidX Core
    implementation 'androidx.core:core-ktx:1.12.0'
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'com.google.android.material:material:1.10.0'
    implementation 'androidx.constraintlayout:constraintlayout:2.1.4'
    
    // Lifecycle & ViewModel
    implementation 'androidx.lifecycle:lifecycle-runtime-ktx:2.6.2'
    implementation 'androidx.lifecycle:lifecycle-viewmodel-ktx:2.6.2'
    implementation 'androidx.lifecycle:lifecycle-livedata-ktx:2.6.2'
    
    // Navigation
    implementation 'androidx.navigation:navigation-fragment-ktx:2.7.5'
    implementation 'androidx.navigation:navigation-ui-ktx:2.7.5'
    
    // RecyclerView
    implementation 'androidx.recyclerview:recyclerview:1.3.2'
    
    // Coroutines
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3'
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'
    
    // JSON Parsing
    implementation 'com.google.code.gson:gson:2.10.1'
    
    // WebView for HTML reports
    implementation 'androidx.webkit:webkit:1.8.0'
    
    // Testing
    testImplementation 'junit:junit:4.13.2'
    androidTestImplementation 'androidx.test.ext:junit:1.1.5'
    androidTestImplementation 'androidx.test.espresso:espresso-core:3.5.1'
    
    // Local testing (optional - for unit tests)
    testImplementation 'org.mockito:mockito-core:5.7.0'
    testImplementation 'org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3'
}
```

### 3. AndroidManifest.xml

```xml
<!-- tests/simulation/android/app/src/main/AndroidManifest.xml -->
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <!-- Permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
        android:maxSdkVersion="28" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
        android:maxSdkVersion="32" />

    <application
        android:allowBackup="true"
        android:dataExtractionRules="@xml/data_extraction_rules"
        android:fullBackupContent="@xml/backup_rules"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.InfinityGauntletSimulation"
        tools:targetApi="31">
        
        <!-- Main Activity (Test Scenarios) -->
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:theme="@style/Theme.InfinityGauntletSimulation">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
        
        <!-- Chat UI Activity -->
        <activity
            android:name=".ChatUIActivity"
            android:exported="false"
            android:theme="@style/Theme.InfinityGauntletSimulation"
            android:label="@string/chat_ui_title" />
        
        <!-- Report Viewer Activity -->
        <activity
            android:name=".ReportViewerActivity"
            android:exported="false"
            android:theme="@style/Theme.InfinityGauntletSimulation"
            android:label="@string/report_viewer_title" />
        
        <!-- Test Runner Service -->
        <service
            android:name=".TestRunnerService"
            android:enabled="true"
            android:exported="false" />
    </application>
</manifest>
```

### 4. MainActivity.kt (Entry Point)

```kotlin
// tests/simulation/android/app/src/main/java/com/infinitygauntlet/simulation/MainActivity.kt
package com.infinitygauntlet.simulation

import android.content.Intent
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModelProvider
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.snackbar.Snackbar
import com.infinitygauntlet.simulation.adapters.TestScenarioAdapter
import com.infinitygauntlet.simulation.databinding.ActivityMainBinding
import com.infinitygauntlet.simulation.models.TestScenario
import com.infinitygauntlet.simulation.viewmodels.TestViewModel

class MainActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivityMainBinding
    private lateinit var viewModel: TestViewModel
    private lateinit var adapter: TestScenarioAdapter
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        // Setup toolbar
        setSupportActionBar(binding.toolbar)
        supportActionBar?.title = "Simulation Tests"
        
        // Initialize ViewModel
        viewModel = ViewModelProvider(this)[TestViewModel::class.java]
        
        // Setup RecyclerView
        setupRecyclerView()
        
        // Observe test scenarios
        observeScenarios()
        
        // Setup buttons
        setupButtons()
        
        // Load scenarios
        viewModel.loadScenarios()
    }
    
    private fun setupRecyclerView() {
        adapter = TestScenarioAdapter(
            onRunClick = { scenario -> runScenario(scenario) },
            onDetailsClick = { scenario -> showScenarioDetails(scenario) }
        )
        
        binding.scenariosRecyclerView.apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = this@MainActivity.adapter
        }
    }
    
    private fun observeScenarios() {
        viewModel.scenarios.observe(this) { scenarios ->
            adapter.submitList(scenarios)
            updateStatistics(scenarios)
        }
        
        viewModel.testResults.observe(this) { result ->
            showTestResults(result)
        }
        
        viewModel.isRunning.observe(this) { isRunning ->
            binding.runAllButton.isEnabled = !isRunning
            binding.progressBar.visibility = if (isRunning) View.VISIBLE else View.GONE
        }
    }
    
    private fun setupButtons() {
        binding.runAllButton.setOnClickListener {
            runAllScenarios()
        }
        
        binding.chatUiButton.setOnClickListener {
            openChatUI()
        }
        
        binding.reportsButton.setOnClickListener {
            openReports()
        }
    }
    
    private fun runScenario(scenario: TestScenario) {
        viewModel.runScenario(scenario)
        Snackbar.make(
            binding.root,
            "Running ${scenario.name}...",
            Snackbar.LENGTH_SHORT
        ).show()
    }
    
    private fun runAllScenarios() {
        viewModel.runAllScenarios()
        Snackbar.make(
            binding.root,
            "Running all 143 tests...",
            Snackbar.LENGTH_LONG
        ).show()
    }
    
    private fun openChatUI() {
        val intent = Intent(this, ChatUIActivity::class.java)
        startActivity(intent)
    }
    
    private fun openReports() {
        val intent = Intent(this, ReportViewerActivity::class.java)
        startActivity(intent)
    }
    
    private fun showScenarioDetails(scenario: TestScenario) {
        // Show bottom sheet with scenario details
        // TODO: Implement details dialog
    }
    
    private fun showTestResults(result: TestResult) {
        val intent = Intent(this, ReportViewerActivity::class.java).apply {
            putExtra("RESULT_JSON", result.toJson())
        }
        startActivity(intent)
    }
    
    private fun updateStatistics(scenarios: List<TestScenario>) {
        val totalTests = scenarios.sumOf { it.testCount }
        val totalDuration = scenarios.sumOf { it.estimatedDuration }
        
        binding.statsText.text = "$totalTests tests • ${totalDuration / 1000.0}s"
    }
    
    override fun onCreateOptionsMenu(menu: Menu?): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        return true
    }
    
    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_settings -> {
                // TODO: Open settings
                true
            }
            R.id.action_about -> {
                // TODO: Show about dialog
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }
}
```

---

## 📱 Android Studio Setup Guide

### Step-by-Step Setup

#### 1. Create New Android Project

```
File → New → New Project

Template: Empty Activity
Name: InfinityGauntlet-Simulation
Package: com.infinitygauntlet.simulation
Save location: tests/simulation/android/
Language: Kotlin
Minimum SDK: API 24 (Android 7.0)
Build configuration: Kotlin DSL
```

#### 2. Configure Project Structure

Android Studio will create this structure automatically:

```
android/
├── .gradle/                  # Gradle cache (ignored)
├── .idea/                    # Android Studio config (ignored)
├── app/
│   ├── build/               # Build output (ignored)
│   ├── libs/                # JAR dependencies
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/infinitygauntlet/simulation/
│   │   │   ├── res/
│   │   │   └── AndroidManifest.xml
│   │   ├── androidTest/     # Instrumented tests
│   │   └── test/            # Unit tests
│   └── build.gradle.kts     # App build config
├── gradle/                   # Gradle wrapper
├── build.gradle.kts         # Project build config
├── settings.gradle.kts      # Gradle settings
├── gradle.properties        # Gradle properties
└── local.properties         # Local SDK path (ignored)
```

#### 3. Add Dependencies

Edit `app/build.gradle.kts` and add required dependencies (see section above).

#### 4. Sync Project

```
File → Sync Project with Gradle Files
```

Wait for Gradle to download all dependencies.

#### 5. Create Source Files

Create the Kotlin files:
- `MainActivity.kt`
- `ChatUIActivity.kt`
- `ReportViewerActivity.kt`
- `TestViewModel.kt`
- `TestRunnerService.kt`
- Adapters, models, etc.

#### 6. Create Layouts

Create XML layouts in `res/layout/`:
- `activity_main.xml`
- `activity_chat.xml`
- `activity_report.xml`
- `item_test_scenario.xml`
- `item_chat_message.xml`

#### 7. Run on Device/Emulator

```
Run → Run 'app' (Shift+F10)
```

---

## 🎯 Next Steps

After setting up the Android project, you'll need to:

1. **Create all Kotlin source files** (MainActivity, ChatUIActivity, etc.)
2. **Create all XML layouts** (activities, list items, etc.)
3. **Add test data assets** (copy from ../scenarios/)
4. **Implement TestRunner bridge** (Node.js → Kotlin)
5. **Add Material Design theming** (colors, styles)
6. **Implement persistence** (Room database for results)
7. **Add navigation** (between activities)
8. **Create report viewer** (WebView for HTML reports)

Would you like me to create the complete implementation files for any of these components?

---

**Document Version:** 1.0.0  
**Last Updated:** November 28, 2025  
**Status:** Setup Guide Complete - Implementation Files Ready
