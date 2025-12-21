/* eslint-disable no-console */
/**
 * Command Execution Library
 * 
 * Promise-based command execution with streaming support.
 * 
 * @module scripts/lib/exec
 * @since 2025-12-21
 */

import { spawn, SpawnOptions } from 'child_process';
import { ExecError } from './errors.js';
import { c } from './output.js';

// ============================================================================
// Types
// ============================================================================

export interface ExecOptions {
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: NodeJS.ProcessEnv;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Stream output to console */
  stream?: boolean;
  /** Silent mode (no output) */
  silent?: boolean;
  /** Shell to use (default: true for cross-platform) */
  shell?: boolean | string;
}

export interface ExecResult {
  /** Exit code */
  code: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Combined output */
  output: string;
}

// ============================================================================
// Exec Functions
// ============================================================================

/**
 * Execute a command and return result
 * Supports two calling patterns:
 * - exec('ls -la') - single command string
 * - exec('ls', ['-l', '-a']) - command with args array
 * - exec('ls', ['-l'], { silent: true }) - command with args and options
 */
export async function exec(
  command: string,
  argsOrOptions?: string[] | ExecOptions,
  maybeOptions?: ExecOptions
): Promise<ExecResult> {
  // Normalize arguments
  let fullCommand: string;
  let options: ExecOptions;
  
  if (Array.isArray(argsOrOptions)) {
    // exec('cmd', ['arg1', 'arg2'], options?)
    fullCommand = `${command} ${argsOrOptions.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`;
    options = maybeOptions ?? {};
  } else {
    // exec('cmd arg1 arg2', options?)
    fullCommand = command;
    options = argsOrOptions ?? {};
  }

  const {
    cwd = process.cwd(),
    env = process.env,
    timeout,
    stream = false,
    silent = false,
    shell = true,
  } = options;

  return new Promise((resolve, reject) => {
    const spawnOptions: SpawnOptions = {
      cwd,
      env,
      shell,
      stdio: stream ? 'inherit' : 'pipe',
    };

    const child = spawn(fullCommand, [], spawnOptions);

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Handle timeout
    let timeoutId: NodeJS.Timeout | undefined;
    if (timeout) {
      timeoutId = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        reject(new ExecError(`Command timed out after ${timeout}ms`, undefined, undefined, { command: fullCommand, timeout }));
      }, timeout);
    }

    // Collect output (only if not streaming)
    if (!stream && child.stdout && child.stderr) {
      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        if (!silent) {
          process.stdout.write(text);
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        if (!silent) {
          process.stderr.write(text);
        }
      });
    }

    child.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(new ExecError(`Failed to execute: ${error.message}`, undefined, undefined, { command: fullCommand }));
    });

    child.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (killed) return;

      const result: ExecResult = {
        code: code ?? 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        output: (stdout + stderr).trim(),
      };

      resolve(result);
    });
  });
}

/**
 * Execute a command silently, return only stdout
 */
export async function execQuiet(
  command: string,
  options: ExecOptions = {}
): Promise<string> {
  const result = await exec(command, { ...options, silent: true, stream: false });
  if (result.code !== 0) {
    throw new ExecError(`Command failed with code ${result.code}`, result.code, result.stderr, { command });
  }
  return result.stdout;
}

/**
 * Execute a command with streaming output (for long-running processes)
 */
export async function execStream(
  command: string,
  options: ExecOptions = {}
): Promise<number> {
  const result = await exec(command, { ...options, stream: true });
  return result.code;
}

/**
 * Execute and throw on non-zero exit
 */
export async function execStrict(
  command: string,
  options: ExecOptions = {}
): Promise<ExecResult> {
  const result = await exec(command, options);
  if (result.code !== 0) {
    throw new ExecError(
      `Command failed with exit code ${result.code}`,
      result.code,
      result.stderr,
      { command }
    );
  }
  return result;
}

/**
 * Check if a command exists
 */
export async function commandExists(command: string): Promise<boolean> {
  const checkCmd = process.platform === 'win32'
    ? `where ${command} 2>nul`
    : `which ${command} 2>/dev/null`;
  
  try {
    const result = await exec(checkCmd, { silent: true });
    return result.code === 0;
  } catch {
    return false;
  }
}

/**
 * Print command before executing (dry-run helper)
 */
export function printCommand(command: string, dryRun = false): void {
  const prefix = dryRun ? c.yellow('[DRY-RUN]') : c.cyan('$');
  console.log(`${prefix} ${c.dim(command)}`);
}

// ============================================================================
// Export Default
// ============================================================================

export default {
  exec,
  execQuiet,
  execStream,
  execStrict,
  commandExists,
  printCommand,
};
