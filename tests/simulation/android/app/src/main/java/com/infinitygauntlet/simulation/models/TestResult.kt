package com.infinitygauntlet.simulation.models

import com.google.gson.Gson

/**
 * Test Result data model
 * Represents the outcome of test execution
 */
data class TestResult(
    val scenarioId: String,
    val scenarioName: String,
    val passed: Int,
    val failed: Int,
    val skipped: Int,
    val duration: Long, // milliseconds
    val timestamp: Long = System.currentTimeMillis(),
    val failureDetails: List<TestFailure> = emptyList()
) {
    data class TestFailure(
        val testName: String,
        val expectedValue: String,
        val actualValue: String,
        val errorMessage: String
    )
    
    fun getTotal(): Int = passed + failed + skipped
    
    fun getPassRate(): Float {
        val total = getTotal()
        return if (total > 0) {
            (passed.toFloat() / total.toFloat()) * 100f
        } else {
            0f
        }
    }
    
    fun isSuccess(): Boolean = failed == 0 && passed > 0
    
    fun getDurationSeconds(): Double = duration / 1000.0
    
    fun toJson(): String {
        return Gson().toJson(this)
    }
    
    companion object {
        fun fromJson(json: String): TestResult {
            return Gson().fromJson(json, TestResult::class.java)
        }
        
        fun createSampleResult(): TestResult {
            return TestResult(
                scenarioId = "battle-system",
                scenarioName = "Battle System",
                passed = 55,
                failed = 3,
                skipped = 0,
                duration = 4180,
                failureDetails = listOf(
                    TestFailure(
                        testName = "should calculate critical hit damage correctly",
                        expectedValue = "150",
                        actualValue = "145",
                        errorMessage = "Critical hit multiplier not applied correctly"
                    ),
                    TestFailure(
                        testName = "should apply burn status correctly",
                        expectedValue = "Physical attack reduced by 50%",
                        actualValue = "Physical attack unchanged",
                        errorMessage = "Burn status not affecting attack stat"
                    ),
                    TestFailure(
                        testName = "should handle speed tie correctly",
                        expectedValue = "Random order",
                        actualValue = "Always same Pokémon first",
                        errorMessage = "Speed tie resolution not randomized"
                    )
                )
            )
        }
    }
}
