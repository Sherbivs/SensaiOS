# Render Architecture Audit & Redesign Plan
**Date:** November 12, 2025  
**Status:** AUDIT IN PROGRESS  
**Priority:** P0 - Production Outage (12+ hours, 20+ failed deployments)

---

## Executive Summary

After 20+ failed deployment attempts and 12+ hours of downtime, the root cause is **NOT** the elaborate detection scripts or path finding logic we've implemented. The fundamental issue is **architectural misalignment with Render's platform behavior**.

### The Core Problem

**Render behavior we've been fighting:**
- ✅ `rootDirectory: .` tells Render where the REPOSITORY is
- ❌ But npm commands still run from a DIFFERENT working directory
- ❌ Build artifacts (dist/) created at wrong location
- ❌ Runtime processes start from wrong working directory
- ❌ Module resolution fails because CWD doesn't match artifact locations

**What we've tried (ALL WORKAROUNDS):**
1. Complex path detection in `build_typescript.sh` (searching for package.json)
2. CommonJS wrapper script `start.cjs` (changing CWD before import)
3. Adding `cd /opt/render/project &&` to render.yaml startCommands
4. Adding `cd` commands to package.json scripts
5. Using absolute paths in startCommand

**Current state:** Still getting `Cannot find module '/opt/render/project/dist/index.js'` because:
- Build creates `dist/` at `/opt/render/project/src/dist/` (WRONG)
- Start tries to run from `/opt/render/project/dist/index.js` (file doesn't exist there)

---

## Root Cause Analysis

### 1. Render's Actual Behavior (Documented Facts)

According to Render's official documentation and our logs:

```
Render Build Container:
├─ Working directory: /opt/render/project/src  (NOT /opt/render/project!)
├─ buildCommand runs here
├─ npm install runs here
└─ postinstall hooks run here

Render Runtime Container:
├─ Working directory: /opt/render/project/src  (STILL wrong!)
├─ startCommand runs here
└─ Module resolution starts here
```

### 2. Why `rootDirectory: .` Doesn't Fix It

From Render docs:
> **rootDirectory** specifies where your code lives IN THE REPOSITORY.
> It does NOT control the working directory for build/start commands.

What `rootDirectory: .` actually does:
- ✅ Tells Render to look at repository root for package.json
- ✅ Sets context for REPOSITORY FILE ACCESS
- ❌ Does NOT change where npm commands execute
- ❌ Does NOT change where processes start

### 3. The Missing Configuration

After reviewing Render best practices, we're missing:

**Option A: Use build/start command prefixes (NOT WORKING)**
```yaml
startCommand: "cd /opt/render/project && node dist/index.js"
```
We tried this. Build logs show the `cd` command executes, but dist/ still doesn't exist at that location.

**Option B: Configure paths relative to actual working directory (SHOULD WORK)**
```yaml
buildCommand: "npm install && npm run build"
startCommand: "node dist/index.js"  # Run from WHERE IT WAS BUILT
```

**Option C: Make scripts adapt to Render's behavior (CURRENT APPROACH - FAILING)**
Complex detection logic trying to outsmart the platform.

---

## Why Our Current Approach Is Wrong

### Problem 1: Fighting The Platform

We're trying to force Render to behave how we want instead of adapting to how it works.

**Evidence:**
- 759-line `build_typescript.sh` with elaborate path detection
- 150-line `start.cjs` with multiple fallback strategies
- 8 different git commits trying variations of the same approach
- 20+ failed deployments

### Problem 2: Misunderstanding The Problem

We thought: "If we just find the correct root directory, everything will work"

Reality: **Render doesn't CARE about our root directory detection** because:
- Build commands run from `/opt/render/project/src` ALWAYS
- Start commands run from `/opt/render/project/src` ALWAYS
- Our scripts searching for package.json are irrelevant to Render's behavior

### Problem 3: Over-Engineering

We've created:
- Complex bash scripts with 5+ path checks
- CommonJS wrappers with directory traversal
- Multiple fallback strategies
- Extensive logging and diagnostics

When the solution should be: **Build where Render wants to build, run where Render wants to run**

---

## The Correct Solution

### Step 1: Accept Render's Behavior

Stop fighting where Render runs commands. Accept:
- ✅ Build runs from `/opt/render/project/src`
- ✅ Start runs from `/opt/render/project/src`
- ✅ dist/ will be created at `/opt/render/project/src/dist/`

### Step 2: Fix TypeScript Configuration

Make TypeScript output relative to WHERE THE BUILD RUNS:

```json
// tsconfig.build.json
{
  "compilerOptions": {
    "rootDir": ".",           // Current directory (where build runs)
    "outDir": "./dist",       // Output relative to CWD
    "baseUrl": ".",           // Module resolution from CWD
    "paths": {}               // No path mapping needed
  },
  "include": ["./**/*.ts"],   // Compile from CWD
  "exclude": ["./dist", "./node_modules"]
}
```

### Step 3: Fix Module Imports

Since dist/ is at `/opt/render/project/src/dist/`, imports should be:

```typescript
// src/index.ts
import { startResourceMonitoring } from './services/resource-monitor.js';
// Resolves to: /opt/render/project/src/services/resource-monitor.js ✅
```

After compilation:
```javascript
// dist/index.js  (at /opt/render/project/src/dist/index.js)
import { startResourceMonitoring } from './services/resource-monitor.js';
// Resolves to: /opt/render/project/src/dist/services/resource-monitor.js ✅
```

### Step 4: Simplify Scripts

**build script:**
```bash
#!/bin/bash
# No path detection needed!
npx tsc --project tsconfig.build.json
cp src/services/*.js dist/services/
```

**start script (package.json):**
```json
{
  "scripts": {
    "start": "node dist/index.js"  // Simple. No detection. No cd.
  }
}
```

**render.yaml:**
```yaml
services:
  - type: worker
    name: infinity-gauntlet
    runtime: node
    rootDirectory: src        # Tell Render our code is in src/
    buildCommand: "npm install && npm run build"
    startCommand: "npm start" # Runs from src/, finds dist/ at ./dist/
```

---

## Implementation Plan

### Phase 1: Simplify & Align (IMMEDIATE)

1. **Update `rootDirectory` in render.yaml**
   ```yaml
   rootDirectory: src  # Our code lives in src/, not .
   ```

2. **Fix tsconfig.build.json**
   ```json
   {
     "compilerOptions": {
       "rootDir": ".",
       "outDir": "./dist"
     }
   }
   ```

3. **Simplify build script**
   - Remove ALL path detection
   - Just compile and copy

4. **Simplify start script**
   - Remove start.cjs entirely
   - Use simple `node dist/index.js`

### Phase 2: Verify Locally (CRITICAL)

```bash
# Test build
cd src/
npm install
npm run build
# Verify: dist/ created at src/dist/

# Test start
npm start
# Verify: Bot starts, no module errors
```

### Phase 3: Deploy & Monitor

1. Commit changes
2. Push to Render
3. Watch build logs for:
   - "Working directory: /opt/render/project/src" ✅
   - "dist/index.js created" ✅
4. Watch start logs for:
   - "Starting bot..." ✅
   - No module errors ✅

---

## Files To Modify

### DELETE (No Longer Needed)
- ❌ `scripts/start.cjs` (150 lines of unnecessary CWD manipulation)
- ❌ Complex path detection in `scripts/build_typescript.sh`

### SIMPLIFY
- ✅ `scripts/build_typescript.sh` → 10 lines (just tsc + cp)
- ✅ `package.json` → Simple start script
- ✅ `render.yaml` → Change `rootDirectory: . ` to `rootDirectory: src`

### UPDATE
- ✅ `tsconfig.build.json` → Fix rootDir/outDir
- ✅ ALL render.yaml services → Update rootDirectory

---

## Why This Will Work

1. **Aligns with Render's behavior**
   - Build runs from src/ → dist/ created at src/dist/ ✅
   - Start runs from src/ → finds dist/ at ./dist/ ✅

2. **Eliminates complexity**
   - No path detection needed
   - No CWD manipulation needed
   - No fallback strategies needed

3. **Follows platform best practices**
   - Let Render do what it wants
   - Adapt our structure to the platform
   - Don't fight the platform

---

## Lessons Learned

### ❌ Wrong Approach
- Assuming we can control where Render runs commands
- Fighting platform behavior with workarounds
- Adding complexity to solve architectural misalignment

### ✅ Right Approach
- Understand platform behavior FIRST
- Adapt code structure to platform
- Keep scripts simple and platform-aligned
- **"Work with the platform, not against it"**

---

## Next Actions

1. **READ** Render documentation on rootDirectory
2. **UNDERSTAND** where Render actually runs commands
3. **ALIGN** our structure with Render's expectations
4. **SIMPLIFY** all detection/manipulation scripts
5. **TEST** locally with correct directory structure
6. **DEPLOY** aligned architecture

---

## References

- Render Docs: https://render.com/docs/configure-environment
- This Audit: `docs/deployment/RENDER-ARCHITECTURE-AUDIT-2025-11-12.md`
- Previous Attempts: `docs/REPOSITORY-OVERHAUL-2025-11-12.md`
- Failed Approaches: See git history (commits 437e321 through e1ffbd5)

---

**Status:** Document complete. Ready for Phase 1 implementation.
