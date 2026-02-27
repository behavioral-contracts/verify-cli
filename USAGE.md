# Verify-CLI Usage Guide

**Complete guide to using the Behavioral Contracts verification tool.**

---

## Table of Contents

- [Quick Start](#quick-start)
- [Running Scans](#running-scans)
  - [Single Repository](#single-repository)
  - [Multiple Repositories](#multiple-repositories)
- [Understanding Output](#understanding-output)
  - [Standard Violations Report](#standard-violations-report)
  - [Positive Evidence Report](#positive-evidence-report)
  - [Benchmarking Results](#benchmarking-results)
- [CLI Options](#cli-options)
- [Advanced Usage](#advanced-usage)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

**Prerequisites:**
- Node.js 18+ installed
- TypeScript project with `tsconfig.json`
- Behavioral contracts corpus (included in this repo)

**Basic scan:**

```bash
cd verify-cli
npm run build
node dist/index.js --tsconfig /path/to/your/tsconfig.json --corpus ../corpus
```

This will:
1. ✅ Analyze your TypeScript codebase
2. ✅ Check for behavioral contract violations
3. ✅ Generate positive evidence report (what passed)
4. ✅ Compare against benchmark (282 repos analyzed)
5. ✅ Output results to terminal and files

---

## Running Scans

### Single Repository

**Command:**

```bash
cd verify-cli
node dist/index.js \
  --tsconfig /path/to/repo/tsconfig.json \
  --corpus ../corpus \
  --output output/runs/$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)/repo-name/audit.json
```

**Example - scanning your client's repo:**

```bash
cd verify-cli
node dist/index.js \
  --tsconfig ../test-repos/Next-js-Boilerplate/tsconfig.json \
  --corpus ../corpus \
  --output output/runs/$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)/Next-js-Boilerplate/audit.json
```

**Outputs:**
- `audit.json` - Machine-readable violations
- `audit-positive-report.txt` - Human-readable positive evidence report
- Terminal output - Both reports displayed

**Shorter version (default output location):**

```bash
node dist/index.js --tsconfig /path/to/tsconfig.json --corpus ../corpus
```

Outputs to current directory:
- `./behavioral-audit.json`
- `./behavioral-audit-positive-report.txt`

### Multiple Repositories

**Using the scan script:**

```bash
# From the behavioral-contracts root
./tools/scan-all-repos.sh
```

This will:
- Scan all repositories in `test-repos/`
- Generate timestamped output for each
- Calculate aggregate statistics
- Update benchmarking data

**Outputs organized by run:**

```
verify-cli/output/runs/
└── 20260226-114616-2b12e68/
    ├── Next-js-Boilerplate/
    │   ├── audit.json
    │   ├── audit-positive-report.txt
    │   └── output.txt
    ├── medusajs/
    │   ├── audit.json
    │   └── ...
    └── [... 282 repos ...]
```

**Recalculate benchmark after scanning:**

```bash
node tools/calculate-benchmark.mjs
```

This updates `verify-cli/data/benchmarks.json` with new aggregate stats.

---

## Understanding Output

### Standard Violations Report

**What it shows:**
- Summary (files analyzed, contracts applied, violations found)
- Package discovery (packages with/without contracts)
- Violations by package (grouped by severity)

**Example:**

```
Behavioral Contract Verification Report
────────────────────────────────────────────────────────

Summary:
  Files analyzed: 55
  Contracts applied: 258
  Timestamp: 2026-02-26T11:47:26.456Z

Package Discovery & Coverage
────────────────────────────────────────────────────────
  Total packages: 72
  Packages with contracts: 7 (9.7%)
  Packages without contracts: 65

Violations by Package
────────────────────────────────────────────────────────
react-hook-form (1 violations)
  Errors: 1 | Warnings: 0 | Info: 0

  ✗ ../test-repos/Next-js-Boilerplate/src/components/CounterForm.tsx:19:27
    No try-catch block found. UnhandledPromiseRejection - this will crash the application.
    Package: react-hook-form.handleSubmit()
    Contract: async-submit-unhandled-error
```

### Positive Evidence Report

**NEW: Shows value even at zero violations!**

**What it shows:**
1. **Health Score** - Composite metric (0-100)
2. **Coverage Summary** - Checks passed vs violations
3. **Repository Health Metrics** - Compliance %, maturity, risk level
4. **Package Breakdown** - Per-package stats (ALL packages, not just violations)
5. **Benchmarking** - How you compare to 282 other repos
6. **Insights** - Positive patterns detected
7. **Recommendations** - Actionable next steps

**Example (1 violation):**

```
╔═══════════════════════════════════════════════════════╗
║    Behavioral Contracts Analysis Report               ║
╚═══════════════════════════════════════════════════════╝

✅ CODE HEALTH SCORE: 73/100

📊 COVERAGE SUMMARY
────────────────────────────────────────────────────────
  • Files Analyzed: 55
  • Package Usages Detected: 258
  • Contracts Applied: 258
  • Violations Found: 1 !
  • Checks Passed: 257 ✓

📈 REPOSITORY HEALTH METRICS
────────────────────────────────────────────────────────
  • Error Handling Compliance: 100%
  • Package Coverage: 10%
  • Code Maturity: HIGH
  • Risk Level: MEDIUM

🔍 PACKAGE USAGE BREAKDOWN
────────────────────────────────────────────────────────
  @clerk/nextjs      ✓  36 checks    0 issues  100% pass
  drizzle-orm        ✓  36 checks    0 issues  100% pass
  next               ✓  36 checks    0 issues  100% pass
  pg                 ✓  36 checks    0 issues  100% pass
  typescript         ✓  36 checks    0 issues  100% pass
  zod                ✓  36 checks    0 issues  100% pass
  react-hook-form    ✗   5 checks    1 issues  80% pass
      ↳ 1 errors

  Total packages analyzed: 49
  Packages with contracts: 7
  Fully compliant: 6 ✓
  With violations: 1 ✗

🏆 BENCHMARKING
────────────────────────────────────────────────────────
  Sample Size: 282 repositories analyzed

  Your Violations: 1
  Average Violations: 29

  ✓ You avoided 28 violations vs typical repo

  Your Ranking: Top 62%
  Your repo is better than 38% of repos scanned.

  Percentile Distribution:
    25th percentile: 0 violations
    50th percentile: 0 violations (median)
    75th percentile: 2 violations
    90th percentile: 38 violations

💡 INSIGHTS
────────────────────────────────────────────────────────
  ✓ 6 packages have zero violations
  ✓ Global error handling patterns detected
  ✓ Consistent error handling patterns throughout codebase
  ✓ Analyzed 258 function calls - comprehensive coverage
  ✓ Avoided 28 violations compared to average repo

🎯 RECOMMENDATIONS
────────────────────────────────────────────────────────
  1. Fix 1 remaining violations to achieve 100% compliance
  2. Run scan after fixes to verify improvements
  3. Add to CI to prevent future violations
  4. Request contracts for your most-used packages (65 uncovered)
```

**Key Insight:** Instead of "1 error found", you see:
- ✅ 257 checks passed
- ✅ Avoided 28 violations vs average
- ✅ Top 62% ranking
- ⚠️ 1 issue to fix

### Benchmarking Results

**How it works:**
- Baseline calculated from 282 repositories
- Average: 28.8 violations per repo
- Median: 0 violations (most repos are clean!)
- Your repo compared to distribution

**Metrics shown:**
- **Your Violations** - Count in this repo
- **Average Violations** - Across all 282 repos
- **Violations Avoided** - How many you prevented vs average
- **Percentile Rank** - What % of repos you're cleaner than
- **Comparison** - Descriptive (Much Better, Better, Average, Worse, Much Worse)

**Updating the benchmark:**

As you scan more repos, recalculate the baseline:

```bash
node tools/calculate-benchmark.mjs
```

This reads all `verify-cli/output/runs/**/audit.json` files and updates `verify-cli/data/benchmarks.json`.

---

## CLI Options

### Required

```bash
--tsconfig <path>    # Path to tsconfig.json (required for TypeScript analysis)
--corpus <path>      # Path to corpus directory (default: ../corpus)
```

### Optional

```bash
--output <path>              # Output path for audit.json (default: ./behavioral-audit.json)
--project <path>             # Path to project root for package.json discovery (default: cwd)
--no-terminal                # Disable terminal output (JSON only)
--no-positive-report         # Disable positive evidence report
--fail-on-warnings           # Exit with error code if warnings found
--discover-packages          # Enable package discovery (default: true)
--include-tests              # Include test files in analysis (default: false)
```

### Examples

**Basic scan:**
```bash
node dist/index.js --tsconfig ./tsconfig.json --corpus ../corpus
```

**Scan with custom output location:**
```bash
node dist/index.js \
  --tsconfig ./tsconfig.json \
  --corpus ../corpus \
  --output ./reports/audit-$(date +%Y%m%d).json
```

**JSON-only output (no terminal):**
```bash
node dist/index.js \
  --tsconfig ./tsconfig.json \
  --corpus ../corpus \
  --no-terminal
```

**Disable positive evidence report:**
```bash
node dist/index.js \
  --tsconfig ./tsconfig.json \
  --corpus ../corpus \
  --no-positive-report
```

**Fail CI on warnings:**
```bash
node dist/index.js \
  --tsconfig ./tsconfig.json \
  --corpus ../corpus \
  --fail-on-warnings
```

**Include test files:**
```bash
node dist/index.js \
  --tsconfig ./tsconfig.json \
  --corpus ../corpus \
  --include-tests
```

---

## Advanced Usage

### Testing Against Specific Audit File

If you have an existing `audit.json`, you can generate a positive evidence report from it:

```bash
node tools/test-report.mjs ./path/to/audit.json
```

This is useful for:
- Re-generating reports with updated templates
- Testing report formatting changes
- Analyzing historical scans

### Programmatic Usage

```typescript
import { Analyzer } from './src/analyzer.js';
import { loadCorpus } from './src/corpus-loader.js';
import { generatePositiveEvidenceReport } from './src/reporters/index.js';

// Load contracts
const corpus = await loadCorpus('../corpus');

// Configure analyzer
const analyzer = new Analyzer(
  { tsconfigPath: './tsconfig.json', corpusPath: '../corpus' },
  corpus.contracts
);

// Run analysis
const violations = analyzer.analyze();

// Generate positive evidence report
const report = await generatePositiveEvidenceReport(auditRecord, {
  showHealthScore: true,
  showPackageBreakdown: true,
  showInsights: true,
  showRecommendations: true,
  showBenchmarking: true,
});

console.log(report.formattedReport);
```

### Custom Benchmark Data

To use a different benchmark baseline:

```typescript
import { calculateBenchmark, saveBenchmark } from './src/reporters/benchmarking.js';

// Calculate from your own set of audit records
const auditRecords = [ /* array of AuditRecord objects */ ];
const benchmark = calculateBenchmark(auditRecords);

// Save to custom location
await saveBenchmark(benchmark, './my-benchmarks.json');
```

Then modify the positive evidence reporter to load from your custom path.

---

## Troubleshooting

### "No contracts loaded from corpus"

**Problem:** Corpus directory not found or empty.

**Solution:**
```bash
# Verify corpus exists
ls ../corpus/packages

# Should show directories like: axios, prisma, stripe, etc.

# If missing, clone the corpus repo:
git clone https://github.com/your-org/behavioral-contracts-corpus.git ../corpus
```

### "Cannot find tsconfig.json"

**Problem:** Specified tsconfig.json doesn't exist.

**Solution:**
```bash
# Verify the path
ls -la /path/to/tsconfig.json

# Use absolute path:
node dist/index.js --tsconfig $(pwd)/tsconfig.json --corpus ../corpus
```

### "Analyzed 0 files"

**Problem:** tsconfig.json doesn't include any TypeScript files.

**Solution:**
```bash
# Check tsconfig.json includes your source files
cat tsconfig.json | grep -A5 "include"

# Should include something like:
# "include": ["src/**/*"]
```

### Benchmarking doesn't show

**Problem:** Benchmark data file not found.

**Solution:**
```bash
# Generate benchmark from existing scans
node tools/calculate-benchmark.mjs

# Verify it was created
ls verify-cli/data/benchmarks.json
```

### High false positive rate

**Problem:** Too many violations that aren't real issues.

**Solution:**

1. **Check if violations are legitimate:**
   - Read the violation description
   - Check the source documentation link
   - Verify if error handling is actually missing

2. **Report false positives:**
   - Open an issue with the contract name
   - Include the code snippet
   - Explain why it's a false positive

3. **Adjust contract severity:**
   - Contracts can be updated in `corpus/packages/<name>/contract.yaml`
   - Change severity from `error` to `warning` or `info`

### Performance issues on large codebases

**Problem:** Scan takes too long.

**Solutions:**

1. **Exclude test files** (default behavior):
   ```bash
   # Test files are excluded by default
   node dist/index.js --tsconfig ./tsconfig.json --corpus ../corpus
   ```

2. **Use a more specific tsconfig:**
   ```json
   // tsconfig.analysis.json
   {
     "extends": "./tsconfig.json",
     "include": ["src/**/*"],  // Only source files
     "exclude": ["**/*.test.ts", "**/*.spec.ts", "test/**/*"]
   }
   ```

3. **Scan incrementally:**
   - Scan changed files only in CI
   - Full scan on main branch

---

## Output File Reference

### audit.json

**Purpose:** Machine-readable violations record

**Schema:**
```json
{
  "tool": "@behavioral-contracts/verify-cli",
  "tool_version": "0.1.0",
  "corpus_version": "1.0.0",
  "timestamp": "2026-02-26T16:47:26.456Z",
  "git_commit": "2b12e682",
  "git_branch": "main",
  "tsconfig": "/path/to/tsconfig.json",
  "packages_analyzed": ["axios", "prisma", ...],
  "contracts_applied": 258,
  "files_analyzed": 55,
  "violations": [
    {
      "id": "react-hook-form-async-submit-unhandled-error",
      "severity": "error",
      "file": "/path/to/file.tsx",
      "line": 19,
      "column": 27,
      "package": "react-hook-form",
      "function": "handleSubmit",
      "contract_clause": "async-submit-unhandled-error",
      "description": "No try-catch block found...",
      "source_doc": "https://react-hook-form.com/...",
      "suggested_fix": "MUST wrap async operations...",
      "code_snippet": { ... }
    }
  ],
  "summary": {
    "total_violations": 1,
    "error_count": 1,
    "warning_count": 0,
    "info_count": 0,
    "passed": false
  }
}
```

### audit-positive-report.txt

**Purpose:** Human-readable positive evidence report

**Sections:**
1. Header - Repo info, timestamp, git commit
2. Health Score - Composite metric
3. Coverage Summary - Checks passed/failed
4. Repository Health Metrics - Compliance, maturity, risk
5. Package Breakdown - Per-package stats
6. Benchmarking - Comparison to baseline
7. Insights - Positive patterns detected
8. Recommendations - Actionable next steps

### benchmarks.json

**Purpose:** Aggregate baseline for comparisons

**Schema:**
```json
{
  "calculated_at": "2026-02-26T18:00:00.000Z",
  "sample_size": 282,
  "avg_violations_per_repo": 28.8,
  "avg_violations_per_kloc": 0,
  "avg_compliance_percent": 37.7,
  "percentiles": {
    "p25": 0,
    "p50": 0,
    "p75": 2,
    "p90": 38,
    "p95": 148
  },
  "total_checks_performed": 46648,
  "total_violations_found": 8110
}
```

---

## Exit Codes

```
0   - Success (no errors found, or only warnings/info)
1   - Errors found (or warnings when --fail-on-warnings is set)
```

**Examples:**

```bash
# Will exit 0 (no errors)
node dist/index.js --tsconfig ./clean-repo/tsconfig.json --corpus ../corpus
echo $?  # 0

# Will exit 1 (errors found)
node dist/index.js --tsconfig ./buggy-repo/tsconfig.json --corpus ../corpus
echo $?  # 1

# Will exit 1 (warnings treated as errors)
node dist/index.js \
  --tsconfig ./repo-with-warnings/tsconfig.json \
  --corpus ../corpus \
  --fail-on-warnings
echo $?  # 1
```

---

## Integration Examples

### GitHub Actions

```yaml
name: Behavioral Contracts Check

on: [push, pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd verify-cli
          npm install
          npm run build

      - name: Run behavioral contracts check
        run: |
          cd verify-cli
          node dist/index.js \
            --tsconfig ../tsconfig.json \
            --corpus ../corpus \
            --fail-on-warnings

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: behavioral-contracts-report
          path: verify-cli/behavioral-audit*
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

cd verify-cli
npm run build

node dist/index.js \
  --tsconfig ../tsconfig.json \
  --corpus ../corpus

if [ $? -ne 0 ]; then
  echo "❌ Behavioral contract violations found. Please fix before committing."
  exit 1
fi

echo "✅ Behavioral contracts check passed"
exit 0
```

### NPM Script

```json
{
  "scripts": {
    "verify": "cd verify-cli && npm run build && node dist/index.js --tsconfig ../tsconfig.json --corpus ../corpus",
    "verify:ci": "cd verify-cli && node dist/index.js --tsconfig ../tsconfig.json --corpus ../corpus --fail-on-warnings"
  }
}
```

---

## Getting Help

**Documentation:**
- [Main README](./README.md) - Project overview
- [Value Proposition](../VISION/PROVING_VALUE_TO_CUSTOMERS.md) - How to sell this to clients
- [Implementation Plan](../dev-notes/contexts/0007-positive-evidence-reporting.md) - Technical details

**Common Questions:**

**Q: How do I disable the positive evidence report?**
A: Use `--no-positive-report` flag.

**Q: Can I scan just specific packages?**
A: Not currently - it scans all packages in your tsconfig. Use a custom tsconfig to limit scope.

**Q: How do I add a new contract?**
A: See corpus documentation for contract authoring guidelines.

**Q: The benchmark seems outdated. How do I update it?**
A: Run `node tools/calculate-benchmark.mjs` after scanning new repos.

**Q: Can I use this in CI without breaking builds?**
A: Yes! By default, only errors cause exit code 1. Warnings don't fail CI unless you use `--fail-on-warnings`.

---

## Version History

**v0.1.0** (Current)
- ✅ Standard violations reporting
- ✅ Package discovery and coverage
- ✅ Positive evidence reporting (health score, benchmarking)
- ✅ Automated benchmarking system
- ✅ 49+ package contracts

**Upcoming:**
- HTML report export
- Interactive dashboard
- Custom contract authoring UI
- IDE integrations

---

**Last Updated:** 2026-02-26
