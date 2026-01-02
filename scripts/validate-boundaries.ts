/**
 * 3-Layer Architecture Boundary Validator
 * 
 * Validates that import boundaries are respected:
 * - Kernel CANNOT import from SensaiOS or Application layers
 * - Application/User-space CANNOT import Kernel directly (must go through SensaiOS)
 * - SensaiOS CAN import from Kernel
 * 
 * This script uses ts-morph to parse TypeScript AST and detect violations.
 * Run as: npm run validate:boundaries
 */

import { Project } from 'ts-morph';
import * as path from 'path';

interface Violation {
  file: string;
  line: number;
  imported: string;
  reason: string;
  severity: 'error' | 'warning';
}

const KERNEL_PATHS = ['src/kernel/', '@kernel/'];
const SENSAI_PATHS = ['src/sensaios/', '@sensai/'];
const APP_PATHS = ['src/app/', '@app/', 'src/bot/', 'src/observability/', '@observability/'];

async function validateBoundaries(): Promise<Violation[]> {
  console.log('🔍 Validating 3-layer architecture boundaries...\n');
  
  const project = new Project({ 
    tsConfigFilePath: 'tsconfig.json',
    skipAddingFilesFromTsConfig: false
  });
  
  const violations: Violation[] = [];
  
  // Rule 1: Kernel CANNOT import from SensaiOS or Application
  console.log('Checking Kernel layer (cannot import from upper layers)...');
  const kernelFiles = project.getSourceFiles('src/kernel/**/*.ts');
  
  for (const file of kernelFiles) {
    for (const importDecl of file.getImportDeclarations()) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      
      // Check for SensaiOS imports
      if (SENSAI_PATHS.some(p => moduleSpecifier.includes(p))) {
        violations.push({
          file: path.relative(process.cwd(), file.getFilePath()),
          line: importDecl.getStartLineNumber(),
          imported: moduleSpecifier,
          reason: 'Kernel CANNOT import from SensaiOS layer',
          severity: 'error'
        });
      }
      
      // Check for Application imports
      if (APP_PATHS.some(p => moduleSpecifier.includes(p))) {
        violations.push({
          file: path.relative(process.cwd(), file.getFilePath()),
          line: importDecl.getStartLineNumber(),
          imported: moduleSpecifier,
          reason: 'Kernel CANNOT import from Application layer',
          severity: 'error'
        });
      }
    }
  }
  
  console.log(`  Found ${kernelFiles.length} kernel files`);
  
  // Rule 2: Application/User-space CANNOT import Kernel directly
  console.log('Checking Application layer (cannot import Kernel directly)...');
  const appFiles = project.getSourceFiles([
    'src/app/**/*.ts',
    'src/bot/**/*.ts',
    'src/observability/**/*.ts'
  ]);
  
  for (const file of appFiles) {
    for (const importDecl of file.getImportDeclarations()) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      
      // Check for direct Kernel imports
      if (KERNEL_PATHS.some(p => moduleSpecifier.includes(p))) {
        violations.push({
          file: path.relative(process.cwd(), file.getFilePath()),
          line: importDecl.getStartLineNumber(),
          imported: moduleSpecifier,
          reason: 'Application MUST use SensaiOS adapters, not Kernel directly',
          severity: 'error'
        });
      }
    }
  }
  
  console.log(`  Found ${appFiles.length} application files\n`);
  
  return violations;
}

// Main execution
try {
  const violations = await validateBoundaries();
  
  if (violations.length === 0) {
    console.log('✅ All boundary rules satisfied!\n');
    console.log('Summary:');
    console.log('  - Kernel layer: Clean (no imports from upper layers)');
    console.log('  - Application layer: Clean (uses SensaiOS adapters only)');
    console.log('  - SensaiOS layer: No restrictions checked (can import Kernel)\n');
    process.exit(0);
  }
  
  // Report violations
  console.error('❌ Boundary violations detected:\n');
  
  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');
  
  for (const v of errors) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    Imported: ${v.imported}`);
    console.error(`    ❌ ${v.reason}\n`);
  }
  
  for (const v of warnings) {
    console.warn(`  ${v.file}:${v.line}`);
    console.warn(`    Imported: ${v.imported}`);
    console.warn(`    ⚠️  ${v.reason}\n`);
  }
  
  console.error(`\nTotal: ${errors.length} error(s), ${warnings.length} warning(s)\n`);
  console.error('Fix suggestions:');
  console.error('  1. Kernel violations: Move code to SensaiOS or Application layer');
  console.error('  2. Application violations: Import from @sensai/* instead of @kernel/*');
  console.error('  3. Use ComponentContext from SensaiOS to access kernel primitives\n');
  
  process.exit(1);
} catch (error) {
  console.error('❌ Error during validation:', error);
  process.exit(1);
}
