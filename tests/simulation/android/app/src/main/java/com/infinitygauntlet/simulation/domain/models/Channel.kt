package com.infinitygauntlet.simulation.domain.models

/**
 * Domain Model: Channel
 * 
 * Week 2: Phase 2.2 - Repository Pattern
 * 
 * Represents a chat channel in the business logic layer.
 * Immutable data class for use in ViewModels and UI.
 * 
 * @property id Unique identifier (Discord channel ID)
 * @property name Channel name
 * @property description Channel description (optional)
 * @property category Channel category for grouping (optional)
 * @property icon Icon identifier or emoji (optional)
 * @property color Hex color code for channel display (optional)
 * @property unreadCount Number of unread messages
 * @property lastMessageTimestamp Timestamp of last message (0 if no messages)
 * @property lastMessagePreview Preview text of last message (optional)
 * @property isTyping Whether someone is currently typing
 * @property typingUsers List of users currently typing
 * @property createdAt Channel creation timestamp
 * @property updatedAt Last update timestamp
 */
data class Channel(
    val id: String,
    val name: String,
    val description: String? = null,
    val category: String? = null,
    val icon: String? = null,
    val color: String? = null,
    val unreadCount: Int = 0,
    val lastMessageTimestamp: Long = 0,
    val lastMessagePreview: String? = null,
    val isTyping: Boolean = false,
    val typingUsers: List<String> = emptyList(),
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
) {
    /**
     * Check if channel has unread messages
     */
    val hasUnreadMessages: Boolean
        get() = unreadCount > 0
    
    /**
     * Check if channel has messages
     */
    val hasMessages: Boolean
        get() = lastMessageTimestamp > 0
    
    /**
     * Check if multiple users are typing
     */
    val multipleUsersTyping: Boolean
        get() = typingUsers.size > 1
    
    /**
     * Get typing indicator text
     */
    fun getTypingIndicatorText(): String {
        return when {
            !isTyping || typingUsers.isEmpty() -> ""
            typingUsers.size == 1 -> "${typingUsers[0]} is typing..."
            typingUsers.size == 2 -> "${typingUsers[0]} and ${typingUsers[1]} are typing..."
            else -> "Several people are typing..."
        }
    }
    
    /**
     * Format last message timestamp as human-readable string
     */
    fun formatLastMessageTime(): String {
        if (lastMessageTimestamp == 0L) return ""
        
        val now = System.currentTimeMillis()
        val diff = now - lastMessageTimestamp
        
        return when {
            diff < 60_000 -> "Just now"                                    // < 1 minute
            diff < 3600_000 -> "${diff / 60_000}m ago"                    // < 1 hour
            diff < 86400_000 -> "${diff / 3600_000}h ago"                 // < 1 day
            diff < 604800_000 -> "${diff / 86400_000}d ago"               // < 1 week
            else -> {
                val formatter = java.text.SimpleDateFormat("MMM dd", java.util.Locale.getDefault())
                formatter.format(java.util.Date(lastMessageTimestamp))
            }
        }
    }
    
    /**
     * Get unread badge text
     */
    fun getUnreadBadgeText(): String {
        return when {
            unreadCount == 0 -> ""
            unreadCount > 99 -> "99+"
            else -> unreadCount.toString()
        }
    }
    
    /**
     * Get channel display color (fallback to default if not set)
     */
    fun getDisplayColor(): String {
        return color ?: "#607D8B"  // Blue Gray as default
    }
    
    /**
     * Get channel icon or default emoji
     */
    fun getDisplayIcon(): String {
        return icon ?: "#️⃣"  // Hash emoji as default
    }
    
    /**
     * Check if channel is in specific category
     */
    fun isInCategory(targetCategory: String?): Boolean {
        return category == targetCategory
    }
    
    /**
     * Get truncated last message preview (max 50 chars)
     */
    fun getTruncatedPreview(): String {
        if (lastMessagePreview.isNullOrBlank()) return ""
        return if (lastMessagePreview.length > 50) {
            lastMessagePreview.substring(0, 47) + "..."
        } else {
            lastMessagePreview
        }
    }
}
