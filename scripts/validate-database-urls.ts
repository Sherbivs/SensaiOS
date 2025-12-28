#!/usr/bin/env npx tsx
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

import {
  formatSectionHeader,
  formatKeyValueList,
  formatStatus,
  formatList,
} from "../src/utils/output-formatter.js";

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

console.log(formatSectionHeader("Database URL Validation"));
console.log(formatStatus("Checking URLs for Prisma client generation...", "info"));
console.log();

// Check each database environment variable
const urlResults: Array<[string, string]> = [];

for (const key of DATABASE_ENV_VARS) {
  const value = process.env[key];
  
  if (!value) {
    urlResults.push([key, "⚪ Not set (optional)"]);
    continue;
  }
  
  // Check for Accelerate URL format
  if (ACCELERATE_PATTERN.test(value)) {
    urlResults.push([key, "❌ INVALID - Accelerate URL detected"]);
    failures++;
    continue;
  }
  
  // Check for valid PostgreSQL URL format
  if (VALID_PATTERN.test(value)) {
    urlResults.push([key, "✅ Valid (direct PostgreSQL)"]);
  } else {
    urlResults.push([key, "⚠️ Unexpected format"]);
    warnings++;
  }
}

console.log(formatKeyValueList(urlResults).join('\n'));

console.log();

// Check NODE_ENV and ensure correct environment-specific URL is set
const nodeEnv = process.env.NODE_ENV || 'development';
console.log(formatKeyValueList([["Environment", nodeEnv]]).join('\n'));

// Verify environment-specific database URLs are configured
if (nodeEnv === 'production') {
  const hasProdUrl = process.env.PROD_DATABASE_URL || process.env.RENDER_DB_INTERNAL_URL;
  if (!hasProdUrl) {
    console.log(formatStatus("CRITICAL: PROD_DATABASE_URL or RENDER_DB_INTERNAL_URL not set", "error"));
    console.log(formatKeyValueList([["Required", "Direct PostgreSQL connection to Render"]], { indent: 1 }).join('\n'));
    failures++;
  }
} else {
  const hasProdUrl = process.env.PROD_DATABASE_URL || process.env.RENDER_DB_EXTERNAL_URL;
  if (!hasProdUrl) {
    console.log(formatStatus("PROD_DATABASE_URL or RENDER_DB_EXTERNAL_URL not set", "warning"));
    console.log(formatKeyValueList([["Recommended", "Connection to Render database"]], { indent: 1 }).join('\n'));
    warnings++;
  }
}

// Summary
console.log();
console.log(formatSectionHeader("Validation Summary"));

if (failures === 0 && warnings === 0) {
  console.log(formatStatus("All database URLs valid", "success"));
  console.log(formatStatus("Prisma client ready for direct PostgreSQL", "success"));
  process.exit(0);
} else if (failures === 0) {
  console.log(formatStatus(`${warnings} warning(s) - build will continue`, "warning"));
  console.log(formatKeyValueList([["Action", "Review warnings above"]], { indent: 1 }).join('\n'));
  process.exit(0);
} else {
  console.log(formatStatus(`${failures} critical issue(s) detected`, "error"));
  if (warnings > 0) {
    console.log(formatStatus(`${warnings} warning(s)`, "warning"));
  }
  console.log();
  console.log(formatSectionHeader("Action Required", 1));
  console.log(formatList([
    "Remove Accelerate URLs from environment variables",
    "Set PROD_DATABASE_URL (production/development)",
    "Use direct PostgreSQL format: postgresql://..."
  ], { numbered: true, indent: 1 }).join('\n'));
  console.log();
  console.log(formatKeyValueList([["Documentation", "docs/database-url-selection.md"]], { indent: 1 }).join('\n'));
  process.exit(1);
}
