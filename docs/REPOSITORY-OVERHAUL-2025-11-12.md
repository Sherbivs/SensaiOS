# Repository Overhaul & Build System Audit
## Date: November 12, 2025
## Status: CRITICAL FIXES DEPLOYED

---

## Executive Summary

This document details the complete overhaul of the Infinity Gauntlet bot's build and deployment system, fixing critical issues that prevented production deployment on Render.com for 12+ hours across 20+ failed deployment attempts.

### Root Causes Identified

1. **Working Directory Mismatch**: Render runs from `/opt/render/project/src` but project root is `/opt/render/project`
2. **False Positive Path Detection**: npm install creates `package.json` in subdirectories during postinstall, causing root detection to fail
3. **TypeScript File Conflicts**: Both `resource-monitor.ts` and `resource-monitor.js` existed, causing compilation overwrites
4. **ES Module Incompatibilities**: 
   - Using `require()` without proper working directory context
   - Top-level await requiring dynamic import()
   - Missing .js file copies to dist/

### Critical Fixes Deployed

- ✅ **scripts/start.cjs**: Robust project root detection with absolute path priority
- ✅ **scripts/build_typescript.sh**: Copies .js files to dist/ after TypeScript compilation
- ✅ **tsconfig.build.json**: Excludes .js/.mjs files from compilation
- ✅ **package.json**: Simplified start script using start.cjs
- ✅ **Removed resource-monitor.ts**: Prevents overwriting perfected .js version

---

## Repository Structure (Physical)

```
/opt/render/project/                         # Render deployment root (CRITICAL PATH)
├── package.json                             # Main package.json (name: "infinity-gauntlet")
├── tsconfig.json                            # TypeScript base config
├── tsconfig.build.json                      # Build-specific config (excludes .js/.mjs)
├── dist/                                    # Compiled output (created by postinstall hook)
│   ├── index.js                            # Entry point (imports from ./services/*)
│   ├── bot/                                # Compiled bot logic
│   ├── services/                           # Compiled + copied services
│   │   ├── resource-monitor.js            # COPIED from src/ (not compiled)
│   │   ├── ai-log-writer.js               # COPIED from src/
│   │   ├── ai-log-analyzer.js             # COPIED from src/
│   │   ├── ai-log-integrations.js         # COPIED from src/
│   │   ├── cache.js                        # COPIED from src/
│   │   ├── pokemonService.js              # COPIED from src/
│   │   └── *.js (compiled from .ts)       # TypeScript outputs
│   └── ...
├── src/                                     # Source code
│   ├── index.ts                            # TypeScript entry (imports resource-monitor.js)
│   ├── bot/                                # Bot logic (TypeScript)
│   ├── services/                           # Service layer
│   │   ├── resource-monitor.js            # JavaScript source (759 lines, AUTHORITATIVE)
│   │   ├── resource-monitor.ts.backup     # Old TypeScript version (archived)
│   │   ├── ai-log-writer.js               # JavaScript source
│   │   ├── ai-log-analyzer.js             # JavaScript source
│   │   └── *.ts                           # TypeScript sources
│   └── ...
├── scripts/
│   ├── start.cjs                          # PRODUCTION START SCRIPT (CommonJS)
│   ├── build_typescript.sh                # Build wrapper (finds root, compiles, copies .js)
│   └── ...
├── Store/                                  # Persistent storage (protected from git)
└── ...

/opt/render/project/src/                    # DANGER ZONE: Where Render runs from
├── package.json                            # May exist (created by npm install)
└── dist/                                   # WRONG: Old deployment artifacts here
```

### Critical Path Rules

1. **NEVER trust current working directory on Render**
   - CWD is `/opt/render/project/src` during execution
   - Scripts MUST check absolute path `/opt/render/project` FIRST

2. **Check absolute paths BEFORE relative paths**
   - Order matters: `/opt/render/project` → `..` → `../..` → `.`
   - Prevents false positives from npm-created package.json files

3. **Verify package name to confirm correct root**
   - Check `package.json` contains `"name": "infinity-gauntlet"`
   - Prevents selecting wrong package.json

---

## Build Process (Complete Flow)

### 1. Render Deploy Trigger
```bash
git push origin main
# Render webhook triggers build
```

### 2. npm install (Render's Build Command)
```bash
npm install
# Runs in /opt/render/project/src (CWD issue starts here)
# Triggers postinstall hook
```

### 3. postinstall Hook
```json
// package.json
{
  "scripts": {
    "postinstall": "npx prisma generate && echo 'Running postinstall TypeScript build...' && npm run build:ts && echo 'postinstall build complete'"
  }
}
```

### 4. TypeScript Build (scripts/build_typescript.sh)
```bash
#!/bin/bash
set -e

echo "🔨 TypeScript Build Starting..."

# CRITICAL: Find project root with absolute path priority
if [ -d "/opt/render/project" ] && [ -f "/opt/render/project/package.json" ]; then
  PROJECT_ROOT="/opt/render/project"
elif [ -f "../package.json" ]; then
  PROJECT_ROOT="$(cd .. && pwd)"
elif [ -f "../../package.json" ]; then
  PROJECT_ROOT="$(cd ../.. && pwd)"
elif [ -f "package.json" ]; then
  PROJECT_ROOT="$(pwd)"
else
  echo "❌ ERROR: Cannot find project root"
  exit 1
fi

cd "$PROJECT_ROOT"

# Compile TypeScript
npx tsc --project tsconfig.build.json

# CRITICAL: Copy JavaScript source files to dist/
echo "Copying JavaScript source files to dist/..."
if [ -d "src/services" ]; then
  mkdir -p dist/services
  for jsfile in src/services/*.js; do
    if [ -f "$jsfile" ]; then
      cp -v "$jsfile" "dist/services/"
    fi
  done
fi

# Verify output
if [ -f "dist/index.js" ]; then
  echo "✅ TypeScript compilation successful!"
else
  echo "❌ ERROR: dist/index.js not created!"
  exit 1
fi
```

### 5. Start Command (scripts/start.cjs)
```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function findProjectRoot() {
  // 1. Check absolute Render path FIRST
  const renderPath = '/opt/render/project';
  if (fs.existsSync(renderPath)) {
    const renderPkg = path.join(renderPath, 'package.json');
    const renderSrc = path.join(renderPath, 'src');
    
    if (fs.existsSync(renderPkg) && fs.existsSync(renderSrc)) {
      // Verify it's the correct package
      const pkg = JSON.parse(fs.readFileSync(renderPkg, 'utf-8'));
      if (pkg.name === 'infinity-gauntlet') {
        return renderPath;
      }
    }
  }
  
  // 2. Check parent directories (local development)
  const searchPaths = [
    path.resolve('..'),
    path.resolve('../..'),
    path.resolve('.')
  ];
  
  for (const searchPath of searchPaths) {
    const pkgPath = path.join(searchPath, 'package.json');
    const srcPath = path.join(searchPath, 'src');
    
    if (fs.existsSync(pkgPath) && fs.existsSync(srcPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.name === 'infinity-gauntlet') {
        return searchPath;
      }
    }
  }
  
  return null;
}

function main() {
  const projectRoot = findProjectRoot();
  
  if (!projectRoot) {
    console.error('❌ FATAL: Cannot find project root!');
    process.exit(1);
  }
  
  const distPath = path.join(projectRoot, 'dist', 'index.js');
  
  if (!fs.existsSync(distPath)) {
    console.error(`❌ FATAL: ${distPath} not found!`);
    process.exit(1);
  }
  
  // CRITICAL: Change working directory BEFORE importing
  process.chdir(projectRoot);
  
  // CRITICAL: Use dynamic import for ES modules with top-level await
  const distUrl = pathToFileURL(distPath).href;
  import(distUrl).catch(err => {
    console.error('❌ FATAL: Failed to start bot!');
    console.error(err.stack);
    process.exit(1);
  });
}

main();
```

### Key Principles

1. **Absolute path priority**: Always check `/opt/render/project` first
2. **Package name verification**: Confirm `name === 'infinity-gauntlet'`
3. **Working directory change**: `process.chdir(root)` before imports
4. **Dynamic import**: Use `import()` for ES modules with top-level await
5. **File URL conversion**: Use `pathToFileURL()` for cross-platform compatibility
6. **Copy .js files**: TypeScript excludes .js, must copy manually

---

## TypeScript Configuration

### tsconfig.json (Base Configuration)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "rootDir": "src",
    "outDir": "dist",
    "esModuleInterop": true,
    "allowJs": true,           // Allow importing .js files
    "skipLibCheck": true,
    "strict": true
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### tsconfig.build.json (Build-Specific)
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "allowJs": true,
    "skipLibCheck": true
  },
  "include": [
    "src/**/*.ts"
  ],
  "exclude": [
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/*.js",            // CRITICAL: Don't compile .js files
    "src/**/*.mjs",           // CRITICAL: Don't compile .mjs files
    "assets/**/*"             // CRITICAL: Exclude assets/
  ]
}
```

### Why These Settings?

- **allowJs: true**: Allows TypeScript to type-check imports of .js files
- **exclude .js/.mjs**: Prevents TypeScript from trying to compile JavaScript files
- **exclude assets**: Prevents TS5055 error (trying to overwrite input files)
- **skipLibCheck**: Faster builds, skip type checking of .d.ts files

---

## Module System (ES Modules)

### package.json
```json
{
  "type": "module"
}
```

### Import Rules

1. **Always use .js extension in imports** (even for .ts sources)
   ```typescript
   // ✅ CORRECT
   import { startResourceMonitoring } from "./services/resource-monitor.js";
   
   // ❌ WRONG
   import { startResourceMonitoring } from "./services/resource-monitor";
   ```

2. **Never use require() in project root**
   - CWD may be wrong on Render
   - Use dynamic import() instead

3. **Use CommonJS (.cjs) for wrapper scripts**
   ```javascript
   // scripts/start.cjs
   const { pathToFileURL } = require('url');
   import(pathToFileURL(distPath).href);
   ```

4. **Change CWD before importing**
   ```javascript
   process.chdir(projectRoot);  // CRITICAL for ES module resolution
   import(distUrl);
   ```

---

## Resource Monitor Architecture

### File Conflict Resolution

**BEFORE (Broken):**
```
src/services/resource-monitor.ts (515 lines, old implementation)
src/services/resource-monitor.js (759 lines, perfected implementation)
# TypeScript compiles .ts → dist/services/resource-monitor.js (overwrites perfected version!)
```

**AFTER (Fixed):**
```
src/services/resource-monitor.ts.backup (archived)
src/services/resource-monitor.js (759 lines, AUTHORITATIVE SOURCE)
# TypeScript excludes .js files
# build_typescript.sh copies .js to dist/ manually
```

### Why JavaScript instead of TypeScript?

1. **Already perfected**: 759 lines of tested, production-ready code
2. **Immediate deployment**: No need to rewrite in TypeScript
3. **Circular dependency handling**: JavaScript allows more flexible module patterns
4. **Auto-start on import**: Can call `startMonitoring()` at module level

### Exports
```javascript
// src/services/resource-monitor.js
export const resourceMonitor = { /* ... */ };
export const startResourceMonitoring = startMonitoring;
export const stopResourceMonitoring = stopMonitoring;
export default resourceMonitor;  // For logger.js compatibility
```

### Imports
```typescript
// src/index.ts
import { startResourceMonitoring, stopResourceMonitoring } from "./services/resource-monitor.js";
```

---

## Common Failure Modes & Solutions

### 1. "Project root: /opt/render/project/src"

**Cause**: Script checks current directory before absolute path
**Solution**: Check `/opt/render/project` FIRST

**WRONG:**
```bash
if [ -f "package.json" ]; then
  PROJECT_ROOT="$(pwd)"  # This runs first!
elif [ -d "/opt/render/project" ]; then
  PROJECT_ROOT="/opt/render/project"
fi
```

**CORRECT:**
```bash
if [ -d "/opt/render/project" ] && [ -f "/opt/render/project/package.json" ]; then
  PROJECT_ROOT="/opt/render/project"  # Check absolute path first!
elif [ -f "package.json" ]; then
  PROJECT_ROOT="$(pwd)"
fi
```

### 2. "Cannot find module '/opt/render/project/src/dist/config/env.js'"

**Cause**: 
- CWD is `/opt/render/project/src`
- Looking for `dist/` in wrong location
- ES module imports resolve relative to CWD

**Solution**: 
```javascript
process.chdir(projectRoot);  // Change to /opt/render/project before import
```

### 3. "error TS5055: Cannot write file 'assets/dexpack.gen.mjs' because it would overwrite input file"

**Cause**: TypeScript trying to compile .mjs file
**Solution**: Add to tsconfig.build.json:
```json
{
  "exclude": [
    "src/**/*.js",
    "src/**/*.mjs",
    "assets/**/*"
  ]
}
```

### 4. "require() cannot be used on an ESM graph with top-level await"

**Cause**: Using CommonJS require() on ES module with await at top level
**Solution**: Use dynamic import()
```javascript
// WRONG
require(distPath);

// CORRECT
import(pathToFileURL(distPath).href);
```

### 5. "The requested module 'resource-monitor.js' does not provide an export named 'default'"

**Cause**: 
- TypeScript compiled old .ts file, overwriting .js exports
- Missing named exports

**Solution**:
- Rename .ts to .backup
- Add to tsconfig exclude: `"src/**/*.js"`
- Copy .js files to dist/ in build script

---

## Deployment Checklist

### Pre-Deploy
- [ ] All .ts files use .js extensions in imports
- [ ] No require() calls in ES modules
- [ ] tsconfig.build.json excludes .js/.mjs files
- [ ] build_typescript.sh copies .js files to dist/
- [ ] start.cjs uses dynamic import() with pathToFileURL()
- [ ] Local build succeeds: `npm run build:ts`
- [ ] Local start works: `npm start`

### Deploy
- [ ] `git push origin main`
- [ ] Watch Render build logs
- [ ] Verify: "Running postinstall TypeScript build..."
- [ ] Verify: "Project root: /opt/render/project" (NOT /opt/render/project/src!)
- [ ] Verify: "✅ TypeScript compilation successful!"
- [ ] Verify: "Copying JavaScript source files to dist/..."
- [ ] Verify: "Starting from: /opt/render/project/dist/index.js"

### Post-Deploy
- [ ] Bot initializes without errors
- [ ] Resource monitor starts
- [ ] Discord client connects
- [ ] No crashes in first 10 minutes
- [ ] Memory stays under 460 MB (90% threshold)
- [ ] No "Cannot find module" errors

---

## Performance Targets

### Memory (Render Starter: 512 MB)
- **Optimal**: 307-384 MB (60-75%)
- **Warning**: 384 MB (75%)
- **Critical**: 435 MB (85%)
- **Emergency**: 460 MB (90%)

### CPU (Render Starter: 0.5 vCPU)
- **Optimal**: < 50%
- **Warning**: 50%
- **Critical**: 70%
- **Emergency**: 90%

### Monitoring
- Real-time metrics: Every 15 seconds
- Snapshots: Every 5 minutes
- Retention: 24 hours (288 snapshots)
- Alerts: 4-tier system (optimal/warning/critical/emergency)

---

## Critical Files Index

| File | Purpose | Critical Details |
|------|---------|-----------------|
| `scripts/start.cjs` | Production start | CommonJS, dynamic import, pathToFileURL |
| `scripts/build_typescript.sh` | Build wrapper | Finds root, compiles, copies .js files |
| `tsconfig.build.json` | Build config | Excludes .js/.mjs, includes only .ts |
| `package.json` | npm scripts | postinstall hook, start command |
| `src/services/resource-monitor.js` | Resource monitor | 759 lines, JavaScript source |
| `src/index.ts` | Entry point | Imports from dist/ after compilation |
| `dist/index.js` | Compiled entry | Created by tsc, starts bot |

---

## Lessons Learned

### 1. Never Trust Working Directory on Cloud Platforms
- Render runs from `/opt/render/project/src` not project root
- Always use absolute paths for critical checks
- Verify assumptions with diagnostics

### 2. npm install Creates Artifacts
- `npm install` may create `package.json` in subdirectories
- Check absolute paths BEFORE relative paths
- Verify package name to confirm correct root

### 3. TypeScript + JavaScript Coexistence
- `.ts` and `.js` with same name cause conflicts
- TypeScript excludes .js but won't copy them
- Build scripts must copy .js files manually

### 4. ES Modules Require Careful Handling
- CWD affects import resolution
- require() fails with top-level await
- Use dynamic import() with file:// URLs

### 5. Start Scripts Need Robustness
- Inline node -e becomes unmaintainable
- Separate .cjs file allows debugging
- Comprehensive error messages save hours

---

## Future Improvements

### Short Term
1. Clean up diagnostic console.log statements
2. Remove .backup files after stability confirmed
3. Optimize build script for faster execution

### Medium Term
1. Migrate all .js services to TypeScript
2. Add build cache to speed up deployments
3. Implement health check endpoint

### Long Term
1. Consider Docker for consistent environments
2. Add integration tests for build process
3. Automate rollback on deployment failure

---

## References

- **Render Documentation**: https://render.com/docs
- **Node.js ES Modules**: https://nodejs.org/api/esm.html
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/
- **Discord.js Guide**: https://discordjs.guide/

---

## Commit History (This Session)

1. `a2d0875` - FIX: Exclude JS/MJS files from TypeScript compilation (TS5055)
2. `1e924e7` - DEBUG: Add diagnostics to build script
3. `09fcf6f` - CRITICAL FIX: Complete build/start script overhaul

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-12 19:00 UTC  
**Status**: ✅ FIXES DEPLOYED, MONITORING  
**Next Review**: After 24h stability confirmation
