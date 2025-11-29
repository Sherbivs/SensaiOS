package com.infinitygauntlet.simulation.data.mappers

import com.infinitygauntlet.simulation.data.local.entities.TestScenarioEntity
import com.infinitygauntlet.simulation.domain.models.TestScenario
import com.infinitygauntlet.simulation.domain.models.TestStatus

/**
 * Mapper: TestScenario Entity ↔ Domain
 * 
 * Week 2: Phase 2.2 - Repository Pattern
 * 
 * Provides bidirectional conversion between database entity and domain model.
 * Handles status enum conversion and maintains data integrity.
 * 
 * Usage:
 * ```
 * val entity = TestScenarioEntity(...)
 * val domain = entity.toDomain()
 * val backToEntity = domain.toEntity()
 * ```
 */

/**
 * Convert TestScenarioEntity to TestScenario (Domain)
 * 
 * Database → Domain Layer
 */
fun TestScenarioEntity.toDomain(): TestScenario {
    return TestScenario(
        id = id,
        name = name,
        description = description,
        category = category,
        testCount = testCount,
        estimatedDuration = estimatedDuration,
        status = TestStatus.fromString(status),
        lastRunTimestamp = lastRunTimestamp,
        successCount = successCount,
        failureCount = failureCount,
        createdAt = createdAt,
        updatedAt = updatedAt
    )
}

/**
 * Convert TestScenario (Domain) to TestScenarioEntity
 * 
 * Domain → Database Layer
 */
fun TestScenario.toEntity(): TestScenarioEntity {
    return TestScenarioEntity(
        id = id,
        name = name,
        description = description,
        category = category,
        testCount = testCount,
        estimatedDuration = estimatedDuration,
        status = status.name.lowercase(),
        lastRunTimestamp = lastRunTimestamp,
        successCount = successCount,
        failureCount = failureCount,
        createdAt = createdAt,
        updatedAt = updatedAt
    )
}

/**
 * Convert list of TestScenarioEntity to list of TestScenario
 * 
 * Bulk conversion: Database → Domain
 */
fun List<TestScenarioEntity>.toDomainList(): List<TestScenario> {
    return map { it.toDomain() }
}

/**
 * Convert list of TestScenario to list of TestScenarioEntity
 * 
 * Bulk conversion: Domain → Database
 */
fun List<TestScenario>.toEntityList(): List<TestScenarioEntity> {
    return map { it.toEntity() }
}
