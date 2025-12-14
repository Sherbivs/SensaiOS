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
