package com.infinitygauntlet.simulation.data.mappers

import com.infinitygauntlet.simulation.data.local.entities.ChatMessageEntity
import com.infinitygauntlet.simulation.domain.models.ChatMessage
import com.infinitygauntlet.simulation.domain.models.AuthorType
import com.infinitygauntlet.simulation.domain.models.MessageType

/**
 * Mapper: ChatMessage Entity ↔ Domain
 * 
 * Week 2: Phase 2.2 - Repository Pattern
 * 
 * Provides bidirectional conversion between database entity and domain model.
 * Handles enum conversions and JSON reactions mapping.
 * 
 * Note: Reactions are stored as JSON string in entity, parsed to Map in domain.
 * 
 * Usage:
 * ```
 * val entity = ChatMessageEntity(...)
 * val domain = entity.toDomain()
 * val backToEntity = domain.toEntity()
 * ```
 */

/**
 * Convert ChatMessageEntity to ChatMessage (Domain)
 * 
 * Database → Domain Layer
 * 
 * @param replyToContent Optional parent message content (from join query)
 */
fun ChatMessageEntity.toDomain(replyToContent: String? = null): ChatMessage {
    // Parse reactions JSON to Map
    val reactionsMap = reactions?.let { json ->
        try {
            com.google.gson.Gson().fromJson(
                json,
                object : com.google.gson.reflect.TypeToken<Map<String, Int>>() {}.type
            ) ?: emptyMap()
        } catch (e: Exception) {
            emptyMap()
        }
    } ?: emptyMap()
    
    return ChatMessage(
        id = id,
        channelId = channelId,
        content = content,
        authorType = AuthorType.fromString(authorType),
        authorName = authorName,
        authorAvatar = authorAvatar,
        messageType = MessageType.fromString(messageType),
        timestamp = timestamp,
        replyToId = replyToId,
        replyToContent = replyToContent,
        attachmentUrl = attachmentUrl,
        reactions = reactionsMap,
        isEdited = isEdited,
        editedAt = editedAt
    )
}

/**
 * Convert ChatMessage (Domain) to ChatMessageEntity
 * 
 * Domain → Database Layer
 * 
 * Note: replyToContent is dropped (not stored in database)
 */
fun ChatMessage.toEntity(): ChatMessageEntity {
    // Convert reactions Map to JSON string
    val reactionsJson = if (reactions.isNotEmpty()) {
        com.google.gson.Gson().toJson(reactions)
    } else {
        null
    }
    
    return ChatMessageEntity(
        id = id,
        channelId = channelId,
        content = content,
        authorType = authorType.name.lowercase(),
        authorName = authorName,
        authorAvatar = authorAvatar,
        messageType = messageType.name.lowercase(),
        timestamp = timestamp,
        replyToId = replyToId,
        attachmentUrl = attachmentUrl,
        reactions = reactionsJson,
        isEdited = isEdited,
        editedAt = editedAt
    )
}

/**
 * Convert list of ChatMessageEntity to list of ChatMessage
 * 
 * Bulk conversion: Database → Domain
 */
fun List<ChatMessageEntity>.toDomainList(): List<ChatMessage> {
    return map { it.toDomain() }
}

/**
 * Convert list of ChatMessage to list of ChatMessageEntity
 * 
 * Bulk conversion: Domain → Database
 */
fun List<ChatMessage>.toEntityList(): List<ChatMessageEntity> {
    return map { it.toEntity() }
}
