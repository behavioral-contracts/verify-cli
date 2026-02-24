#!/bin/bash
# Opens a violation in your editor for manual inspection
# Usage: ./scripts/inspect-violation.sh <repo-name> <file-path> <line-number>

set -e

REPO=$1
FILE=$2
LINE=${3:-1}

if [ -z "$REPO" ] || [ -z "$FILE" ]; then
  echo "Usage: ./scripts/inspect-violation.sh <repo-name> <file-path> <line-number>"
  echo ""
  echo "Example:"
  echo "  ./scripts/inspect-violation.sh medusajs packages/core/src/api.ts 42"
  exit 1
fi

REPO_PATH="../test-repos/$REPO"
FULL_PATH="$REPO_PATH/$FILE"

if [ ! -f "$FULL_PATH" ]; then
  echo "❌ File not found: $FULL_PATH"
  echo ""
  echo "Is the repo cloned in test-repos/$REPO?"
  exit 1
fi

echo "Opening: $FULL_PATH at line $LINE"
echo ""

# Open in VSCode at specific line (if available)
if command -v code &> /dev/null; then
  code --goto "$FULL_PATH:$LINE"
else
  echo "⚠️  VSCode 'code' command not found. Opening with default editor."
  ${EDITOR:-vim} "+$LINE" "$FULL_PATH"
fi

# Print context (10 lines before and after)
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "Context around line $LINE:"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Use awk to print line numbers and highlight the target line
awk -v target="$LINE" '
  NR >= target-10 && NR <= target+10 {
    if (NR == target) {
      printf "\033[1;31m→ %4d │ %s\033[0m\n", NR, $0
    } else {
      printf "  %4d │ %s\n", NR, $0
    }
  }
' "$FULL_PATH"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "File: $FULL_PATH"
echo "Line: $LINE"
echo ""
