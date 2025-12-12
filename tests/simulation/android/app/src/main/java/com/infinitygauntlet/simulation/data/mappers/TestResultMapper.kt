package com.infinitygauntlet.simulation.data.mappers

import com.infinitygauntlet.simulation.data.local.entities.TestResultEntity
import com.infinitygauntlet.simulation.domain.models.TestResult
import com.infinitygauntlet.simulation.domain.models.ResultStatus

/**
 * Mapper: TestResult Entity ↔ Domain
 * 
 * Week 2: Phase 2.2 - Repository Pattern
 * 
 * Provides bidirectional conversion between database entity and domain model.
 * Handles status enum conversion and maintains data integrity.
 * 
 * Note: scenarioName is NOT stored in entity (foreign key only).
 * Use repository join queries to populate scenarioName in domain model.
 * 
 * Usage:
 * ```
 * val entity = TestResultEntity(...)
 * val domain = entity.toDomain(scenarioName = "My Test")
 * val backToEntity = domain.toEntity()
 * ```
 */

/**
 * Convert TestResultEntity to TestResult (Domain)
 * 
 * Database → Domain Layer
 * 
 * @param scenarioName Optional scenario name (from join query)
 */
fun TestResultEntity.toDomain(scenarioName: String = ""): TestResult {
    return TestResult(
        id = id,
        scenarioId = scenarioId,
        scenarioName = scenarioName,
        executionTimestamp = executionTimestamp,
        durationMs = durationMs,
        status = ResultStatus.fromString(status),
        passedTests = passedTests,
        failedTests = failedTests,
        errorMessage = errorMessage,
        details = details
    )
}

/**
 * Convert TestResult (Domain) to TestResultEntity
 * 
 * Domain → Database Layer
 * 
 * Note: scenarioName is dropped (not stored in database)
 */
fun TestResult.toEntity(): TestResultEntity {
    return TestResultEntity(
        id = id,
        scenarioId = scenarioId,
        executionTimestamp = executionTimestamp,
        durationMs = durationMs,
        status = status.name.lowercase(),
        passedTests = passedTests,
        failedTests = failedTests,
        errorMessage = errorMessage,
        details = details
    )
}

/**
 * Convert list of TestResultEntity to list of TestResult
 * 
 * Bulk conversion: Database → Domain
 * 
 * @param scenarioName Optional scenario name for all results
 */
fun List<TestResultEntity>.toDomainList(scenarioName: String = ""): List<TestResult> {
    return map { it.toDomain(scenarioName) }
}

/**
 * Convert list of TestResult to list of TestResultEntity
 * 
 * Bulk conversion: Domain → Database
 */
fun List<TestResult>.toEntityList(): List<TestResultEntity> {
    return map { it.toEntity() }
}
