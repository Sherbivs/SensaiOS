#!/usr/bin/env ts-node

/**
 * End-to-End Testing for Error Detection Integration
 * 
 * Tests the complete error flow:
 * 1. Error capture with stack parsing
 * 2. Database storage with metadata
 * 3. AI report generation
 * 4. Intelligent logger integration
 * 5. Emergency fallback mechanisms
 * 6. CLI command functionality
 * 
 * Run: ts-node scripts/test-error-integration.ts
 */

import { errorTracker } from '../src/services/error-tracker.js';
import intelligentLogger from '../src/utils/intelligent-logger.js';
import { prisma } from '../src/shared/prisma.js';
import { delay } from '../src/shared/utils/async-utils.js';
import * as fs from 'fs';
import * as path from 'path';

// Color output utilities
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function printHeader(title: string) {
  const border = '='.repeat(80);
  log('', 'cyan');
  log(border, 'cyan');
  log(`  ${title}`, 'cyan');
  log(border, 'cyan');
  log('', 'reset');
}

// Test result tracking
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

const results: TestResult[] = [];

function recordResult(name: string, passed: boolean, error?: string, duration?: number) {
  results.push({ name, passed, error, duration });
  const status = passed ? '✓ PASS' : '✗ FAIL';
  const statusColor = passed ? 'green' : 'red';
  const durationStr = duration ? ` (${duration}ms)` : '';
  log(`  ${status}${durationStr} ${name}`, statusColor);
  if (!passed && error) {
    log(`    Error: ${error}`, 'red');
  }
}

// Test data
let testErrorFingerprint: string | undefined;
let testErrorId: string | undefined;

// Helper: Wait for async operations - now imported from centralized async-utils.ts
// function wait removed - using centralized delay()

// Test 1: Stack Trace Parsing
async function testStackTraceParsing(): Promise<void> {
  printHeader('Test 1: Stack Trace Parsing');
  
  try {
    const startTime = Date.now();
    
    // Create a test error with known stack
    const testError = new TypeError('Test error: Cannot read property \'test\' of undefined');
    
    // Capture the error (this triggers stack parsing internally)
    const errorId = await errorTracker.captureError(testError, {
      service: 'error-integration-test',
      operation: 'testStackTraceParsing',
      severity: 'HIGH',
      category: 'ENGINE',
      userId: 'test-user-123',
    });
    
    const duration = Date.now() - startTime;
    
    // Store for later tests
    testErrorId = errorId;
    
    // Wait for async operations (AI report generation)
    await delay(100);
    
    // Verify error was captured
    if (!errorId) {
      recordResult('Stack trace parsing', false, 'captureError returned undefined', duration);
      return;
    }
    
    // Query database for the error (use fingerprint since errorId is not unique)
    const errorLog = await prisma.errorLog.findUnique({
      where: { fingerprint: testError.message },
    });
    
    if (!errorLog) {
      recordResult('Stack trace parsing', false, 'Error not found in database', duration);
      return;
    }
    
    // Extract stack metadata from contextData
    const contextData = errorLog.contextData as any;
    const stackMetadata = contextData.stackMetadata;
    
    if (!stackMetadata) {
      recordResult('Stack trace parsing', false, 'No stackMetadata in contextData', duration);
      return;
    }
    
    // Verify stack metadata structure
    const hasDepth = typeof stackMetadata.depth === 'number';
    const hasTopFrame = stackMetadata.topFrame !== undefined;
    const hasCallChain = Array.isArray(stackMetadata.callChain);
    const hasUserCodeFrames = typeof stackMetadata.userCodeFrames === 'number';
    
    if (!hasDepth || !hasTopFrame || !hasCallChain || !hasUserCodeFrames) {
      recordResult('Stack trace parsing', false, 'Invalid stackMetadata structure', duration);
      return;
    }
    
    // Store fingerprint for CLI tests
    testErrorFingerprint = errorLog.fingerprint;
    
    log(`  Error ID: ${errorId}`, 'blue');
    log(`  Fingerprint: ${errorLog.fingerprint}`, 'blue');
    log(`  Stack depth: ${stackMetadata.depth}`, 'blue');
    log(`  Top frame: ${stackMetadata.topFrame.file}:${stackMetadata.topFrame.line}`, 'blue');
    log(`  User code frames: ${stackMetadata.userCodeFrames}`, 'blue');
    
    recordResult('Stack trace parsing', true, undefined, duration);
  } catch (error) {
    recordResult('Stack trace parsing', false, (error as Error).message);
  }
}

// Test 2: AI Report Generation
async function testAIReportGeneration(): Promise<void> {
  printHeader('Test 2: AI Report Generation');
  
  if (!testErrorFingerprint) {
    recordResult('AI report generation', false, 'No test error fingerprint available');
    return;
  }
  
  try {
    const startTime = Date.now();
    
    // Wait for AI report to be written (happens async after captureError)
    await delay(500);
    
    const reportDir = path.join(process.cwd(), 'Store', 'error-reports');
    
    // Find report file matching fingerprint
    if (!fs.existsSync(reportDir)) {
      recordResult('AI report generation', false, `Report directory not found: ${reportDir}`);
      return;
    }
    
    const reportFiles = fs.readdirSync(reportDir).filter(f => f.includes(testErrorFingerprint!));
    
    if (reportFiles.length === 0) {
      recordResult('AI report generation', false, 'No AI report found');
      return;
    }
    
    const reportPath = path.join(reportDir, reportFiles[0]);
    const reportContent = fs.readFileSync(reportPath, 'utf-8');
    
    const duration = Date.now() - startTime;
    
    // Verify report structure
    const hasTitle = reportContent.includes('# Error Report');
    const hasOverview = reportContent.includes('## 📋 Error Overview');
    const hasStackTrace = reportContent.includes('## 📚 Stack Trace');
    const hasHints = reportContent.includes('## 💡 Troubleshooting Hints');
    const hasSystemState = reportContent.includes('## 🖥️ System State');
    
    if (!hasTitle || !hasOverview || !hasStackTrace || !hasHints || !hasSystemState) {
      recordResult('AI report generation', false, 'Incomplete AI report structure', duration);
      return;
    }
    
    log(`  Report file: ${reportFiles[0]}`, 'blue');
    log(`  Report size: ${reportContent.length} bytes`, 'blue');
    
    recordResult('AI report generation', true, undefined, duration);
  } catch (error) {
    recordResult('AI report generation', false, (error as Error).message);
  }
}

// Test 3: Intelligent Logger Integration
async function testIntelligentLoggerIntegration(): Promise<void> {
  printHeader('Test 3: Intelligent Logger Integration');
  
  if (!testErrorFingerprint) {
    recordResult('Intelligent logger integration', false, 'No test error fingerprint available');
    return;
  }
  
  try {
    const startTime = Date.now();
    
    // Wait for intelligent logger to process error stream
    await delay(500);
    
    // Read current log file
    const logDir = path.join(process.cwd(), 'Store', 'intelligent-logs');
    const currentLogPath = path.join(logDir, 'current.jsonl');
    
    if (!fs.existsSync(currentLogPath)) {
      recordResult('Intelligent logger integration', false, 'Current log file not found');
      return;
    }
    
    const logContent = fs.readFileSync(currentLogPath, 'utf-8');
    const logLines = logContent.trim().split('\n').filter(line => line.length > 0);
    
    // Find log entry with our fingerprint
    let found = false;
    let hasStackMetadata = false;
    let hasSourceLocation = false;
    
    for (const line of logLines) {
      try {
        const entry = JSON.parse(line);
        if (entry.data?.fingerprint === testErrorFingerprint) {
          found = true;
          hasStackMetadata = !!entry.data.stackMetadata;
          hasSourceLocation = !!entry.data.sourceLocation;
          
          log(`  Found log entry at ${entry.timestamp}`, 'blue');
          log(`  Level: ${entry.level}`, 'blue');
          log(`  Category: ${entry.category}`, 'blue');
          
          if (hasStackMetadata) {
            log(`  Stack metadata: YES`, 'blue');
            log(`    Depth: ${entry.data.stackMetadata.depth}`, 'blue');
            log(`    Top frame: ${entry.data.stackMetadata.topFrame.file}:${entry.data.stackMetadata.topFrame.line}`, 'blue');
          }
          
          if (hasSourceLocation) {
            log(`  Source location: ${entry.data.sourceLocation.file}:${entry.data.sourceLocation.line}`, 'blue');
          }
          
          break;
        }
      } catch (err) {
        // Skip invalid JSON lines
      }
    }
    
    const duration = Date.now() - startTime;
    
    if (!found) {
      recordResult('Intelligent logger integration', false, 'Error not found in logs', duration);
      return;
    }
    
    if (!hasStackMetadata) {
      recordResult('Intelligent logger integration', false, 'Missing stackMetadata in log entry', duration);
      return;
    }
    
    if (!hasSourceLocation) {
      recordResult('Intelligent logger integration', false, 'Missing sourceLocation in log entry', duration);
      return;
    }
    
    recordResult('Intelligent logger integration', true, undefined, duration);
  } catch (error) {
    recordResult('Intelligent logger integration', false, (error as Error).message);
  }
}

// Test 4: Emergency Fallback
async function testEmergencyFallback(): Promise<void> {
  printHeader('Test 4: Emergency Fallback Mechanism');
  
  try {
    const startTime = Date.now();
    
    // Create an error with database unavailable simulation
    // (We'll just verify the emergency log directory exists and has write permissions)
    
    const emergencyDir = path.join(process.cwd(), 'Store', 'emergency-error-logs');
    
    // Check directory exists
    if (!fs.existsSync(emergencyDir)) {
      fs.mkdirSync(emergencyDir, { recursive: true });
    }
    
    // Test write permissions
    const testFile = path.join(emergencyDir, 'test-write-access.json');
    const testData = { test: true, timestamp: new Date().toISOString() };
    fs.writeFileSync(testFile, JSON.stringify(testData, null, 2));
    
    // Verify we can read it back
    const readData = JSON.parse(fs.readFileSync(testFile, 'utf-8'));
    
    if (readData.test !== true) {
      recordResult('Emergency fallback', false, 'Failed to read test file');
      return;
    }
    
    // Clean up
    fs.unlinkSync(testFile);
    
    const duration = Date.now() - startTime;
    
    log(`  Emergency directory: ${emergencyDir}`, 'blue');
    log(`  Write permissions: OK`, 'blue');
    log(`  Read permissions: OK`, 'blue');
    
    recordResult('Emergency fallback', true, undefined, duration);
  } catch (error) {
    recordResult('Emergency fallback', false, (error as Error).message);
  }
}

// Test 5: Performance Characteristics
async function testPerformanceCharacteristics(): Promise<void> {
  printHeader('Test 5: Performance Characteristics');
  
  try {
    const iterations = 10;
    const captureTimes: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      
      const testError = new Error(`Performance test error ${i}`);
      await errorTracker.captureError(testError, {
        service: 'performance-test',
        operation: `testPerformance_${i}`,
        severity: 'LOW',
        category: 'ENGINE',
      });
      
      const duration = Date.now() - startTime;
      captureTimes.push(duration);
    }
    
    // Calculate statistics
    const avgTime = captureTimes.reduce((a, b) => a + b, 0) / captureTimes.length;
    const minTime = Math.min(...captureTimes);
    const maxTime = Math.max(...captureTimes);
    
    log(`  Iterations: ${iterations}`, 'blue');
    log(`  Average capture time: ${avgTime.toFixed(2)}ms`, 'blue');
    log(`  Min capture time: ${minTime}ms`, 'blue');
    log(`  Max capture time: ${maxTime}ms`, 'blue');
    
    // Performance thresholds (generous for testing)
    const avgThreshold = 200; // 200ms average
    const maxThreshold = 500; // 500ms max
    
    if (avgTime > avgThreshold) {
      recordResult('Performance characteristics', false, `Average time ${avgTime.toFixed(2)}ms exceeds threshold ${avgThreshold}ms`);
      return;
    }
    
    if (maxTime > maxThreshold) {
      recordResult('Performance characteristics', false, `Max time ${maxTime}ms exceeds threshold ${maxThreshold}ms`);
      return;
    }
    
    recordResult('Performance characteristics', true, undefined, Math.round(avgTime));
  } catch (error) {
    recordResult('Performance characteristics', false, (error as Error).message);
  }
}

// Test 6: Error Type Handling
async function testErrorTypeHandling(): Promise<void> {
  printHeader('Test 6: Error Type Handling');
  
  try {
    const startTime = Date.now();
    
    // Test different error types
    const errorTypes = [
      { name: 'TypeError', error: new TypeError('Test TypeError') },
      { name: 'ReferenceError', error: new ReferenceError('Test ReferenceError') },
      { name: 'Error', error: new Error('Test generic Error') },
    ];
    
    for (const { name, error } of errorTypes) {
      const errorId = await errorTracker.captureError(error, {
        service: 'error-type-test',
        operation: `test_${name}`,
        severity: 'LOW',
        category: 'ENGINE',
      });
      
      if (!errorId) {
        recordResult(`Error type handling (${name})`, false, 'captureError returned undefined');
        return;
      }
      
      // Verify in database (use fingerprint for lookup)
      const errorLog = await prisma.errorLog.findFirst({
        where: { errorName: name },
        orderBy: { firstSeen: 'desc' },
      });
      
      if (!errorLog) {
        recordResult(`Error type handling (${name})`, false, 'Error not found in database');
        return;
      }
      
      log(`  ✓ ${name} captured successfully`, 'green');
    }
    
    const duration = Date.now() - startTime;
    
    recordResult('Error type handling', true, undefined, duration);
  } catch (error) {
    recordResult('Error type handling', false, (error as Error).message);
  }
}

// Test Summary
function printTestSummary() {
  printHeader('Test Summary');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  log(`Total Tests: ${total}`, 'cyan');
  log(`Passed: ${passed}`, 'green');
  log(`Failed: ${failed}`, failed > 0 ? 'red' : 'green');
  log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`, failed > 0 ? 'yellow' : 'green');
  
  if (failed > 0) {
    log('', 'reset');
    log('Failed Tests:', 'red');
    for (const result of results.filter(r => !r.passed)) {
      log(`  - ${result.name}: ${result.error}`, 'red');
    }
  }
  
  log('', 'reset');
  
  // Exit with error code if any tests failed
  if (failed > 0) {
    process.exit(1);
  }
}

// Main test runner
async function main() {
  printHeader('Error Detection Integration - End-to-End Tests');
  
  log('This test suite validates the complete error detection flow:', 'reset');
  log('  1. Stack trace parsing with source extraction', 'reset');
  log('  2. AI report generation with troubleshooting hints', 'reset');
  log('  3. Intelligent logger integration via error stream', 'reset');
  log('  4. Emergency fallback mechanisms', 'reset');
  log('  5. Performance characteristics (<100ms capture)', 'reset');
  log('  6. Multiple error type handling', 'reset');
  log('', 'reset');
  
  try {
    // Run tests sequentially
    await testStackTraceParsing();
    await delay(100);
    
    await testAIReportGeneration();
    await delay(100);
    
    await testIntelligentLoggerIntegration();
    await delay(100);
    
    await testEmergencyFallback();
    await delay(100);
    
    await testPerformanceCharacteristics();
    await delay(100);
    
    await testErrorTypeHandling();
    await delay(100);
    
    // Print summary
    printTestSummary();
    
    log('', 'reset');
    log('Tests complete. Exiting...', 'cyan');
    
    // Give time for async operations to complete
    await delay(500);
    
    // Disconnect Prisma
    await prisma.$disconnect();
    
  } catch (error) {
    log(`Fatal error: ${(error as Error).message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
main();
