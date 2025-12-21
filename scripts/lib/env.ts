/**
 * Environment Loading Library
 * 
 * Unified environment variable loading with validation.
 * 
 * @module scripts/lib/env
 * @since 2025-12-21
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { EnvError } from './errors.js';
import { printInfo, printWarning, c } from './output.js';

// ============================================================================
// Types
// ============================================================================

export interface EnvOptions {
  /** Path to .env file (auto-detected if not provided) */
  path?: string;
  /** Required environment variables */
  required?: string[];
  /** Print loaded variables */
  verbose?: boolean;
  /** Override existing env vars */
  override?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_ENV_PATHS = [
  // External secure location (recommended)
  process.env.IG_ENV_FILE,
  'secrets/Infinity-Gauntlet.env',
  // Fallback locations
  '.env',
  '../.env',
];

// ============================================================================
// Functions
// ============================================================================

/**
 * Find the first existing env file from default paths
 */
export function findEnvFile(): string | null {
  for (const envPath of DEFAULT_ENV_PATHS) {
    if (!envPath) continue;
    const resolved = resolve(envPath);
    if (existsSync(resolved)) {
      return resolved;
    }
  }
  return null;
}

/**
 * Parse a .env file content into key-value pairs
 */
export function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    // Skip comments and empty lines
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Parse KEY=VALUE
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

/**
 * Load environment variables from .env file
 */
export function loadEnv(options: EnvOptions = {}): Record<string, string> {
  const {
    path: envPath,
    required = [],
    verbose = false,
    override = false,
  } = options;

  // Find env file
  const filePath = envPath ? resolve(envPath) : findEnvFile();
  
  if (!filePath) {
    if (required.length > 0) {
      throw new EnvError('No .env file found and required variables specified', {
        searched: DEFAULT_ENV_PATHS.filter(Boolean),
      });
    }
    if (verbose) {
      printWarning('No .env file found, using process.env only');
    }
    return {};
  }

  if (!existsSync(filePath)) {
    throw new EnvError(`Environment file not found: ${filePath}`);
  }

  // Load and parse
  const content = readFileSync(filePath, 'utf-8');
  const parsed = parseEnvFile(content);

  // Apply to process.env
  let loadedCount = 0;
  for (const [key, value] of Object.entries(parsed)) {
    if (override || !process.env[key]) {
      process.env[key] = value;
      loadedCount++;
    }
  }

  if (verbose) {
    printInfo(`Loaded ${loadedCount} variables from ${c.cyan(filePath)}`);
  }

  // Validate required
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new EnvError(`Missing required environment variables: ${missing.join(', ')}`, {
      missing,
      file: filePath,
    });
  }

  return parsed;
}

/**
 * Get an environment variable, throw if not set
 */
export function requireEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new EnvError(`Required environment variable not set: ${key}`, { key });
  }
  return value;
}

/**
 * Get an environment variable with optional default
 */
export function getEnv(key: string, defaultValue = ''): string {
  return process.env[key] ?? defaultValue;
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' || 
         process.env.RENDER === '1' ||
         !!process.env.RENDER_SERVICE_ID;
}

/**
 * Check if running on Render
 */
export function isRender(): boolean {
  return !!process.env.RENDER || !!process.env.RENDER_SERVICE_ID;
}

/**
 * Get project root directory
 */
export function getProjectRoot(): string {
  // Check common indicators
  const markers = ['package.json', 'tsconfig.json', '.git'];
  let dir = process.cwd();
  
  while (dir !== resolve(dir, '..')) {
    for (const marker of markers) {
      if (existsSync(join(dir, marker))) {
        return dir;
      }
    }
    dir = resolve(dir, '..');
  }
  
  return process.cwd();
}

// ============================================================================
// Export Default
// ============================================================================

export default {
  findEnvFile,
  parseEnvFile,
  loadEnv,
  requireEnv,
  getEnv,
  isProduction,
  isRender,
  getProjectRoot,
};
