package com.infinitygauntlet.simulation.data.local.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Room entity for Test Results
 * 
 * Week 2: Phase 2.1 - Room Database
 * 
 * Represents the result of executing a test scenario.
 * Linked to TestScenarioEntity via foreign key.
 * 
 * Foreign Keys:
 * - scenario_id: References test_scenarios(id) with CASCADE delete
 * 
 * Indexes:
 * - scenario_id: For querying results by scenario
 * - execution_timestamp: For chronological queries
 * - status: For filtering by result status
 * 
 * @property id Unique identifier (auto-generated)
 * @property scenarioId Foreign key to test_scenarios
 * @property executionTimestamp When the test was executed
 * @property durationMs Actual execution time in milliseconds
 * @property status Result status (passed, failed, error)
 * @property passedTests Number of tests that passed
 * @property failedTests Number of tests that failed
 * @property errorMessage Error message if failed
 * @property details Detailed result information (JSON or text)
 * @property createdAt When this result was recorded
 */
@Entity(
    tableName = "test_results",
    foreignKeys = [
        ForeignKey(
            entity = TestScenarioEntity::class,
            parentColumns = ["id"],
            childColumns = ["scenario_id"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index(value = ["scenario_id"]),
        Index(value = ["execution_timestamp"]),
        Index(value = ["status"])
    ]
)
data class TestResultEntity(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "id")
    val id: Long = 0,
    
    @ColumnInfo(name = "scenario_id")
    val scenarioId: Long,
    
    @ColumnInfo(name = "execution_timestamp")
    val executionTimestamp: Long,
    
    @ColumnInfo(name = "duration_ms")
    val durationMs: Long,
    
    @ColumnInfo(name = "status")
    val status: String, // passed, failed, error
    
    @ColumnInfo(name = "passed_tests")
    val passedTests: Int,
    
    @ColumnInfo(name = "failed_tests")
    val failedTests: Int,
    
    @ColumnInfo(name = "error_message")
    val errorMessage: String? = null,
    
    @ColumnInfo(name = "details")
    val details: String? = null,
    
    @ColumnInfo(name = "created_at")
    val createdAt: Long = System.currentTimeMillis()
)
