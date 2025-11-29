# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

#===============================================================================
# GENERAL OPTIMIZATION SETTINGS
#===============================================================================

# Enable optimization (max 5 passes for best results)
-optimizationpasses 5
-dontusemixedcaseclassnames
-dontskipnonpubliclibraryclasses
-dontpreverify
-verbose

# Optimization options
-optimizations !code/simplification/arithmetic,!code/simplification/cast,!field/*,!class/merging/*
-allowaccessmodification
-repackageclasses ''

#===============================================================================
# APPLICATION CLASSES
#===============================================================================

# Keep all classes in the simulation package (selective keep)
-keep public class com.infinitygauntlet.simulation.MainActivity
-keep public class com.infinitygauntlet.simulation.ChatUIActivity
-keep public class com.infinitygauntlet.simulation.ReportViewerActivity

# Keep data models for serialization
-keep class com.infinitygauntlet.simulation.models.** { *; }

# Keep adapters (referenced by layout XML)
-keep class com.infinitygauntlet.simulation.adapters.** { *; }

# Keep ViewModels (instantiated via reflection)
-keep class com.infinitygauntlet.simulation.viewmodels.** { *; }

# Keep services (registered in AndroidManifest)
-keep class com.infinitygauntlet.simulation.services.** { *; }

# Keep repositories (dependency injection)
-keep class com.infinitygauntlet.simulation.repositories.** { *; }

#===============================================================================
# GSON / JSON SERIALIZATION
#===============================================================================

-keepattributes Signature
-keepattributes *Annotation*
-keepattributes EnclosingMethod

-dontwarn sun.misc.**
-keep class sun.misc.Unsafe { *; }

-keep class com.google.gson.** { *; }
-keep class com.google.gson.stream.** { *; }

# Prevent obfuscation of model fields used by Gson
-keepclassmembers,allowobfuscation class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# Keep generic type information for Gson
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

#===============================================================================
# KOTLIN & COROUTINES
#===============================================================================

# Keep Kotlin metadata
-keep class kotlin.Metadata { *; }

# Keep coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembernames class kotlinx.** {
    volatile <fields>;
}

# Kotlin serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

# Kotlin reflect
-dontwarn kotlin.reflect.jvm.internal.**
-keep class kotlin.reflect.** { *; }

#===============================================================================
# ANDROIDX & MATERIAL DESIGN
#===============================================================================

# Keep AndroidX components
-keep class androidx.** { *; }
-keep interface androidx.** { *; }
-dontwarn androidx.**

# Material Design components
-keep class com.google.android.material.** { *; }
-dontwarn com.google.android.material.**

# ViewBinding
-keep class * implements androidx.viewbinding.ViewBinding {
    public static *** bind(android.view.View);
    public static *** inflate(android.view.LayoutInflater);
}

# RecyclerView
-keep class androidx.recyclerview.widget.RecyclerView { *; }
-keep class androidx.recyclerview.widget.RecyclerView$ViewHolder { *; }

#===============================================================================
# LIFECYCLE COMPONENTS
#===============================================================================

# ViewModels
-keep class * extends androidx.lifecycle.ViewModel {
    <init>(...);
}
-keep class androidx.lifecycle.ViewModelProvider$NewInstanceFactory {
    <init>(...);
}

# LiveData
-keep class androidx.lifecycle.LiveData { *; }
-keep class androidx.lifecycle.MutableLiveData { *; }
-keep class androidx.lifecycle.MediatorLiveData { *; }

# Lifecycle observers
-keep class * implements androidx.lifecycle.LifecycleObserver {
    <init>(...);
}

# StateFlow
-keep class kotlinx.coroutines.flow.StateFlow { *; }
-keep class kotlinx.coroutines.flow.MutableStateFlow { *; }

#===============================================================================
# WEBVIEW
#===============================================================================

# Keep WebView JavaScript interface methods
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep WebView constructors
-keepclassmembers class * extends android.webkit.WebView {
    public <init>(android.content.Context);
    public <init>(android.content.Context, android.util.AttributeSet);
    public <init>(android.content.Context, android.util.AttributeSet, int);
}

#===============================================================================
# NATIVE METHODS
#===============================================================================

-keepclasseswithmembernames class * {
    native <methods>;
}

#===============================================================================
# ENUMS
#===============================================================================

-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

#===============================================================================
# PARCELABLE
#===============================================================================

-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator CREATOR;
}

#===============================================================================
# SERIALIZABLE
#===============================================================================

-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

#===============================================================================
# DEBUGGING & STACK TRACES
#===============================================================================

# Preserve line number information for debugging stack traces
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Keep exception classes
-keep public class * extends java.lang.Exception

#===============================================================================
# LOGGING REMOVAL (RELEASE BUILDS)
#===============================================================================

# Remove verbose logging in release builds (keeps warnings/errors)
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}

# Remove println statements
-assumenosideeffects class java.io.PrintStream {
    public void println(%);
    public void println(**);
}

#===============================================================================
# CUSTOM ATTRIBUTES
#===============================================================================

-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions
-keepattributes InnerClasses
-keepattributes EnclosingMethod

#===============================================================================
# R8 COMPATIBILITY
#===============================================================================

# Keep R class references (for resources)
-keepclassmembers class **.R$* {
    public static <fields>;
}

# Keep BuildConfig
-keep class com.infinitygauntlet.simulation.BuildConfig { *; }

#===============================================================================
# THIRD-PARTY LIBRARIES
#===============================================================================

# Add rules for any third-party libraries here
# Example for OkHttp (if used in future):
# -dontwarn okhttp3.**
# -keep class okhttp3.** { *; }

#===============================================================================
# END OF PROGUARD RULES
#===============================================================================
