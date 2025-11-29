package com.infinitygauntlet.simulation.data.local

import androidx.room.TypeConverter
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

/**
 * Type Converters for Room Database
 * 
 * Week 2: Phase 2.1 - Room Database
 * 
 * Provides conversion between complex types and database-storable primitives.
 * Used by Room to store lists, JSON objects, and other non-primitive types.
 */
class Converters {
    
    private val gson = Gson()
    
    /**
     * Convert JSON string to Map<String, Int>
     * Used for reactions (emoji -> count)
     */
    @TypeConverter
    fun fromReactionsJson(value: String?): Map<String, Int>? {
        if (value == null) return null
        val type = object : TypeToken<Map<String, Int>>() {}.type
        return try {
            gson.fromJson(value, type)
        } catch (e: Exception) {
            null
        }
    }
    
    /**
     * Convert Map<String, Int> to JSON string
     */
    @TypeConverter
    fun toReactionsJson(reactions: Map<String, Int>?): String? {
        return reactions?.let { gson.toJson(it) }
    }
    
    /**
     * Convert comma-separated string to List<String>
     * Used for typing users
     */
    @TypeConverter
    fun fromStringList(value: String?): List<String>? {
        return value?.split(",")?.filter { it.isNotBlank() }
    }
    
    /**
     * Convert List<String> to comma-separated string
     */
    @TypeConverter
    fun toStringList(list: List<String>?): String? {
        return list?.joinToString(",")
    }
    
    /**
     * Convert JSON array string to List<String>
     * Alternative approach for lists
     */
    @TypeConverter
    fun fromJsonStringList(value: String?): List<String>? {
        if (value == null) return null
        val type = object : TypeToken<List<String>>() {}.type
        return try {
            gson.fromJson(value, type)
        } catch (e: Exception) {
            null
        }
    }
    
    /**
     * Convert List<String> to JSON array string
     */
    @TypeConverter
    fun toJsonStringList(list: List<String>?): String? {
        return list?.let { gson.toJson(it) }
    }
    
    /**
     * Convert Long timestamp to Long (no-op, for consistency)
     * Room handles Long natively, but explicit converter for documentation
     */
    @TypeConverter
    fun fromTimestamp(value: Long?): Long? = value
    
    /**
     * Convert Long to Long timestamp (no-op, for consistency)
     */
    @TypeConverter
    fun toTimestamp(timestamp: Long?): Long? = timestamp
}
