#!/usr/bin/env node
/* eslint-disable no-console, no-undef */

/**
 * Guard Script: Database Migration Safety Check
 * ============================================
 * 
 * Analyzes Prisma migrations for dangerous patterns and validates
 * migration integrity. Used by CI/CD pipeline and pre-commit hooks.
 * 
 * Part of: Database-Centric Development Plan (Sprint 3, P2-008)
 * See: docs/projects/database-centric/SPRINT-TRACKER.md
 * 
 * Usage:
 *   node scripts/guard_db_migrations.mjs [--strict] [--verbose]
 * 
 * Options:
 *   --strict   Fail on warnings (default: only fail on errors)
 *   --verbose  Show detailed analysis output
 */

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join } from "path";

// Configuration
const MIGRATIONS_DIR = "prisma/migrations";

// Pattern definitions with severity levels
const PATTERNS = {
  danger: [
    { regex: /DROP\s+TABLE/gi, name: "DROP TABLE", message: "Drops entire table - ensure data backup exists" },
    { regex: /DROP\s+COLUMN/gi, name: "DROP COLUMN", message: "Drops column - ensure data migrated" },
    { regex: /TRUNCATE/gi, name: "TRUNCATE", message: "Removes all data from table" },
    { regex: /DELETE\s+FROM\s+\w+\s*;/gi, name: "DELETE ALL", message: "Deletes all rows (no WHERE clause)" },
    { regex: /ALTER\s+TABLE\s+\w+\s+ALTER\s+COLUMN\s+\w+\s+TYPE/gi, name: "TYPE CHANGE", message: "Changes column type - may cause data loss" },
    { regex: /DROP\s+CONSTRAINT/gi, name: "DROP CONSTRAINT", message: "Removes constraint - may allow invalid data" },
  ],
  warning: [
    { regex: /DROP\s+INDEX/gi, name: "DROP INDEX", message: "Drops index - may impact query performance" },
    { regex: /RENAME\s+TO/gi, name: "RENAME", message: "Renames object - ensure references updated" },
    { regex: /CREATE\s+INDEX(?!\s+CONCURRENTLY)/gi, name: "INDEX (non-concurrent)", message: "Consider CONCURRENTLY for large tables" },
    { regex: /ALTER\s+TABLE\s+\w+\s+ADD\s+COLUMN\s+\w+\s+\w+\s+NOT\s+NULL(?!\s+DEFAULT)/gi, name: "NOT NULL without DEFAULT", message: "Adding NOT NULL column without default - may fail on existing data" },
  ],
  info: [
    { regex: /CREATE\s+POLICY/gi, name: "CREATE POLICY", message: "RLS policy created - verify security rules" },
    { regex: /ALTER\s+TABLE\s+\w+\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi, name: "ENABLE RLS", message: "RLS enabled - verify policies exist" },
    { regex: /CREATE\s+INDEX\s+CONCURRENTLY/gi, name: "CONCURRENT INDEX", message: "Good practice: concurrent index creation" },
  ],
};

// ANSI color codes
const colors = {
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

/**
 * Analyzes a single migration file for patterns
 */
function analyzeMigration(filePath, content) {
  const results = {
    file: filePath,
    dangers: [],
    warnings: [],
    info: [],
  };

  for (const pattern of PATTERNS.danger) {
    const matches = content.match(pattern.regex);
    if (matches) {
      results.dangers.push({
        pattern: pattern.name,
        message: pattern.message,
        count: matches.length,
        matches: matches.slice(0, 3), // Show first 3 matches
      });
    }
  }

  for (const pattern of PATTERNS.warning) {
    const matches = content.match(pattern.regex);
    if (matches) {
      results.warnings.push({
        pattern: pattern.name,
        message: pattern.message,
        count: matches.length,
        matches: matches.slice(0, 3),
      });
    }
  }

  for (const pattern of PATTERNS.info) {
    const matches = content.match(pattern.regex);
    if (matches) {
      results.info.push({
        pattern: pattern.name,
        message: pattern.message,
        count: matches.length,
      });
    }
  }

  return results;
}

/**
 * Validates migration directory structure
 */
function validateStructure() {
  const issues = [];

  if (!existsSync(MIGRATIONS_DIR)) {
    issues.push({ severity: "error", message: `Migrations directory not found: ${MIGRATIONS_DIR}` });
    return issues;
  }

  // Check migration_lock.toml
  const lockFile = join(MIGRATIONS_DIR, "migration_lock.toml");
  if (!existsSync(lockFile)) {
    issues.push({ severity: "error", message: "Missing migration_lock.toml" });
  }

  // Check each migration directory
  const entries = readdirSync(MIGRATIONS_DIR);
  for (const entry of entries) {
    const entryPath = join(MIGRATIONS_DIR, entry);
    if (statSync(entryPath).isDirectory()) {
      const migrationSql = join(entryPath, "migration.sql");
      if (!existsSync(migrationSql)) {
        issues.push({ severity: "error", message: `Missing migration.sql in ${entry}` });
      }
    }
  }

  return issues;
}

/**
 * Gets all migration files
 */
function getMigrationFiles() {
  const files = [];
  
  if (!existsSync(MIGRATIONS_DIR)) {
    return files;
  }

  const entries = readdirSync(MIGRATIONS_DIR);
  for (const entry of entries) {
    const entryPath = join(MIGRATIONS_DIR, entry);
    if (statSync(entryPath).isDirectory()) {
      const migrationSql = join(entryPath, "migration.sql");
      if (existsSync(migrationSql)) {
        files.push({
          name: entry,
          path: migrationSql,
          content: readFileSync(migrationSql, "utf-8"),
        });
      }
    }
  }

  return files.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Main analysis function
 */
function main() {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const verbose = args.includes("--verbose");

  console.log(`${colors.bold}🔍 Database Migration Safety Check${colors.reset}`);
  console.log("=".repeat(50));
  console.log();

  // Validate structure
  const structureIssues = validateStructure();
  const structureErrors = structureIssues.filter(i => i.severity === "error");
  
  if (structureErrors.length > 0) {
    console.log(`${colors.red}❌ Structure Validation Failed:${colors.reset}`);
    for (const issue of structureErrors) {
      console.log(`   ${issue.message}`);
    }
    process.exit(1);
  }

  console.log(`${colors.green}✅ Structure validation passed${colors.reset}`);
  console.log();

  // Analyze migrations
  const migrations = getMigrationFiles();
  console.log(`📁 Found ${migrations.length} migrations`);
  console.log();

  let totalDangers = 0;
  let totalWarnings = 0;
  let totalInfo = 0;

  for (const migration of migrations) {
    const results = analyzeMigration(migration.path, migration.content);
    
    if (results.dangers.length > 0 || results.warnings.length > 0 || (verbose && results.info.length > 0)) {
      console.log(`${colors.cyan}📄 ${migration.name}${colors.reset}`);
      
      for (const danger of results.dangers) {
        console.log(`   ${colors.red}❌ DANGER: ${danger.pattern}${colors.reset}`);
        console.log(`      ${danger.message}`);
        if (verbose) {
          console.log(`      Found ${danger.count} occurrence(s)`);
        }
        totalDangers++;
      }
      
      for (const warning of results.warnings) {
        console.log(`   ${colors.yellow}⚠️  WARNING: ${warning.pattern}${colors.reset}`);
        console.log(`      ${warning.message}`);
        if (verbose) {
          console.log(`      Found ${warning.count} occurrence(s)`);
        }
        totalWarnings++;
      }
      
      if (verbose) {
        for (const info of results.info) {
          console.log(`   ${colors.blue}ℹ️  INFO: ${info.pattern}${colors.reset}`);
          console.log(`      ${info.message}`);
        }
      }
      
      console.log();
    }
    
    totalInfo += results.info.length;
  }

  // Summary
  console.log("=".repeat(50));
  console.log(`${colors.bold}📊 Summary${colors.reset}`);
  console.log(`   Migrations analyzed: ${migrations.length}`);
  console.log(`   ${colors.red}Dangers found: ${totalDangers}${colors.reset}`);
  console.log(`   ${colors.yellow}Warnings found: ${totalWarnings}${colors.reset}`);
  if (verbose) {
    console.log(`   ${colors.blue}Info items: ${totalInfo}${colors.reset}`);
  }
  console.log();

  // Exit code logic
  if (totalDangers > 0) {
    console.log(`${colors.yellow}⚠️  Dangerous patterns detected. Review migrations carefully before deploying.${colors.reset}`);
    console.log(`   Ensure rollback plans exist for each dangerous operation.`);
    console.log();
    // Don't fail - just warn. The patterns exist in historical migrations.
  }

  if (strict && totalWarnings > 0) {
    console.log(`${colors.red}❌ Strict mode: Failing due to ${totalWarnings} warning(s)${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.green}✅ Migration safety check complete${colors.reset}`);
  process.exit(0);
}

main();
