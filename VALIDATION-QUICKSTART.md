# Violation Validation - Quick Start

This guide shows you how to **validate violations systematically** after running your analyzer.

---

## The Problem

You have violations reported by the analyzer. Now you need to know:
- Are they **real bugs** (true positives)?
- Is the **analyzer wrong** (false positives)?
- What patterns emerge?

---

## Quick Start (5 Steps)

### Step 1: Run Analysis on Multiple Repos

```bash
cd verify-cli

# Run on all your test repos
./scripts/run-analysis.sh medusajs ../test-repos/medusa
./scripts/run-analysis.sh strapi ../test-repos/strapi
./scripts/run-analysis.sh hoppscotch ../test-repos/hoppscotch
# ... etc
```

Results go to: `output/20260223/`

### Step 2: Extract Violations for Review

```bash
# Extract all violations into a reviewable format
node scripts/extract-violations.js output/20260223
```

This creates:
- Console summary of violations by type
- **`output/20260223/violations-for-review.csv`** ← Open this in spreadsheet

### Step 3: Manual Validation in Spreadsheet

Open the CSV in Google Sheets or Excel:

```bash
open output/20260223/violations-for-review.csv
```

For each violation (or a sample):

1. **Look at the code** - Use inspect script or click file location
2. **Determine if it's real**:
   - `TP` = True Positive (real bug, missing error handling)
   - `FP` = False Positive (analyzer is wrong, handling exists)
   - `EC` = Edge Case (debatable/partial handling)
3. **Mark the "Validated?" column** as `yes`
4. **Mark the "Classification" column** as `TP`, `FP`, or `EC`
5. **Add notes** about why

### Step 4: Inspect Code Quickly

To look at a specific violation:

```bash
# Make script executable first
chmod +x scripts/inspect-violation.sh

# Inspect a violation
./scripts/inspect-violation.sh medusajs packages/core/src/api.ts 42
```

This:
- Opens the file in your editor at that line
- Shows context (10 lines before/after)

### Step 5: Calculate Precision

After validating a sample (30+ violations recommended):

```bash
node scripts/calculate-precision.js output/20260223/violations-for-review.csv
```

This shows:
- Overall precision percentage
- True positives vs false positives
- Breakdown by contract type
- Statistical confidence level

---

## Example Workflow

```bash
# 1. Extract violations
cd verify-cli
node scripts/extract-violations.js output/20260223

# Output:
# Total violations: 347
# By Contract Type:
#   axios.request()::error-4xx-5xx (156 violations)
#   axios.get()::network-failure (89 violations)
#   ...

# 2. Open CSV in spreadsheet
open output/20260223/violations-for-review.csv

# 3. Validate first 50 violations (sample)
# - Mark TP/FP/EC for each
# - Add notes

# 4. Calculate precision
node scripts/calculate-precision.js output/20260223/violations-for-review.csv

# Output:
# Precision: 87.3%
# True Positives: 43 (86%)
# False Positives: 5 (10%)
# Edge Cases: 2 (4%)
```

---

## Validation Decision Tree

For each violation, ask:

```
Is there a try-catch block around this call?
├─ No → Is there a .catch() handler?
│  ├─ No → Is there error handling in a wrapper?
│  │  ├─ No → ✅ TRUE POSITIVE (TP)
│  │  └─ Yes → Ask: Does wrapper handle THIS specific error?
│  │     ├─ Yes → ❌ FALSE POSITIVE (FP)
│  │     └─ No → ✅ TRUE POSITIVE (TP)
│  └─ Yes → Does it handle the specific error type?
│     ├─ Yes → ❌ FALSE POSITIVE (FP)
│     └─ No → 🤔 EDGE CASE (EC)
└─ Yes → Does it check for the specific condition?
   ├─ Yes → ❌ FALSE POSITIVE (FP)
   └─ No → 🤔 EDGE CASE (EC)
```

---

## What Makes a True Positive?

✅ **TRUE POSITIVE** if:
- No try-catch block exists
- No `.catch()` on the promise
- Doesn't check `error.response` before accessing
- Doesn't handle rate limits (429)
- Doesn't retry on network errors
- Error handling is generic (logs but doesn't handle specific error)

❌ **FALSE POSITIVE** if:
- Try-catch exists but analyzer missed it
- Error handling in wrapper function that analyzer didn't follow
- Framework handles errors automatically (e.g., Next.js API routes with error boundaries)
- Error propagation is intentional and documented

🤔 **EDGE CASE** if:
- Partial error handling (catches some errors but not the specific one)
- Logs error but doesn't handle it properly
- Test file or example code (not production)
- Intentionally letting errors bubble (documented in comments)

---

## Sample Size Guidelines

| Total Violations | Recommended Sample | Confidence Level |
|-----------------|-------------------|------------------|
| < 50            | All (validate everything) | 100% |
| 50-200          | 50 violations | 95% |
| 200-1000        | 100 violations | 90% |
| > 1000          | 200 violations | 85% |

**Random sampling:** Validate violations randomly distributed across repos and contract types.

---

## After Validation

### If Precision > 90%
✅ **Analyzer is working well!**
- Document patterns observed
- Expand to more repos
- Consider auto-fixing common issues
- Publish findings

### If Precision 70-90%
⚠️ **Good but improvable**
- Identify false positive patterns
- Refine analyzer logic
- Update contracts if needed
- Re-run and re-validate

### If Precision < 70%
❌ **Needs improvement**
- Review all false positives
- Identify root causes
- Fix analyzer or contracts
- Re-run on same repos
- Re-validate from scratch

---

## Documentation

After validation, create a findings document:

```bash
# Template provided in workflow guide
cp dev-notes/workflows/02-violation-validation-workflow.md \
   dev-notes/findings/NNNN-validation-results.md

# Edit with your findings
vim dev-notes/findings/NNNN-validation-results.md
```

Include:
- Precision metrics
- True positive examples (with code)
- False positive examples (with explanation)
- Patterns observed
- Recommendations for improvement

---

## Troubleshooting

**Q: CSV has thousands of violations, how do I sample?**
A: Use spreadsheet's random sort or filter by repo to get diverse sample.

**Q: Violation location doesn't match the code?**
A: Repo might have been updated since analysis. Re-clone or note in validation.

**Q: Can't decide if TP or FP?**
A: Mark as Edge Case (EC) and add detailed notes explaining the ambiguity.

**Q: Same violation repeated many times?**
A: Validate 5-10 examples. If all are TP or all FP, likely pattern holds for others.

---

## Scripts Reference

```bash
# Extract violations
node scripts/extract-violations.js output/20260223

# Inspect specific violation
./scripts/inspect-violation.sh <repo> <file-path> <line>

# Calculate precision
node scripts/calculate-precision.js output/20260223/violations-for-review.csv
```

---

## Next: Phase 6 - Contract Refinement

After validation, use findings to:
1. Improve contracts (if false positives due to unclear specs)
2. Improve analyzer (if false positives due to detection issues)
3. Document patterns (if true positives show common mistakes)

See: `dev-notes/workflows/01-complete-workflow.md` Phase 6
