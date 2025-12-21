/**
 * SSH Helpers Library
 * 
 * Cross-platform SSH with WSL fallback for Windows.
 * Designed for Render SSH access per SSH-ONLY policy.
 * 
 * @module scripts/lib/ssh
 * @since 2025-12-21
 */

import { exec, commandExists, printCommand } from './exec.js';
import { SSHError } from './errors.js';
import { printInfo, c } from './output.js';

// ============================================================================
// Types
// ============================================================================

export interface SSHOptions {
  /** SSH host alias (default: render-virginia) */
  host?: string;
  /** Interactive TTY mode */
  interactive?: boolean;
  /** Connection timeout in seconds */
  timeout?: number;
  /** Dry run mode */
  dryRun?: boolean;
  /** Silent mode */
  silent?: boolean;
}

export interface SSHResult {
  /** Exit code */
  code: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Success flag (code === 0) */
  success: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_HOST = 'render-virginia';
const DEFAULT_TIMEOUT = 30;

// ============================================================================
// Platform Detection
// ============================================================================

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Check if WSL is available
 */
export async function hasWSL(): Promise<boolean> {
  if (!isWindows()) return false;
  return commandExists('wsl');
}

/**
 * Check if native SSH is available
 */
export async function hasNativeSSH(): Promise<boolean> {
  return commandExists('ssh');
}

// ============================================================================
// SSH Functions
// ============================================================================

/**
 * Build SSH command for the platform
 */
export async function buildSSHCommand(
  command: string,
  options: SSHOptions = {}
): Promise<string> {
  const {
    host = DEFAULT_HOST,
    interactive = false,
    timeout = DEFAULT_TIMEOUT,
  } = options;

  const flags: string[] = [];
  
  if (interactive) {
    flags.push('-t');
  }
  
  if (timeout) {
    flags.push(`-o ConnectTimeout=${timeout}`);
  }

  const flagStr = flags.length > 0 ? flags.join(' ') + ' ' : '';
  const sshCmd = command
    ? `ssh ${flagStr}${host} "${command.replace(/"/g, '\\"')}"`
    : `ssh ${flagStr}${host}`;

  // On Windows, wrap in WSL if needed
  if (isWindows()) {
    const hasWsl = await hasWSL();
    const hasNative = await hasNativeSSH();

    if (hasNative) {
      // Windows has native SSH (Windows 10+)
      return sshCmd;
    } else if (hasWsl) {
      // Use WSL wrapper
      return `wsl bash -c '${sshCmd.replace(/'/g, "'\\''")}'`;
    } else {
      throw new SSHError('No SSH client available. Install OpenSSH or WSL.', {
        platform: 'win32',
        hasWSL: hasWsl,
        hasNativeSSH: hasNative,
      });
    }
  }

  return sshCmd;
}

/**
 * Execute SSH command on remote host
 */
export async function runSSH(
  command: string,
  options: SSHOptions = {}
): Promise<SSHResult> {
  const { dryRun = false, silent = false } = options;

  const sshCmd = await buildSSHCommand(command, options);

  if (dryRun) {
    printCommand(sshCmd, true);
    return { code: 0, stdout: '', stderr: '', success: true };
  }

  if (!silent) {
    printCommand(sshCmd);
  }

  try {
    const result = await exec(sshCmd, { silent });
    return {
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      success: result.code === 0,
    };
  } catch (error) {
    throw new SSHError(
      `SSH command failed: ${error instanceof Error ? error.message : String(error)}`,
      { command, host: options.host ?? DEFAULT_HOST }
    );
  }
}

/**
 * Execute SSH command and return stdout only
 */
export async function sshExec(
  command: string,
  options: SSHOptions = {}
): Promise<string> {
  const result = await runSSH(command, { ...options, silent: true });
  
  if (result.code !== 0) {
    throw new SSHError(
      `SSH command failed with code ${result.code}: ${result.stderr}`,
      { command, exitCode: result.code }
    );
  }
  
  return result.stdout;
}

/**
 * Start interactive SSH session
 */
export async function sshInteractive(options: SSHOptions = {}): Promise<number> {
  const sshCmd = await buildSSHCommand('', { ...options, interactive: true });
  
  printInfo(`Starting interactive SSH session to ${c.cyan(options.host ?? DEFAULT_HOST)}`);
  printCommand(sshCmd);
  
  const result = await exec(sshCmd, { stream: true });
  return result.code;
}

/**
 * Test SSH connection
 */
export async function testSSH(options: SSHOptions = {}): Promise<boolean> {
  try {
    const result = await runSSH('echo "connected"', { ...options, silent: true });
    return result.code === 0 && result.stdout.includes('connected');
  } catch {
    return false;
  }
}

/**
 * Get SSH connection info
 */
export async function getSSHInfo(): Promise<{
  platform: string;
  hasNativeSSH: boolean;
  hasWSL: boolean;
  method: 'native' | 'wsl' | 'none';
}> {
  const hasNative = await hasNativeSSH();
  const hasWsl = isWindows() ? await hasWSL() : false;

  let method: 'native' | 'wsl' | 'none' = 'none';
  if (hasNative) {
    method = 'native';
  } else if (hasWsl) {
    method = 'wsl';
  }

  return {
    platform: process.platform,
    hasNativeSSH: hasNative,
    hasWSL: hasWsl,
    method,
  };
}

// ============================================================================
// Render-Specific Helpers
// ============================================================================

/**
 * Get Render service ID from environment
 */
export function getRenderServiceId(): string {
  return process.env.RENDER_SERVICE_ID ?? 'srv-d3snk2ndiees73cn709g';
}

/**
 * SSH to Render and run command
 */
export async function renderSSH(
  command: string,
  options: Omit<SSHOptions, 'host'> = {}
): Promise<SSHResult> {
  return runSSH(command, { ...options, host: DEFAULT_HOST });
}

/**
 * SSH to Render interactively
 */
export async function renderSSHInteractive(): Promise<number> {
  return sshInteractive({ host: DEFAULT_HOST });
}

// ============================================================================
// Export Default
// ============================================================================

export default {
  isWindows,
  hasWSL,
  hasNativeSSH,
  buildSSHCommand,
  runSSH,
  sshExec,
  sshInteractive,
  testSSH,
  getSSHInfo,
  getRenderServiceId,
  renderSSH,
  renderSSHInteractive,
};
