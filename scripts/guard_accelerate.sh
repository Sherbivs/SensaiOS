#!/bin/bash
# guard_accelerate.sh - Prevent Accelerate code from entering the codebase
#
# PURPOSE:
#   Fail CI/build if any Accelerate references are detected in active code.
#   Part of Phase 1 cleanup to ensure Accelerate is completely eliminated.
#
# USAGE:
#   ./scripts/guard_accelerate.sh [--strict]
#
# OPTIONS:
#   --strict    Fail on ANY mention (including docs/comments)
#
# EXIT CODES:
#   0 - No Accelerate references found
#   1 - Accelerate references detected (build should fail)

set -euo pipefail

STRICT_MODE=false
FAILURES=0

# Parse arguments
for arg in "$@"; do
  case $arg in
    --strict)
      STRICT_MODE=true
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: $0 [--strict]"
      exit 1
      ;;
  esac
done

echo "🔍 Scanning for Accelerate residue..."
echo "Mode: $([ "$STRICT_MODE" = true ] && echo "STRICT" || echo "NORMAL")"
echo ""

# Function to check pattern and report findings
check_pattern() {
  local pattern="$1"
  local description="$2"
  local exclude_pattern="${3:-}"
  local is_critical="${4:-false}"
  
  echo "Checking: $description"
  
  local results
  
  # In strict mode, search all files except node_modules/dist/.git
  if [ "$STRICT_MODE" = true ]; then
    results=$(grep -rn --color=never --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git "$pattern" . 2>/dev/null || true)
  else
    results=$(grep -rn --color=never --include="*.ts" --include="*.js" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git "$pattern" . 2>/dev/null || true)
  fi
  
  if [ -n "$results" ]; then
    local count
    count=$(echo "$results" | wc -l)
    
    if [ "$is_critical" = true ]; then
      echo "  ❌ CRITICAL: Found $count match(es)"
      FAILURES=$((FAILURES + 1))
    else
      echo "  ⚠️  Warning: Found $count match(es)"
    fi
    
    # Show first 5 matches
    echo "$results" | head -5 | sed 's/^/    /'
    
    if [ "$count" -gt 5 ]; then
      echo "    ... and $((count - 5)) more"
    fi
    echo ""
  else
    echo "  ✅ Clean"
    echo ""
  fi
}

# CRITICAL PATTERNS - These should NEVER appear in active code
echo "=== CRITICAL PATTERNS (Active Code) ==="
echo ""

check_pattern "prisma://" "Accelerate URL scheme (prisma://)" "" true
check_pattern "prisma\\+postgres://" "Accelerate URL scheme (prisma+postgres://)" "" true
check_pattern "data-proxy" "Data-proxy engine references" "" true
check_pattern "dataproxy" "Dataproxy engine references" "" true
check_pattern "@prisma/extension-accelerate" "Accelerate extension import" "" true
check_pattern "PRISMA_CLIENT_ENGINE_TYPE.*accelerate" "Accelerate engine type env var" "" true

# WARNING PATTERNS - May be acceptable in comments/docs but should be reviewed
if [ "$STRICT_MODE" = true ]; then
  echo "=== WARNING PATTERNS (Strict Mode) ==="
  echo ""
  
  check_pattern "accelerate" "Generic accelerate mentions (case-insensitive)" "" false
  check_pattern "Accelerate" "Accelerate mentions (capitalized)" "" false
  check_pattern "ACCELERATE" "ACCELERATE mentions (uppercase)" "" false
fi

# Check environment templates for Accelerate URLs
echo "=== ENVIRONMENT FILES ==="
echo ""

if [ -f "secrets/env.template" ]; then
  if grep -q "prisma://" secrets/env.template 2>/dev/null; then
    echo "  ❌ CRITICAL: Found Accelerate URL in secrets/env.template"
    FAILURES=$((FAILURES + 1))
  else
    echo "  ✅ secrets/env.template clean"
  fi
fi

if [ -f "secrets/prisma-dev.env.example" ]; then
  if grep -q "prisma://" secrets/prisma-dev.env.example 2>/dev/null; then
    echo "  ❌ CRITICAL: Found Accelerate URL in secrets/prisma-dev.env.example"
    FAILURES=$((FAILURES + 1))
  else
    echo "  ✅ secrets/prisma-dev.env.example clean"
  fi
fi

echo ""

# Check render.yaml for fromDatabase references (should use direct connectionString)
echo "=== RENDER CONFIGURATION ==="
echo ""

if [ -f "render.yaml" ]; then
  # Extract service names that have database environment variables
  echo "Checking render.yaml for DATABASE_URL configuration..."
  
  # Get unique service names
  service_names=$(grep -E "^\s+name: infinity-gauntlet" render.yaml | sed 's/.*name: //' | sort | uniq)
  
  all_good=true
  for service in $service_names; do
    # Skip the database itself
    if [ "$service" = "infinity-gauntlet-db" ]; then
      continue
    fi
    
    # Check if service has DATABASE_URL
    if grep -A 50 "name: $service" render.yaml | grep -q "key: DATABASE_URL"; then
      echo "  ✅ $service has explicit DATABASE_URL"
    else
      # Check if service has DEV or PROD URLs (may still work but not ideal)
      if grep -A 50 "name: $service" render.yaml | grep -q "DEV_DATABASE_URL\|PROD_DATABASE_URL"; then
        echo "  ⚠️  $service has DEV/PROD URLs but missing explicit DATABASE_URL"
        echo "     (Prisma generation may fail during build)"
      fi
    fi
  done
  
  echo ""
fi

# Summary
echo "=== SUMMARY ==="
echo ""

if [ $FAILURES -eq 0 ]; then
  echo "✅ All checks passed - No Accelerate residue detected"
  echo ""
  exit 0
else
  echo "❌ $FAILURES critical issue(s) detected"
  echo ""
  echo "Action Required:"
  echo "  1. Remove Accelerate references from active code"
  echo "  2. Update environment templates to use direct PostgreSQL URLs"
  echo "  3. Ensure render.yaml sets explicit DATABASE_URL for all services"
  echo ""
  echo "See ops/CODEBASE-OVERHAUL-PLAN.md for comprehensive cleanup guide"
  echo ""
  exit 1
fi
