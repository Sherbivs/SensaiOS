package com.infinitygauntlet.simulation.repositories

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Unit tests for MoveRepository
 * Tests move data loading, type filtering, power calculations, and caching.
 */
@ExperimentalCoroutinesApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class MoveRepositoryTest {

    private lateinit var context: Context
    private lateinit var repository: MoveRepository

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        repository = MoveRepository(context)
    }

    @Test
    fun `getMoves should load from assets`() = runTest {
        // When
        val moves = repository.getMoves()

        // Then
        assertTrue(moves.isNotEmpty())
        assertTrue(moves.size >= 10) // Expected at least 10 moves
    }

    @Test
    fun `getMoveByName should return correct move`() = runTest {
        // When
        val thunderbolt = repository.getMoveByName("Thunderbolt")

        // Then
        assertNotNull(thunderbolt)
        assertEquals("Thunderbolt", thunderbolt?.name)
        assertEquals("Electric", thunderbolt?.type)
    }

    @Test
    fun `getMovesByType should filter correctly`() = runTest {
        // When
        val waterMoves = repository.getMovesByType("Water")

        // Then
        assertTrue(waterMoves.isNotEmpty())
        assertTrue(waterMoves.all { it.type == "Water" })
    }

    @Test
    fun `getMovesByCategory should filter correctly`() = runTest {
        // When
        val physicalMoves = repository.getMovesByCategory("Physical")

        // Then
        assertTrue(physicalMoves.isNotEmpty())
        assertTrue(physicalMoves.all { it.category == "Physical" })
    }

    @Test
    fun `getStatusMoves should return status moves only`() = runTest {
        // When
        val statusMoves = repository.getStatusMoves()

        // Then
        assertTrue(statusMoves.isNotEmpty())
        assertTrue(statusMoves.all { it.category == "Status" })
    }

    @Test
    fun `clearCache should invalidate cached data`() = runTest {
        // Given
        repository.getMoves() // Load and cache

        // When
        repository.clearCache()

        // Then
        assertFalse(repository.isCached())
    }
}
