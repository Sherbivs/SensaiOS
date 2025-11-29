package com.infinitygauntlet.simulation.data.local.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Room entity for Channels
 * 
 * Week 2: Phase 2.1 - Room Database
 * 
 * Represents a chat channel in the Discord-like interface.
 * Tracks channel metadata and unread counts.
 * 
 * Indexes:
 * - name: For quick channel lookups by name
 * - category: For grouping channels by category
 * 
 * @property id Channel identifier (e.g., "homestead", "arena", "wild-area")
 * @property name Display name of the channel
 * @property description Channel description
 * @property category Channel category grouping
 * @property icon Icon identifier or emoji
 * @property color Theme color for the channel (hex string)
 * @property unreadCount Number of unread messages
 * @property lastMessageTimestamp Timestamp of most recent message
 * @property lastMessagePreview Preview text of last message
 * @property isTyping Whether someone is currently typing
 * @property typingUsers Comma-separated list of typing users
 * @property createdAt When this channel was created
 * @property updatedAt When this channel was last updated
 */
@Entity(
    tableName = "channels",
    indices = [
        Index(value = ["name"], unique = true),
        Index(value = ["category"])
    ]
)
data class ChannelEntity(
    @PrimaryKey
    @ColumnInfo(name = "id")
    val id: String, // homestead, arena, wild-area
    
    @ColumnInfo(name = "name")
    val name: String,
    
    @ColumnInfo(name = "description")
    val description: String,
    
    @ColumnInfo(name = "category")
    val category: String = "default",
    
    @ColumnInfo(name = "icon")
    val icon: String? = null,
    
    @ColumnInfo(name = "color")
    val color: String? = null, // Hex color: #FF5733
    
    @ColumnInfo(name = "unread_count")
    val unreadCount: Int = 0,
    
    @ColumnInfo(name = "last_message_timestamp")
    val lastMessageTimestamp: Long? = null,
    
    @ColumnInfo(name = "last_message_preview")
    val lastMessagePreview: String? = null,
    
    @ColumnInfo(name = "is_typing")
    val isTyping: Boolean = false,
    
    @ColumnInfo(name = "typing_users")
    val typingUsers: String? = null,
    
    @ColumnInfo(name = "created_at")
    val createdAt: Long = System.currentTimeMillis(),
    
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long = System.currentTimeMillis()
)
