package com.infinitygauntlet.simulation.domain.models

/**
 * Domain Model: Chat Message
 * 
 * Week 2: Phase 2.2 - Repository Pattern
 * 
 * Represents a chat message in the business logic layer.
 * Immutable data class for use in ViewModels and UI.
 * Supports Discord-like features: replies, reactions, attachments.
 * 
 * @property id Unique identifier (Discord message ID)
 * @property channelId Channel this message belongs to
 * @property content Message text content
 * @property authorType Type of author (user, bot, system)
 * @property authorName Display name of author
 * @property authorAvatar URL to author avatar (optional)
 * @property messageType Type of message (text, command, system, error)
 * @property timestamp Message creation timestamp
 * @property replyToId ID of message being replied to (null if not a reply)
 * @property replyToContent Content of parent message (for UI convenience)
 * @property attachmentUrl URL to attachment (image, file, etc.)
 * @property reactions Map of emoji to reaction count
 * @property isEdited Whether message has been edited
 * @property editedAt Timestamp of last edit (0 if not edited)
 */
data class ChatMessage(
    val id: String,
    val channelId: String,
    val content: String,
    val authorType: AuthorType,
    val authorName: String,
    val authorAvatar: String? = null,
    val messageType: MessageType = MessageType.TEXT,
    val timestamp: Long = System.currentTimeMillis(),
    val replyToId: String? = null,
    val replyToContent: String? = null,
    val attachmentUrl: String? = null,
    val reactions: Map<String, Int> = emptyMap(),
    val isEdited: Boolean = false,
    val editedAt: Long = 0
) {
    /**
     * Check if message is a reply
     */
    val isReply: Boolean
        get() = replyToId != null
    
    /**
     * Check if message has attachment
     */
    val hasAttachment: Boolean
        get() = attachmentUrl != null
    
    /**
     * Check if message has reactions
     */
    val hasReactions: Boolean
        get() = reactions.isNotEmpty()
    
    /**
     * Get total reaction count
     */
    val totalReactions: Int
        get() = reactions.values.sum()
    
    /**
     * Check if message is from bot
     */
    val isFromBot: Boolean
        get() = authorType == AuthorType.BOT
    
    /**
     * Check if message is system message
     */
    val isSystemMessage: Boolean
        get() = authorType == AuthorType.SYSTEM || messageType == MessageType.SYSTEM
    
    /**
     * Format timestamp as human-readable string
     */
    fun formatTimestamp(): String {
        val formatter = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault())
        return formatter.format(java.util.Date(timestamp))
    }
    
    /**
     * Format full timestamp with date
     */
    fun formatFullTimestamp(): String {
        val formatter = java.text.SimpleDateFormat("MMM dd, HH:mm", java.util.Locale.getDefault())
        return formatter.format(java.util.Date(timestamp))
    }
    
    /**
     * Get edited indicator text
     */
    fun getEditedIndicator(): String {
        return if (isEdited) "(edited)" else ""
    }
    
    /**
     * Get author color based on type
     */
    fun getAuthorColor(): String {
        return when (authorType) {
            AuthorType.USER -> "#2196F3"      // Blue
            AuthorType.BOT -> "#9C27B0"       // Purple
            AuthorType.SYSTEM -> "#FF9800"    // Orange
        }
    }
}

/**
 * Author Type Enum
 */
enum class AuthorType {
    USER,
    BOT,
    SYSTEM;
    
    companion object {
        fun fromString(value: String): AuthorType {
            return try {
                valueOf(value.uppercase())
            } catch (e: IllegalArgumentException) {
                USER
            }
        }
    }
}

/**
 * Message Type Enum
 */
enum class MessageType {
    TEXT,
    COMMAND,
    SYSTEM,
    ERROR;
    
    companion object {
        fun fromString(value: String): MessageType {
            return try {
                valueOf(value.uppercase())
            } catch (e: IllegalArgumentException) {
                TEXT
            }
        }
    }
}
