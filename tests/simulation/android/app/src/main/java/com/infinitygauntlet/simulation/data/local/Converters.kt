package com.infinitygauntlet.simulation.data.local

import androidx.room.TypeConverter
import com.google.gson.Gson

/**
 * Type Converters for Room Database
 * 
 * Week 2: Phase 2.1 - Room Database
 * UPGRADED: KSP Migration (2025-12-20) - Cleaned up duplicate methods
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
        return try {
            @Suppress("UNCHECKED_CAST")
            gson.fromJson(value, Map::class.java) as? Map<String, Int>
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
     * Convert JSON array string to List<String>
     * Used for arrays of strings (tags, categories, etc.)
     */
    @TypeConverter
    fun fromJsonStringList(value: String?): List<String>? {
        if (value == null) return null
        return try {
            @Suppress("UNCHECKED_CAST")
            gson.fromJson(value, List::class.java) as? List<String>
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
}
