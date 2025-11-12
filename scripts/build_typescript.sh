#!/bin/bash
# Script: build_typescript.sh  
# Purpose: Compile TypeScript to dist/ (Render-aligned architecture)
# Working directory: Render runs from /opt/render/project (repo root)

set -e

echo "🔨 TypeScript Build Starting..."
echo "   Working directory: $(pwd)"

# Compile TypeScript
echo "   Compiling TypeScript..."
npx tsc --project tsconfig.build.json

# Copy JavaScript source files to dist/
echo "   Copying JavaScript source files..."
if [ -d "src/services" ]; then
  mkdir -p dist/services
  cp src/services/*.js dist/services/ 2>/dev/null || true
fi

# Verify output
if [ -f "dist/index.js" ]; then
  echo "✅ Build successful!"
  echo "   Output: $(pwd)/dist/index.js"
else
  echo "❌ ERROR: dist/index.js not created"
  exit 1
fi
