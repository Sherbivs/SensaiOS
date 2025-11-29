package com.infinitygauntlet.simulation.data.mappers

import com.infinitygauntlet.simulation.data.local.entities.ChannelEntity
import com.infinitygauntlet.simulation.domain.models.Channel

/**
 * Mapper: Channel Entity ↔ Domain
 * 
 * Week 2: Phase 2.2 - Repository Pattern
 * 
 * Provides bidirectional conversion between database entity and domain model.
 * Handles typing users list conversion (comma-separated ↔ List).
 * 
 * Usage:
 * ```
 * val entity = ChannelEntity(...)
 * val domain = entity.toDomain()
 * val backToEntity = domain.toEntity()
 * ```
 */

/**
 * Convert ChannelEntity to Channel (Domain)
 * 
 * Database → Domain Layer
 */
fun ChannelEntity.toDomain(): Channel {
    // Parse typing users from comma-separated string to list
    val typingUsersList = typingUsers?.split(",")
        ?.map { it.trim() }
        ?.filter { it.isNotBlank() }
        ?: emptyList()
    
    return Channel(
        id = id,
        name = name,
        description = description,
        category = category,
        icon = icon,
        color = color,
        unreadCount = unreadCount,
        lastMessageTimestamp = lastMessageTimestamp ?: 0,
        lastMessagePreview = lastMessagePreview,
        isTyping = isTyping,
        typingUsers = typingUsersList,
        createdAt = createdAt,
        updatedAt = updatedAt
    )
}

/**
 * Convert Channel (Domain) to ChannelEntity
 * 
 * Domain → Database Layer
 */
fun Channel.toEntity(): ChannelEntity {
    // Convert typing users list to comma-separated string
    val typingUsersString = if (typingUsers.isNotEmpty()) {
        typingUsers.joinToString(",")
    } else {
        null
    }
    
    return ChannelEntity(
        id = id,
        name = name,
        description = description ?: "",
        category = category ?: "default",
        icon = icon,
        color = color,
        unreadCount = unreadCount,
        lastMessageTimestamp = lastMessageTimestamp,
        lastMessagePreview = lastMessagePreview,
        isTyping = isTyping,
        typingUsers = typingUsersString,
        createdAt = createdAt,
        updatedAt = updatedAt
    )
}

/**
 * Convert list of ChannelEntity to list of Channel
 * 
 * Bulk conversion: Database → Domain
 */
fun List<ChannelEntity>.toDomainList(): List<Channel> {
    return map { it.toDomain() }
}

/**
 * Convert list of Channel to list of ChannelEntity
 * 
 * Bulk conversion: Domain → Database
 */
fun List<Channel>.toEntityList(): List<ChannelEntity> {
    return map { it.toEntity() }
}
