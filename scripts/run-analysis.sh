#!/bin/bash
# Run behavioral contract analysis against a TypeScript repo
# Usage: ./scripts/run-analysis.sh <repo-name> <project-dir-or-tsconfig>

set -e

REPO_NAME=$1
PROJECT_PATH=$2
OUTPUT_DIR="output/$(date +%Y%m%d)"
CORPUS_PATH="../corpus"

# Validate inputs
if [ -z "$REPO_NAME" ] || [ -z "$PROJECT_PATH" ]; then
  echo "Usage: ./scripts/run-analysis.sh <repo-name> <project-dir-or-tsconfig>"
  echo ""
  echo "Examples:"
  echo "  ./scripts/run-analysis.sh medusajs ../test-repos/medusa"
  echo "  ./scripts/run-analysis.sh medusajs ../test-repos/medusa/tsconfig.json"
  echo ""
  echo "Note: tsconfig.json will be auto-generated if not found"
  exit 1
fi

# Determine tsconfig path
# If PROJECT_PATH is a directory, append /tsconfig.json
# If it's already a .json file, use as-is
if [ -d "$PROJECT_PATH" ]; then
  TSCONFIG_PATH="$PROJECT_PATH/tsconfig.json"
elif [ -f "$PROJECT_PATH" ]; then
  TSCONFIG_PATH="$PROJECT_PATH"
else
  # Path doesn't exist yet - assume it's meant to be a tsconfig path
  # Auto-generation will create it
  TSCONFIG_PATH="$PROJECT_PATH"
fi

# Check CLI is built
if [ ! -f "dist/index.js" ]; then
  echo "Error: CLI not built. Run 'npm run build' first."
  exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo "Running analysis on $REPO_NAME..."
echo "Project path: $PROJECT_PATH"
echo "Tsconfig path: $TSCONFIG_PATH"
echo "Output will be saved to $OUTPUT_DIR/"
echo ""

# Run analysis
node dist/index.js \
  --tsconfig "$TSCONFIG_PATH" \
  --corpus "$CORPUS_PATH" \
  --output "$OUTPUT_DIR/${REPO_NAME}-audit.json" \
  2>&1 | tee "$OUTPUT_DIR/${REPO_NAME}-output.txt"

echo ""
echo "✓ Analysis complete!"
echo ""
echo "Output files:"
echo "  JSON: $OUTPUT_DIR/${REPO_NAME}-audit.json"
echo "  Text: $OUTPUT_DIR/${REPO_NAME}-output.txt"
echo ""
echo "Next: Document findings in dev-notes/findings/"
