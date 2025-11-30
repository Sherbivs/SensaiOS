// Project-level build configuration
// tests/simulation/android/build.gradle.kts
// Week 1: Compose + Hilt Setup
// UPGRADED: KSP Migration (2025-12-20)

plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false  // Re-enabled for Kotlin 2.0+
    alias(libs.plugins.ksp) apply false  // Migrated from KAPT to KSP
    alias(libs.plugins.hilt.android) apply false
}

tasks.register("clean", Delete::class) {
    delete(rootProject.layout.buildDirectory)
}
