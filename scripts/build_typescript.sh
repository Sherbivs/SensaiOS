#!/bin/bash
# Script: build_typescript.sh  
# Purpose: Compile TypeScript to dist/ at repository root
# Render-compliant: Find repo root and build there

set -e

echo "🔨 TypeScript Build Starting..."
echo "   Initial directory: $(pwd)"

# Find repository root by looking for package.json with our package name
PROJECT_ROOT=""

# Check common locations
for check_dir in "." ".." "../.." "/opt/render/project"; do
  if [ -f "$check_dir/package.json" ]; then
    pkg_name=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$check_dir/package.json" 2>/dev/null | cut -d'"' -f4)
    if [ "$pkg_name" = "infinity-gauntlet" ]; then
      PROJECT_ROOT=$(cd "$check_dir" && pwd)
      echo "   ✓ Found project root: $PROJECT_ROOT"
      break
    fi
  fi
done

if [ -z "$PROJECT_ROOT" ]; then
  echo "   ❌ ERROR: Cannot find infinity-gauntlet package.json"
  echo "   Tried: ., .., ../.., /opt/render/project"
  exit 1
fi

# Change to project root
cd "$PROJECT_ROOT"
echo "   Working directory: $(pwd)"

# Verify required files exist
if [ ! -f "tsconfig.build.json" ]; then
  echo "   ❌ ERROR: tsconfig.build.json not found in $PROJECT_ROOT"
  exit 1
fi

if [ ! -d "src" ]; then
  echo "   ❌ ERROR: src/ directory not found in $PROJECT_ROOT"
  exit 1
fi

# Compile TypeScript
echo "   Compiling TypeScript..."
npx tsc --project tsconfig.build.json

# Copy JavaScript source files to dist/
echo "   Copying JavaScript source files..."
if [ -d "src/services" ]; then
  mkdir -p dist/services
  for jsfile in src/services/*.js; do
    if [ -f "$jsfile" ]; then
      cp "$jsfile" "dist/services/" 2>/dev/null || true
    fi
  done
fi

# Verify output
if [ -f "dist/index.js" ]; then
  echo "✅ Build successful!"
  echo "   Output: $(pwd)/dist/index.js"
else
  echo "❌ ERROR: dist/index.js not created"
  exit 1
fi
