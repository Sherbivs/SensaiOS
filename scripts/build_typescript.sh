#!/bin/bash
# Script: build_typescript.sh
# Purpose: Compile TypeScript to dist/
# Now that render.yaml specifies rootDirectory: ., this runs from project root

set -e

echo "� TypeScript Build Starting..."
echo "   Working directory: $(pwd)"

# Verify we're in project root
if [ ! -f "tsconfig.build.json" ]; then
  echo "❌ ERROR: tsconfig.build.json not found"
  echo "   Current directory: $(pwd)"
  echo "   This script must run from project root"
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
