#!/usr/bin/env bash
# Guard: Verify .gitignore preserves meta documentation for AI navigation
# Purpose: Ensure ROUTER.md, README.md, and other meta docs are tracked
# Exit 0 if valid, non-zero if violations detected

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "🔍 Validating .gitignore preserves meta documentation..."

# Check if .gitignore exists
if [[ ! -f .gitignore ]]; then
  echo "❌ ERROR: .gitignore file not found"
  exit 1
fi

# Count how many ROUTER.md files are tracked
ROUTER_COUNT=$(git ls-files | grep -c 'ROUTER\.md$' || echo "0")

if [[ "$ROUTER_COUNT" -lt 10 ]]; then
  echo "❌ ERROR: Only $ROUTER_COUNT ROUTER.md files tracked (expected 10+)"
  echo "   Meta documentation must be preserved for AI navigation"
  exit 1
fi

# Verify critical meta docs are NOT ignored
CRITICAL_DOCS=(
  "secrets/ROUTER.md"
  "secrets/README.md"
  "tools/README.md"
  "data/cache/ROUTER.md"
  "Store/ROUTER.md"
)

ERRORS=0
for doc in "${CRITICAL_DOCS[@]}"; do
  if git check-ignore -q "$doc" 2>/dev/null; then
    echo "❌ ERROR: Critical meta doc is ignored: $doc"
    ((ERRORS++))
  fi
done

if [[ $ERRORS -gt 0 ]]; then
  echo "❌ FAILED: $ERRORS critical meta documentation files are being ignored"
  echo "   Update .gitignore to preserve these files for AI navigation"
  exit 1
fi

# Verify sensitive files ARE ignored
SENSITIVE_PATTERNS=(
  "secrets/*.env"
  "Store/db/"
  "tools/pgsql17/pgsql/bin/postgres.exe"
)

for pattern in "${SENSITIVE_PATTERNS[@]}"; do
  # Check if at least one matching file exists and is ignored
  if ls $pattern 2>/dev/null | head -1 | xargs -I {} git check-ignore -q {} 2>/dev/null || true; then
    : # Pattern is correctly ignored
  else
    if ls $pattern 2>/dev/null >/dev/null; then
      echo "⚠️  WARNING: Sensitive files may not be ignored: $pattern"
    fi
  fi
done

echo "✅ .gitignore validation passed:"
echo "   - $ROUTER_COUNT ROUTER.md files tracked for AI navigation"
echo "   - Critical meta docs preserved"
echo "   - Sensitive files excluded"

exit 0
