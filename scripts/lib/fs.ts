/**
 * File System Helpers Library
 * 
 * JSON read/write, file existence, path utilities.
 * 
 * @module scripts/lib/fs
 * @since 2025-12-21
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  rmSync,
} from 'fs';
import { dirname, resolve, join, relative, basename, extname } from 'path';
import { FileError } from './errors.js';

// ============================================================================
// Types
// ============================================================================

export interface WriteOptions {
  /** Create parent directories if needed */
  mkdir?: boolean;
  /** Pretty print JSON */
  pretty?: boolean;
}

export interface GlobOptions {
  /** Include directories */
  directories?: boolean;
  /** Include files */
  files?: boolean;
  /** Recursive search */
  recursive?: boolean;
  /** File extensions to match */
  extensions?: string[];
}

// ============================================================================
// Existence Checks
// ============================================================================

/**
 * Check if path exists
 */
export function exists(path: string): boolean {
  return existsSync(resolve(path));
}

/**
 * Check if path is a file
 */
export function isFile(path: string): boolean {
  try {
    return statSync(resolve(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Check if path is a directory
 */
export function isDirectory(path: string): boolean {
  try {
    return statSync(resolve(path)).isDirectory();
  } catch {
    return false;
  }
}

// ============================================================================
// Read Functions
// ============================================================================

/**
 * Read a file as string
 */
export function readText(path: string): string {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    throw new FileError(`File not found: ${path}`, resolved);
  }
  return readFileSync(resolved, 'utf-8');
}

/**
 * Read and parse JSON file
 */
export function readJson<T = unknown>(path: string): T {
  const content = readText(path);
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new FileError(
      `Invalid JSON in file: ${path}`,
      resolve(path),
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Read file, return null if not exists
 */
export function readTextSafe(path: string): string | null {
  try {
    return readText(path);
  } catch {
    return null;
  }
}

/**
 * Read JSON, return null if not exists or invalid
 */
export function readJsonSafe<T = unknown>(path: string): T | null {
  try {
    return readJson<T>(path);
  } catch {
    return null;
  }
}

// ============================================================================
// Write Functions
// ============================================================================

/**
 * Write string to file
 */
export function writeText(path: string, content: string, options: WriteOptions = {}): void {
  const resolved = resolve(path);
  
  if (options.mkdir) {
    mkdirSync(dirname(resolved), { recursive: true });
  }
  
  writeFileSync(resolved, content, 'utf-8');
}

/**
 * Write object as JSON to file
 */
export function writeJson(path: string, data: unknown, options: WriteOptions = {}): void {
  const content = options.pretty
    ? JSON.stringify(data, null, 2)
    : JSON.stringify(data);
  writeText(path, content + '\n', options);
}

/**
 * Ensure directory exists
 */
export function ensureDir(path: string): void {
  mkdirSync(resolve(path), { recursive: true });
}

// ============================================================================
// Delete Functions
// ============================================================================

/**
 * Delete a file
 */
export function deleteFile(path: string): boolean {
  try {
    unlinkSync(resolve(path));
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a directory recursively
 */
export function deleteDir(path: string): boolean {
  try {
    rmSync(resolve(path), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// List Functions
// ============================================================================

/**
 * List files in a directory
 */
export function listFiles(dir: string, options: GlobOptions = {}): string[] {
  const {
    directories = false,
    files = true,
    recursive = false,
    extensions,
  } = options;

  const resolved = resolve(dir);
  if (!isDirectory(resolved)) {
    return [];
  }

  const results: string[] = [];
  const entries = readdirSync(resolved, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(resolved, entry.name);

    if (entry.isDirectory()) {
      if (directories) {
        results.push(fullPath);
      }
      if (recursive) {
        results.push(...listFiles(fullPath, options));
      }
    } else if (entry.isFile() && files) {
      if (extensions) {
        const ext = extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          results.push(fullPath);
        }
      } else {
        results.push(fullPath);
      }
    }
  }

  return results;
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Get relative path from project root
 */
export function relativePath(path: string, from?: string): string {
  return relative(from ?? process.cwd(), resolve(path));
}

/**
 * Join paths
 */
export { join, resolve, dirname, basename, extname };

// ============================================================================
// Export Default
// ============================================================================

export default {
  exists,
  isFile,
  isDirectory,
  readText,
  readJson,
  readTextSafe,
  readJsonSafe,
  writeText,
  writeJson,
  ensureDir,
  deleteFile,
  deleteDir,
  listFiles,
  relativePath,
  join,
  resolve,
  dirname,
  basename,
  extname,
};
