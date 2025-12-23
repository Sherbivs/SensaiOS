#!/usr/bin/env bash
set -euo pipefail
# Builds ops/ROUTER_INDEX.yaml by scanning for */ROUTER.md files and extracting metadata.

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
cd "$ROOT"

INDEX_FILE="ops/ROUTER_INDEX.yaml"
GEN_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

echo "version: 1" > "$INDEX_FILE"
echo "generated_utc: \"$GEN_TIME\"" >> "$INDEX_FILE"
echo "routers:" >> "$INDEX_FILE"

# Find ROUTER.md files (case-sensitive), excluding node_modules and .git, sorted for determinism
git ls-files | grep -E '(^|/)ROUTER\.md$' | grep -vE '(^|/)(node_modules|\.git)(/|$)' | sort | while read -r router; do
  dir="$(dirname "$router")"
  title="$(grep -m1 '^Title:' "$router" | sed 's/^Title:[[:space:]]*//')"
  purpose="$(grep -m1 '^Purpose:' "$router" | sed 's/^Purpose:[[:space:]]*//')"
  last_updated="$(grep -m1 '^Last Updated (UTC):' "$router" | sed 's/^Last Updated (UTC):[[:space:]]*//')"
  echo "  - path: \"$dir/\"" >> "$INDEX_FILE"
  echo "    router_file: \"$router\"" >> "$INDEX_FILE"
  echo "    title: \"${title:-}\"" >> "$INDEX_FILE"
  echo "    purpose: \"${purpose:-}\"" >> "$INDEX_FILE"
  echo "    last_updated_utc: \"${last_updated:-}\"" >> "$INDEX_FILE"
done

echo "[router-index] Wrote $INDEX_FILE"
