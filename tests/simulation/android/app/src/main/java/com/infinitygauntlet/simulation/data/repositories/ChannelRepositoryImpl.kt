package com.infinitygauntlet.simulation.data.repositories

import com.infinitygauntlet.simulation.data.local.dao.ChannelDao
import com.infinitygauntlet.simulation.data.mappers.toDomain
import com.infinitygauntlet.simulation.data.mappers.toDomainList
import com.infinitygauntlet.simulation.data.mappers.toEntity
import com.infinitygauntlet.simulation.data.mappers.toEntityList
import com.infinitygauntlet.simulation.domain.models.Channel
import com.infinitygauntlet.simulation.domain.repository.ChannelRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject

/**
 * Implementation: ChannelRepository
 * 
 * Week 2: Phase 2.2 - Repository Pattern
 * 
 * Concrete implementation of ChannelRepository interface.
 * Bridges DAO layer with domain layer using mappers.
 * Handles typing indicator management.
 * Injected via Hilt for dependency inversion.
 * 
 * @param dao ChannelDao for database operations
 */
class ChannelRepositoryImpl @Inject constructor(
    private val dao: ChannelDao
) : ChannelRepository {
    
    override fun getAllChannels(): Flow<List<Channel>> {
        return dao.getAllChannels().map { entities ->
            entities.toDomainList()
        }
    }
    
    override fun getChannelsByCategory(category: String): Flow<List<Channel>> {
        return dao.getChannelsByCategory(category).map { entities ->
            entities.toDomainList()
        }
    }
    
    override fun getChannelById(channelId: String): Flow<Channel?> {
        return dao.getChannelById(channelId).map { entity ->
            entity?.toDomain()
        }
    }
    
    override suspend fun getChannelByIdSync(channelId: String): Channel? {
        val entity = dao.getChannelByIdSync(channelId)
        return entity?.toDomain()
    }
    
    override fun getChannelsWithUnread(): Flow<List<Channel>> {
        return dao.getChannelsWithUnread().map { entities ->
            entities.toDomainList()
        }
    }
    
    override fun getChannelsWithTyping(): Flow<List<Channel>> {
        return dao.getChannelsWithTyping().map { entities ->
            entities.toDomainList()
        }
    }
    
    override fun getTotalUnreadCount(): Flow<Int> {
        return dao.getTotalUnreadCount().map { count ->
            count ?: 0
        }
    }
    
    override fun getChannelsByActivity(): Flow<List<Channel>> {
        return dao.getChannelsByActivity().map { entities ->
            entities.toDomainList()
        }
    }
    
    override fun searchChannels(query: String): Flow<List<Channel>> {
        return dao.searchChannels(query).map { entities ->
            entities.toDomainList()
        }
    }
    
    override suspend fun insertChannel(channel: Channel) {
        dao.insertChannel(channel.toEntity())
    }
    
    override suspend fun insertChannels(channels: List<Channel>) {
        dao.insertChannels(channels.toEntityList())
    }
    
    override suspend fun updateChannel(channel: Channel) {
        dao.updateChannel(channel.toEntity())
    }
    
    override suspend fun updateUnreadCount(channelId: String, count: Int) {
        dao.updateUnreadCount(channelId, count)
    }
    
    override suspend fun incrementUnreadCount(channelId: String) {
        dao.incrementUnreadCount(channelId)
    }
    
    override suspend fun clearUnreadCount(channelId: String) {
        dao.clearUnreadCount(channelId)
    }
    
    override suspend fun updateLastMessage(channelId: String, timestamp: Long, preview: String?) {
        dao.updateLastMessage(channelId, timestamp, preview)
    }
    
    override suspend fun setTypingIndicator(
        channelId: String,
        isTyping: Boolean,
        typingUsers: List<String>
    ) {
        val typingUsersString = if (typingUsers.isNotEmpty()) {
            typingUsers.joinToString(",")
        } else {
            null
        }
        dao.setTypingIndicator(channelId, isTyping, typingUsersString)
    }
    
    override suspend fun addTypingUser(channelId: String, username: String) {
        // Get current channel
        val channel = getChannelByIdSync(channelId) ?: return
        
        // Add user if not already typing
        val updatedUsers = channel.typingUsers.toMutableList()
        if (!updatedUsers.contains(username)) {
            updatedUsers.add(username)
        }
        
        // Update typing indicator
        setTypingIndicator(channelId, updatedUsers.isNotEmpty(), updatedUsers)
    }
    
    override suspend fun removeTypingUser(channelId: String, username: String) {
        // Get current channel
        val channel = getChannelByIdSync(channelId) ?: return
        
        // Remove user
        val updatedUsers = channel.typingUsers.toMutableList()
        updatedUsers.remove(username)
        
        // Update typing indicator
        setTypingIndicator(channelId, updatedUsers.isNotEmpty(), updatedUsers)
    }
    
    override suspend fun clearTypingIndicator(channelId: String) {
        dao.clearTypingIndicator(channelId)
    }
    
    override suspend fun updateChannelMetadata(channelId: String, name: String, description: String?) {
        dao.updateChannelMetadata(channelId, name, description)
    }
    
    override suspend fun updateChannelAppearance(channelId: String, icon: String?, color: String?) {
        dao.updateChannelAppearance(channelId, icon, color)
    }
    
    override suspend fun deleteChannel(channel: Channel) {
        dao.deleteChannel(channel.toEntity())
    }
    
    override suspend fun deleteChannelById(channelId: String) {
        dao.deleteChannelById(channelId)
    }
    
    override suspend fun deleteAllChannels() {
        dao.deleteAllChannels()
    }
    
    override suspend fun getCount(): Int {
        return dao.getCount()
    }
    
    override suspend fun channelExists(channelId: String): Boolean {
        return dao.channelExists(channelId)
    }
}
