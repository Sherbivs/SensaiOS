package com.infinitygauntlet.simulation.data.local.dao

import androidx.room.*
import com.infinitygauntlet.simulation.data.local.entities.ChannelEntity
import kotlinx.coroutines.flow.Flow

/**
 * Data Access Object for Channels
 * 
 * Week 2: Phase 2.1 - Room Database
 * 
 * Provides methods to interact with channels table.
 * Manages channel metadata, unread counts, and typing indicators.
 * 
 * @see ChannelEntity
 */
@Dao
interface ChannelDao {
    
    /**
     * Get all channels
     * Ordered by category, then name
     */
    @Query("SELECT * FROM channels ORDER BY category, name")
    fun getAllChannels(): Flow<List<ChannelEntity>>
    
    /**
     * Get channels by category
     * 
     * @param category Category to filter by
     */
    @Query("SELECT * FROM channels WHERE category = :category ORDER BY name")
    fun getChannelsByCategory(category: String): Flow<List<ChannelEntity>>
    
    /**
     * Get a channel by ID
     * 
     * @param channelId Channel ID
     */
    @Query("SELECT * FROM channels WHERE id = :channelId")
    fun getChannelById(channelId: String): Flow<ChannelEntity?>
    
    /**
     * Get channel by ID (one-shot, not reactive)
     * 
     * @param channelId Channel ID
     */
    @Query("SELECT * FROM channels WHERE id = :channelId")
    suspend fun getChannelByIdSync(channelId: String): ChannelEntity?
    
    /**
     * Get channels with unread messages
     */
    @Query("SELECT * FROM channels WHERE unread_count > 0 ORDER BY last_message_timestamp DESC")
    fun getChannelsWithUnread(): Flow<List<ChannelEntity>>
    
    /**
     * Get channels with active typing
     */
    @Query("SELECT * FROM channels WHERE is_typing = 1")
    fun getChannelsWithTyping(): Flow<List<ChannelEntity>>
    
    /**
     * Get total unread count across all channels
     */
    @Query("SELECT SUM(unread_count) FROM channels")
    fun getTotalUnreadCount(): Flow<Int?>
    
    /**
     * Get channels sorted by activity (most recent first)
     */
    @Query("SELECT * FROM channels ORDER BY last_message_timestamp DESC")
    fun getChannelsByActivity(): Flow<List<ChannelEntity>>
    
    /**
     * Search channels by name or description
     * 
     * @param query Search query
     */
    @Query("""
        SELECT * FROM channels 
        WHERE name LIKE '%' || :query || '%' 
        OR description LIKE '%' || :query || '%'
        ORDER BY name
    """)
    fun searchChannels(query: String): Flow<List<ChannelEntity>>
    
    /**
     * Insert a channel
     * 
     * @param channel Channel to insert
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertChannel(channel: ChannelEntity)
    
    /**
     * Insert multiple channels
     * 
     * @param channels List of channels to insert
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertChannels(channels: List<ChannelEntity>)
    
    /**
     * Update a channel
     * 
     * @param channel Channel to update
     */
    @Update
    suspend fun updateChannel(channel: ChannelEntity)
    
    /**
     * Update channel unread count
     * 
     * @param channelId Channel ID
     * @param count New unread count
     */
    @Query("UPDATE channels SET unread_count = :count WHERE id = :channelId")
    suspend fun updateUnreadCount(channelId: String, count: Int)
    
    /**
     * Increment unread count
     * 
     * @param channelId Channel ID
     */
    @Query("UPDATE channels SET unread_count = unread_count + 1 WHERE id = :channelId")
    suspend fun incrementUnreadCount(channelId: String)
    
    /**
     * Clear unread count
     * 
     * @param channelId Channel ID
     */
    @Query("UPDATE channels SET unread_count = 0 WHERE id = :channelId")
    suspend fun clearUnreadCount(channelId: String)
    
    /**
     * Update last message metadata
     * 
     * @param channelId Channel ID
     * @param timestamp Message timestamp
     * @param preview Message preview text
     */
    @Query("""
        UPDATE channels 
        SET last_message_timestamp = :timestamp,
            last_message_preview = :preview
        WHERE id = :channelId
    """)
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
     * @param typingUsers Comma-separated list of typing users
     */
    @Query("""
        UPDATE channels 
        SET is_typing = :isTyping,
            typing_users = :typingUsers
        WHERE id = :channelId
    """)
    suspend fun setTypingIndicator(
        channelId: String,
        isTyping: Boolean,
        typingUsers: String?
    )
    
    /**
     * Clear typing indicator
     * 
     * @param channelId Channel ID
     */
    @Query("""
        UPDATE channels 
        SET is_typing = 0,
            typing_users = NULL
        WHERE id = :channelId
    """)
    suspend fun clearTypingIndicator(channelId: String)
    
    /**
     * Update channel metadata
     * 
     * @param channelId Channel ID
     * @param name New name
     * @param description New description
     */
    @Query("""
        UPDATE channels 
        SET name = :name,
            description = :description
        WHERE id = :channelId
    """)
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
    @Query("""
        UPDATE channels 
        SET icon = :icon,
            color = :color
        WHERE id = :channelId
    """)
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
    @Delete
    suspend fun deleteChannel(channel: ChannelEntity)
    
    /**
     * Delete channel by ID
     * 
     * @param channelId Channel ID
     */
    @Query("DELETE FROM channels WHERE id = :channelId")
    suspend fun deleteChannelById(channelId: String)
    
    /**
     * Delete all channels
     */
    @Query("DELETE FROM channels")
    suspend fun deleteAllChannels()
    
    /**
     * Get count of channels
     */
    @Query("SELECT COUNT(*) FROM channels")
    suspend fun getCount(): Int
    
    /**
     * Check if channel exists
     * 
     * @param channelId Channel ID
     * @return True if channel exists
     */
    @Query("SELECT EXISTS(SELECT 1 FROM channels WHERE id = :channelId)")
    suspend fun channelExists(channelId: String): Boolean
}
