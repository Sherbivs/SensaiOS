package com.infinitygauntlet.simulation

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

/**
 * Application class for Hilt dependency injection
 * 
 * Week 1: Phase 1.2 - Dependency Injection Setup
 * 
 * This class is the entry point for Hilt's code generation.
 * The @HiltAndroidApp annotation triggers Hilt's code generation,
 * including a base class for the application that serves as the
 * application-level dependency container.
 * 
 * @see [Hilt Documentation](https://developer.android.com/training/dependency-injection/hilt-android)
 */
@HiltAndroidApp
class InfinityGauntletApplication : Application() {
    
    override fun onCreate() {
        super.onCreate()
        
        // Application initialization
        initializeApp()
    }
    
    private fun initializeApp() {
        // TODO Week 2: Initialize Room database
        // TODO Week 3: Initialize theme preferences
        // TODO Week 7: Initialize analytics
        
        // Log initialization
        android.util.Log.d("IGApp", "Infinity Gauntlet Application initialized")
    }
}
