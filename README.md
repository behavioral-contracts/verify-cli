# @behavioral-contracts/verify-cli

**Verify TypeScript code against behavioral contracts.**

This CLI tool analyzes TypeScript codebases to detect violations of documented behavioral contracts from npm packages.

---

## What This Does

This tool answers: **"Does this code handle package error states correctly?"**

Not with opinions. With **verifiable checks against documented contracts**.

### The Problem

```typescript
// Is this code production-ready?
const response = await axios.get('/api/data');
return response.data;
```

**Answer:** No. This crashes on network errors, ignores rate limiting, and doesn't check error.response exists.

### The Solution

```bash
npx @behavioral-contracts/verify-cli --tsconfig ./tsconfig.json
```

**Output:**
```
❌ axios-network-failure
   src/api.ts:42:5
   No try-catch block found. Network failures will crash the application.
   Fix: Check error.response exists before accessing error.response.status
   Docs: https://axios-http.com/docs/handling_errors

❌ axios-rate-limited-429
   src/api.ts:42:5
   Rate limit response (429) is not explicitly handled.
   Fix: Implement retry logic or handle 429 as terminal error
   Docs: https://axios-http.com/docs/handling_errors
```

---

## Installation

```bash
npm install -D @behavioral-contracts/verify-cli
```

Or run directly:
```bash
npx @behavioral-contracts/verify-cli
```

---

## Usage

### Basic Usage

```bash
npx verify-cli --tsconfig ./tsconfig.json
```

### Options

```bash
npx verify-cli \
  --tsconfig ./tsconfig.json \
  --corpus ../corpus \
  --output ./audit.json \
  --fail-on-warnings
```

**Options:**
- `--tsconfig <path>` - Path to tsconfig.json (default: ./tsconfig.json)
- `--corpus <path>` - Path to corpus directory (default: auto-detect)
- `--output <path>` - Output path for audit JSON (default: ./behavioral-audit.json)
- `--no-terminal` - Disable terminal output, JSON only
- `--fail-on-warnings` - Exit with error code if warnings found
- `--include-tests` - Include test files in analysis (default: false)

### Test File Handling

**By default, verify-cli excludes test files from analysis.**

**Why?**
- Tests intentionally expect errors to be thrown
- Test frameworks (Jest, Vitest, Mocha) provide automatic error handling
- 90%+ of test file violations are false positives

**Excluded patterns:**
- `/__tests__/` - Jest convention
- `/__mocks__/` - Mock files
- `.test.ts`, `.spec.ts` - Test files
- `.test.tsx`, `.spec.tsx` - React test files
- `/tests/`, `/test/` - Test directories

**To include test files:**

```bash
npx verify-cli --tsconfig ./tsconfig.json --include-tests
```

**When to use `--include-tests`:**
- Analyzing test utility/helper functions
- Auditing test infrastructure code
- Reviewing test code quality
- Checking integration test error handling

**Example:** In production code, you might have 200 violations. With test files included, you might see 600+ violations (300% more), but 400+ are false positives from test code patterns.

**Decision rationale:** We default to excluding tests to maximize precision and focus on production code issues. Most CI/CD pipelines care about production code quality, not test file violations.

### CI Integration

**GitHub Actions:**
```yaml
- name: Verify behavioral contracts
  run: npx @behavioral-contracts/verify-cli --tsconfig ./tsconfig.json
```

**GitLab CI:**
```yaml
verify:
  script:
    - npx @behavioral-contracts/verify-cli --tsconfig ./tsconfig.json
```

---

## Output

### Terminal Output

Human-readable report with violations grouped by severity:

```
Behavioral Contract Verification Report
────────────────────────────────────────────────────────────────────────────

Summary:
  Files analyzed: 47
  Packages: axios, prisma
  Contracts applied: 12
  Timestamp: 2026-02-23T14:30:00Z
  Git commit: abc123de

Violations:

Errors (2):

  ✗ src/api/client.ts:34:5
    axios.get() called without handling 429 rate limit response
    Package: axios.get()
    Contract: rate-limited-429
    Fix: Add handling for error.response?.status === 429
    Docs: https://axios-http.com/docs/handling_errors

────────────────────────────────────────────────────────────────────────────

Summary:
  Total violations: 2
  Errors: 2
  Warnings: 0
  Info: 0

✗ FAILED
```

### JSON Output (Audit Record)

Machine-readable artifact for CI/CD pipelines and compliance:

```json
{
  "tool": "@behavioral-contracts/verify-cli",
  "tool_version": "0.1.0",
  "corpus_version": "1.0.0",
  "timestamp": "2026-02-23T14:30:00Z",
  "git_commit": "abc123def456",
  "git_branch": "main",
  "tsconfig": "./tsconfig.json",
  "packages_analyzed": ["axios@1.6.2"],
  "contracts_applied": 5,
  "files_analyzed": 47,
  "violations": [
    {
      "id": "axios-rate-limited-429",
      "severity": "error",
      "file": "src/api/client.ts",
      "line": 34,
      "column": 5,
      "package": "axios",
      "function": "get",
      "contract_clause": "rate-limited-429",
      "description": "axios.get() called without handling 429 rate limit response",
      "source_doc": "https://axios-http.com/docs/handling_errors",
      "suggested_fix": "Add handling for error.response?.status === 429"
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

---

## How It Works

The verification pipeline:

```
TypeScript Code
      ↓
1. PARSE — TypeScript Compiler API reads AST
      ↓
2. RESOLVE — Find all call sites for corpus packages
      ↓
3. ANALYZE — Determine what error states are handled
      ↓
4. COMPARE — Match against contract requirements
      ↓
Audit Record (JSON + Terminal)
```

### What Gets Checked

For each function call to a corpus package:
- ✅ Is there a try-catch block?
- ✅ Does the catch block check error.response exists?
- ✅ Are specific status codes (like 429) handled?
- ✅ Is there retry logic with backoff?
- ✅ Are null returns checked before use?

**Not checked:** Code style, formatting, naming conventions. This is behavioral verification only.

---

## Corpus

Contracts come from the [behavioral-contracts/corpus](https://github.com/behavioral-contracts/corpus) repository.

**Currently supported packages:**
- axios (HTTP errors, rate limiting, network failures)
- jsonwebtoken (coming soon)
- prisma (coming soon)
- stripe (coming soon)
- bullmq (coming soon)

To add contracts for more packages, contribute to the corpus repository.

---

## Architecture

```
verify-cli/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── analyzer.ts       # TypeScript AST analysis
│   ├── corpus-loader.ts  # Loads YAML contracts
│   ├── reporter.ts       # Generates reports
│   └── types.ts          # Shared TypeScript types
└── tests/
    ├── fixtures/         # Test files with known violations
    └── analyzer.test.ts  # Test suite
```

**Key technologies:**
- **TypeScript Compiler API** - AST analysis and type checking
- **YAML + JSON Schema** - Contract format and validation
- **Vitest** - Testing framework

---

## Bulk Analysis & Cross-Repo Scanning

For analyzing multiple repositories at once (e.g., testing against Top 50 TypeScript repos), use the bulk scanner.

### Quick Start

```bash
# From the workspace root (parent of verify-cli)
./tools/scan-all-repos.sh
```

This will:
1. Build verify-cli (skip with `--skip-build`)
2. Scan all repos in `test-repos/`
3. Generate comprehensive reports with unique run IDs
4. Create per-repo and per-package breakdowns

### Output Structure

Each run creates a timestamped directory with complete analysis results:

```
verify-cli/output/runs/20260224-163824-9192ca6/
├── run-metadata.json                     # Run metadata (timestamp, git hash, stats)
├── summary.md                            # Main overview table (all repos)
└── <repo-name>/
    ├── summary.md                        # Per-repo package breakdown
    ├── audit.json                        # Machine-readable violations
    ├── output.txt                        # Human-readable violations
    └── packages/                         # Per-package violation files
        ├── INDEX.md
        ├── axios/
        │   ├── violations.json
        │   └── violations.txt
        ├── zod/
        │   ├── violations.json
        │   └── violations.txt
        └── ...
```

### Navigation Workflow

**1. Start at Main Summary** (`summary.md`)

Overview table showing all repos:

| Repo | Version | Git Hash | Passed | Files | Packages | Contracts | Total | Errors | Warnings | Info | Details |
|------|---------|----------|--------|-------|----------|-----------|-------|--------|----------|------|---------|
| [angular](./angular/) | 0.1.0 | 98e64c5 | ❌ | 1178 | 10 | 44 | 15 | 9 | 6 | 0 | [📊 Summary](./angular/summary.md) · [📦 Packages](./angular/packages/) · [📄 JSON](./angular/audit.json) · [📝 TXT](./angular/output.txt) |

Click:
- **Repo name** → Navigate to repo directory
- **📊 Summary** → View per-repo package breakdown
- **📦 Packages** → View per-package violation index
- **📄 JSON** → Machine-readable audit
- **📝 TXT** → Human-readable violations with code context

**2. Repo Summary** (`<repo>/summary.md`)

Shows which packages were analyzed and which had violations:

| Package | Contracts | Total | Errors | Warnings | Info | Status | Details |
|---------|-----------|-------|--------|----------|------|--------|---------|
| react-hook-form | 2 | 12 | 6 | 6 | 0 | ❌ Failed | [📄 JSON](./packages/react-hook-form/violations.json) · [📝 TXT](./packages/react-hook-form/violations.txt) |
| zod | 0 | 0 | 0 | 0 | 0 | ✅ Passed | - |

**Sorted automatically:**
- ❌ Failed packages (with violations) at top
- ✅ Passed packages at bottom

**3. Package Violations** (`<repo>/packages/<package>/`)

Individual violation files for cross-repo analysis:
- `violations.json` - Machine-readable violations for this package in this repo
- `violations.txt` - Human-readable with code snippets

### Cross-Repo Analysis

#### Find all violations for a specific package

```bash
# Find all axios violations across all runs
find verify-cli/output/runs -path "*/packages/axios/violations.json"

# Find axios violations in latest run
find verify-cli/output/runs -path "*/packages/axios/violations.json" | sort | tail -1
```

#### Count violations per repo for a package

```bash
# How many zod violations in each repo?
find verify-cli/output/runs/20260224-163824-9192ca6 \
  -path "*/packages/zod/violations.json" \
  -exec sh -c 'echo -n "$(dirname $1 | xargs dirname | xargs basename): "; jq .total_violations "$1"' sh {} \;
```

**Output:**
```
angular: 8
nextjs: 15
vitest: 3
```

#### Extract all violation descriptions for a package

```bash
# See all zod violation types across repos
find verify-cli/output/runs/20260224-163824-9192ca6 \
  -path "*/packages/zod/violations.json" \
  -exec jq -r '.violations[].description' {} \; | sort | uniq
```

#### Compare package usage between repos

```bash
# Which repos use axios?
find verify-cli/output/runs/20260224-163824-9192ca6 \
  -path "*/packages/axios" -type d | \
  xargs dirname | xargs basename
```

#### Aggregate statistics for a package

```bash
# Total violations for react-hook-form across all repos
find verify-cli/output/runs/20260224-163824-9192ca6 \
  -path "*/packages/react-hook-form/violations.json" \
  -exec jq '.total_violations' {} \; | \
  awk '{sum+=$1} END {print "Total:", sum}'
```

### Run Metadata

Each run includes `run-metadata.json` with:

```json
{
  "run_id": "20260224-163824-9192ca6",
  "timestamp": "2026-02-24T16:38:24Z",
  "git_commit": "9192ca6f...",
  "git_branch": "main",
  "scanner_version": "0.1.0",
  "trigger": "manual",
  "repos_scanned": 50,
  "repos_failed": 0,
  "total_files": 45832,
  "total_packages": 500,
  "total_contracts": 2200,
  "total_violations": 3456,
  "total_errors": 2100,
  "total_warnings": 1200,
  "total_info": 156
}
```

### Advanced Usage

#### Analyze specific repos only

```bash
# Remove unwanted repos from test-repos/ first
rm -rf test-repos/unwanted-repo
./tools/scan-all-repos.sh
```

#### Skip build for faster iteration

```bash
# If verify-cli hasn't changed
./tools/scan-all-repos.sh --skip-build
```

#### Compare runs over time

```bash
# List all runs
ls -1 verify-cli/output/runs/

# Compare violation counts
echo "Run 1:" && jq .total_violations verify-cli/output/runs/20260224-163824-9192ca6/run-metadata.json
echo "Run 2:" && jq .total_violations verify-cli/output/runs/20260224-170000-abc123d/run-metadata.json
```

#### Deep-dive analysis for a specific violation

```bash
# Find all occurrences of a specific contract violation
find verify-cli/output/runs -name "*.json" \
  -exec jq -r '.violations[] | select(.contract_clause == "empty-catch-block-silent-failure") | .file + ":" + (.line|tostring)' {} \;
```

### Integration with CI/CD

**Track violations over time:**

```yaml
# .github/workflows/contracts.yml
- name: Run contract scanner
  run: |
    ./tools/scan-all-repos.sh

- name: Upload results
  uses: actions/upload-artifact@v3
  with:
    name: contract-violations-${{ github.sha }}
    path: verify-cli/output/runs/latest/
```

**Fail on new violations:**

```bash
# Compare current run with baseline
BASELINE_VIOLATIONS=$(jq .total_violations baseline/run-metadata.json)
CURRENT_VIOLATIONS=$(jq .total_violations verify-cli/output/runs/latest/run-metadata.json)

if [ $CURRENT_VIOLATIONS -gt $BASELINE_VIOLATIONS ]; then
  echo "❌ New violations introduced!"
  exit 1
fi
```

---

## Development

### Setup

```bash
git clone https://github.com/behavioral-contracts/verify-cli.git
cd verify-cli
npm install
npm run build
```

### Run Tests

```bash
npm test
```

### Run on Sample Project

```bash
npm run build
node dist/index.js --tsconfig ./tests/tsconfig.test.json
```

---

## Roadmap

### v0.1.0 (MVP) - Current
- ✅ Core analysis engine
- ✅ Axios contract support
- ✅ Terminal + JSON output
- ✅ CI integration

### v0.2.0
- [ ] jsonwebtoken, prisma, stripe, bullmq contracts
- [ ] Performance optimization (sub-1min for 50K LOC)
- [ ] Severity threshold filtering

### v0.3.0
- [ ] IDE integration (VS Code extension)
- [ ] Watch mode for development
- [ ] Custom contract overlays

### v1.0.0
- [ ] 20+ package contracts
- [ ] Production-tested on 100+ codebases
- [ ] Enterprise features (SIEM integration, compliance reports)

---

## FAQ

**Q: Is this a linter?**
A: No. Linters check style and patterns. This verifies behavioral correctness against documented contracts.

**Q: Does this replace tests?**
A: No. This catches missing error handling. Tests verify business logic.

**Q: What about false positives?**
A: Contracts are designed to minimize false positives. Test files are excluded by default because they have different error handling patterns (90%+ of test violations are false positives). For production code, precision is >95%. If you find a false positive, report it.

**Q: Can I use this with JavaScript?**
A: Not yet. TypeScript is required for AST type resolution. JavaScript support is on the roadmap.

**Q: How is this different from TypeScript types?**
A: Types specify structure. Contracts specify behavior. "Throws on 429" is not in the type system.

**Q: Why are test files excluded by default?**
A: Test files have fundamentally different error handling patterns. Tests *expect* errors to be thrown (e.g., `expect(() => fn()).toThrow()`), and test frameworks automatically catch errors. Including test files creates 90%+ false positives, reducing precision from ~98% to ~85%. Use `--include-tests` if you want to analyze test utilities or infrastructure.

---

## License

**GNU Affero General Public License v3.0 (AGPL-3.0)**

This CLI tool is free and open source software.

### What This Means for You

**Individual Developers:**
- ✅ Use freely in your projects (free forever)
- ✅ Run locally without restrictions
- ✅ Contribute improvements back (open source)

**Companies (Internal Use):**
- ✅ Run in your CI/CD pipelines (free forever)
- ✅ Self-host for your organization (free forever)
- ✅ Modify for internal use (no restrictions)
- ✅ Integrate into your development workflow

**Companies (Building SaaS):**
- ⚠️ If you offer this tool as a **web service** (SaaS), you must open source your modifications
- ⚠️ Or contact us for commercial licensing

### Why AGPL-3.0?

**The AGPL protects open source from cloud providers:**

If Sentry (or any competitor) wants to use our analyzer:
- ✅ They can use it for free
- ✅ They can modify it
- ❌ But if they offer it as SaaS, they must open source their version
- ❌ Or pay for a commercial license

**What happened to Redis:**
- Redis: BSD license (permissive)
- AWS: Forked Redis → ElastiCache (proprietary SaaS)
- Redis Labs: Lost revenue to AWS
- Result: Redis Labs had to change license (too late)

**What we learned:**
- Use AGPL from day 1
- Prevent proprietary SaaS forks
- Ensure improvements flow back to community

### Examples

**✅ Allowed without restrictions:**
```bash
# Run in GitHub Actions
- name: Verify contracts
  run: npx @behavioral-contracts/verify-cli

# Self-host for company
docker run verify-cli --tsconfig ./tsconfig.json

# Integrate into VSCode extension (if extension is open source)
import { analyze } from '@behavioral-contracts/verify-cli'
```

**⚠️ Requires open sourcing OR commercial license:**
```
# Building "ContractCheckr.com" (SaaS)
# Offering verify-cli as a web service
# Must either:
#   1. Open source your SaaS (AGPL compliance)
#   2. Get commercial license from us
```

### Dual Licensing

For organizations that cannot comply with AGPL-3.0, we offer commercial licenses.

**Commercial licenses include:**
- Proprietary SaaS rights
- No source code disclosure requirements
- Priority support
- Custom SLA

Contact: [Coming soon]

### Corpus License

The contract corpus is licensed separately under **CC BY-SA 4.0**.

See [corpus/LICENSE](../corpus/LICENSE) for details.

---

**Related:**
- Full license text: [LICENSE](./LICENSE)
- License FAQ: [Why AGPL?](https://www.gnu.org/licenses/why-affero-gpl.html)
- Commercial licensing: [Contact us]

---

## Contributing

See the main [behavioral-contracts](https://github.com/behavioral-contracts) organization for contribution guidelines.

To add contracts for new packages, contribute to the [corpus repository](https://github.com/behavioral-contracts/corpus).

---

## Support

- **Issues**: https://github.com/behavioral-contracts/verify-cli/issues
- **Discussions**: https://github.com/behavioral-contracts/verify-cli/discussions
- **Corpus Questions**: https://github.com/behavioral-contracts/corpus/issues

---

Built with the belief that **AI-generated code should be auditable, not just plausible**.
