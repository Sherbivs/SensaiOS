#!/usr/bin/env npx tsx
/* eslint-disable no-console */
/**
 * validate_database_urls.ts - Pre-build validation for database URLs
 *
 * PURPOSE:
 *   Fail build if Accelerate URLs are detected in environment variables.
 *   Ensures Prisma client generates with correct engine type.
 *
 * USAGE:
 *   npx tsx scripts/validate_database_urls.ts
 *
 * EXIT CODES:
 *   0 - All database URLs valid (direct PostgreSQL)
 *   1 - Invalid URLs detected (Accelerate format)
 */

const ACCELERATE_PATTERN = /prisma(\+|:\/\/)/i;
const VALID_PATTERN = /^postgresql:\/\//i;

// Unified architecture: Check environment-specific URLs (PROD primary, optional LOCAL)
// Uses canonical database naming schema (see docs/database-naming-schema.md)
const DATABASE_ENV_VARS: readonly string[] = [
  'PROD_DATABASE_URL',                     // CLOUD-PROD-MASTER (Render managed PostgreSQL)
  'RENDER_DB_EXTERNAL_URL',                // Fallback for CLOUD-PROD-MASTER
  'RENDER_DB_INTERNAL_URL',                // Fallback for CLOUD-PROD-MASTER
  'DATABASE_ONPREMISE_DEV_PRIMARY',        // ONPREMISE-DEV-PRIMARY (workstation development)
  'DATABASE_ONPREMISE_DEV_EXPERIMENT',     // ONPREMISE-DEV-EXPERIMENT (migration testing)
] as const;

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

// Check NODE_ENV and ensure correct environment-specific URL is set
const nodeEnv = process.env.NODE_ENV || 'development';
console.log(`Environment: ${nodeEnv}`);

// Verify environment-specific database URLs are configured
if (nodeEnv === 'production') {
  const hasProdUrl = process.env.PROD_DATABASE_URL || process.env.RENDER_DB_INTERNAL_URL;
  if (!hasProdUrl) {
    console.error('❌ CRITICAL: PROD_DATABASE_URL or RENDER_DB_INTERNAL_URL not set in production');
    console.error('   Production requires direct PostgreSQL connection to Render managed database');
    failures++;
  }
} else {
  const hasProdUrl = process.env.PROD_DATABASE_URL || process.env.RENDER_DB_EXTERNAL_URL;
  if (!hasProdUrl) {
    console.warn('⚠️  PROD_DATABASE_URL or RENDER_DB_EXTERNAL_URL not set in development');
    console.warn('   Development requires connection to Render managed database');
    warnings++;
  }
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
  console.error('  2. Set PROD_DATABASE_URL (production/development)');
  console.error('  3. Use direct PostgreSQL format: postgresql://...');
  console.error('');
  console.error('See docs/database-url-selection.md for canonical URL selection logic');
  console.error('');
  process.exit(1);
}
