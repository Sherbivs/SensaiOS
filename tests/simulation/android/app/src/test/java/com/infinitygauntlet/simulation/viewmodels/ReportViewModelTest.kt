package com.infinitygauntlet.simulation.viewmodels

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import com.infinitygauntlet.simulation.models.*
import com.infinitygauntlet.simulation.repositories.ReportRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.Mock
import org.mockito.Mockito.*
import org.mockito.MockitoAnnotations
import java.io.File

/**
 * Unit tests for ReportViewModel
 * Tests report loading, format switching, filtering, sharing, and export.
 */
@ExperimentalCoroutinesApi
class ReportViewModelTest {

    @get:Rule
    val instantExecutorRule = InstantTaskExecutorRule()

    private val testDispatcher = StandardTestDispatcher()

    @Mock
    private lateinit var mockRepository: ReportRepository

    private lateinit var viewModel: ReportViewModel

    @Before
    fun setup() {
        MockitoAnnotations.openMocks(this)
        Dispatchers.setMain(testDispatcher)
        
        // Mock repository responses
        `when`(mockRepository.getSampleReport()).thenReturn(createSampleReport())
        `when`(mockRepository.getAvailableReports()).thenReturn(createReportList())
        
        viewModel = ReportViewModel(mockRepository)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state should be correct`() = runTest {
        // When
        val currentReport = viewModel.currentReport.first()
        val isLoading = viewModel.isLoading.first()
        val format = viewModel.currentFormat.first()

        // Then
        assertNull(currentReport)
        assertFalse(isLoading)
        assertEquals(ReportFormat.HTML, format)
    }

    @Test
    fun `loadReport should update current report`() = runTest {
        // Given
        val reportId = "report-001"
        val report = createSampleReport()
        `when`(mockRepository.getReportById(reportId)).thenReturn(report)

        // When
        viewModel.loadReport(reportId)
        advanceUntilIdle()

        // Then
        val currentReport = viewModel.currentReport.first()
        assertNotNull(currentReport)
        assertEquals(reportId, currentReport?.id)
    }

    @Test
    fun `loadReport should set loading state`() = runTest {
        // Given
        val reportId = "report-001"
        `when`(mockRepository.getReportById(reportId)).thenAnswer {
            Thread.sleep(100) // Simulate delay
            createSampleReport()
        }

        // When
        viewModel.loadReport(reportId)
        advanceTimeBy(50) // Check midway

        // Then
        val isLoading = viewModel.isLoading.first()
        assertTrue(isLoading)
    }

    @Test
    fun `loadReport should clear loading after completion`() = runTest {
        // Given
        val reportId = "report-001"
        `when`(mockRepository.getReportById(reportId)).thenReturn(createSampleReport())

        // When
        viewModel.loadReport(reportId)
        advanceUntilIdle()

        // Then
        val isLoading = viewModel.isLoading.first()
        assertFalse(isLoading)
    }

    @Test
    fun `switchFormat should update current format`() = runTest {
        // When
        viewModel.switchFormat(ReportFormat.JSON)
        advanceUntilIdle()

        // Then
        val format = viewModel.currentFormat.first()
        assertEquals(ReportFormat.JSON, format)
    }

    @Test
    fun `switchFormat should regenerate report content`() = runTest {
        // Given
        viewModel.loadReport("report-001")
        advanceUntilIdle()
        val initialContent = viewModel.reportContent.first()

        // When
        viewModel.switchFormat(ReportFormat.CSV)
        advanceUntilIdle()

        // Then
        val newContent = viewModel.reportContent.first()
        assertNotEquals(initialContent, newContent)
    }

    @Test
    fun `getAvailableReports should return report list`() = runTest {
        // When
        viewModel.loadAvailableReports()
        advanceUntilIdle()

        // Then
        val reports = viewModel.availableReports.first()
        assertTrue(reports.isNotEmpty())
        verify(mockRepository).getAvailableReports()
    }

    @Test
    fun `filterReportsByStatus should filter correctly`() = runTest {
        // Given
        viewModel.loadAvailableReports()
        advanceUntilIdle()

        // When
        viewModel.filterByStatus(TestStatus.PASSED)
        advanceUntilIdle()

        // Then
        val filtered = viewModel.filteredReports.first()
        assertTrue(filtered.all { it.passedCount > 0 })
    }

    @Test
    fun `filterReportsByCategory should filter correctly`() = runTest {
        // Given
        viewModel.loadAvailableReports()
        advanceUntilIdle()

        // When
        viewModel.filterByCategory(TestCategory.BATTLE)
        advanceUntilIdle()

        // Then
        val filtered = viewModel.filteredReports.first()
        assertTrue(filtered.all { it.category == TestCategory.BATTLE })
    }

    @Test
    fun `clearFilters should restore all reports`() = runTest {
        // Given
        viewModel.loadAvailableReports()
        advanceUntilIdle()
        viewModel.filterByStatus(TestStatus.PASSED)
        advanceUntilIdle()

        // When
        viewModel.clearFilters()
        advanceUntilIdle()

        // Then
        val available = viewModel.availableReports.first()
        val filtered = viewModel.filteredReports.first()
        assertEquals(available.size, filtered.size)
    }

    @Test
    fun `exportReport should generate file`() = runTest {
        // Given
        viewModel.loadReport("report-001")
        advanceUntilIdle()
        val mockFile = mock(File::class.java)
        `when`(mockRepository.exportReportToFile(any(), any(), any())).thenReturn(mockFile)

        // When
        val result = viewModel.exportReport(ReportFormat.HTML)
        advanceUntilIdle()

        // Then
        assertNotNull(result)
        verify(mockRepository).exportReportToFile(any(), eq(ReportFormat.HTML), any())
    }

    @Test
    fun `shareReport should prepare share intent data`() = runTest {
        // Given
        viewModel.loadReport("report-001")
        advanceUntilIdle()

        // When
        val shareData = viewModel.prepareShareData()

        // Then
        assertNotNull(shareData)
        assertTrue(shareData.contains("Test Report"))
    }

    @Test
    fun `getReportStatistics should calculate correctly`() = runTest {
        // Given
        viewModel.loadReport("report-001")
        advanceUntilIdle()

        // When
        val stats = viewModel.getReportStatistics()

        // Then
        assertNotNull(stats)
        assertTrue(stats.totalTests > 0)
        assertTrue(stats.passRate >= 0.0 && stats.passRate <= 1.0)
    }

    @Test
    fun `error handling should update error state`() = runTest {
        // Given
        `when`(mockRepository.getReportById(anyString())).thenThrow(RuntimeException("File not found"))

        // When
        viewModel.loadReport("invalid-id")
        advanceUntilIdle()

        // Then
        val errorState = viewModel.error.first()
        assertNotNull(errorState)
        assertTrue(errorState?.contains("error", ignoreCase = true) ?: false)
    }

    @Test
    fun `refreshReport should reload current report`() = runTest {
        // Given
        val reportId = "report-001"
        viewModel.loadReport(reportId)
        advanceUntilIdle()

        // When
        viewModel.refreshReport()
        advanceUntilIdle()

        // Then
        verify(mockRepository, times(2)).getReportById(reportId)
    }

    @Test
    fun `sortReportsByDate should order correctly`() = runTest {
        // Given
        viewModel.loadAvailableReports()
        advanceUntilIdle()

        // When
        viewModel.sortReports(SortOrder.DATE_DESC)
        advanceUntilIdle()

        // Then
        val sorted = viewModel.sortedReports.first()
        assertTrue(sorted.size > 1)
        assertTrue(sorted[0].timestamp >= sorted[1].timestamp)
    }

    @Test
    fun `deleteReport should remove from list`() = runTest {
        // Given
        viewModel.loadAvailableReports()
        advanceUntilIdle()
        val reports = viewModel.availableReports.first()
        val toDelete = reports.first()
        `when`(mockRepository.deleteReport(toDelete.id)).thenReturn(true)

        // When
        viewModel.deleteReport(toDelete.id)
        advanceUntilIdle()

        // Then
        val updated = viewModel.availableReports.first()
        assertFalse(updated.any { it.id == toDelete.id })
    }

    // Helper methods

    private fun createSampleReport(): TestReport {
        return TestReport(
            id = "report-001",
            title = "Test Report - Battle Tests",
            category = TestCategory.BATTLE,
            timestamp = System.currentTimeMillis(),
            totalTests = 9,
            passedCount = 6,
            failedCount = 2,
            skippedCount = 1,
            duration = 2800L,
            results = createSampleResults(),
            format = ReportFormat.HTML,
            content = "<html><body><h1>Test Report</h1></body></html>"
        )
    }

    private fun createReportList(): List<TestReport> {
        val now = System.currentTimeMillis()
        return listOf(
            TestReport(
                id = "report-001",
                title = "Battle Tests",
                category = TestCategory.BATTLE,
                timestamp = now - 3600000,
                totalTests = 9,
                passedCount = 6,
                failedCount = 2,
                skippedCount = 1,
                duration = 2800L,
                results = createSampleResults(),
                format = ReportFormat.HTML,
                content = ""
            ),
            TestReport(
                id = "report-002",
                title = "Onboarding Tests",
                category = TestCategory.ONBOARDING,
                timestamp = now - 7200000,
                totalTests = 5,
                passedCount = 5,
                failedCount = 0,
                skippedCount = 0,
                duration = 1500L,
                results = emptyList(),
                format = ReportFormat.JSON,
                content = ""
            ),
            TestReport(
                id = "report-003",
                title = "Wild Encounter Tests",
                category = TestCategory.WILD_ENCOUNTER,
                timestamp = now - 10800000,
                totalTests = 7,
                passedCount = 5,
                failedCount = 1,
                skippedCount = 1,
                duration = 2100L,
                results = emptyList(),
                format = ReportFormat.CSV,
                content = ""
            )
        )
    }

    private fun createSampleResults(): List<TestResult> {
        return listOf(
            TestResult(
                testName = "Test_Battle_Type_Advantage",
                status = TestStatus.PASSED,
                duration = 450L,
                errorMessage = null,
                timestamp = System.currentTimeMillis()
            ),
            TestResult(
                testName = "Test_Battle_Critical_Hit",
                status = TestStatus.FAILED,
                duration = 300L,
                errorMessage = "Expected critical hit rate ~6%, got 12%",
                timestamp = System.currentTimeMillis()
            ),
            TestResult(
                testName = "Test_Battle_Status_Effect",
                status = TestStatus.SKIPPED,
                duration = 0L,
                errorMessage = "Prerequisites not met",
                timestamp = System.currentTimeMillis()
            )
        )
    }
}
