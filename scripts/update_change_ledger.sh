#!/usr/bin/env bash
set -euo pipefail

LEDGER_BEGIN='<!-- LEDGER:BEGIN -->'
LEDGER_END='<!-- LEDGER:END -->'
TMP_FILE=$(mktemp)

COMMITS=$(git rev-list --max-count=200 HEAD)
{
  echo ""
  echo "**Generated:** $(date -u +'%Y-%m-%dT%H:%M:%SZ')  |  **Branch:** $(git rev-parse --abbrev-ref HEAD)"
  echo ""
  for c in $COMMITS; do
    short=$(git rev-parse --short "$c")
    author=$(git show -s --format='%an' "$c")
    date=$(git show -s --format='%ad' --date=format:'%Y-%m-%d' "$c")
    subject=$(git show -s --format='%s' "$c" | sed 's/|/\\|/g')
    echo "- **$short** — $date — $author — _logic intent:_ $subject"
    git show --name-only --pretty="" "$c" | grep -v '^$' | while read -r f; do
      case "$f" in
        *.min.*) continue ;;
      esac
      hunks=$(git show --unified=0 "$c" -- "$f" | grep -E '^@@ ' || true)
      if [[ -n "$hunks" ]]; then
        ranges=$(echo "$hunks" | sed -E 's/^@@ -([0-9]+)(,[0-9]+)? \+([0-9]+)(,[0-9]+)? @@.*$/+\3\4/g' | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g')
        echo "  - \`$f\` — ~lines: ${ranges}"
      else
        echo "  - \`$f\`"
      fi
    done
  done
} >"$TMP_FILE"

awk -v BEGIN="$LEDGER_BEGIN" -v END="$LEDGER_END" -v file="$TMP_FILE" '
  BEGIN {inblk=0}
  {
    if ($0 ~ BEGIN) { print; system("cat " file); inblk=1; next }
    if ($0 ~ END && inblk==1) { inblk=0 }
    if (inblk==0) print
  }
' Prompt.md > Prompt.md.new

mv Prompt.md.new Prompt.md
rm -f "$TMP_FILE"
echo "Ledger updated in Prompt.md."
