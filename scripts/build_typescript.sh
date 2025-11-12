#!/bin/bash
# Script: build_typescript.sh
# Purpose: Ensure TypeScript compiles from project root regardless of CWD
# This fixes the issue where Render runs from /opt/render/project/src

set -e

echo "🔨 TypeScript Build Starting..."
echo "Current directory: $(pwd)"
echo ""
echo "🔍 DEBUG: Checking file system..."
echo "  - /opt/render/project exists: $([ -d "/opt/render/project" ] && echo "YES" || echo "NO")"
echo "  - /opt/render/project/package.json exists: $([ -f "/opt/render/project/package.json" ] && echo "YES" || echo "NO")"
echo "  - /opt/render/project/src exists: $([ -d "/opt/render/project/src" ] && echo "YES" || echo "NO")"
echo "  - /opt/render/project/tsconfig.json exists: $([ -f "/opt/render/project/tsconfig.json" ] && echo "YES" || echo "NO")"
if [ -f "/opt/render/project/package.json" ]; then
  echo "  - /opt/render/project/package.json contents (first 5 lines):"
  head -5 /opt/render/project/package.json | sed 's/^/    /'
fi
echo "  - Current dir package.json exists: $([ -f "package.json" ] && echo "YES" || echo "NO")"
echo ""

# Find project root
# On Render, package.json may not exist at /opt/render/project after deployment
# Instead, look for indicators: src/ directory AND tsconfig.json
PROJECT_ROOT=""

# Check absolute Render path using src/ + tsconfig.json as indicators
if [ -d "/opt/render/project/src" ] && [ -f "/opt/render/project/tsconfig.json" ]; then
  PROJECT_ROOT="/opt/render/project"
  echo "✓ Found Render project root at /opt/render/project (detected via src/ + tsconfig.json)"
elif [ -d "/opt/render/project" ] && [ -f "/opt/render/project/package.json" ]; then
  # Fallback: package.json exists (local development)
  PKG_NAME=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' /opt/render/project/package.json | cut -d'"' -f4)
  echo "📦 Found package.json at /opt/render/project with name: '$PKG_NAME'"
  if [ "$PKG_NAME" = "infinity-gauntlet" ]; then
    PROJECT_ROOT="/opt/render/project"
    echo "✓ Found Render project root at /opt/render/project (verified package name)"
  fi
fi

# If not found yet, check parent directories
if [ -z "$PROJECT_ROOT" ]; then
  if [ -f "../package.json" ]; then
    PKG_NAME=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' ../package.json | cut -d'"' -f4)
    if [ "$PKG_NAME" = "infinity-gauntlet" ]; then
      PROJECT_ROOT="$(cd .. && pwd)"
      echo "✓ Found project root at parent directory (verified package name)"
    fi
  elif [ -f "../../package.json" ]; then
    PKG_NAME=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' ../../package.json | cut -d'"' -f4)
    if [ "$PKG_NAME" = "infinity-gauntlet" ]; then
      PROJECT_ROOT="$(cd ../.. && pwd)"
      echo "✓ Found project root at grandparent directory (verified package name)"
    fi
  elif [ -f "package.json" ]; then
    PKG_NAME=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' package.json | cut -d'"' -f4)
    if [ "$PKG_NAME" = "infinity-gauntlet" ]; then
      PROJECT_ROOT="$(pwd)"
      echo "✓ Found project root at current directory (verified package name)"
    fi
  fi
fi

if [ -z "$PROJECT_ROOT" ]; then
  echo "❌ ERROR: Cannot find project root (no valid infinity-gauntlet package.json found)"
  echo "Checked locations:"
  echo "  - /opt/render/project/package.json"
  echo "  - ../package.json"
  echo "  - ../../package.json"
  echo "  - ./package.json"
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
