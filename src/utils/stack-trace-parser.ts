/**
 * Advanced Stack Trace Parser
 * Purpose: Parse error stack traces into structured data for AI troubleshooting
 * 
 * Features:
 * - Extract file paths, line numbers, column numbers, function names
 * - Support for TypeScript source maps (compiled .js → original .ts)
 * - Call stack depth analysis
 * - Source code snippet extraction
 * - Call chain reconstruction
 * - Frame-by-frame error propagation tracking
 * 
 * @module utils/stack-trace-parser
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/// ---- Types ----

/**
 * Parsed stack frame with full location information
 */
export interface StackFrame {
  /** Function name (e.g., "BattleEngine.resolveTurn") */
  functionName: string | null;
  
  /** Absolute file path */
  filePath: string | null;
  
  /** Relative file path from project root */
  relativeFilePath: string | null;
  
  /** Line number in file (1-indexed) */
  lineNumber: number | null;
  
  /** Column number in line (1-indexed) */
  columnNumber: number | null;
  
  /** Whether this is TypeScript (.ts) or JavaScript (.js) */
  fileType: 'typescript' | 'javascript' | 'native' | 'unknown';
  
  /** Whether this is in node_modules */
  isNodeModule: boolean;
  
  /** Whether this is native Node.js code */
  isNative: boolean;
  
  /** Whether this is anonymous function */
  isAnonymous: boolean;
  
  /** Original raw frame string */
  raw: string;
  
  /** Source code snippet (3 lines: before, error, after) */
  sourceSnippet?: SourceSnippet;
  
  /** TypeScript source location (if available from source map) */
  tsSourceLocation?: {
    filePath: string;
    lineNumber: number;
    columnNumber: number;
  };
}

/**
 * Source code snippet around error line
 */
export interface SourceSnippet {
  /** Line before error (line N-1) */
  before: string | null;
  
  /** Error line (line N) */
  errorLine: string;
  
  /** Line after error (line N+1) */
  after: string | null;
  
  /** Line number of error line */
  lineNumber: number;
  
  /** Column where error occurred (visual marker position) */
  columnNumber: number | null;
}

/**
 * Complete parsed stack trace with metadata
 */
export interface ParsedStackTrace {
  /** Original error name (e.g., "TypeError") */
  errorName: string;
  
  /** Original error message */
  errorMessage: string;
  
  /** All parsed stack frames */
  frames: StackFrame[];
  
  /** Stack depth (number of frames) */
  depth: number;
  
  /** Top-level frame (where error occurred) */
  topFrame: StackFrame | null;
  
  /** User code frames (exclude node_modules and native) */
  userCodeFrames: StackFrame[];
  
  /** Call chain summary (function call sequence) */
  callChain: string[];
  
  /** Whether stack trace was successfully parsed */
  parsed: boolean;
  
  /** Original raw stack trace */
  rawStack: string;
}

/**
 * Error context snapshot for troubleshooting
 */
export interface ErrorContextSnapshot {
  /** When error occurred */
  timestamp: string;
  
  /** Error details */
  error: {
    name: string;
    message: string;
    fingerprint?: string;
  };
  
  /** Parsed stack trace */
  stackTrace: ParsedStackTrace;
  
  /** System state at error time */
  system: {
    nodeVersion: string;
    platform: string;
    architecture: string;
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
  };
  
  /** Environment context */
  environment: {
    cwd: string;
    execPath: string;
    execArgv: string[];
    env: Record<string, string | undefined>; // Safe subset (no secrets)
  };
  
  /** Related context (if available) */
  context?: Record<string, any>;
  
  /** AI-optimized troubleshooting hints */
  troubleshootingHints: string[];
}

/// ---- Stack Trace Parsing ----

/**
 * Parse JavaScript/Node.js stack trace into structured frames
 * Supports V8 stack trace format (used by Node.js)
 */
export function parseStackTrace(error: Error): ParsedStackTrace {
  const rawStack = error.stack ?? '';
  const lines = rawStack.split('\n');
  
  // First line is "ErrorName: error message"
  const firstLine = lines[0] ?? '';
  const errorNameMatch = firstLine.match(/^(\w+Error|\w+Exception|\w+):/);
  const errorName = errorNameMatch ? errorNameMatch[1] : error.name || 'Error';
  const errorMessage = error.message || firstLine.replace(/^\w+:\s*/, '');
  
  // Remaining lines are stack frames
  const frameLines = lines.slice(1);
  const frames: StackFrame[] = [];
  
  for (const line of frameLines) {
    const frame = parseStackFrame(line);
    if (frame) {
      frames.push(frame);
    }
  }
  
  const userCodeFrames = frames.filter(f => !f.isNodeModule && !f.isNative);
  const topFrame = frames[0] ?? null;
  
  return {
    errorName,
    errorMessage,
    frames,
    depth: frames.length,
    topFrame,
    userCodeFrames,
    callChain: frames
      .map(f => f.functionName || '<anonymous>')
      .filter(name => name !== '<anonymous>'),
    parsed: frames.length > 0,
    rawStack,
  };
}

/**
 * Parse a single stack frame line
 * V8 format: "    at functionName (file:line:column)"
 * or: "    at file:line:column"
 */
export function parseStackFrame(line: string): StackFrame | null {
  const trimmed = line.trim();
  
  // Skip empty lines
  if (!trimmed) {
    return null;
  }
  
  // Check for "at" prefix (standard V8 format)
  if (!trimmed.startsWith('at ')) {
    return null;
  }
  
  const raw = trimmed;
  const content = trimmed.substring(3); // Remove "at "
  
  // Pattern 1: "functionName (file:line:column)"
  const pattern1 = /^(.+?)\s+\((.+):(\d+):(\d+)\)$/;
  const match1 = content.match(pattern1);
  
  if (match1) {
    const [, functionName, filePath, lineStr, colStr] = match1;
    return buildStackFrame({
      functionName: functionName.trim(),
      filePath: normalizeFilePath(filePath),
      lineNumber: parseInt(lineStr, 10),
      columnNumber: parseInt(colStr, 10),
      raw,
    });
  }
  
  // Pattern 2: "file:line:column" (anonymous function)
  const pattern2 = /^(.+):(\d+):(\d+)$/;
  const match2 = content.match(pattern2);
  
  if (match2) {
    const [, filePath, lineStr, colStr] = match2;
    return buildStackFrame({
      functionName: null,
      filePath: normalizeFilePath(filePath),
      lineNumber: parseInt(lineStr, 10),
      columnNumber: parseInt(colStr, 10),
      raw,
    });
  }
  
  // Pattern 3: Native code "native"
  if (content.includes('native')) {
    return {
      functionName: content.replace(/\s*\(.*\)$/, '').trim(),
      filePath: null,
      relativeFilePath: null,
      lineNumber: null,
      columnNumber: null,
      fileType: 'native',
      isNodeModule: false,
      isNative: true,
      isAnonymous: false,
      raw,
    };
  }
  
  // Unable to parse
  return null;
}

/**
 * Build a StackFrame object from parsed components
 */
function buildStackFrame(parts: {
  functionName: string | null;
  filePath: string;
  lineNumber: number;
  columnNumber: number;
  raw: string;
}): StackFrame {
  const { functionName, filePath, lineNumber, columnNumber, raw } = parts;
  
  const isNodeModule = filePath.includes('node_modules');
  const isNative = filePath.includes('internal/') || filePath.includes('node:');
  const isAnonymous = !functionName || functionName === '<anonymous>';
  
  // Determine file type
  let fileType: StackFrame['fileType'] = 'unknown';
  if (isNative) {
    fileType = 'native';
  } else if (filePath.endsWith('.ts')) {
    fileType = 'typescript';
  } else if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
    fileType = 'javascript';
  }
  
  // Get relative path from project root
  const relativeFilePath = getRelativePath(filePath);
  
  return {
    functionName,
    filePath,
    relativeFilePath,
    lineNumber,
    columnNumber,
    fileType,
    isNodeModule,
    isNative,
    isAnonymous,
    raw,
  };
}

/**
 * Normalize file path (convert file:// URLs to absolute paths)
 */
function normalizeFilePath(filePath: string): string {
  if (filePath.startsWith('file://')) {
    return fileURLToPath(filePath);
  }
  return filePath;
}

/**
 * Get relative path from project root
 */
function getRelativePath(absolutePath: string): string | null {
  try {
    const cwd = process.cwd();
    const relative = path.relative(cwd, absolutePath);
    
    // If path goes outside project (starts with ..), return null
    if (relative.startsWith('..')) {
      return null;
    }
    
    return relative;
  } catch {
    return null;
  }
}

/// ---- Source Code Extraction ----

/**
 * Extract source code snippet around error line
 * Shows 1 line before, error line, and 1 line after
 */
export async function extractSourceSnippet(
  filePath: string,
  lineNumber: number,
  columnNumber: number | null
): Promise<SourceSnippet | null> {
  try {
    // Read file
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    
    // Validate line number
    if (lineNumber < 1 || lineNumber > lines.length) {
      return null;
    }
    
    // Get lines (convert 1-indexed to 0-indexed)
    const errorLineIndex = lineNumber - 1;
    const before = errorLineIndex > 0 ? lines[errorLineIndex - 1] : null;
    const errorLine = lines[errorLineIndex];
    const after = errorLineIndex < lines.length - 1 ? lines[errorLineIndex + 1] : null;
    
    return {
      before,
      errorLine,
      after,
      lineNumber,
      columnNumber,
    };
  } catch {
    // File not accessible (maybe in node_modules, or deleted)
    return null;
  }
}

/**
 * Enrich stack frames with source code snippets
 * Only enriches user code frames (not node_modules or native)
 */
export async function enrichStackFramesWithSource(
  frames: StackFrame[]
): Promise<StackFrame[]> {
  const enriched: StackFrame[] = [];
  
  for (const frame of frames) {
    // Skip node_modules and native code
    if (frame.isNodeModule || frame.isNative || !frame.filePath || !frame.lineNumber) {
      enriched.push(frame);
      continue;
    }
    
    // Extract source snippet
    const snippet = await extractSourceSnippet(
      frame.filePath,
      frame.lineNumber,
      frame.columnNumber
    );
    
    enriched.push({
      ...frame,
      sourceSnippet: snippet ?? undefined,
    });
  }
  
  return enriched;
}

/// ---- Error Context Snapshot ----

/**
 * Capture complete error context snapshot for AI troubleshooting
 * Includes: stack trace, system state, environment, and AI hints
 */
export async function captureErrorContextSnapshot(
  error: Error,
  context?: Record<string, any>
): Promise<ErrorContextSnapshot> {
  // Parse stack trace
  const stackTrace = parseStackTrace(error);
  
  // Enrich with source code
  const enrichedFrames = await enrichStackFramesWithSource(stackTrace.frames);
  stackTrace.frames = enrichedFrames;
  
  // Capture system state
  const memoryUsage = process.memoryUsage();
  const system = {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    memoryUsage,
    uptime: process.uptime(),
  };
  
  // Capture environment (safe subset only)
  const environment = {
    cwd: process.cwd(),
    execPath: process.execPath,
    execArgv: process.execArgv,
    env: getSafeEnvVars(),
  };
  
  // Generate AI troubleshooting hints
  const troubleshootingHints = generateTroubleshootingHints(stackTrace, system);
  
  return {
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      fingerprint: context?.fingerprint,
    },
    stackTrace,
    system,
    environment,
    context,
    troubleshootingHints,
  };
}

/**
 * Get safe subset of environment variables (exclude secrets)
 */
function getSafeEnvVars(): Record<string, string | undefined> {
  const safe: Record<string, string | undefined> = {};
  const safeKeys = [
    'NODE_ENV',
    'IS_RENDER',
    'RENDER_SERVICE_NAME',
    'SERVICE_NAME',
    'LOG_LEVEL',
    'TZ',
    'LANG',
  ];
  
  for (const key of safeKeys) {
    if (process.env[key]) {
      safe[key] = process.env[key];
    }
  }
  
  return safe;
}

/**
 * Generate AI-optimized troubleshooting hints based on error analysis
 */
function generateTroubleshootingHints(
  stackTrace: ParsedStackTrace,
  system: ErrorContextSnapshot['system']
): string[] {
  const hints: string[] = [];
  
  // Hint 1: Primary error location
  if (stackTrace.topFrame && stackTrace.topFrame.relativeFilePath) {
    hints.push(
      `Error originated in: ${stackTrace.topFrame.relativeFilePath}:${stackTrace.topFrame.lineNumber}`
    );
  }
  
  // Hint 2: Error type-specific suggestions
  if (stackTrace.errorName === 'TypeError') {
    hints.push('TypeError suggests: undefined/null access, incorrect type usage, missing property');
  } else if (stackTrace.errorName === 'ReferenceError') {
    hints.push('ReferenceError suggests: undefined variable, missing import, typo in identifier');
  } else if (stackTrace.errorName === 'RangeError') {
    hints.push('RangeError suggests: invalid array length, number out of bounds, invalid buffer size');
  } else if (stackTrace.errorName.includes('Prisma')) {
    hints.push('Prisma error: Check database connection, schema mismatches, query syntax');
  } else if (stackTrace.errorName.includes('Discord')) {
    hints.push('Discord API error: Check permissions, rate limits, token validity, API changes');
  }
  
  // Hint 3: Call chain analysis
  if (stackTrace.callChain.length > 0) {
    hints.push(`Call sequence: ${stackTrace.callChain.slice(0, 5).join(' → ')}`);
  }
  
  // Hint 4: Memory pressure check
  const heapUsedPercent = (system.memoryUsage.heapUsed / system.memoryUsage.heapTotal) * 100;
  if (heapUsedPercent > 90) {
    hints.push(`⚠️ High memory usage: ${heapUsedPercent.toFixed(1)}% heap used - possible memory leak`);
  }
  
  // Hint 5: User code frames (where to look)
  if (stackTrace.userCodeFrames.length > 0) {
    const userFiles = stackTrace.userCodeFrames
      .slice(0, 3)
      .map(f => f.relativeFilePath)
      .filter(Boolean);
    hints.push(`Review user code in: ${userFiles.join(', ')}`);
  }
  
  // Hint 6: Stack depth analysis
  if (stackTrace.depth > 50) {
    hints.push('⚠️ Deep call stack (>50 frames) - possible infinite recursion or nested loops');
  }
  
  return hints;
}

/// ---- AI-Optimized Error Report ----

/**
 * Format error context snapshot for AI consumption
 * Returns markdown-formatted report optimized for AI analysis
 */
export function formatErrorReportForAI(snapshot: ErrorContextSnapshot): string {
  const lines: string[] = [];
  
  lines.push('# 🔍 AI Error Analysis Report');
  lines.push('');
  lines.push(`**Generated:** ${snapshot.timestamp}`);
  lines.push(`**Error:** ${snapshot.error.name}: ${snapshot.error.message}`);
  if (snapshot.error.fingerprint) {
    lines.push(`**Fingerprint:** \`${snapshot.error.fingerprint}\``);
  }
  lines.push('');
  
  // Troubleshooting hints (most important - show first)
  lines.push('## 💡 Troubleshooting Hints');
  lines.push('');
  for (const hint of snapshot.troubleshootingHints) {
    lines.push(`- ${hint}`);
  }
  lines.push('');
  
  // Stack trace with source snippets
  lines.push('## 📚 Stack Trace');
  lines.push('');
  const st = snapshot.stackTrace;
  lines.push(`**Depth:** ${st.depth} frames | **User Code Frames:** ${st.userCodeFrames.length}`);
  lines.push(`**Call Chain:** ${st.callChain.slice(0, 5).join(' → ')}`);
  lines.push('');
  
  // Show top 5 frames with source snippets
  const topFrames = st.frames.slice(0, 5);
  for (let i = 0; i < topFrames.length; i++) {
    const frame = topFrames[i];
    lines.push(`### Frame ${i + 1}: ${frame.functionName || '<anonymous>'}`);
    lines.push('');
    
    if (frame.relativeFilePath) {
      lines.push(`**Location:** \`${frame.relativeFilePath}:${frame.lineNumber}:${frame.columnNumber}\``);
    } else if (frame.filePath) {
      lines.push(`**Location:** \`${frame.filePath}:${frame.lineNumber}:${frame.columnNumber}\``);
    } else {
      lines.push(`**Location:** ${frame.isNative ? 'Native code' : 'Unknown'}`);
    }
    
    if (frame.sourceSnippet) {
      lines.push('');
      lines.push('**Source:**');
      lines.push('```typescript');
      if (frame.sourceSnippet.before) {
        lines.push(`${frame.sourceSnippet.lineNumber - 1}: ${frame.sourceSnippet.before}`);
      }
      lines.push(`${frame.sourceSnippet.lineNumber}: ${frame.sourceSnippet.errorLine} <-- ERROR HERE`);
      if (frame.sourceSnippet.after) {
        lines.push(`${frame.sourceSnippet.lineNumber + 1}: ${frame.sourceSnippet.after}`);
      }
      lines.push('```');
    }
    
    lines.push('');
  }
  
  // System state
  lines.push('## 🖥️  System State');
  lines.push('');
  lines.push(`- **Node.js:** ${snapshot.system.nodeVersion}`);
  lines.push(`- **Platform:** ${snapshot.system.platform} (${snapshot.system.architecture})`);
  lines.push(`- **Uptime:** ${Math.floor(snapshot.system.uptime)}s`);
  lines.push(`- **Memory:** RSS ${formatBytes(snapshot.system.memoryUsage.rss)} | Heap ${formatBytes(snapshot.system.memoryUsage.heapUsed)}/${formatBytes(snapshot.system.memoryUsage.heapTotal)}`);
  lines.push('');
  
  // Environment
  lines.push('## 🌍 Environment');
  lines.push('');
  lines.push(`- **Working Directory:** \`${snapshot.environment.cwd}\``);
  lines.push(`- **Node Binary:** \`${snapshot.environment.execPath}\``);
  if (Object.keys(snapshot.environment.env).length > 0) {
    lines.push(`- **Environment Variables:**`);
    for (const [key, value] of Object.entries(snapshot.environment.env)) {
      lines.push(`  - \`${key}\` = \`${value}\``);
    }
  }
  lines.push('');
  
  // Additional context
  if (snapshot.context && Object.keys(snapshot.context).length > 0) {
    lines.push('## 📝 Additional Context');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(snapshot.context, null, 2));
    lines.push('```');
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Format bytes into human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
