#!/bin/bash
# Run analysis on multiple repos

cd /Users/calebgates/WebstormProjects/behavioral-contracts/verify-cli

repos=(
  "cal.com"
  "backstage"
  "n8n"
  "supabase"
  "plane"
  "hoppscotch"
  "formbricks"
  "trigger.dev"
  "docusaurus"
  "payload"
)

for repo in "${repos[@]}"; do
  echo ""
  echo "======================================"
  echo "Analyzing: $repo"
  echo "======================================"
  ./scripts/run-analysis.sh "$repo" "../test-repos/$repo" || echo "❌ Failed: $repo"
done

echo ""
echo "✓ All analyses complete!"
echo "Results in: verify-cli/output/$(date +%Y%m%d)/"
