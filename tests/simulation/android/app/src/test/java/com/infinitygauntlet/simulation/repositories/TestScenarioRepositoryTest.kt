package com.infinitygauntlet.simulation.repositories

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.infinitygauntlet.simulation.models.TestCategory
import com.infinitygauntlet.simulation.models.TestPriority
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Unit tests for TestScenarioRepository
 * Tests asset loading, JSON parsing, caching, and error handling.
 */
@ExperimentalCoroutinesApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class TestScenarioRepositoryTest {

    private lateinit var context: Context
    private lateinit var repository: TestScenarioRepository

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        repository = TestScenarioRepository(context)
    }

    @Test
    fun `getScenarios should load from assets`() = runTest {
        // When
        val scenarios = repository.getScenarios()

        // Then
        assertTrue(scenarios.isNotEmpty())
        assertTrue(scenarios.size >= 5) // Expected at least 5 scenarios
    }

    @Test
    fun `getScenarios should return cached data on second call`() = runTest {
        // Given
        val firstCall = repository.getScenarios()

        // When
        val secondCall = repository.getScenarios()

        // Then
        assertEquals(firstCall.size, secondCall.size)
        assertTrue(repository.isCached())
    }

    @Test
    fun `getScenarioById should return correct scenario`() = runTest {
        // Given
        val scenarios = repository.getScenarios()
        val targetId = scenarios.first().id

        // When
        val scenario = repository.getScenarioById(targetId)

        // Then
        assertNotNull(scenario)
        assertEquals(targetId, scenario?.id)
    }

    @Test
    fun `getScenarioById should return null for invalid id`() = runTest {
        // When
        val scenario = repository.getScenarioById("invalid-id-999")

        // Then
        assertNull(scenario)
    }

    @Test
    fun `getScenariosByCategory should filter correctly`() = runTest {
        // When
        val battleScenarios = repository.getScenariosByCategory(TestCategory.BATTLE)

        // Then
        assertTrue(battleScenarios.isNotEmpty())
        assertTrue(battleScenarios.all { it.category == TestCategory.BATTLE })
    }

    @Test
    fun `getScenariosByPriority should filter correctly`() = runTest {
        // When
        val highPriority = repository.getScenariosByPriority(TestPriority.HIGH)

        // Then
        assertTrue(highPriority.isNotEmpty())
        assertTrue(highPriority.all { it.priority == TestPriority.HIGH })
    }

    @Test
    fun `clearCache should invalidate cached data`() = runTest {
        // Given
        repository.getScenarios() // Load and cache

        // When
        repository.clearCache()

        // Then
        assertFalse(repository.isCached())
    }

    @Test
    fun `refreshScenarios should reload from assets`() = runTest {
        // Given
        val oldScenarios = repository.getScenarios()

        // When
        val newScenarios = repository.refreshScenarios()

        // Then
        assertEquals(oldScenarios.size, newScenarios.size)
        assertNotSame(oldScenarios, newScenarios) // New instance
    }
}
