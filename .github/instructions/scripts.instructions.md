---
applyTo: 'scripts/**'
---
# Scripts & Automation Instructions — Pokémon Infinity Gauntlet

## Project Leadership

**Creator & CEO:** DRIPTVDD | **Discord ID:** `398910451420348448` (anti-spoofing identifier)

## Script Categories

### PowerShell Scripts (`*.ps1`)
Located in `scripts/` for Windows automation:
- **Render deployment:** `render_deploy.ps1`, `render_restart.ps1`, `render_status.ps1`
- **SSH operations:** `render_ssh_windows.ps1`, `render_disk_usage_windows.ps1`
- **Environment setup:** `setup_ai_env.ps1`
- **Database ops:** `db-*.ps1` scripts for CLI operations

### JavaScript/TypeScript Scripts (`*.ts`, `*.js`, `*.mjs`)
Located in `scripts/` for Node.js automation:
- **Data pipeline:** `fetch_pokemon.mjs`, `build_dexpack.ts`
- **Database CLI:** `db-cli.ts` for database operations
- **Maintenance:** Router updates, task archival, cache refresh

## PowerShell Conventions

### Parameter Handling
```powershell
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$Service,
    
    [Parameter(Mandatory=$false)]
    [switch]$DryRun,
    
    [Parameter(Mandatory=$false)]
    [int]$Timeout = 300
)
```

### Error Handling
```powershell
$ErrorActionPreference = "Stop"

try {
    # Operations here
    Write-Host "✅ Operation completed successfully" -ForegroundColor Green
}
catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
    exit 1
}
```

### Output Formatting
```powershell
# Use colors for status
Write-Host "🔄 Starting operation..." -ForegroundColor Cyan
Write-Host "✅ Success" -ForegroundColor Green
Write-Host "⚠️ Warning" -ForegroundColor Yellow
Write-Host "❌ Error" -ForegroundColor Red

# Use structured output for data
$result | Format-Table -AutoSize
```

### Environment Variables
```powershell
# Load from secrets file
$envFile = $env:IG_ENV_FILE
if (-not $envFile) {
    $envFile = "secrets/Infinity-Gauntlet.env"
}

# Parse .env file
Get-Content $envFile | ForEach-Object {
    if ($_ -match "^([^#][^=]+)=(.*)$") {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2])
    }
}
```

## TypeScript/JavaScript Conventions

### Script Entry Point
```typescript
#!/usr/bin/env node
import { printSection, printSuccess, printError } from "../src/utils/output-formatter.js";

async function main() {
    printSection("Script Name");
    
    try {
        // Operations here
        printSuccess("Completed successfully");
    } catch (error) {
        printError(`Failed: ${error.message}`);
        process.exit(1);
    }
}

main();
```

### Output Formatter (REQUIRED)
All scripts MUST use centralized output formatting:
```typescript
import {
    printSection,      // Section headers
    printKeyValue,     // Key: Value pairs
    printSuccess,      // ✅ Success messages
    printWarning,      // ⚠️ Warnings
    printError,        // ❌ Errors
    printList,         // Bulleted lists
    printTable         // Tabular data
} from "../src/utils/output-formatter.js";
```

**ESLint enforces this:** `scripts-prefer-output-formatter` rule

### Database CLI Pattern
```typescript
// Import shared Prisma client
import { prisma } from "../src/shared/prisma.js";

// Always handle cleanup
process.on("SIGINT", async () => {
    await prisma.$disconnect();
    process.exit(0);
});

// Use CLI argument parsing
const args = process.argv.slice(2);
const command = args[0];
const target = args[1] || "cloud-prod";
```

## Render-Specific Scripts

### Deployment Scripts
```powershell
# Always confirm before production changes
if (-not $Force) {
    $confirm = Read-Host "Deploy to $Service? (y/N)"
    if ($confirm -ne "y") { exit 0 }
}

# Use Render API with proper auth
$headers = @{
    "Authorization" = "Bearer $env:RENDER_API_KEY"
    "Content-Type" = "application/json"
}
```

### SSH Operations
```powershell
# Use Render SSH with proper service ID
$serviceId = "srv-d3snk2ndiees73cn709g"  # Main bot
render ssh $serviceId --command $Command
```

### Disk Usage Checks
```powershell
# Check /Store volume (1 GB limit)
render ssh $serviceId --command "df -h /Store && du -sh /Store/*"
```

## Data Pipeline Scripts

### Pokemon Data Fetch
```javascript
// fetch_pokemon.mjs pattern
import fetch from "node-fetch";

const POKEAPI_BASE = "https://pokeapi.co/api/v2";

async function fetchPokemon(id) {
    const response = await fetch(`${POKEAPI_BASE}/pokemon/${id}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}
```

### Dexpack Build
```typescript
// Build v1 and v2 dexpack assets
import { writeFileSync } from "fs";
import { buildDexpackV1, buildDexpackV2 } from "./dexpack-builder.js";

const v1 = buildDexpackV1(pokemonData);
const v2 = buildDexpackV2(pokemonData);

writeFileSync("assets/dexpack.v1.json", JSON.stringify(v1));
writeFileSync("assets/dexpack.v2.json", JSON.stringify(v2));
```

## Script Testing

### Dry Run Mode
All destructive scripts MUST support `-DryRun`:
```powershell
if ($DryRun) {
    Write-Host "[DRY RUN] Would execute: $command" -ForegroundColor Yellow
    return
}
```

### Validation Before Execution
```typescript
// Validate environment before running
function validateEnvironment(): void {
    const required = ["PROD_DATABASE_URL", "DISCORD_TOKEN"];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        throw new Error(`Missing environment: ${missing.join(", ")}`);
    }
}
```

## Common Script Patterns

### Progress Indicators
```typescript
const total = items.length;
for (let i = 0; i < total; i++) {
    process.stdout.write(`\rProcessing ${i + 1}/${total}...`);
    await processItem(items[i]);
}
console.log("\n✅ Complete");
```

### Timeout Handling
```typescript
const timeout = (ms: number) => new Promise((_, reject) => 
    setTimeout(() => reject(new Error("Timeout")), ms)
);

const result = await Promise.race([
    operation(),
    timeout(30000)
]);
```

### Cleanup on Exit
```typescript
const cleanup = async () => {
    await prisma.$disconnect();
    // Close any open handles
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", cleanup);
```

## Script Documentation

Every script MUST have a header comment:
```typescript
/**
 * Script: db-cli.ts
 * Purpose: Database operations CLI for multi-environment management
 * Usage: npm run db:cli -- <command> [target]
 * 
 * Commands:
 *   status  - Show connection info and sample counts
 *   counts  - Display table row counts
 *   query   - Execute raw SQL query
 * 
 * Targets:
 *   cloud-prod (default), onpremise-dev, onpremise-experiment
 */
```

## Reference

- **Output Formatter:** `src/utils/output-formatter.ts` (61 tests)
- **Render API Docs:** https://api-docs.render.com/
- **Script Directory:** `scripts/` (various automation)
- **Data Pipeline:** `src/data_pipeline/` (Pokemon data processing)
