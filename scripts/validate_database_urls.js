#!/usr/bin/env node
// validate_database_urls.js - Pre-build validation for database URLs
//
// PURPOSE:
//   Fail build if Accelerate URLs are detected in environment variables.
//   Ensures Prisma client generates with correct engine type.
//
// USAGE:
//   node scripts/validate_database_urls.js
//
// EXIT CODES:
//   0 - All database URLs valid (direct PostgreSQL)
//   1 - Invalid URLs detected (Accelerate format)

const ACCELERATE_PATTERN = /prisma(\+|:\/\/)/i;
const VALID_PATTERN = /^postgresql:\/\//i;

const DATABASE_ENV_VARS = [
  'DATABASE_URL',
  'DEV_DATABASE_URL',
  'PROD_DATABASE_URL',
  'RENDER_DB_EXTERNAL_URL',
  'RENDER_DB_INTERNAL_URL',
  'DATABASE_LOCAL_URL',
];

let failures = 0;
let warnings = 0;

console.log('🔍 Validating database URLs for Prisma client generation...\n');

// Check each database environment variable
for (const key of DATABASE_ENV_VARS) {
  const value = process.env[key];
  
  if (!value) {
    console.log(`⚪ ${key}: Not set (optional)`);
    continue;
  }
  
  // Check for Accelerate URL format
  if (ACCELERATE_PATTERN.test(value)) {
    console.error(`❌ ${key}: INVALID - Accelerate URL detected`);
    console.error(`   Value: ${value.substring(0, 50)}...`);
    console.error(`   Expected: postgresql:// format`);
    failures++;
    continue;
  }
  
  // Check for valid PostgreSQL URL format
  if (VALID_PATTERN.test(value)) {
    console.log(`✅ ${key}: Valid (direct PostgreSQL)`);
  } else {
    console.warn(`⚠️  ${key}: Unexpected format`);
    console.warn(`   Value: ${value.substring(0, 50)}...`);
    console.warn(`   Expected: postgresql:// prefix`);
    warnings++;
  }
}

console.log('');

// Check for DATABASE_URL specifically (required for Prisma generation)
if (!process.env.DATABASE_URL) {
  console.warn('⚠️  DATABASE_URL not set');
  console.warn('   Prisma client generation may fail or use incorrect engine type');
  console.warn('   Recommendation: Set DATABASE_URL to a direct PostgreSQL connection');
  warnings++;
}

// Check NODE_ENV
const nodeEnv = process.env.NODE_ENV || 'development';
console.log(`Environment: ${nodeEnv}`);

// In production, warn if DATABASE_URL isn't set
if (nodeEnv === 'production' && !process.env.DATABASE_URL) {
  console.error('❌ CRITICAL: DATABASE_URL not set in production');
  console.error('   Prisma client will generate with incorrect engine type');
  failures++;
}

// Summary
console.log('\n=== VALIDATION SUMMARY ===\n');

if (failures === 0 && warnings === 0) {
  console.log('✅ All database URLs valid');
  console.log('✅ Prisma client will generate with correct engine type (direct PostgreSQL)');
  console.log('');
  process.exit(0);
} else if (failures === 0) {
  console.log(`⚠️  ${warnings} warning(s) - build will continue`);
  console.log('   Review warnings above to ensure correct configuration');
  console.log('');
  process.exit(0);
} else {
  console.error(`❌ ${failures} critical issue(s) detected`);
  console.error(`⚠️  ${warnings} warning(s)`);
  console.error('');
  console.error('Action Required:');
  console.error('  1. Remove Accelerate URLs from environment variables');
  console.error('  2. Set DATABASE_URL to direct PostgreSQL format: postgresql://...');
  console.error('  3. Update render.yaml to set explicit DATABASE_URL for all services');
  console.error('');
  console.error('See docs/database-url-selection.md for canonical URL selection logic');
  console.error('See ops/CODEBASE-OVERHAUL-PLAN.md for comprehensive cleanup guide');
  console.error('');
  process.exit(1);
}
