#!/usr/bin/env bash
set -euo pipefail

# verify_router_links.sh
# Fails if:
# 1) ops/ROUTER_INDEX.yaml contains a path that does not exist exactly as spelled.
# 2) Any canonical file from ops/CANONICAL_NAMES.yaml is missing or only present under a different case.
# 3) Duplicate case-variants exist for a canonical name (e.g., Patch.md alongside patch.md).
#
# This script is case-sensitive and must run on a case-sensitive FS (CI ubuntu-latest is fine).

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
INDEX="$ROOT/ops/ROUTER_INDEX.yaml"
CANON="$ROOT/ops/CANONICAL_NAMES.yaml"

err=0

note() { echo "::notice ::$*"; }
warn() { echo "::warning ::$*"; }
fail() { echo "::error ::$*"; err=1; }

exact_exists() {
  local p="$1"
  [[ -f "$ROOT/$p" || -d "$ROOT/$p" ]]
}

variant_exists() {
  local p="$1"
  local dir="${p%/*}"
  local base="${p##*/}"
  local search_dir="$ROOT"
  [[ "$dir" != "$p" ]] && search_dir="$ROOT/$dir"
  [[ -d "$search_dir" ]] || return 1
  shopt -s nullglob
  local hits=()
  while IFS= read -r -d '' hit; do
    hits+=("$hit")
  done < <(find "$search_dir" -maxdepth 1 -iname "$base" -print0)
  shopt -u nullglob

  local exact="$ROOT/$p"
  local variants=0
  for h in "${hits[@]:-}"; do
    if [[ "$h" != "$exact" ]]; then
      variants=$((variants + 1))
      fail "Case-variant exists for '$p': found '$h'. Keep only the canonical spelling."
    fi
  done
  [[ $variants -gt 0 ]]
}

if [[ -f "$INDEX" ]]; then
  note "Checking ops/ROUTER_INDEX.yaml entries…"
  while IFS= read -r line; do
    p="$(sed -E 's/^[[:space:]-]*path:[[:space:]]*"?([^"#]+)"?.*/\1/' <<<"$line")"
    [[ -z "$p" ]] && continue
    p="$(echo "$p" | sed 's/[[:space:]]*$//')"
    if [[ -z "$p" ]]; then
      continue
    fi
    if ! exact_exists "$p"; then
      local ci_hit
      ci_hit="$(find "$ROOT" -path "$ROOT/$p" -o -iname "$(basename "$p")" -printf '%P\n' 2>/dev/null | head -n1 || true)"
      if [[ -n "$ci_hit" && "$ci_hit" != "$p" ]]; then
        fail "Router index path missing exactly: '$p'. Did you mean '$ci_hit'?"
      else
        fail "Router index path not found: '$p'. Ensure spelling/case matches the filesystem."
      fi
    else
      variant_exists "$p" || true
    fi
  done < <(grep -E '^[[:space:]-]*path:' "$INDEX" || true)
else
  warn "ops/ROUTER_INDEX.yaml not found; skipping index check."
fi

if [[ -f "$CANON" ]]; then
  note "Checking canonical filenames…"
  mapfile -t items < <(grep -E '^[[:space:]-]+[A-Za-z0-9_./-]+$' "$CANON" | sed -E 's/^[[:space:]-]+//')
  for p in "${items[@]}"; do
    if ! exact_exists "$p"; then
      local alt
      alt="$(git ls-files | awk 'BEGIN{IGNORECASE=1} $0==p{print $0}' p="$p")"
      if [[ -n "$alt" && "$alt" != "$p" ]]; then
        fail "Canonical file missing exactly as spelled: '$p'. Found different case: '$alt'."
      else
        fail "Canonical file missing: '$p'."
      fi
    else
      variant_exists "$p" || true
    fi
  done
else
  warn "ops/CANONICAL_NAMES.yaml not found; skipping canonical name check."
fi

if [[ $err -ne 0 ]]; then
  echo "verify_router_links: FAIL"
  exit 1
fi

echo "verify_router_links: PASS"
