#!/bin/bash
# Pre-commit hook to prevent Store data files from being committed
# Installation: cp scripts/pre-commit-store-guard.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

# Check staged files for Store data (excluding metadata)
STAGED_STORE_FILES=$(git diff --cached --name-only | grep "^Store/" | grep -v -E "(ROUTER\.md|\.gitignore|README\.md)$" || true)

if [ -n "$STAGED_STORE_FILES" ]; then
  echo "❌ PRE-COMMIT BLOCKED: Store data files are staged!"
  echo ""
  echo "You are trying to commit production cache/logs:"
  echo "$STAGED_STORE_FILES"
  echo ""
  echo "These files will WIPE OUT production data on Render!"
  echo ""
  echo "To fix:"
  echo "  git reset HEAD Store/      # Unstage all Store files"
  echo ""
  echo "Only these Store files should be committed:"
  echo "  - ROUTER.md (documentation)"
  echo "  - .gitignore (protection rules)"
  echo "  - README.md (setup guides)"
  echo ""
  exit 1
fi

exit 0
