#!/bin/bash
# Script: build_typescript.sh
# Purpose: Ensure TypeScript compiles from project root regardless of CWD
# This fixes the issue where Render runs from /opt/render/project/src

set -e

echo "🔨 TypeScript Build Starting..."
echo "Current directory: $(pwd)"

# Find project root (directory containing package.json)
if [ -f "package.json" ]; then
  PROJECT_ROOT="$(pwd)"
elif [ -f "../package.json" ]; then
  PROJECT_ROOT="$(cd .. && pwd)"
elif [ -f "../../package.json" ]; then
  PROJECT_ROOT="$(cd ../.. && pwd)"
elif [ -d "/opt/render/project" ] && [ -f "/opt/render/project/package.json" ]; then
  PROJECT_ROOT="/opt/render/project"
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
  exit 1
fi

if [ ! -d "src" ]; then
  echo "❌ ERROR: src/ directory not found in $PROJECT_ROOT"
  exit 1
fi

# Run TypeScript compiler
echo "Compiling TypeScript from: $(pwd)"
echo "Contents of src/ before build:"
ls -la src/ | head -10
npx tsc --project tsconfig.build.json
echo "Contents of dist/ after build:"
ls -la dist/ | head -10

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
