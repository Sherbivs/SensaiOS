package com.infinitygauntlet.simulation.models

/**
 * Test Scenario data model
 * Represents a collection of related tests
 */
data class TestScenario(
    val id: String,
    val name: String,
    val description: String,
    val testCount: Int,
    val estimatedDuration: Long, // milliseconds
    val category: TestCategory,
    val status: TestStatus = TestStatus.PENDING,
    val passedTests: Int = 0,
    val failedTests: Int = 0,
    val skippedTests: Int = 0
) {
    enum class TestCategory {
        CORE,           // Core game mechanics
        INTEGRATION,    // Integration tests
        STRESS,         // Performance tests
        AI,             // AI decision-making
        UI              // UI interaction tests
    }
    
    enum class TestStatus {
        PENDING,        // Not run yet
        RUNNING,        // Currently executing
        PASSED,         // All tests passed
        FAILED,         // Some tests failed
        SKIPPED         // Tests skipped
    }
    
    fun getPassRate(): Float {
        val total = passedTests + failedTests + skippedTests
        return if (total > 0) {
            (passedTests.toFloat() / total.toFloat()) * 100f
        } else {
            0f
        }
    }
    
    fun isComplete(): Boolean {
        return status != TestStatus.PENDING && status != TestStatus.RUNNING
    }
    
    companion object {
        fun createSampleScenarios(): List<TestScenario> {
            return listOf(
                TestScenario(
                    id = "onboarding",
                    name = "Onboarding Flow",
                    description = "Tests starter selection and initial setup",
                    testCount = 15,
                    estimatedDuration = 1500,
                    category = TestCategory.CORE
                ),
                TestScenario(
                    id = "wild-encounters",
                    name = "Wild Encounters",
                    description = "Tests wild Pokémon encounters and catch mechanics",
                    testCount = 42,
                    estimatedDuration = 3500,
                    category = TestCategory.CORE
                ),
                TestScenario(
                    id = "battle-system",
                    name = "Battle System",
                    description = "Tests battle mechanics, damage calculation, status effects",
                    testCount = 58,
                    estimatedDuration = 4200,
                    category = TestCategory.CORE
                ),
                TestScenario(
                    id = "ai-decisions",
                    name = "AI Decision Making",
                    description = "Tests AI strategy and decision-making algorithms",
                    testCount = 18,
                    estimatedDuration = 2800,
                    category = TestCategory.AI
                ),
                TestScenario(
                    id = "stress-tests",
                    name = "Stress Tests",
                    description = "Tests system under heavy load and edge cases",
                    testCount = 10,
                    estimatedDuration = 5000,
                    category = TestCategory.STRESS
                )
            )
        }
    }
}
