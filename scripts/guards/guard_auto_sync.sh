#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

DEFAULT_DEV_ENV="C:/Users/sherb/OneDrive/Documents/Key/Dev/.env"
DEFAULT_PROD_ENV="C:/Users/sherb/OneDrive/Documents/Key/Prod/.env"

DEV_ENV_PATH="${IG_DEV_ENV_FILE:-${DEFAULT_DEV_ENV}}"
PROD_ENV_PATH="${IG_PROD_ENV_FILE:-${DEFAULT_PROD_ENV}}"
TRIGGER_PATH="${DEX_TRIGGER_PATH:-${ROOT}/data/cache/dex-sync-trigger.json}"

resolve_existing_path() {
  local incoming="$1"
  if [[ -z "${incoming}" ]]; then
    return 1
  fi

  if [[ -f "${incoming}" ]]; then
    echo "${incoming}"
    return 0
  fi

  if command -v wslpath >/dev/null 2>&1; then
    local converted
    converted="$(wslpath "${incoming}" 2>/dev/null || true)"
    if [[ -n "${converted}" && -f "${converted}" ]]; then
      echo "${converted}"
      return 0
    fi
  fi

  return 1
}

ensure_file() {
  local label="$1"
  local original="$2"
  local resolved
  resolved="$(resolve_existing_path "${original}")" || {
    echo "::error::Missing ${label}: ${original}"
    exit 1
  }

  if [[ ! -s "${resolved}" ]]; then
    echo "::error::${label} is empty: ${original}"
    exit 1
  fi

  echo "${resolved}"
}

ensure_file "Dev env file" "${DEV_ENV_PATH}" >/dev/null
ensure_file "Prod env file" "${PROD_ENV_PATH}" >/dev/null
ensure_file "Dex trigger" "${TRIGGER_PATH}" >/dev/null

WIN_PATH() {
  local candidate="$1"
  case "${candidate}" in
    /mnt/*|/home/*)
      ;;
    *)
      echo "${candidate}"
      return
      ;;
  esac

  if command -v wslpath >/dev/null 2>&1; then
    local converted
    converted="$(wslpath -m "${candidate}" 2>/dev/null || true)"
    if [[ -n "${converted}" ]]; then
      echo "${converted}"
      return
    fi
  fi
  echo "${candidate}"
}

DEV_ENV_PATH_WIN="$(WIN_PATH "${DEV_ENV_PATH}")"
PROD_ENV_PATH_WIN="$(WIN_PATH "${PROD_ENV_PATH}")"
TRIGGER_PATH_WIN="$(WIN_PATH "${TRIGGER_PATH}")"
ROOT_WIN="$(WIN_PATH "${ROOT}")"

export IG_ENV_FILE="${DEV_ENV_PATH_WIN}"

echo "Running auto-sync dry-run guard..."

npx tsx -- "${ROOT_WIN}/scripts/dev_prod_auto_sync.ts" \
  --ci \
  --dry-run \
  --once \
  --skip-startup \
  --dev-env "${DEV_ENV_PATH_WIN}" \
  --prod-env "${PROD_ENV_PATH_WIN}" \
  --trigger-path "${TRIGGER_PATH_WIN}"
