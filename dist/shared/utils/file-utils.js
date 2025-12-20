/**
 * @fileoverview File I/O utilities for common filesystem operations.
 * Centralizes patterns like fs.existsSync + fs.readFileSync + JSON.parse.
 */
import * as fs from "fs";
import * as path from "path";
/**
 * Check if a file or directory exists.
 */
export function fileExists(filePath) {
    return fs.existsSync(filePath);
}
/**
 * Ensure a directory exists, creating it recursively if needed.
 */
export function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}
/**
 * Read and parse a JSON file. Returns null if file doesn't exist or parsing fails.
 *
 * @param filePath - Path to JSON file
 * @param defaultValue - Value to return if file doesn't exist or parse fails
 * @returns Parsed JSON data or defaultValue
 */
export function readJsonFile(filePath, defaultValue = null) {
    try {
        if (!fs.existsSync(filePath)) {
            return defaultValue;
        }
        const data = fs.readFileSync(filePath, "utf8");
        return JSON.parse(data);
    }
    catch {
        return defaultValue;
    }
}
/**
 * Write data to a JSON file with formatting.
 * Creates parent directories if needed.
 *
 * @param filePath - Path to write to
 * @param data - Data to stringify
 * @param options - Options for formatting
 */
export function writeJsonFile(filePath, data, options = {}) {
    const { indent = 2, ensureDir: shouldEnsureDir = true } = options;
    if (shouldEnsureDir) {
        const dir = path.dirname(filePath);
        ensureDir(dir);
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, indent), "utf8");
}
/**
 * Read a text file. Returns null if file doesn't exist.
 *
 * @param filePath - Path to text file
 * @param defaultValue - Value to return if file doesn't exist
 * @returns File contents or defaultValue
 */
export function readTextFile(filePath, defaultValue = null) {
    try {
        if (!fs.existsSync(filePath)) {
            return defaultValue;
        }
        return fs.readFileSync(filePath, "utf8");
    }
    catch {
        return defaultValue;
    }
}
/**
 * Write text to a file.
 * Creates parent directories if needed.
 *
 * @param filePath - Path to write to
 * @param content - Text content
 * @param options - Options
 */
export function writeTextFile(filePath, content, options = {}) {
    const { ensureDir: shouldEnsureDir = true } = options;
    if (shouldEnsureDir) {
        const dir = path.dirname(filePath);
        ensureDir(dir);
    }
    fs.writeFileSync(filePath, content, "utf8");
}
/**
 * Compare two buffers for equality.
 *
 * @param a - First buffer
 * @param b - Second buffer
 * @returns True if buffers have the same contents
 */
export function buffersEqual(a, b) {
    if (!a && !b)
        return true;
    if (!a || !b)
        return false;
    if (a.length !== b.length)
        return false;
    return a.equals(b);
}
/**
 * Read a file if it exists, returning null if it doesn't.
 *
 * @param filePath - Path to read
 * @returns Buffer contents or null
 */
export function readFileIfExists(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return null;
        }
        return fs.readFileSync(filePath);
    }
    catch {
        return null;
    }
}
/**
 * Write a file only if its contents would change.
 * Useful for avoiding unnecessary file writes that trigger watchers.
 *
 * @param filePath - Path to write
 * @param content - Content to write (Buffer or string)
 * @param options - Options
 * @returns True if file was written, false if unchanged
 */
export function writeFileIfChanged(filePath, content, options = {}) {
    const { ensureDir: shouldEnsureDir = true } = options;
    const newBuffer = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    const existing = readFileIfExists(filePath);
    if (existing && buffersEqual(existing, newBuffer)) {
        return false;
    }
    if (shouldEnsureDir) {
        const dir = path.dirname(filePath);
        ensureDir(dir);
    }
    fs.writeFileSync(filePath, newBuffer);
    return true;
}
