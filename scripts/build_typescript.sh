#!/bin/bash
# Script: build_typescript.sh
# Purpose: Ensure TypeScript compiles from project root regardless of CWD
# This fixes the issue where Render runs from /opt/render/project/src

set -e

echo "🔨 TypeScript Build Starting..."
echo "Current directory: $(pwd)"

# Find project root (directory containing package.json)
# Check absolute Render path FIRST to avoid false positives
if [ -d "/opt/render/project" ] && [ -f "/opt/render/project/package.json" ]; then
  PROJECT_ROOT="/opt/render/project"
elif [ -f "../package.json" ]; then
  PROJECT_ROOT="$(cd .. && pwd)"
elif [ -f "../../package.json" ]; then
  PROJECT_ROOT="$(cd ../.. && pwd)"
elif [ -f "package.json" ]; then
  PROJECT_ROOT="$(pwd)"
else
  echo "❌ ERROR: Cannot find project root (package.json not found)"
  exit 1
fi

echo "Project root: $PROJECT_ROOT"

# Change to project root
cd "$PROJECT_ROOT"

# Verify we're in the right place
if [ ! -f "tsconfig.build.json" ]; then
  echo "❌ ERROR: tsconfig.build.json not found in $PROJECT_ROOT"
  echo "Contents of $PROJECT_ROOT:"
  ls -la "$PROJECT_ROOT" | head -20
  exit 1
fi

if [ ! -d "src" ]; then
  echo "❌ ERROR: src/ directory not found in $PROJECT_ROOT"
  echo "Contents of $PROJECT_ROOT:"
  ls -la "$PROJECT_ROOT" | head -20
  exit 1
fi

# Run TypeScript compiler
echo "Compiling TypeScript from: $(pwd)"
echo "Running: tsc --project tsconfig.build.json"
npx tsc --project tsconfig.build.json

# Copy JavaScript source files that aren't compiled by TypeScript
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
  echo "   Output: $PROJECT_ROOT/dist/index.js"
else
  echo "❌ ERROR: dist/index.js not created!"
  echo "   Expected: $PROJECT_ROOT/dist/index.js"
  ls -la dist/ 2>/dev/null || echo "   dist/ directory doesn't exist"
  exit 1
fi
