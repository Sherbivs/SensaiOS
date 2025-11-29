package com.infinitygauntlet.simulation.data.repositories

import com.infinitygauntlet.simulation.data.local.dao.ChatMessageDao
import com.infinitygauntlet.simulation.data.mappers.toDomain
import com.infinitygauntlet.simulation.data.mappers.toDomainList
import com.infinitygauntlet.simulation.data.mappers.toEntity
import com.infinitygauntlet.simulation.data.mappers.toEntityList
import com.infinitygauntlet.simulation.domain.models.ChatMessage
import com.infinitygauntlet.simulation.domain.models.AuthorType
import com.infinitygauntlet.simulation.domain.models.MessageType
import com.infinitygauntlet.simulation.domain.repository.ChatRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject

/**
 * Implementation: ChatRepository
 * 
 * Week 2: Phase 2.2 - Repository Pattern
 * 
 * Concrete implementation of ChatRepository interface.
 * Bridges DAO layer with domain layer using mappers.
 * Handles reaction operations and message editing.
 * Injected via Hilt for dependency inversion.
 * 
 * @param dao ChatMessageDao for database operations
 */
class ChatRepositoryImpl @Inject constructor(
    private val dao: ChatMessageDao
) : ChatRepository {
    
    override fun getMessagesByChannel(channelId: String): Flow<List<ChatMessage>> {
        return dao.getMessagesByChannel(channelId).map { entities ->
            entities.toDomainList()
        }
    }
    
    override suspend fun getMessagesByChannelPaged(
        channelId: String,
        limit: Int,
        offset: Int
    ): List<ChatMessage> {
        val entities = dao.getMessagesByChannelPaged(channelId, limit, offset)
        return entities.toDomainList()
    }
    
    override fun getMessagesAfter(channelId: String, afterTimestamp: Long): Flow<List<ChatMessage>> {
        return dao.getMessagesAfter(channelId, afterTimestamp).map { entities ->
            entities.toDomainList()
        }
    }
    
    override suspend fun getMessagesBefore(
        channelId: String,
        beforeTimestamp: Long,
        limit: Int
    ): List<ChatMessage> {
        val entities = dao.getMessagesBefore(channelId, beforeTimestamp, limit)
        return entities.toDomainList()
    }
    
    override suspend fun getMessageById(messageId: String): ChatMessage? {
        val entity = dao.getMessageById(messageId)
        return entity?.toDomain()
    }
    
    override fun getMessageByIdFlow(messageId: String): Flow<ChatMessage?> {
        return dao.getMessageByIdFlow(messageId).map { entity ->
            entity?.toDomain()
        }
    }
    
    override fun getMessagesByAuthorType(channelId: String, authorType: AuthorType): Flow<List<ChatMessage>> {
        return dao.getMessagesByAuthorType(channelId, authorType.name.lowercase()).map { entities ->
            entities.toDomainList()
        }
    }
    
    override fun getMessagesByType(channelId: String, messageType: MessageType): Flow<List<ChatMessage>> {
        return dao.getMessagesByType(channelId, messageType.name.lowercase()).map { entities ->
            entities.toDomainList()
        }
    }
    
    override fun getReplies(messageId: String): Flow<List<ChatMessage>> {
        return dao.getReplies(messageId).map { entities ->
            entities.toDomainList()
        }
    }
    
    override fun searchMessages(channelId: String, query: String): Flow<List<ChatMessage>> {
        return dao.searchMessages(channelId, query).map { entities ->
            entities.toDomainList()
        }
    }
    
    override fun getMessagesWithAttachments(channelId: String): Flow<List<ChatMessage>> {
        return dao.getMessagesWithAttachments(channelId).map { entities ->
            entities.toDomainList()
        }
    }
    
    override fun getEditedMessages(channelId: String): Flow<List<ChatMessage>> {
        return dao.getEditedMessages(channelId).map { entities ->
            entities.toDomainList()
        }
    }
    
    override suspend fun getLatestMessage(channelId: String): ChatMessage? {
        val entity = dao.getLatestMessage(channelId)
        return entity?.toDomain()
    }
    
    override fun getLatestMessageFlow(channelId: String): Flow<ChatMessage?> {
        return dao.getLatestMessageFlow(channelId).map { entity ->
            entity?.toDomain()
        }
    }
    
    override suspend fun getMessageCount(channelId: String): Int {
        return dao.getMessageCount(channelId)
    }
    
    override suspend fun getMessageCountByType(channelId: String, messageType: MessageType): Int {
        return dao.getMessageCountByType(channelId, messageType.name.lowercase())
    }
    
    override suspend fun insertMessage(message: ChatMessage) {
        dao.insertMessage(message.toEntity())
    }
    
    override suspend fun insertMessages(messages: List<ChatMessage>) {
        dao.insertMessages(messages.toEntityList())
    }
    
    override suspend fun updateMessage(message: ChatMessage) {
        dao.updateMessage(message.toEntity())
    }
    
    override suspend fun updateMessageContent(messageId: String, newContent: String) {
        dao.updateMessageContent(
            messageId = messageId,
            newContent = newContent,
            editedAt = System.currentTimeMillis()
        )
    }
    
    override suspend fun updateReactions(messageId: String, reactions: Map<String, Int>) {
        // Convert Map to JSON string
        val reactionsJson = if (reactions.isNotEmpty()) {
            com.google.gson.Gson().toJson(reactions)
        } else {
            null
        }
        dao.updateReactions(messageId, reactionsJson)
    }
    
    override suspend fun addReaction(messageId: String, emoji: String) {
        // Get current message
        val message = getMessageById(messageId) ?: return
        
        // Update reactions map
        val updatedReactions = message.reactions.toMutableMap()
        updatedReactions[emoji] = (updatedReactions[emoji] ?: 0) + 1
        
        // Save updated reactions
        updateReactions(messageId, updatedReactions)
    }
    
    override suspend fun removeReaction(messageId: String, emoji: String) {
        // Get current message
        val message = getMessageById(messageId) ?: return
        
        // Update reactions map
        val updatedReactions = message.reactions.toMutableMap()
        val currentCount = updatedReactions[emoji] ?: 0
        
        if (currentCount > 1) {
            updatedReactions[emoji] = currentCount - 1
        } else {
            updatedReactions.remove(emoji)
        }
        
        // Save updated reactions
        updateReactions(messageId, updatedReactions)
    }
    
    override suspend fun deleteMessage(message: ChatMessage) {
        dao.deleteMessage(message.toEntity())
    }
    
    override suspend fun deleteMessageById(messageId: String) {
        dao.deleteMessageById(messageId)
    }
    
    override suspend fun deleteMessagesByChannel(channelId: String) {
        dao.deleteMessagesByChannel(channelId)
    }
    
    override suspend fun deleteAllMessages() {
        dao.deleteAllMessages()
    }
    
    override suspend fun deleteOldMessages(channelId: String, olderThan: Long): Int {
        return dao.deleteOldMessages(channelId, olderThan)
    }
}
