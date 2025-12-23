#!/usr/bin/env tsx
/**
 * generate-script.ts - Generate new scripts from template
 *
 * PURPOSE:
 *   Creates new domain scripts with consistent structure, imports, and patterns.
 *   Ensures all new scripts follow architectural guidelines.
 *
 * USAGE:
 *   npx tsx scripts/lib/generate-script.ts <domain> <name> [description]
 *
 * EXAMPLES:
 *   npx tsx scripts/lib/generate-script.ts db backup-tables "Backup database tables"
 *   npx tsx scripts/lib/generate-script.ts monitor heap-check "Check heap memory"
 *   npx tsx scripts/lib/generate-script.ts guard lint-check "ESLint pre-commit guard"
 *
 * EXIT CODES:
 *   0 - Script created successfully
 *   1 - Invalid arguments or domain
 *
 * @module scripts/lib/generate-script
 * @since 2025-12-22
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { c, printSection, printSuccess, printError, printKeyValue } from './index.js';
import { exists, readText, writeText, ensureDir } from './fs.js';

// ============================================================================
// Configuration
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Valid domain directories for scripts.
 * Each domain has specific ownership and purpose.
 */
const VALID_DOMAINS = [
  'bot',       // Discord bot operations
  'data',      // Data pipeline and dex operations
  'db',        // Database administration
  'dev',       // Developer tools
  'diagnose',  // Emergency diagnostics
  'docker',    // Container management
  'guard',     // CI/CD guards
  'monitor',   // Performance monitoring
  'observe',   // Log observation (Loki)
  'ops',       // Operational tasks
  'render',    // Render.com operations
  'security',  // Security operations
] as const;

type Domain = typeof VALID_DOMAINS[number];

// ============================================================================
// Helpers
// ============================================================================

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function toTitleCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function printHelp(): void {
  console.log(`
${c.bold('generate-script')} - Generate new scripts from template

${c.bold('USAGE:')}
  npx tsx scripts/lib/generate-script.ts <domain> <name> [description]

${c.bold('DOMAINS:')}
  ${VALID_DOMAINS.join(', ')}

${c.bold('ARGUMENTS:')}
  domain       Target domain directory (required)
  name         Script name in kebab-case (required)
  description  Brief description for header (optional)

${c.bold('EXAMPLES:')}
  npx tsx scripts/lib/generate-script.ts db backup-tables "Backup database tables"
  npx tsx scripts/lib/generate-script.ts monitor heap-check "Check heap memory"
  npx tsx scripts/lib/generate-script.ts guard lint-check "ESLint pre-commit guard"

${c.bold('TEMPLATE LOCATION:')}
  scripts/lib/templates/new-script.ts.template
`);
}

function validateDomain(domain: string): domain is Domain {
  return VALID_DOMAINS.includes(domain as Domain);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const [, , domain, name, description] = process.argv;

  // Show help if no arguments
  if (!domain || domain === '--help' || domain === '-h') {
    printHelp();
    process.exit(domain ? 0 : 1);
  }

  // Validate domain
  if (!validateDomain(domain)) {
    printError(`Invalid domain: ${domain}`);
    console.log(`\nValid domains: ${VALID_DOMAINS.join(', ')}`);
    process.exit(1);
  }

  // Validate name
  if (!name) {
    printError('Script name is required');
    printHelp();
    process.exit(1);
  }

  printSection('Generate Script');

  // Normalize inputs
  const kebabName = toKebabCase(name);
  const titleName = toTitleCase(name);
  const desc = description ?? `${titleName} operations`;
  const today = new Date().toISOString().split('T')[0];

  // Read template
  const templatePath = join(__dirname, 'templates', 'new-script.ts.template');
  
  if (!exists(templatePath)) {
    printError(`Template not found: ${templatePath}`);
    process.exit(1);
  }

  const template = readText(templatePath);

  // Replace placeholders
  const output = template
    .replace(/\{\{SCRIPT_NAME\}\}/g, titleName)
    .replace(/\{\{DESCRIPTION\}\}/g, desc)
    .replace(/\{\{PURPOSE\}\}/g, desc)
    .replace(/\{\{DOMAIN\}\}/g, domain)
    .replace(/\{\{FILENAME\}\}/g, kebabName)
    .replace(/\{\{DATE\}\}/g, today);

  // Create output path
  const scriptsRoot = join(__dirname, '..');
  const domainDir = join(scriptsRoot, domain);
  const outputPath = join(domainDir, `${kebabName}.ts`);

  // Ensure domain directory exists
  if (!exists(domainDir)) {
    ensureDir(domainDir);
    console.log(c.yellow(`Created directory: ${domain}/`));
  }

  // Check if file already exists
  if (exists(outputPath)) {
    printError(`File already exists: ${outputPath}`);
    process.exit(1);
  }

  // Write the file
  writeText(outputPath, output);

  // Summary
  console.log();
  printKeyValue('Domain', domain);
  printKeyValue('Script', `${kebabName}.ts`);
  printKeyValue('Path', `scripts/${domain}/${kebabName}.ts`);
  printKeyValue('Description', desc);
  console.log();

  printSuccess(`Created scripts/${domain}/${kebabName}.ts`);

  // Remind about ROUTER.md
  console.log(`
${c.yellow('Next steps:')}
  1. Implement your logic in the TODO section
  2. Add entry to scripts/${domain}/ROUTER.md
  3. Add npm script to package.json if needed:
     "${domain}:${kebabName}": "tsx scripts/${domain}/${kebabName}.ts"
`);
}

main().catch((err) => {
  printError(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
