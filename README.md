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
A: Contracts are designed to produce zero false positives on correct code. If you find one, it's a bug — report it.

**Q: Can I use this with JavaScript?**
A: Not yet. TypeScript is required for AST type resolution. JavaScript support is on the roadmap.

**Q: How is this different from TypeScript types?**
A: Types specify structure. Contracts specify behavior. "Throws on 429" is not in the type system.

---

## License

**MIT License**

The CLI tool is MIT licensed. The corpus is CC BY 4.0.

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
