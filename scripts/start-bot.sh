#!/bin/bash
# Script: start_bot.sh
# Purpose: Start the bot from the correct dist/index.js location

set -e

echo "🚀 Starting bot..."
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

# Verify dist/index.js exists
DIST_PATH="$PROJECT_ROOT/dist/index.js"
if [ ! -f "$DIST_PATH" ]; then
  echo "❌ ERROR: dist/index.js not found!"
  echo "   Expected: $DIST_PATH"
  echo ""
  echo "Checking for dist/ in other locations:"
  ls -la "$PROJECT_ROOT/dist/" 2>/dev/null || echo "  - $PROJECT_ROOT/dist/ doesn't exist"
  ls -la "$PROJECT_ROOT/src/dist/" 2>/dev/null && echo "  - FOUND at $PROJECT_ROOT/src/dist/ (WRONG LOCATION!)"
  exit 1
fi

echo "Found: $DIST_PATH"
echo "Starting bot..."

# Change to project root and run
cd "$PROJECT_ROOT"
node dist/index.js
