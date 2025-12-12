package com.infinitygauntlet.simulation.data.local.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Room entity for Test Scenarios
 * 
 * Week 2: Phase 2.1 - Room Database
 * 
 * Represents a test scenario that can be executed.
 * Includes metadata about test counts, duration, and execution status.
 * 
 * Indexes:
 * - category: For filtering scenarios by category
 * - status: For filtering by execution status
 * 
 * @property id Unique identifier (auto-generated)
 * @property name Display name of the scenario
 * @property description Detailed description
 * @property category Category grouping (e.g., "Discord", "Database", "Battle")
 * @property testCount Number of individual tests in this scenario
 * @property estimatedDuration Estimated execution time in milliseconds
 * @property status Current execution status
 * @property lastRunTimestamp When this scenario was last executed
 * @property successCount Number of successful executions
 * @property failureCount Number of failed executions
 * @property createdAt When this scenario was created
 * @property updatedAt When this scenario was last updated
 */
@Entity(
    tableName = "test_scenarios",
    indices = [
        Index(value = ["category"]),
        Index(value = ["status"])
    ]
)
data class TestScenarioEntity(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "id")
    val id: Long = 0,
    
    @ColumnInfo(name = "name")
    val name: String,
    
    @ColumnInfo(name = "description")
    val description: String,
    
    @ColumnInfo(name = "category")
    val category: String,
    
    @ColumnInfo(name = "test_count")
    val testCount: Int,
    
    @ColumnInfo(name = "estimated_duration")
    val estimatedDuration: Long,
    
    @ColumnInfo(name = "status")
    val status: String = "ready", // ready, running, passed, failed
    
    @ColumnInfo(name = "last_run_timestamp")
    val lastRunTimestamp: Long? = null,
    
    @ColumnInfo(name = "success_count")
    val successCount: Int = 0,
    
    @ColumnInfo(name = "failure_count")
    val failureCount: Int = 0,
    
    @ColumnInfo(name = "created_at")
    val createdAt: Long = System.currentTimeMillis(),
    
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long = System.currentTimeMillis()
)
