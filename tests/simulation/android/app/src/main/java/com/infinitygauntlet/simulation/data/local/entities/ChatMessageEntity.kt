package com.infinitygauntlet.simulation.data.local.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Room entity for Chat Messages
 * 
 * Week 2: Phase 2.1 - Room Database
 * 
 * Represents a message in the Discord-like chat interface.
 * Supports multiple channels and message types.
 * 
 * Indexes:
 * - channel_id: For filtering messages by channel
 * - timestamp: For chronological queries and pagination
 * - author_type: For filtering by user/bot messages
 * 
 * @property id Unique identifier (auto-generated)
 * @property channelId Channel identifier (e.g., "homestead", "arena", "wild-area")
 * @property content Message content/text
 * @property authorType Who sent the message ("user" or "bot")
 * @property authorName Display name of sender
 * @property timestamp When the message was sent
 * @property messageType Type of message (text, command, system, error)
 * @property replyToId Optional ID of message this is replying to
 * @property attachmentUrl Optional URL to attachment
 * @property reactions JSON string of reactions (emoji -> count)
 * @property isEdited Whether the message has been edited
 * @property editedAt When the message was edited (if applicable)
 * @property createdAt When this message was created
 */
@Entity(
    tableName = "chat_messages",
    indices = [
        Index(value = ["channel_id"]),
        Index(value = ["timestamp"]),
        Index(value = ["author_type"])
    ]
)
data class ChatMessageEntity(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "id")
    val id: Long = 0,
    
    @ColumnInfo(name = "channel_id")
    val channelId: String,
    
    @ColumnInfo(name = "content")
    val content: String,
    
    @ColumnInfo(name = "author_type")
    val authorType: String, // user, bot
    
    @ColumnInfo(name = "author_name")
    val authorName: String,
    
    @ColumnInfo(name = "timestamp")
    val timestamp: Long,
    
    @ColumnInfo(name = "message_type")
    val messageType: String = "text", // text, command, system, error
    
    @ColumnInfo(name = "reply_to_id")
    val replyToId: Long? = null,
    
    @ColumnInfo(name = "attachment_url")
    val attachmentUrl: String? = null,
    
    @ColumnInfo(name = "reactions")
    val reactions: String? = null, // JSON: {"👍": 2, "❤️": 1}
    
    @ColumnInfo(name = "is_edited")
    val isEdited: Boolean = false,
    
    @ColumnInfo(name = "edited_at")
    val editedAt: Long? = null,
    
    @ColumnInfo(name = "created_at")
    val createdAt: Long = System.currentTimeMillis()
)
