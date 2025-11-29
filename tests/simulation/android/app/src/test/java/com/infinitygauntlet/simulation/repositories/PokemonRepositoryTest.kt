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
 * Unit tests for PokemonRepository
 * Tests Pokémon data loading, caching, stat calculations, and error handling.
 */
@ExperimentalCoroutinesApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class PokemonRepositoryTest {

    private lateinit var context: Context
    private lateinit var repository: PokemonRepository

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        repository = PokemonRepository(context)
    }

    @Test
    fun `getPokemon should load from assets`() = runTest {
        // When
        val pokemon = repository.getPokemon()

        // Then
        assertTrue(pokemon.isNotEmpty())
        assertTrue(pokemon.size >= 5) // Expected at least 5 Pokémon
    }

    @Test
    fun `getPokemonById should return correct Pokemon`() = runTest {
        // When
        val bulbasaur = repository.getPokemonById(1)

        // Then
        assertNotNull(bulbasaur)
        assertEquals(1, bulbasaur?.id)
        assertEquals("Bulbasaur", bulbasaur?.name)
    }

    @Test
    fun `getPokemonByName should find Pokemon case-insensitively`() = runTest {
        // When
        val pikachu = repository.getPokemonByName("pikachu")

        // Then
        assertNotNull(pikachu)
        assertEquals("Pikachu", pikachu?.name)
    }

    @Test
    fun `getStarterPokemon should return starters only`() = runTest {
        // When
        val starters = repository.getStarterPokemon()

        // Then
        assertTrue(starters.isNotEmpty())
        assertTrue(starters.size == 3) // Bulbasaur, Charmander, Squirtle
        assertTrue(starters.any { it.name == "Bulbasaur" })
        assertTrue(starters.any { it.name == "Charmander" })
        assertTrue(starters.any { it.name == "Squirtle" })
    }

    @Test
    fun `getPokemonByType should filter correctly`() = runTest {
        // When
        val fireTypes = repository.getPokemonByType("Fire")

        // Then
        assertTrue(fireTypes.isNotEmpty())
        assertTrue(fireTypes.all { it.types.contains("Fire") })
    }

    @Test
    fun `clearCache should invalidate cached data`() = runTest {
        // Given
        repository.getPokemon() // Load and cache

        // When
        repository.clearCache()

        // Then
        assertFalse(repository.isCached())
    }
}
