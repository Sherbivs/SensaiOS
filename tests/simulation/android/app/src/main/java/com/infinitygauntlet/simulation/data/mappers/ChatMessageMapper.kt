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
 * KAPT COMPATIBILITY FIX (2025-11-29 - SECOND ATTEMPT):
 * Removed ALL TypeToken usage to avoid KAPT "Could not load module" error.
 * Using direct Map::class.java casting instead.
 * Anonymous object expressions (even at file-level) cause KAPT module loading failures.
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
    val reactionsMap: Map<String, Int> = reactions?.let { json ->
        try {
            // Using fromJson with explicit class instead of TypeToken
            @Suppress("UNCHECKED_CAST")
            com.google.gson.Gson().fromJson(json, Map::class.java) as? Map<String, Int> ?: emptyMap()
        } catch (e: Exception) {
            emptyMap()
        }
    } ?: emptyMap()
    
    return ChatMessage(
        id = id.toString(),
        channelId = channelId,
        content = content,
        authorType = AuthorType.fromString(authorType),
        authorName = authorName,
        authorAvatar = null, // Entity doesn't store avatar
        messageType = MessageType.fromString(messageType),
        timestamp = timestamp,
        replyToId = replyToId?.toString(),
        replyToContent = replyToContent,
        attachmentUrl = attachmentUrl,
        reactions = reactionsMap,
        isEdited = isEdited,
        editedAt = editedAt ?: 0
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
        id = id.toLongOrNull() ?: 0,
        channelId = channelId,
        content = content,
        authorType = authorType.name.lowercase(),
        authorName = authorName,
        messageType = messageType.name.lowercase(),
        timestamp = timestamp,
        replyToId = replyToId?.toLongOrNull(),
        attachmentUrl = attachmentUrl,
        reactions = reactionsJson,
        isEdited = isEdited,
        editedAt = if (editedAt > 0) editedAt else null
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
