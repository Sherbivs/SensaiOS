#!/usr/bin/env npx tsx
/**
 * Script: update-routers.ts
 * Purpose: Deprecated wrapper for router updates.
 * Usage: pwsh -File scripts/update-routers.ps1
 */

import { printWarning, printInfo } from './lib/index.js';

printWarning('update-routers.ts is deprecated.');
printInfo('Use: pwsh -File scripts/update-routers.ps1');
process.exit(1);
