package com.infinitygauntlet.simulation.domain.repository

import com.infinitygauntlet.simulation.domain.models.Channel
import kotlinx.coroutines.flow.Flow

/**
 * Repository Interface: Channel
 * 
 * Week 2: Phase 2.2 - Repository Pattern
 * 
 * Defines the contract for channel data operations.
 * Domain layer interface - implemented in data layer.
 * Manages channel metadata, unread counts, and typing indicators.
 */
interface ChannelRepository {
    
    /**
     * Get all channels
     * Ordered by category, then name
     */
    fun getAllChannels(): Flow<List<Channel>>
    
    /**
     * Get channels by category
     * 
     * @param category Category to filter by
     */
    fun getChannelsByCategory(category: String): Flow<List<Channel>>
    
    /**
     * Get a channel by ID
     * 
     * @param channelId Channel ID
     */
    fun getChannelById(channelId: String): Flow<Channel?>
    
    /**
     * Get channel by ID (one-shot)
     * 
     * @param channelId Channel ID
     */
    suspend fun getChannelByIdSync(channelId: String): Channel?
    
    /**
     * Get channels with unread messages
     */
    fun getChannelsWithUnread(): Flow<List<Channel>>
    
    /**
     * Get channels with active typing
     */
    fun getChannelsWithTyping(): Flow<List<Channel>>
    
    /**
     * Get total unread count across all channels
     */
    fun getTotalUnreadCount(): Flow<Int>
    
    /**
     * Get channels sorted by activity (most recent first)
     */
    fun getChannelsByActivity(): Flow<List<Channel>>
    
    /**
     * Search channels by name or description
     * 
     * @param query Search query
     */
    fun searchChannels(query: String): Flow<List<Channel>>
    
    /**
     * Insert a channel
     * 
     * @param channel Channel to insert
     */
    suspend fun insertChannel(channel: Channel)
    
    /**
     * Insert multiple channels
     * 
     * @param channels List of channels to insert
     */
    suspend fun insertChannels(channels: List<Channel>)
    
    /**
     * Update a channel
     * 
     * @param channel Channel to update
     */
    suspend fun updateChannel(channel: Channel)
    
    /**
     * Update channel unread count
     * 
     * @param channelId Channel ID
     * @param count New unread count
     */
    suspend fun updateUnreadCount(channelId: String, count: Int)
    
    /**
     * Increment unread count
     * 
     * @param channelId Channel ID
     */
    suspend fun incrementUnreadCount(channelId: String)
    
    /**
     * Clear unread count
     * 
     * @param channelId Channel ID
     */
    suspend fun clearUnreadCount(channelId: String)
    
    /**
     * Update last message metadata
     * 
     * @param channelId Channel ID
     * @param timestamp Message timestamp
     * @param preview Message preview text
     */
    suspend fun updateLastMessage(
        channelId: String,
        timestamp: Long,
        preview: String?
    )
    
    /**
     * Set typing indicator
     * 
     * @param channelId Channel ID
     * @param isTyping Whether someone is typing
     * @param typingUsers List of typing users
     */
    suspend fun setTypingIndicator(
        channelId: String,
        isTyping: Boolean,
        typingUsers: List<String>
    )
    
    /**
     * Add typing user
     * 
     * @param channelId Channel ID
     * @param username Username to add
     */
    suspend fun addTypingUser(channelId: String, username: String)
    
    /**
     * Remove typing user
     * 
     * @param channelId Channel ID
     * @param username Username to remove
     */
    suspend fun removeTypingUser(channelId: String, username: String)
    
    /**
     * Clear typing indicator
     * 
     * @param channelId Channel ID
     */
    suspend fun clearTypingIndicator(channelId: String)
    
    /**
     * Update channel metadata
     * 
     * @param channelId Channel ID
     * @param name New name
     * @param description New description
     */
    suspend fun updateChannelMetadata(
        channelId: String,
        name: String,
        description: String?
    )
    
    /**
     * Update channel appearance
     * 
     * @param channelId Channel ID
     * @param icon New icon
     * @param color New color
     */
    suspend fun updateChannelAppearance(
        channelId: String,
        icon: String?,
        color: String?
    )
    
    /**
     * Delete a channel
     * 
     * @param channel Channel to delete
     */
    suspend fun deleteChannel(channel: Channel)
    
    /**
     * Delete channel by ID
     * 
     * @param channelId Channel ID
     */
    suspend fun deleteChannelById(channelId: String)
    
    /**
     * Delete all channels
     */
    suspend fun deleteAllChannels()
    
    /**
     * Get count of channels
     */
    suspend fun getCount(): Int
    
    /**
     * Check if channel exists
     * 
     * @param channelId Channel ID
     * @return True if channel exists
     */
    suspend fun channelExists(channelId: String): Boolean
}
