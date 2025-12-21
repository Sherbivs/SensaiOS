/* eslint-disable no-console */
/**
 * Progress Indicators Library
 * 
 * Spinners and progress bars for long-running operations.
 * 
 * @module scripts/lib/progress
 * @since 2025-12-21
 */

import { c } from './output.js';

// ============================================================================
// Types
// ============================================================================

export interface SpinnerOptions {
  /** Spinner text */
  text?: string;
  /** Spinner frames */
  frames?: string[];
  /** Frame interval in ms */
  interval?: number;
}

export interface ProgressBarOptions {
  /** Total steps */
  total: number;
  /** Bar width in characters */
  width?: number;
  /** Show percentage */
  showPercent?: boolean;
  /** Show count */
  showCount?: boolean;
}

export interface Spinner {
  /** Update spinner text */
  text: (text: string) => void;
  /** Stop with success message */
  success: (text?: string) => void;
  /** Stop with error message */
  error: (text?: string) => void;
  /** Stop with warning message */
  warn: (text?: string) => void;
  /** Stop spinner */
  stop: () => void;
}

export interface ProgressBar {
  /** Update progress */
  update: (current: number, text?: string) => void;
  /** Increment by 1 */
  tick: (text?: string) => void;
  /** Complete the progress bar */
  complete: (text?: string) => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const DEFAULT_INTERVAL = 80;
const DEFAULT_BAR_WIDTH = 30;

// ============================================================================
// Spinner
// ============================================================================

/**
 * Create an animated spinner
 */
export function createSpinner(options: SpinnerOptions = {}): Spinner {
  const {
    text: initialText = '',
    frames = DEFAULT_FRAMES,
    interval = DEFAULT_INTERVAL,
  } = options;

  let currentText = initialText;
  let frameIndex = 0;
  let intervalId: NodeJS.Timeout | null = null;
  let stopped = false;

  // Check if stdout supports clearing
  const canAnimate = process.stdout.isTTY && !process.env.CI;

  const render = () => {
    if (stopped) return;
    const frame = frames[frameIndex];
    frameIndex = (frameIndex + 1) % frames.length;
    
    if (canAnimate) {
      process.stdout.clearLine?.(0);
      process.stdout.cursorTo?.(0);
      process.stdout.write(`${c.cyan(frame)} ${currentText}`);
    }
  };

  // Start spinning
  if (canAnimate) {
    intervalId = setInterval(render, interval);
    render();
  } else {
    // Non-TTY: just print once
    console.log(`... ${currentText}`);
  }

  const stop = () => {
    stopped = true;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (canAnimate) {
      process.stdout.clearLine?.(0);
      process.stdout.cursorTo?.(0);
    }
  };

  return {
    text: (text: string) => {
      currentText = text;
      if (!canAnimate) {
        console.log(`... ${text}`);
      }
    },

    success: (text?: string) => {
      stop();
      console.log(`${c.green('✓')} ${text ?? currentText}`);
    },

    error: (text?: string) => {
      stop();
      console.log(`${c.red('✗')} ${text ?? currentText}`);
    },

    warn: (text?: string) => {
      stop();
      console.log(`${c.yellow('⚠')} ${text ?? currentText}`);
    },

    stop,
  };
}

/**
 * Simple spinner that auto-stops
 */
export async function withSpinner<T>(
  text: string,
  fn: () => Promise<T>
): Promise<T> {
  const spinner = createSpinner({ text });
  try {
    const result = await fn();
    spinner.success();
    return result;
  } catch (error) {
    spinner.error();
    throw error;
  }
}

// ============================================================================
// Progress Bar
// ============================================================================

/**
 * Create a progress bar
 */
export function createProgressBar(options: ProgressBarOptions): ProgressBar {
  const {
    total,
    width = DEFAULT_BAR_WIDTH,
    showPercent = true,
    showCount = true,
  } = options;

  let current = 0;
  let currentText = '';

  // Check if stdout supports clearing
  const canAnimate = process.stdout.isTTY && !process.env.CI;

  const render = () => {
    const percent = Math.min(100, Math.round((current / total) * 100));
    const filled = Math.round((current / total) * width);
    const empty = width - filled;

    const bar = c.green('█'.repeat(filled)) + c.gray('░'.repeat(empty));
    const parts: string[] = [bar];

    if (showPercent) {
      parts.push(c.cyan(`${percent.toString().padStart(3)}%`));
    }

    if (showCount) {
      parts.push(c.gray(`(${current}/${total})`));
    }

    if (currentText) {
      parts.push(currentText);
    }

    const line = parts.join(' ');

    if (canAnimate) {
      process.stdout.clearLine?.(0);
      process.stdout.cursorTo?.(0);
      process.stdout.write(line);
    } else if (percent % 25 === 0 || current === total) {
      // Non-TTY: print at 0%, 25%, 50%, 75%, 100%
      console.log(line);
    }
  };

  render();

  return {
    update: (value: number, text?: string) => {
      current = Math.min(value, total);
      if (text !== undefined) currentText = text;
      render();
    },

    tick: (text?: string) => {
      current = Math.min(current + 1, total);
      if (text !== undefined) currentText = text;
      render();
    },

    complete: (text?: string) => {
      current = total;
      if (text !== undefined) currentText = text;
      render();
      if (canAnimate) {
        console.log(); // New line after completion
      }
    },
  };
}

// ============================================================================
// Step Counter
// ============================================================================

/**
 * Create a step counter for multi-step operations
 */
export function createSteps(totalSteps: number): {
  step: (text: string) => void;
  current: () => number;
} {
  let currentStep = 0;

  return {
    step: (text: string) => {
      currentStep++;
      console.log(c.cyan(`[${currentStep}/${totalSteps}]`) + ` ${text}`);
    },
    current: () => currentStep,
  };
}

// ============================================================================
// Timer
// ============================================================================

/**
 * Create a timer for measuring duration
 */
export function createTimer(): {
  elapsed: () => number;
  format: () => string;
} {
  const start = Date.now();

  return {
    elapsed: () => Date.now() - start,
    format: () => {
      const ms = Date.now() - start;
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
      const mins = Math.floor(ms / 60000);
      const secs = ((ms % 60000) / 1000).toFixed(0);
      return `${mins}m ${secs}s`;
    },
  };
}

// ============================================================================
// Export Default
// ============================================================================

export default {
  createSpinner,
  withSpinner,
  createProgressBar,
  createSteps,
  createTimer,
};
