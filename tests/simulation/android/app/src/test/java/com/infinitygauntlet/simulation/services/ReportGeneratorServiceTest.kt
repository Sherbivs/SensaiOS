package com.infinitygauntlet.simulation.services

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.infinitygauntlet.simulation.domain.models.*
import com.infinitygauntlet.simulation.utils.ReportFormatter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.Mockito.*
import org.mockito.MockitoAnnotations
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/**
 * Unit tests for ReportGeneratorService
 * Tests HTML/JSON/text report generation, batch processing, file saving to external storage.
 */
@ExperimentalCoroutinesApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class ReportGeneratorServiceTest {

    @get:Rule
    val tempFolder = TemporaryFolder()

    private val testDispatcher = StandardTestDispatcher()

    @Mock
    private lateinit var mockFormatter: ReportFormatter

    private lateinit var context: Context
    private lateinit var service: ReportGeneratorService

    @Before
    fun setup() {
        MockitoAnnotations.openMocks(this)
        Dispatchers.setMain(testDispatcher)
        
        context = ApplicationProvider.getApplicationContext()
        
        // Mock formatter responses
        `when`(mockFormatter.formatAsHtml(any())).thenReturn("<html><body>Report</body></html>")
        `when`(mockFormatter.formatAsJson(any())).thenReturn("{\"report\": \"data\"}")
        `when`(mockFormatter.formatAsText(any())).thenReturn("Test Report\nResults: 3/5 passed")
        
        service = ReportGeneratorService()
        service.formatter = mockFormatter
        service.outputDirectory = tempFolder.root
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `generateHtmlReport should create HTML file`() = runTest {
        // Given
        val results = createSampleResults()

        // When
        val file = service.generateHtmlReport(results)
        advanceUntilIdle()

        // Then
        assertNotNull(file)
        assertTrue(file.exists())
        assertTrue(file.name.endsWith(".html"))
        verify(mockFormatter).formatAsHtml(results)
    }

    @Test
    fun `generateJsonReport should create JSON file`() = runTest {
        // Given
        val results = createSampleResults()

        // When
        val file = service.generateJsonReport(results)
        advanceUntilIdle()

        // Then
        assertNotNull(file)
        assertTrue(file.exists())
        assertTrue(file.name.endsWith(".json"))
        verify(mockFormatter).formatAsJson(results)
    }

    @Test
    fun `generateTextReport should create text file`() = runTest {
        // Given
        val results = createSampleResults()

        // When
        val file = service.generateTextReport(results)
        advanceUntilIdle()

        // Then
        assertNotNull(file)
        assertTrue(file.exists())
        assertTrue(file.name.endsWith(".txt"))
        verify(mockFormatter).formatAsText(results)
    }

    @Test
    fun `generateReport should handle all formats`() = runTest {
        // Given
        val results = createSampleResults()

        // When - HTML
        val htmlFile = service.generateReport(results, ReportFormat.HTML)
        advanceUntilIdle()

        // Then
        assertTrue(htmlFile.name.endsWith(".html"))
        verify(mockFormatter).formatAsHtml(results)

        // When - JSON
        val jsonFile = service.generateReport(results, ReportFormat.JSON)
        advanceUntilIdle()

        // Then
        assertTrue(jsonFile.name.endsWith(".json"))
        verify(mockFormatter).formatAsJson(results)

        // When - TEXT
        val textFile = service.generateReport(results, ReportFormat.TEXT)
        advanceUntilIdle()

        // Then
        assertTrue(textFile.name.endsWith(".txt"))
        verify(mockFormatter).formatAsText(results)
    }

    @Test
    fun `generateBatchReports should create multiple files`() = runTest {
        // Given
        val results = createSampleResults()
        val formats = listOf(ReportFormat.HTML, ReportFormat.JSON, ReportFormat.TEXT)

        // When
        val files = service.generateBatchReports(results, formats)
        advanceUntilIdle()

        // Then
        assertEquals(3, files.size)
        assertTrue(files.any { it.name.endsWith(".html") })
        assertTrue(files.any { it.name.endsWith(".json") })
        assertTrue(files.any { it.name.endsWith(".txt") })
    }

    @Test
    fun `saveReportToExternalStorage should write file`() = runTest {
        // Given
        val content = "<html><body>Test Report</body></html>"
        val filename = "test_report.html"

        // When
        val file = service.saveToExternalStorage(content, filename)
        advanceUntilIdle()

        // Then
        assertNotNull(file)
        assertTrue(file.exists())
        assertEquals(filename, file.name)
        assertEquals(content, file.readText())
    }

    @Test
    fun `generateReport should include timestamp in filename`() = runTest {
        // Given
        val results = createSampleResults()

        // When
        val file = service.generateReport(results, ReportFormat.HTML)
        advanceUntilIdle()

        // Then
        assertTrue(file.name.matches(Regex("report_\\d{8}_\\d{6}\\.html")))
    }

    @Test
    fun `generateReport should handle empty results`() = runTest {
        // Given
        val emptyResults = emptyList<TestResult>()

        // When
        val file = service.generateReport(emptyResults, ReportFormat.HTML)
        advanceUntilIdle()

        // Then
        assertNotNull(file)
        assertTrue(file.exists())
        verify(mockFormatter).formatAsHtml(emptyResults)
    }

    @Test
    fun `deleteReport should remove file`() = runTest {
        // Given
        val results = createSampleResults()
        val file = service.generateReport(results, ReportFormat.HTML)
        advanceUntilIdle()
        assertTrue(file.exists())

        // When
        val deleted = service.deleteReport(file)

        // Then
        assertTrue(deleted)
        assertFalse(file.exists())
    }

    @Test
    fun `getReportFiles should list all reports`() = runTest {
        // Given
        service.generateReport(createSampleResults(), ReportFormat.HTML)
        service.generateReport(createSampleResults(), ReportFormat.JSON)
        advanceUntilIdle()

        // When
        val files = service.getReportFiles()

        // Then
        assertTrue(files.size >= 2)
        assertTrue(files.any { it.name.endsWith(".html") })
        assertTrue(files.any { it.name.endsWith(".json") })
    }

    @Test
    fun `cleanupOldReports should delete files older than threshold`() = runTest {
        // Given
        val oldFile = File(tempFolder.root, "old_report.html")
        oldFile.writeText("Old report")
        oldFile.setLastModified(System.currentTimeMillis() - (8 * 24 * 60 * 60 * 1000)) // 8 days old

        val newFile = File(tempFolder.root, "new_report.html")
        newFile.writeText("New report")

        // When
        service.cleanupOldReports(maxAgeDays = 7)
        advanceUntilIdle()

        // Then
        assertFalse(oldFile.exists())
        assertTrue(newFile.exists())
    }

    // Helper methods

    private fun createSampleResults(): List<TestResult> {
        val now = System.currentTimeMillis()
        return listOf(
            TestResult(
                testName = "Test_Onboarding_Tutorial",
                status = TestStatus.PASSED,
                duration = 1200L,
                errorMessage = null,
                timestamp = now
            ),
            TestResult(
                testName = "Test_Wild_Encounter_Basic",
                status = TestStatus.PASSED,
                duration = 800L,
                errorMessage = null,
                timestamp = now
            ),
            TestResult(
                testName = "Test_Battle_Type_Advantage",
                status = TestStatus.PASSED,
                duration = 450L,
                errorMessage = null,
                timestamp = now
            ),
            TestResult(
                testName = "Test_Battle_Critical_Hit",
                status = TestStatus.FAILED,
                duration = 300L,
                errorMessage = "Expected critical hit rate ~6%, got 12%",
                timestamp = now
            ),
            TestResult(
                testName = "Test_AI_Random_Actions",
                status = TestStatus.SKIPPED,
                duration = 0L,
                errorMessage = "Prerequisites not met",
                timestamp = now
            )
        )
    }
}
