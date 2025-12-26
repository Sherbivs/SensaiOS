/**
 * Error Learning Worker — Periodic Pattern Analysis
 * 
 * Background worker that analyzes error patterns hourly to:
 * - Detect time-of-day clusters
 * - Find error correlations
 * - Identify error cascades
 * - Update recovery strategy effectiveness
 * - Build knowledge base for impact prediction
 * 
 * Runs every hour to analyze recent errors and update ErrorLog.learningMetadata.
 * 
 * Referenced By: docs/error-detection-system.md (Learning Worker section)
 *                src/index.ts (worker lifecycle)
 * 
 * @module workers/error-learning-worker
 */

// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from "../shared/logging/index.js";
const logger = getLogger();

import { errorLearning } from '../services/monitoring/error-learning.js';
import { getErrorMessage } from '../shared/utils/index.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface ErrorLearningWorkerStatus {
  name: string;
  isRunning: boolean;
  lastRunTime: Date | null;
  lastRunDurationMs: number;
  successCount: number;
  errorCount: number;
  lastError: string | null;
  analysisCount: number;  // Total errors analyzed
}

// ============================================================================
// Error Learning Worker
// ============================================================================

export class ErrorLearningWorker {
  private interval: NodeJS.Timeout | null = null;
  private status: ErrorLearningWorkerStatus = {
    name: 'ErrorLearningWorker',
    isRunning: false,
    lastRunTime: null,
    lastRunDurationMs: 0,
    successCount: 0,
    errorCount: 0,
    lastError: null,
    analysisCount: 0,
  };
  
  /**
   * Start the worker with hourly execution schedule.
   * First run happens 5 minutes after startup (stagger delay).
   */
  async start(): Promise<void> {
    if (this.interval) {
      logger.warn('ErrorLearningWorker', 'start', 'Error learning worker already running');
      return;
    }
    
    const intervalMs = 60 * 60 * 1000; // 1 hour
    const staggerDelayMs = 5 * 60 * 1000; // 5 minutes (different from engine workers)
    
    logger.info('ErrorLearningWorker', 'start', 'Starting with 1-hour interval', {
      metadata: {
        staggerDelay: `${staggerDelayMs / 1000}s`,
        interval: '60 minutes',
      },
    });
    
    // Schedule periodic execution
    this.interval = setInterval(async () => {
      await this.execute();
    }, intervalMs);
    
    // Run first execution after stagger delay
    setTimeout(async () => {
      await this.execute();
    }, staggerDelayMs);
  }
  
  /**
   * Stop the worker gracefully.
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('ErrorLearningWorker', 'stop', 'Stopped');
    }
  }
  
  /**
   * Execute learning analysis cycle.
   * Analyzes all errors and updates knowledge base.
   */
  private async execute(): Promise<void> {
    if (this.status.isRunning) {
      logger.warn('ErrorLearningWorker', 'execute', 'Previous execution still running, skipping');
      return;
    }
    
    this.status.isRunning = true;
    const startTime = performance.now();
    
    try {
      logger.info('ErrorLearningWorker', 'execute', 'Execution started');
      
      // Run knowledge base update
      const analysisCount = await errorLearning.updateKnowledgeBase();
      
      const durationMs = performance.now() - startTime;
      this.status.lastRunTime = new Date();
      this.status.lastRunDurationMs = durationMs;
      this.status.successCount++;
      this.status.analysisCount += analysisCount;
      this.status.lastError = null;
      
      logger.info('ErrorLearningWorker', 'execute', 'Execution complete', {
        durationMs,
        metadata: {
          errorsAnalyzed: analysisCount,
          totalAnalyzed: this.status.analysisCount,
          successCount: this.status.successCount,
        },
      });
      
    } catch (error) {
      const durationMs = performance.now() - startTime;
      this.status.lastRunTime = new Date();
      this.status.lastRunDurationMs = durationMs;
      this.status.errorCount++;
      this.status.lastError = getErrorMessage(error);
      
      logger.error('ErrorLearningWorker', 'execute', 'Execution failed', {
        durationMs,
        metadata: {
          errorMsg: this.status.lastError,
          errorCount: this.status.errorCount,
        },
      });
      
      // Capture error for tracking
      if (error instanceof Error) {
        const { workerErrorHandler } = await import('./worker-error-handler.js');
        await workerErrorHandler.handleTaskError(error, 'ErrorLearningWorker', 'learning-analysis', {
          operation: 'error-learning',
          customData: {
            taskType: 'analysis',
          },
        });
      }
      
    } finally {
      this.status.isRunning = false;
    }
  }
  
  /**
   * Get current worker status.
   */
  getStatus(): ErrorLearningWorkerStatus {
    return { ...this.status };
  }
  
  /**
   * Trigger immediate execution (for testing/manual trigger).
   */
  async triggerNow(): Promise<void> {
    logger.info('ErrorLearningWorker', 'triggerNow', 'Manual execution triggered');
    await this.execute();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const errorLearningWorker = new ErrorLearningWorker();

