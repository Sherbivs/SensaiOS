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

# Copy ALL JavaScript source files to dist/ (preserving directory structure)
# tsconfig excludes .js files, so we must copy them manually
echo "   Copying JavaScript source files..."
cd src
find . -type f -name "*.js" | while read -r jsfile; do
  targetdir="$(dirname "../dist/$jsfile")"
  mkdir -p "$targetdir"
  cp "$jsfile" "../dist/$jsfile"
done
cd ..

# Verify output
if [ -f "dist/index.js" ]; then
  echo "[OK] Build successful!"
  echo "   Output: $(pwd)/dist/index.js"
else
  echo "[HALT] dist/index.js not created"
  exit 1
fi
