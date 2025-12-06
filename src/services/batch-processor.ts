/**
 * Batch Processing System
 * ======================
 * 
 * Enterprise-grade batch processor for handling large dataset operations
 * with chunking, progress tracking, resumability, and comprehensive metrics.
 * 
 * Key Features:
 * - Chunked processing for memory efficiency
 * - Progress tracking with percentage and ETA
 * - Resumable jobs with checkpoint persistence
 * - Parallel chunk processing with concurrency control
 * - Audit logging integration
 * - Dead letter queue for failed items
 * - Prometheus metrics
 * - Graceful shutdown support
 * 
 * @module services/batch-processor
 * @since 2025-12-04
 */

import { log } from "../utils/logger.js";
import type { AuditUserContext } from "./audit-service.js";
import crypto from "crypto";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Batch job status
 */
export type BatchJobStatus = 
  | "pending"     // Job created but not started
  | "running"     // Job currently processing
  | "paused"      // Job paused, can be resumed
  | "completed"   // Job finished successfully
  | "failed"      // Job failed with errors
  | "cancelled";  // Job cancelled by user

/**
 * Batch job priority
 */
export type BatchJobPriority = "low" | "normal" | "high" | "critical";

/**
 * Result of processing a single item
 */
export interface ItemResult<T> {
  item: T;
  success: boolean;
  error?: Error;
  duration: number;  // ms
}

/**
 * Chunk processing result
 */
export interface ChunkResult<T> {
  chunkIndex: number;
  totalItems: number;
  successCount: number;
  failureCount: number;
  results: ItemResult<T>[];
  duration: number;  // ms
}

/**
 * Batch job progress
 */
export interface BatchProgress {
  jobId: string;
  status: BatchJobStatus;
  totalItems: number;
  processedItems: number;
  successCount: number;
  failureCount: number;
  currentChunk: number;
  totalChunks: number;
  percentComplete: number;
  estimatedTimeRemaining: number;  // ms
  startedAt: Date | null;
  completedAt: Date | null;
  lastCheckpoint: Date | null;
  averageItemDuration: number;  // ms
}

/**
 * Batch job checkpoint for resumability
 */
export interface BatchCheckpoint {
  jobId: string;
  lastProcessedChunk: number;
  lastProcessedItem: number;
  processedItems: number;
  successCount: number;
  failureCount: number;
  timestamp: Date;
  deadLetterItems: unknown[];
}

/**
 * Batch job configuration
 */
export interface BatchJobConfig<T> {
  /** Unique job name for identification */
  name: string;
  
  /** Job priority */
  priority?: BatchJobPriority;
  
  /** Number of items per chunk (default: 100) */
  chunkSize?: number;
  
  /** Number of concurrent chunks to process (default: 1) */
  concurrency?: number;
  
  /** Delay between chunks in ms (default: 100) */
  chunkDelay?: number;
  
  /** Maximum retries per item (default: 3) */
  maxRetries?: number;
  
  /** Checkpoint interval in processed items (default: 1000) */
  checkpointInterval?: number;
  
  /** Enable audit logging (default: true) */
  enableAudit?: boolean;
  
  /** User context for audit logging */
  userContext?: AuditUserContext;
  
  /** Custom tags for filtering/grouping */
  tags?: string[];
  
  /** Timeout per item in ms (default: 30000) */
  itemTimeout?: number;
  
  /** Callback on progress update */
  onProgress?: (progress: BatchProgress) => void;
  
  /** Callback on chunk complete */
  onChunkComplete?: (result: ChunkResult<T>) => void;
  
  /** Callback on error */
  onError?: (error: Error, item: T) => void;
}

/**
 * Batch job definition
 */
export interface BatchJob<T, R = void> {
  /** Unique job ID */
  id: string;
  
  /** Job configuration */
  config: Required<BatchJobConfig<T>>;
  
  /** Current status */
  status: BatchJobStatus;
  
  /** Progress information */
  progress: BatchProgress;
  
  /** Items to process */
  items: T[];
  
  /** Processing function */
  processor: (item: T, context: ProcessingContext) => Promise<R>;
  
  /** Dead letter queue */
  deadLetter: Array<{ item: T; error: Error; attempts: number }>;
  
  /** Created timestamp */
  createdAt: Date;
  
  /** Last checkpoint */
  checkpoint: BatchCheckpoint | null;
}

/**
 * Context passed to item processor
 */
export interface ProcessingContext {
  jobId: string;
  itemIndex: number;
  chunkIndex: number;
  totalItems: number;
  attempt: number;
  signal: AbortSignal;
}

/**
 * Batch processor configuration
 */
export interface BatchProcessorConfig {
  /** Maximum concurrent jobs (default: 3) */
  maxConcurrentJobs?: number;
  
  /** Enable persistence (default: true) */
  enablePersistence?: boolean;
  
  /** Metrics collection (default: true) */
  enableMetrics?: boolean;
  
  /** Auto-start pending jobs on init (default: false) */
  autoStart?: boolean;
}

// ============================================================================
// PROMETHEUS METRICS
// ============================================================================

interface BatchMetrics {
  jobsCreated: number;
  jobsCompleted: number;
  jobsFailed: number;
  jobsCancelled: number;
  itemsProcessed: number;
  itemsFailed: number;
  totalProcessingTime: number;  // ms
  averageJobDuration: number;   // ms
  averageItemDuration: number;  // ms
  activeJobs: number;
  queuedJobs: number;
  deadLetterSize: number;
}

// Global metrics state
let metrics: BatchMetrics = {
  jobsCreated: 0,
  jobsCompleted: 0,
  jobsFailed: 0,
  jobsCancelled: 0,
  itemsProcessed: 0,
  itemsFailed: 0,
  totalProcessingTime: 0,
  averageJobDuration: 0,
  averageItemDuration: 0,
  activeJobs: 0,
  queuedJobs: 0,
  deadLetterSize: 0,
};

/**
 * Get current batch processor metrics
 */
export function getBatchMetrics(): BatchMetrics {
  return { ...metrics };
}

/**
 * Get Prometheus-formatted metrics
 */
export function getPrometheusMetrics(): string {
  return `
# HELP batch_jobs_created_total Total batch jobs created
# TYPE batch_jobs_created_total counter
batch_jobs_created_total ${metrics.jobsCreated}

# HELP batch_jobs_completed_total Total batch jobs completed successfully
# TYPE batch_jobs_completed_total counter
batch_jobs_completed_total ${metrics.jobsCompleted}

# HELP batch_jobs_failed_total Total batch jobs that failed
# TYPE batch_jobs_failed_total counter
batch_jobs_failed_total ${metrics.jobsFailed}

# HELP batch_jobs_cancelled_total Total batch jobs cancelled
# TYPE batch_jobs_cancelled_total counter
batch_jobs_cancelled_total ${metrics.jobsCancelled}

# HELP batch_items_processed_total Total items processed across all jobs
# TYPE batch_items_processed_total counter
batch_items_processed_total ${metrics.itemsProcessed}

# HELP batch_items_failed_total Total items that failed processing
# TYPE batch_items_failed_total counter
batch_items_failed_total ${metrics.itemsFailed}

# HELP batch_active_jobs Currently running batch jobs
# TYPE batch_active_jobs gauge
batch_active_jobs ${metrics.activeJobs}

# HELP batch_queued_jobs Queued batch jobs waiting to run
# TYPE batch_queued_jobs gauge
batch_queued_jobs ${metrics.queuedJobs}

# HELP batch_dead_letter_size Items in dead letter queue
# TYPE batch_dead_letter_size gauge
batch_dead_letter_size ${metrics.deadLetterSize}

# HELP batch_avg_job_duration_ms Average job duration in milliseconds
# TYPE batch_avg_job_duration_ms gauge
batch_avg_job_duration_ms ${metrics.averageJobDuration}

# HELP batch_avg_item_duration_ms Average item processing duration in milliseconds
# TYPE batch_avg_item_duration_ms gauge
batch_avg_item_duration_ms ${metrics.averageItemDuration}
`.trim();
}

// ============================================================================
// BATCH PROCESSOR CLASS
// ============================================================================

/**
 * Enterprise batch processor with full lifecycle management
 */
export class BatchProcessor {
  private config: Required<BatchProcessorConfig>;
  private jobs: Map<string, BatchJob<unknown, unknown>> = new Map();
  private jobQueue: string[] = [];
  private runningJobs: Set<string> = new Set();
  private abortControllers: Map<string, AbortController> = new Map();
  private isShuttingDown = false;
  
  constructor(config: BatchProcessorConfig = {}) {
    this.config = {
      maxConcurrentJobs: config.maxConcurrentJobs ?? 3,
      enablePersistence: config.enablePersistence ?? true,
      enableMetrics: config.enableMetrics ?? true,
      autoStart: config.autoStart ?? false,
    };
  }
  
  /**
   * Create and enqueue a new batch job
   */
  async createJob<T, R = void>(
    items: T[],
    processor: (item: T, context: ProcessingContext) => Promise<R>,
    config: BatchJobConfig<T>
  ): Promise<string> {
    const jobId = this.generateJobId(config.name);
    
    const fullConfig: Required<BatchJobConfig<T>> = {
      name: config.name,
      priority: config.priority ?? "normal",
      chunkSize: config.chunkSize ?? 100,
      concurrency: config.concurrency ?? 1,
      chunkDelay: config.chunkDelay ?? 100,
      maxRetries: config.maxRetries ?? 3,
      checkpointInterval: config.checkpointInterval ?? 1000,
      enableAudit: config.enableAudit ?? true,
      userContext: config.userContext ?? { discordId: "system", userId: "system" },
      tags: config.tags ?? [],
      itemTimeout: config.itemTimeout ?? 30000,
      onProgress: config.onProgress ?? (() => {}),
      onChunkComplete: config.onChunkComplete ?? (() => {}),
      onError: config.onError ?? (() => {}),
    };
    
    const totalChunks = Math.ceil(items.length / fullConfig.chunkSize);
    
    const job: BatchJob<T, R> = {
      id: jobId,
      config: fullConfig,
      status: "pending",
      progress: {
        jobId,
        status: "pending",
        totalItems: items.length,
        processedItems: 0,
        successCount: 0,
        failureCount: 0,
        currentChunk: 0,
        totalChunks,
        percentComplete: 0,
        estimatedTimeRemaining: 0,
        startedAt: null,
        completedAt: null,
        lastCheckpoint: null,
        averageItemDuration: 0,
      },
      items,
      processor,
      deadLetter: [],
      createdAt: new Date(),
      checkpoint: null,
    };
    
    this.jobs.set(jobId, job as BatchJob<unknown, unknown>);
    this.enqueueJob(jobId, fullConfig.priority);
    
    metrics.jobsCreated++;
    metrics.queuedJobs = this.jobQueue.length;
    
    log.info(`[BatchProcessor] Created job ${jobId}: ${items.length} items, ${totalChunks} chunks`);
    
    // Audit log job creation (logged via standard logger - audit service integration optional)
    if (fullConfig.enableAudit) {
      log.info(`[BatchProcessor:Audit] CREATE BatchJob ${jobId}`, {
        name: fullConfig.name,
        itemCount: items.length,
        tags: fullConfig.tags,
        actor: fullConfig.userContext.discordId ?? fullConfig.userContext.userId,
      });
    }
    
    // Auto-start if configured
    if (this.config.autoStart) {
      this.processQueue();
    }
    
    return jobId;
  }
  
  /**
   * Start processing the job queue
   */
  async start(): Promise<void> {
    if (this.isShuttingDown) {
      log.warn("[BatchProcessor] Cannot start - processor is shutting down");
      return;
    }
    
    log.info("[BatchProcessor] Starting job queue processing");
    await this.processQueue();
  }
  
  /**
   * Pause a running job
   */
  async pauseJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "running") {
      return false;
    }
    
    // Abort current processing
    const controller = this.abortControllers.get(jobId);
    if (controller) {
      controller.abort();
    }
    
    job.status = "paused";
    job.progress.status = "paused";
    this.runningJobs.delete(jobId);
    metrics.activeJobs = this.runningJobs.size;
    
    // Save checkpoint
    await this.saveCheckpoint(job);
    
    log.info(`[BatchProcessor] Paused job ${jobId} at ${job.progress.percentComplete.toFixed(1)}%`);
    return true;
  }
  
  /**
   * Resume a paused job
   */
  async resumeJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "paused") {
      return false;
    }
    
    // Re-enqueue with high priority
    this.enqueueJob(jobId, "high");
    log.info(`[BatchProcessor] Resumed job ${jobId}`);
    
    await this.processQueue();
    return true;
  }
  
  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }
    
    // Abort if running
    const controller = this.abortControllers.get(jobId);
    if (controller) {
      controller.abort();
    }
    
    job.status = "cancelled";
    job.progress.status = "cancelled";
    job.progress.completedAt = new Date();
    
    this.runningJobs.delete(jobId);
    this.jobQueue = this.jobQueue.filter(id => id !== jobId);
    
    metrics.jobsCancelled++;
    metrics.activeJobs = this.runningJobs.size;
    metrics.queuedJobs = this.jobQueue.length;
    
    // Audit log cancellation
    if (job.config.enableAudit) {
      log.info(`[BatchProcessor:Audit] CANCEL BatchJob ${jobId}`, {
        status: "cancelled",
        previousStatus: "running",
        progress: job.progress.percentComplete,
        actor: job.config.userContext.discordId ?? job.config.userContext.userId,
      });
    }
    
    log.info(`[BatchProcessor] Cancelled job ${jobId}`);
    return true;
  }
  
  /**
   * Get job status and progress
   */
  getJobProgress(jobId: string): BatchProgress | null {
    const job = this.jobs.get(jobId);
    return job ? { ...job.progress } : null;
  }
  
  /**
   * Get all jobs with optional filtering
   */
  getJobs(filter?: { status?: BatchJobStatus; tags?: string[] }): BatchProgress[] {
    const jobs = Array.from(this.jobs.values());
    
    return jobs
      .filter(job => {
        if (filter?.status && job.status !== filter.status) return false;
        if (filter?.tags && !filter.tags.every(tag => job.config.tags.includes(tag))) return false;
        return true;
      })
      .map(job => ({ ...job.progress }));
  }
  
  /**
   * Get dead letter items for a job
   */
  getDeadLetter(jobId: string): Array<{ item: unknown; error: string; attempts: number }> {
    const job = this.jobs.get(jobId);
    if (!job) return [];
    
    return job.deadLetter.map(dl => ({
      item: dl.item,
      error: dl.error.message,
      attempts: dl.attempts,
    }));
  }
  
  /**
   * Retry dead letter items for a job
   */
  async retryDeadLetter(jobId: string): Promise<number> {
    const job = this.jobs.get(jobId);
    if (!job || job.deadLetter.length === 0) {
      return 0;
    }
    
    const itemsToRetry = job.deadLetter.length;
    const items = job.deadLetter.map(dl => dl.item);
    job.deadLetter = [];
    
    // Create a new retry job
    const retryJobId = await this.createJob(
      items,
      job.processor as (item: unknown, ctx: ProcessingContext) => Promise<unknown>,
      {
        ...job.config,
        name: `${job.config.name}-retry`,
        tags: [...job.config.tags, "retry", `parent:${jobId}`],
      }
    );
    
    log.info(`[BatchProcessor] Created retry job ${retryJobId} with ${itemsToRetry} items from ${jobId}`);
    return itemsToRetry;
  }
  
  /**
   * Graceful shutdown
   */
  async shutdown(timeout: number = 30000): Promise<void> {
    log.info("[BatchProcessor] Initiating graceful shutdown...");
    this.isShuttingDown = true;
    
    // Abort all running jobs
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    
    // Wait for running jobs to complete or timeout
    const startTime = Date.now();
    while (this.runningJobs.size > 0 && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Save checkpoints for any remaining jobs
    for (const jobId of this.runningJobs) {
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = "paused";
        await this.saveCheckpoint(job);
      }
    }
    
    log.info(`[BatchProcessor] Shutdown complete. ${this.runningJobs.size} jobs paused.`);
  }
  
  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================
  
  private generateJobId(name: string): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString("hex");
    return `${name.toLowerCase().replace(/\s+/g, "-")}-${timestamp}-${random}`;
  }
  
  private enqueueJob(jobId: string, priority: BatchJobPriority): void {
    // Remove if already in queue
    this.jobQueue = this.jobQueue.filter(id => id !== jobId);
    
    // Insert based on priority
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    const jobPriority = priorityOrder[priority];
    
    let insertIndex = this.jobQueue.length;
    for (let i = 0; i < this.jobQueue.length; i++) {
      const existingJob = this.jobs.get(this.jobQueue[i]);
      if (existingJob) {
        const existingPriority = priorityOrder[existingJob.config.priority];
        if (jobPriority < existingPriority) {
          insertIndex = i;
          break;
        }
      }
    }
    
    this.jobQueue.splice(insertIndex, 0, jobId);
    metrics.queuedJobs = this.jobQueue.length;
  }
  
  private async processQueue(): Promise<void> {
    while (
      !this.isShuttingDown &&
      this.jobQueue.length > 0 &&
      this.runningJobs.size < this.config.maxConcurrentJobs
    ) {
      const jobId = this.jobQueue.shift();
      if (!jobId) continue;
      
      const job = this.jobs.get(jobId);
      if (!job || job.status === "cancelled") continue;
      
      // Start processing in background
      this.processJob(job).catch(error => {
        log.error(`[BatchProcessor] Job ${jobId} failed:`, error);
      });
    }
  }
  
  private async processJob(job: BatchJob<unknown, unknown>): Promise<void> {
    const jobId = job.id;
    const startTime = Date.now();
    
    // Setup abort controller
    const controller = new AbortController();
    this.abortControllers.set(jobId, controller);
    
    job.status = "running";
    job.progress.status = "running";
    job.progress.startedAt = new Date();
    this.runningJobs.add(jobId);
    
    metrics.activeJobs = this.runningJobs.size;
    metrics.queuedJobs = this.jobQueue.length;
    
    log.info(`[BatchProcessor] Starting job ${jobId}`);
    
    try {
      // Resume from checkpoint if available
      let startChunk = 0;
      if (job.checkpoint) {
        startChunk = job.checkpoint.lastProcessedChunk;
        job.progress.processedItems = job.checkpoint.processedItems;
        job.progress.successCount = job.checkpoint.successCount;
        job.progress.failureCount = job.checkpoint.failureCount;
        log.info(`[BatchProcessor] Resuming job ${jobId} from chunk ${startChunk}`);
      }
      
      // Process chunks
      const { chunkSize, concurrency, chunkDelay } = job.config;
      const chunks = this.chunkArray(job.items, chunkSize);
      job.progress.totalChunks = chunks.length;
      
      let itemDurations: number[] = [];
      
      for (let chunkIndex = startChunk; chunkIndex < chunks.length; chunkIndex += concurrency) {
        if (controller.signal.aborted) break;
        
        // Process concurrent chunks
        const chunkPromises: Promise<ChunkResult<unknown>>[] = [];
        for (let i = 0; i < concurrency && chunkIndex + i < chunks.length; i++) {
          const idx = chunkIndex + i;
          chunkPromises.push(
            this.processChunk(job, chunks[idx], idx, controller.signal)
          );
        }
        
        const results = await Promise.all(chunkPromises);
        
        // Aggregate results
        for (const result of results) {
          job.progress.processedItems += result.totalItems;
          job.progress.successCount += result.successCount;
          job.progress.failureCount += result.failureCount;
          job.progress.currentChunk = result.chunkIndex + 1;
          
          // Track item durations for ETA calculation
          itemDurations.push(...result.results.map(r => r.duration));
          if (itemDurations.length > 1000) {
            itemDurations = itemDurations.slice(-1000);
          }
          
          // Calculate progress metrics
          job.progress.percentComplete = 
            (job.progress.processedItems / job.progress.totalItems) * 100;
          
          if (itemDurations.length > 0) {
            job.progress.averageItemDuration = 
              itemDurations.reduce((a, b) => a + b, 0) / itemDurations.length;
            
            const remainingItems = job.progress.totalItems - job.progress.processedItems;
            job.progress.estimatedTimeRemaining = 
              remainingItems * job.progress.averageItemDuration;
          }
          
          // Notify progress
          job.config.onProgress(job.progress);
          job.config.onChunkComplete(result);
        }
        
        // Checkpoint if needed
        if (job.progress.processedItems % job.config.checkpointInterval < chunkSize * concurrency) {
          await this.saveCheckpoint(job);
        }
        
        // Delay between chunk batches
        if (chunkIndex + concurrency < chunks.length && chunkDelay > 0) {
          await this.sleep(chunkDelay);
        }
      }
      
      // Job complete
      const endTime = Date.now();
      const totalDuration = endTime - startTime;
      
      job.status = "completed";
      job.progress.status = "completed";
      job.progress.completedAt = new Date();
      job.progress.percentComplete = 100;
      job.progress.estimatedTimeRemaining = 0;
      
      metrics.jobsCompleted++;
      metrics.itemsProcessed += job.progress.successCount;
      metrics.itemsFailed += job.progress.failureCount;
      metrics.totalProcessingTime += totalDuration;
      metrics.averageJobDuration = metrics.totalProcessingTime / metrics.jobsCompleted;
      metrics.averageItemDuration = job.progress.averageItemDuration;
      metrics.deadLetterSize += job.deadLetter.length;
      
      // Audit log completion
      if (job.config.enableAudit) {
        log.info(`[BatchProcessor:Audit] COMPLETE BatchJob ${jobId}`, {
          status: "completed",
          successCount: job.progress.successCount,
          failureCount: job.progress.failureCount,
          duration: totalDuration,
          actor: job.config.userContext.discordId ?? job.config.userContext.userId,
        });
      }
      
      log.info(`[BatchProcessor] Job ${jobId} completed: ${job.progress.successCount}/${job.progress.totalItems} items in ${(totalDuration / 1000).toFixed(1)}s`);
      
    } catch (error) {
      job.status = "failed";
      job.progress.status = "failed";
      job.progress.completedAt = new Date();
      
      metrics.jobsFailed++;
      
      // Audit log failure
      if (job.config.enableAudit) {
        log.info(`[BatchProcessor:Audit] FAIL BatchJob ${jobId}`, {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          progress: job.progress.percentComplete,
          actor: job.config.userContext.discordId ?? job.config.userContext.userId,
        });
      }
      
      log.error(`[BatchProcessor] Job ${jobId} failed:`, error);
      throw error;
      
    } finally {
      this.runningJobs.delete(jobId);
      this.abortControllers.delete(jobId);
      metrics.activeJobs = this.runningJobs.size;
      
      // Process next jobs in queue
      this.processQueue();
    }
  }
  
  private async processChunk(
    job: BatchJob<unknown, unknown>,
    chunk: unknown[],
    chunkIndex: number,
    signal: AbortSignal
  ): Promise<ChunkResult<unknown>> {
    const startTime = Date.now();
    const results: ItemResult<unknown>[] = [];
    let successCount = 0;
    let failureCount = 0;
    
    for (let i = 0; i < chunk.length; i++) {
      if (signal.aborted) break;
      
      const item = chunk[i];
      const itemStartTime = Date.now();
      let attempt = 0;
      let success = false;
      let lastError: Error | undefined;
      
      // Retry loop
      while (attempt < job.config.maxRetries && !success && !signal.aborted) {
        attempt++;
        
        try {
          const context: ProcessingContext = {
            jobId: job.id,
            itemIndex: chunkIndex * job.config.chunkSize + i,
            chunkIndex,
            totalItems: job.progress.totalItems,
            attempt,
            signal,
          };
          
          // Process with timeout
          await Promise.race([
            job.processor(item, context),
            this.timeout(job.config.itemTimeout, signal),
          ]);
          
          success = true;
          successCount++;
          
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          if (attempt < job.config.maxRetries) {
            // Exponential backoff
            await this.sleep(Math.min(1000 * Math.pow(2, attempt - 1), 10000));
          }
        }
      }
      
      const itemDuration = Date.now() - itemStartTime;
      
      if (!success && lastError) {
        failureCount++;
        job.deadLetter.push({ item, error: lastError, attempts: attempt });
        job.config.onError(lastError, item);
      }
      
      results.push({
        item,
        success,
        error: lastError,
        duration: itemDuration,
      });
    }
    
    return {
      chunkIndex,
      totalItems: chunk.length,
      successCount,
      failureCount,
      results,
      duration: Date.now() - startTime,
    };
  }
  
  private async saveCheckpoint(job: BatchJob<unknown, unknown>): Promise<void> {
    if (!this.config.enablePersistence) return;
    
    const checkpoint: BatchCheckpoint = {
      jobId: job.id,
      lastProcessedChunk: job.progress.currentChunk,
      lastProcessedItem: job.progress.processedItems,
      processedItems: job.progress.processedItems,
      successCount: job.progress.successCount,
      failureCount: job.progress.failureCount,
      timestamp: new Date(),
      deadLetterItems: job.deadLetter.map(dl => dl.item),
    };
    
    job.checkpoint = checkpoint;
    job.progress.lastCheckpoint = checkpoint.timestamp;
    
    // Persist checkpoint to file system (database model can be added later)
    // This allows resumability even without database schema changes
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const checkpointDir = process.env.STORE_PATH 
        ? `${process.env.STORE_PATH}/batch-checkpoints`
        : "Store/batch-checkpoints";
      
      await fs.mkdir(checkpointDir, { recursive: true });
      const checkpointFile = path.join(checkpointDir, `${job.id}.json`);
      await fs.writeFile(checkpointFile, JSON.stringify(checkpoint, null, 2));
    } catch (error) {
      // Checkpoint persistence is best-effort - job continues if it fails
      log.warn(`[BatchProcessor] Could not persist checkpoint for ${job.id}:`, error);
    }
  }
  
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private timeout(ms: number, signal: AbortSignal): Promise<never> {
    return new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${ms}ms`));
      }, ms);
      
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("Operation aborted"));
      });
    });
  }
}

// ============================================================================
// BATCH JOB SCHEDULER
// ============================================================================

/**
 * Scheduled batch job configuration
 */
export interface ScheduledBatchJobConfig<T> {
  /** Job name */
  name: string;
  
  /** Cron expression (e.g., "0 0 * * *" for daily at midnight) */
  cron?: string;
  
  /** Interval in milliseconds */
  interval?: number;
  
  /** Function to fetch items for the batch */
  fetchItems: () => Promise<T[]>;
  
  /** Processing function */
  processor: (item: T, context: ProcessingContext) => Promise<void>;
  
  /** Job configuration */
  config?: Omit<BatchJobConfig<T>, "name">;
  
  /** Whether the job is enabled */
  enabled?: boolean;
}

/**
 * Batch job scheduler for recurring batch operations
 */
export class BatchJobScheduler {
  private processor: BatchProcessor;
  private scheduledJobs: Map<string, {
    config: ScheduledBatchJobConfig<unknown>;
    timer: ReturnType<typeof setInterval> | null;
    lastRun: Date | null;
    nextRun: Date | null;
  }> = new Map();
  private isRunning = false;
  
  constructor(processor: BatchProcessor) {
    this.processor = processor;
  }
  
  /**
   * Register a scheduled batch job
   */
  register<T>(config: ScheduledBatchJobConfig<T>): void {
    if (!config.interval && !config.cron) {
      throw new Error("Either interval or cron must be specified");
    }
    
    this.scheduledJobs.set(config.name, {
      config: config as ScheduledBatchJobConfig<unknown>,
      timer: null,
      lastRun: null,
      nextRun: null,
    });
    
    log.info(`[BatchJobScheduler] Registered job: ${config.name}`);
  }
  
  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    
    for (const [name, job] of this.scheduledJobs) {
      if (job.config.enabled === false) continue;
      
      if (job.config.interval) {
        job.timer = setInterval(() => {
          this.runJob(name);
        }, job.config.interval);
        
        // Calculate next run
        job.nextRun = new Date(Date.now() + job.config.interval);
      }
      // Note: Cron support would require a cron parser library
    }
    
    log.info(`[BatchJobScheduler] Started with ${this.scheduledJobs.size} jobs`);
  }
  
  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    
    for (const job of this.scheduledJobs.values()) {
      if (job.timer) {
        clearInterval(job.timer);
        job.timer = null;
      }
    }
    
    log.info("[BatchJobScheduler] Stopped");
  }
  
  /**
   * Manually trigger a scheduled job
   */
  async runJob(name: string): Promise<string | null> {
    const job = this.scheduledJobs.get(name);
    if (!job) {
      log.warn(`[BatchJobScheduler] Job not found: ${name}`);
      return null;
    }
    
    try {
      const items = await job.config.fetchItems();
      if (items.length === 0) {
        log.info(`[BatchJobScheduler] Job ${name} - no items to process`);
        return null;
      }
      
      const jobId = await this.processor.createJob(
        items,
        job.config.processor,
        {
          name,
          ...job.config.config,
        }
      );
      
      job.lastRun = new Date();
      if (job.config.interval) {
        job.nextRun = new Date(Date.now() + job.config.interval);
      }
      
      await this.processor.start();
      return jobId;
      
    } catch (error) {
      log.error(`[BatchJobScheduler] Failed to run job ${name}:`, error);
      return null;
    }
  }
  
  /**
   * Get scheduler status
   */
  getStatus(): Array<{
    name: string;
    enabled: boolean;
    lastRun: Date | null;
    nextRun: Date | null;
    interval: number | undefined;
  }> {
    return Array.from(this.scheduledJobs.entries()).map(([name, job]) => ({
      name,
      enabled: job.config.enabled !== false,
      lastRun: job.lastRun,
      nextRun: job.nextRun,
      interval: job.config.interval,
    }));
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a batch processor instance
 */
export function createBatchProcessor(config?: BatchProcessorConfig): BatchProcessor {
  return new BatchProcessor(config);
}

/**
 * Create a batch job scheduler
 */
export function createBatchJobScheduler(processor: BatchProcessor): BatchJobScheduler {
  return new BatchJobScheduler(processor);
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let defaultProcessor: BatchProcessor | null = null;
let defaultScheduler: BatchJobScheduler | null = null;

/**
 * Get or create the default batch processor
 */
export function getDefaultBatchProcessor(): BatchProcessor {
  if (!defaultProcessor) {
    defaultProcessor = createBatchProcessor({
      maxConcurrentJobs: 3,
      enablePersistence: true,
      enableMetrics: true,
      autoStart: false,
    });
  }
  return defaultProcessor;
}

/**
 * Get or create the default batch job scheduler
 */
export function getDefaultBatchJobScheduler(): BatchJobScheduler {
  if (!defaultScheduler) {
    defaultScheduler = createBatchJobScheduler(getDefaultBatchProcessor());
  }
  return defaultScheduler;
}

/**
 * Shutdown batch processing system
 */
export async function shutdownBatchProcessing(timeout?: number): Promise<void> {
  if (defaultScheduler) {
    defaultScheduler.stop();
  }
  if (defaultProcessor) {
    await defaultProcessor.shutdown(timeout);
  }
  defaultProcessor = null;
  defaultScheduler = null;
}

// ============================================================================
// COMMON BATCH OPERATIONS
// ============================================================================

/**
 * Helper to create a data migration batch job
 */
export async function createMigrationBatchJob<T>(
  name: string,
  items: T[],
  migrator: (item: T) => Promise<void>,
  options?: Partial<BatchJobConfig<T>>
): Promise<string> {
  const processor = getDefaultBatchProcessor();
  
  return processor.createJob(
    items,
    async (item, context) => {
      await migrator(item);
      if (context.itemIndex % 100 === 0) {
        log.info(`[Migration:${name}] Progress: ${context.itemIndex}/${context.totalItems}`);
      }
    },
    {
      name: `migration-${name}`,
      priority: "normal",
      chunkSize: 50,
      concurrency: 2,
      maxRetries: 2,
      tags: ["migration", name],
      ...options,
    }
  );
}

/**
 * Helper to create a cleanup batch job
 */
export async function createCleanupBatchJob<T>(
  name: string,
  items: T[],
  cleaner: (item: T) => Promise<void>,
  options?: Partial<BatchJobConfig<T>>
): Promise<string> {
  const processor = getDefaultBatchProcessor();
  
  return processor.createJob(
    items,
    async (item) => {
      await cleaner(item);
    },
    {
      name: `cleanup-${name}`,
      priority: "low",
      chunkSize: 100,
      concurrency: 1,
      maxRetries: 1,
      tags: ["cleanup", name],
      ...options,
    }
  );
}

/**
 * Helper to create an export batch job
 */
export async function createExportBatchJob<T, R>(
  name: string,
  items: T[],
  exporter: (item: T) => Promise<R>,
  collector: (results: R[]) => Promise<void>,
  options?: Partial<BatchJobConfig<T>>
): Promise<string> {
  const processor = getDefaultBatchProcessor();
  const results: R[] = [];
  
  const jobId = await processor.createJob(
    items,
    async (item) => {
      const result = await exporter(item);
      results.push(result);
    },
    {
      name: `export-${name}`,
      priority: "normal",
      chunkSize: 100,
      concurrency: 2,
      maxRetries: 3,
      tags: ["export", name],
      onProgress: async (progress) => {
        if (progress.status === "completed") {
          await collector(results);
        }
      },
      ...options,
    }
  );
  
  return jobId;
}
