plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)  // Re-enabled for Kotlin 2.0+
    alias(libs.plugins.ksp)  // Migrated from KAPT to KSP
    alias(libs.plugins.hilt.android)
    id("kotlin-parcelize")  // Required for @Parcelize annotation
}

android {
    namespace = "com.infinitygauntlet.simulation"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.infinitygauntlet.simulation"
        minSdk = 26  // Required for PostgreSQL JDBC driver (MethodHandle.invoke)
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Test framework configuration
        buildConfigField("int", "TEST_SCENARIOS", "5")
        buildConfigField("int", "TOTAL_TESTS", "143")
        buildConfigField("long", "TARGET_DURATION_MS", "10000L")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isDebuggable = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"

        // Enable Compose compiler metrics (optional, for debugging)
        freeCompilerArgs += listOf(
            "-opt-in=kotlin.RequiresOptIn"
        )
    }

    buildFeatures {
        viewBinding = true
        buildConfig = true
        compose = true  // Enable Jetpack Compose
    }

    // Packaging options for Hilt
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // ══════════════════════════════════════════════════════════════
    // WEEK 1: COMPOSE + HILT FOUNDATION
    // ══════════════════════════════════════════════════════════════

    // Jetpack Compose BOM (Bill of Materials)
    implementation(platform(libs.compose.bom))

    // Compose UI Bundle (Material 3, Navigation, Lifecycle)
    implementation(libs.bundles.compose)

    // Compose Debugging
    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)

    // Accompanist (System UI, Permissions, Animations)
    implementation(libs.bundles.accompanist)

    // Hilt Dependency Injection
    implementation(libs.hilt.android)
    ksp(libs.hilt.android.compiler)  // Migrated from KAPT to KSP
    implementation(libs.hilt.navigation.compose)

    // ══════════════════════════════════════════════════════════════
    // WEEK 2: ROOM DATABASE (Local Cache)
    // ══════════════════════════════════════════════════════════════
    // Room for local caching of test results, chat messages, etc.
    implementation(libs.bundles.room)
    ksp(libs.room.compiler)  // Migrated from KAPT to KSP

    // ══════════════════════════════════════════════════════════════
    // WEEK 4: IMAGE LOADING (Prepared)
    // ══════════════════════════════════════════════════════════════

    implementation(libs.coil.compose)
    implementation(libs.coil.gif)

    // ══════════════════════════════════════════════════════════════
    // WEEK 7: CHARTS (Prepared)
    // ══════════════════════════════════════════════════════════════

    implementation(libs.vico.compose)
    implementation(libs.vico.compose.m3)

    // ══════════════════════════════════════════════════════════════
    // LEGACY SUPPORT (Transition Period)
    // ══════════════════════════════════════════════════════════════

    // AndroidX Core (Still needed for ViewBinding transition)
    implementation(libs.core.ktx)
    implementation(libs.appcompat)
    implementation(libs.lifecycle.runtime.ktx)
    implementation(libs.material)

    // Coroutines
    implementation(libs.coroutines.core)
    implementation(libs.coroutines.android)

    // JSON Parsing
    implementation(libs.gson)

    // WebView (for reports)
    implementation(libs.webkit)

    // PostgreSQL JDBC Driver (for database connectivity)
    implementation("org.postgresql:postgresql:42.7.1")

    // ══════════════════════════════════════════════════════════════
    // TESTING
    // ══════════════════════════════════════════════════════════════

    // Unit Testing
    testImplementation(libs.bundles.testing)

    // Android Instrumented Testing
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.bundles.android.testing)
}
