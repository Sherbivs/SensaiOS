#!/bin/bash
# Script: verify_store_protection.sh
# Purpose: Verify Store/ data files are not tracked by git
# Usage: bash scripts/verify_store_protection.sh

set -e

echo "🔍 Verifying Store/ protection..."
echo ""

# Get list of tracked Store files (excluding metadata)
TRACKED_STORE_FILES=$(git ls-files Store/ | grep -v -E "(ROUTER\.md|\.gitignore|README\.md)$" || true)

if [ -n "$TRACKED_STORE_FILES" ]; then
  echo "[HALT] ISSUE: Store data files are tracked by git!"
  echo ""
  echo "The following Store files should NOT be committed:"
  echo "$TRACKED_STORE_FILES"
  echo ""
  echo "To fix:"
  echo "  git rm --cached <file>     # Remove from git tracking"
  echo "  git commit -m 'Remove Store data files from tracking'"
  echo ""
  exit 1
fi

# Check staged files
STAGED_STORE_FILES=$(git diff --cached --name-only | grep "^Store/" | grep -v -E "(ROUTER\.md|\.gitignore|README\.md)$" || true)

if [ -n "$STAGED_STORE_FILES" ]; then
  echo "[NOTE] Store data files are staged for commit!"
  echo ""
  echo "Staged files:"
  echo "$STAGED_STORE_FILES"
  echo ""
  echo "To fix:"
  echo "  git reset HEAD <file>      # Unstage the file"
  echo ""
  exit 1
fi

# Check if Store/.gitignore is correct
if [ ! -f "Store/.gitignore" ]; then
  echo "❌ CRITICAL: Store/.gitignore is missing!"
  echo ""
  echo "Create Store/.gitignore with:"
  echo "  *"
  echo "  !.gitignore"
  echo "  !ROUTER.md"
  echo "  !*/"
  echo ""
  exit 1
fi

# Verify Store/.gitignore contains the wildcard (check for * at start of line)
if ! grep -q "^[*]" "Store/.gitignore"; then
  echo "❌ CRITICAL: Store/.gitignore doesn't ignore all files!"
  echo ""
  echo "Store/.gitignore should contain:"
  echo "  *"
  echo "  !.gitignore"
  echo "  !ROUTER.md"
  echo "  !*/"
  echo ""
  exit 1
fi

echo "✅ Store/ protection verified!"
echo ""
echo "Summary:"
echo "  - No Store data files tracked by git"
echo "  - No Store data files staged for commit"
echo "  - Store/.gitignore exists and is correct"
echo ""
echo "🎯 Safe to commit - production cache/logs protected!"
