/**
 * Shared file system utilities
 * Centralized helpers for file operations to avoid duplication across scripts
 */

import { promises as fs } from "node:fs";

/**
 * Compare two buffers for equality (length + content)
 * @param a - First buffer
 * @param b - Second buffer
 * @returns true if buffers are identical, false otherwise
 */
export function buffersEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && a.equals(b);
}

/**
 * Read a file if it exists, returning null if not found
 * @param filePath - Path to the file
 * @returns Buffer content or null if file doesn't exist
 * @throws Error for any error other than ENOENT
 */
export async function readFileIfExists(filePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * Write file only if content has changed (avoids unnecessary writes)
 * @param filePath - Path to the file
 * @param data - Content to write (string or Buffer)
 * @returns true if file was written, false if unchanged
 */
export async function writeFileIfChanged(filePath: string, data: string | Buffer): Promise<boolean> {
  const buffer = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  const existing = await readFileIfExists(filePath);
  if (existing && buffersEqual(existing, buffer)) {
    return false; // No change, skip write
  }
  await fs.writeFile(filePath, buffer);
  return true; // File was written
}

/**
 * Ensure a directory exists (creates if missing)
 * @param dirPath - Path to the directory
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Read JSON file with type safety
 * @param filePath - Path to JSON file
 * @returns Parsed JSON content
 * @throws Error if file doesn't exist or JSON is invalid
 */
export async function readJsonFile<T = unknown>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

/**
 * Write JSON file with formatting
 * @param filePath - Path to JSON file
 * @param data - Data to serialize
 * @param indent - Indentation spaces (default: 2)
 */
export async function writeJsonFile(filePath: string, data: unknown, indent = 2): Promise<void> {
  const content = JSON.stringify(data, null, indent);
  await fs.writeFile(filePath, content, "utf8");
}
