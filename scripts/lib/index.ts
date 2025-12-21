/**
 * Scripts Library - Barrel Export
 * 
 * Centralized exports for all shared utilities used by scripts.
 * Import from this module for convenient access to all utilities.
 * 
 * @example
 * ```ts
 * import { c, printSection, exec, requireEnv, readJson } from '../lib/index.js';
 * ```
 * 
 * @module scripts/lib
 * @since 2025-12-21
 */

// ============================================================================
// Output Utilities
// ============================================================================

export {
  // Colors
  c,
  colors,
  
  // Print functions
  printSection,
  printSubsection,
  printKeyValue,
  printList,
  printNumberedList,
  printTable,
  printRule,
  printBlank,
  
  // Status messages
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printDebug,
  
  // Types
  type PrintOptions,
  type TableOptions,
  type KeyValueOptions,
} from './output.js';

// ============================================================================
// Error Handling
// ============================================================================

export {
  // Error classes
  ScriptError,
  EnvError,
  SSHError,
  ExecError,
  FileError,
  ValidationError,
  
  // Handlers
  handleError,
  withErrorBoundary,
  
  // Utilities
  formatError,
  assert,
  warn,
} from './errors.js';

// ============================================================================
// Command Execution
// ============================================================================

export {
  // Execute functions
  exec,
  execQuiet,
  execStream,
  execStrict,
  
  // Utilities
  commandExists,
  printCommand,
  
  // Types
  type ExecOptions,
  type ExecResult,
} from './exec.js';

// ============================================================================
// Environment Variables
// ============================================================================

export {
  // Load functions
  loadEnv,
  
  // Get functions
  requireEnv,
  getEnv,
  
  // Discovery
  findEnvFile,
  
  // Environment checks
  isProduction,
  isRender,
  getProjectRoot,
  
  // Types
  type EnvOptions,
} from './env.js';

// ============================================================================
// File System
// ============================================================================

export {
  // Check functions
  exists,
  isFile,
  isDirectory,
  
  // Read functions
  readText,
  readJson,
  readTextSafe,
  readJsonSafe,
  
  // Write functions
  writeText,
  writeJson,
  
  // Directory functions
  ensureDir,
  deleteFile,
  deleteDir,
  listFiles,
  
  // Path utilities (re-exported from path module)
  relativePath,
  join as joinPath,
  resolve as resolvePath,
  dirname,
  basename,
  extname,
  
  // Types
  type WriteOptions,
  type GlobOptions,
} from './fs.js';

// ============================================================================
// SSH Utilities
// ============================================================================

export {
  // Run functions
  runSSH,
  sshExec,
  sshInteractive,
  
  // Test functions
  testSSH,
  hasWSL,
  hasNativeSSH,
  isWindows,
  
  // Builders
  buildSSHCommand,
  
  // Info
  getSSHInfo,
  getRenderServiceId,
  
  // Render shortcuts
  renderSSH,
  renderSSHInteractive,
  
  // Types
  type SSHOptions,
  type SSHResult,
} from './ssh.js';

// ============================================================================
// CLI Framework
// ============================================================================

export {
  // Main entry point
  createCLI,
  
  // Parsing
  parseArgs,
  
  // Help generation
  generateHelp,
  generateCommandHelp,
  
  // Single command runner
  runSingle,
  
  // Types
  type CommandDef,
  type FlagDef,
  type ArgDef,
  type CommandContext,
  type CLIOptions,
} from './cli.js';

// ============================================================================
// Progress Indicators
// ============================================================================

export {
  // Spinner
  createSpinner,
  
  // Progress bar
  createProgressBar,
  
  // Steps
  createSteps,
  
  // Timer
  createTimer,
  
  // Types
  type Spinner,
  type SpinnerOptions,
  type ProgressBar,
  type ProgressBarOptions,
} from './progress.js';

// ============================================================================
// Re-export defaults for convenience
// ============================================================================

import output from './output.js';
import errors from './errors.js';
import exec from './exec.js';
import env from './env.js';
import fs from './fs.js';
import ssh from './ssh.js';
import cli from './cli.js';
import progress from './progress.js';

/**
 * Namespace exports for module-level access
 */
export const lib = {
  output,
  errors,
  exec,
  env,
  fs,
  ssh,
  cli,
  progress,
} as const;

export default lib;
