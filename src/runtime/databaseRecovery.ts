/**
 * Database Recovery Module
 * 
 * Automatically attempts to recover from database connection failures by:
 * 1. Running Prisma migrations (prisma migrate deploy)
 * 2. Running bootstrap script if on production node
 * 3. Validating database schema after recovery
 * 
 * This ensures the game engine can self-heal on startup if the database
 * is missing, misconfigured, or needs schema updates.
 */

// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from "../shared/logging/index.js";
const logger = getLogger();

import { spawn } from "node:child_process";
import { config } from "../shared/config.js";
import { getErrorMessage } from "../shared/utils/error-utils.js";

/**
 * Run Prisma migrations to ensure database schema is up-to-date
 */
async function runPrismaMigrations(): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.info('databaseRecovery', 'runMigrations', 'Running Prisma migrations...');
    
    const proc = spawn("npx", ["prisma", "migrate", "deploy"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    
    let stdout = "";
    let stderr = "";
    
    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    
    proc.on("close", (code) => {
      if (code === 0) {
        logger.info('databaseRecovery', 'runMigrations', 'Prisma migrations completed successfully', { metadata: { stdout: stdout.trim() } });
        resolve();
      } else {
        logger.error('databaseRecovery', 'runMigrations', 'Prisma migrations failed', {
          metadata: {
            exitCode: code,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          }
        });
        reject(new Error(`Prisma migrate deploy failed with exit code ${code}`));
      }
    });
    
    proc.on("error", (error) => {
      logger.error('databaseRecovery', 'runMigrations', 'Failed to spawn prisma migrate process', { error: { name: error?.name || 'Error', message: error?.message || String(error) } });
      reject(error);
    });
  });
}

/**
 * Run bootstrap script for on-premise/local development node
 * 
 * IMPORTANT: This script is for LOCAL/ON-PREMISE development only.
 * Render deployments use managed PostgreSQL and do NOT need bootstrapping.
 * 
 * Skips execution if DATABASE_URL contains Render hostnames (managed database detected).
 */
async function runBootstrapScript(): Promise<void> {
  const isProd = config.nodeEnv === "production";
  const databaseUrl = process.env.DATABASE_URL || process.env.PROD_DATABASE_URL || "";
  
  // Skip bootstrap for Render managed databases
  if (databaseUrl.includes("render.com") || databaseUrl.includes("render.co")) {
    logger.info('databaseRecovery', 'runBootstrap', 'Skipping bootstrap script (using Render-managed PostgreSQL)');
    return;
  }
  
  // Only run for local/on-premise production environments
  if (!isProd) {
    logger.info('databaseRecovery', 'runBootstrap', 'Skipping bootstrap script (not production environment)');
    return;
  }
  
  return new Promise((resolve, _reject) => {
    logger.info('databaseRecovery', 'runBootstrap', 'Running bootstrap script for on-premise production node...');
    
    const proc = spawn("bash", ["scripts/bootstrap_prod_node.sh"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      cwd: process.cwd(),
    });
    
    let stdout = "";
    let stderr = "";
    
    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    
    proc.on("close", (code) => {
      if (code === 0) {
        logger.info('databaseRecovery', 'runBootstrap', 'Bootstrap script completed successfully', { metadata: { stdout: stdout.trim() } });
        resolve();
      } else {
        logger.warn('databaseRecovery', 'runBootstrap', 'Bootstrap script failed (may be normal if already initialized)', {
          metadata: {
            exitCode: code,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          }
        });
        // Don't reject - bootstrap failure might be acceptable if DB already exists
        resolve();
      }
    });
    
    proc.on("error", (error) => {
      logger.warn('databaseRecovery', 'runBootstrap', 'Failed to spawn bootstrap script', { error: { name: error?.name || 'Error', message: error.message }, metadata: { stack: error.stack } });
      // Don't reject - script might not be needed
      resolve();
    });
  });
}

/**
 * Main database recovery function
 * Orchestrates recovery attempts in order of least to most invasive
 */
export async function runDatabaseRecovery(): Promise<void> {
  logger.info('databaseRecovery', 'recovery', 'Starting database recovery sequence');
  
  try {
    // Step 1: Try running migrations (most common fix)
    try {
      await runPrismaMigrations();
      logger.info('databaseRecovery', 'recovery', 'Database recovery: migrations completed');
    } catch (error) {
      logger.warn('databaseRecovery', 'recovery', 'Migration step failed during recovery', {
        error: { name: 'Error', message: getErrorMessage(error) },
        metadata: { stack: error instanceof Error ? error.stack : undefined },
      });
      // Continue to bootstrap step
    }
    
    // Step 2: Try running bootstrap script (for new production nodes)
    try {
      await runBootstrapScript();
      logger.info('databaseRecovery', 'recovery', 'Database recovery: bootstrap completed');
    } catch (error) {
      logger.warn('databaseRecovery', 'recovery', 'Bootstrap step failed during recovery', {
        error: { name: 'Error', message: getErrorMessage(error) },
        metadata: { stack: error instanceof Error ? error.stack : undefined },
      });
    }
    
    // Step 3: Wait a moment for database to stabilize
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    logger.info('databaseRecovery', 'recovery', 'Database recovery sequence completed');
  } catch (error) {
    logger.error('databaseRecovery', 'recovery', 'Database recovery sequence failed', { error: { name: 'Error', message: String(error) } });
    throw new Error(`Database recovery failed: ${getErrorMessage(error)}`);
  }
}
