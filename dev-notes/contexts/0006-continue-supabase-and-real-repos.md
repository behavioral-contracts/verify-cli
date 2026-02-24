# Context: Continue with Supabase and Real Repository Testing

**Created:** 2026-02-24
**Previous:** Completed Stripe, OpenAI, and pg fixture validation
**Status:** Ready to start
**Priority:** MEDIUM

---

## What Was Accomplished

### ✅ Phase 1: Fixture Creation Complete

Successfully created and validated test fixtures for:
- **Stripe** (31 ERROR violations detected)
- **OpenAI** (46 ERROR violations detected)
- **pg** (32 ERROR violations detected)

**Total:** 5 of 6 packages now have validated fixtures.

### ✅ Key Discovery: Method Name Simplification

Contracts must use **simple method names** (final method in chain):
- ✅ `name: create` (matches `stripe.charges.create()`, `openai.chat.completions.create()`)
- ✅ `name: query` (matches `client.query()`, `pool.query()`)
- ❌ `name: charges.create` (won't match - analyzer only sees `create`)

### ✅ Cross-Package False Positives: Confirmed Not An Issue

Analyzer uses package-first matching:
1. Extract package name from root identifier
2. Get that package's contract
3. Match function name within that contract only

Result: No collisions between packages even with same method names.

---

## Your Mission: Complete Package Validation

### Part 1: Supabase Fixtures (Optional - May Defer)

**Challenge:** Supabase uses builder pattern which may require analyzer extensions.

**Pattern:**
```typescript
const { data, error } = await supabase
  .from('users')
  .select('*')
  .eq('id', userId)
```

**Options:**
1. **Test current analyzer** - See if it detects `.from()` or `.select()`
2. **Document limitation** - Note that builder patterns need future support
3. **Skip for now** - Focus on real repo testing first

**Recommendation:** Skip Supabase for now, focus on real repos.

---

### Part 2: Real Repository Testing (HIGH PRIORITY)

**Goal:** Test analyzer v2 against real-world codebases using Stripe, OpenAI, and pg.

#### Step 1: Identify Target Repos

Look for repos in `test-repos/` or clone new ones that use:
- Stripe (payment processing apps, SaaS billing)
- OpenAI (AI/chatbot apps)
- PostgreSQL with pg client (Node.js backends)

**Good candidates:**
- E-commerce platforms
- SaaS starter kits
- AI chat applications
- Full-stack TypeScript apps

#### Step 2: Run Analysis

For each repo:

```bash
cd verify-cli
./scripts/run-analysis.sh <repo-name> ../test-repos/<repo>/tsconfig.json
```

Or manually:

```bash
mkdir -p output/$(date +%Y%m%d)
node dist/index.js \
  --tsconfig ../test-repos/<repo>/tsconfig.json \
  --corpus ../corpus \
  --output output/$(date +%Y%m%d)/<repo>-audit.json \
  2>&1 | tee output/$(date +%Y%m%d)/<repo>-output.txt
```

#### Step 3: Validate Results

For each violation found:
- **True Positive (TP):** Legitimate missing error handling
- **False Positive (FP):** Valid code incorrectly flagged

**Common FP patterns:**
- Framework-level error handlers (NestJS, Express middleware)
- GraphQL error formatters
- Try-catch in calling function (not at call site)

Calculate precision: `Precision = TP / (TP + FP)`

#### Step 4: Document Findings

Create: `dev-notes/findings/0002-<package>-real-repo-validation.md`

Template:
```markdown
# Findings: <Package> Real Repository Validation

**Date:** YYYY-MM-DD
**Package:** <package>
**Repos Tested:** N

## Summary
- Total violations: N
- True positives: N
- False positives: N
- Precision: X%

## Violations by Repo

### Repo 1: <name>
- Violations found: N
- TP: N
- FP: N
- Patterns: ...

[Repeat for each repo]

## Common Patterns

### True Positives
1. Pattern 1
2. Pattern 2

### False Positives
1. Framework error handling
2. Calling function has try-catch

## Recommendations
...
```

---

## Files Reference

### Fixtures Created
```
corpus/packages/stripe/fixtures/
corpus/packages/openai/fixtures/
corpus/packages/pg/fixtures/
```

### Contracts Updated
```
corpus/packages/stripe/contract.yaml (already correct)
corpus/packages/openai/contract.yaml (simplified to create + generate)
corpus/packages/pg/contract.yaml (simplified to query + connect)
```

### Findings
```
dev-notes/findings/0001-stripe-openai-pg-fixtures-validation.md
```

### Test Output
```
verify-cli/output/20260224/
├── stripe-fixtures-output.txt
├── openai-fixtures-output.txt
└── pg-fixtures-output-v2.txt
```

---

## Expected Challenges

### 1. Finding Suitable Repos

**Challenge:** Not all test repos may use these packages.

**Solution:**
- Search existing repos: `grep -r "stripe\|openai\|pg" test-repos/*/package.json`
- Clone additional repos if needed
- Document if no suitable repos found

### 2. Framework Error Handling

**Challenge:** Production apps use framework-level error handlers.

**Pattern:**
```typescript
// NestJS - has global exception filter
async createCharge() {
  // No try-catch, but framework catches
  return await this.stripe.charges.create({ ... });
}
```

**Expectation:** Analyzer will flag as violation (FP).

**Future:** Detect framework patterns to reduce FPs.

### 3. Large Codebases

**Challenge:** Repos may have hundreds of files.

**Solution:**
- Analyzer already skips node_modules and declaration files
- Review summary statistics first
- Sample violations rather than reviewing all

---

## Success Criteria

### Per Package
- [ ] At least 2 real repos tested
- [ ] TP/FP classification complete
- [ ] Precision calculated (target >70%)
- [ ] Common patterns documented

### Aggregate
- [ ] 5 packages validated (Axios, Prisma, Stripe, OpenAI, pg)
- [ ] Aggregate precision >70%
- [ ] Architecture patterns documented
- [ ] Recommendations for improvement

---

## Quick Commands

### Search for repos using packages

```bash
# Stripe
find test-repos -name package.json -exec grep -l '"stripe"' {} \;

# OpenAI
find test-repos -name package.json -exec grep -l '"openai"' {} \;

# pg
find test-repos -name package.json -exec grep -l '"pg"' {} \;
```

### Run analysis

```bash
cd verify-cli
npm run build
node dist/index.js \
  --tsconfig ../test-repos/<repo>/tsconfig.json \
  --corpus ../corpus \
  --output output/$(date +%Y%m%d)/<repo>-audit.json \
  2>&1 | tee output/$(date +%Y%m%d)/<repo>-output.txt
```

### Check violations count

```bash
cat output/$(date +%Y%m%d)/<repo>-audit.json | jq '.violations | length'
cat output/$(date +%Y%m%d)/<repo>-audit.json | jq '.violations[] | select(.severity == "error")'
```

---

## After Completion

### Create Summary Document

`dev-notes/findings/0003-all-packages-aggregate-summary.md`:
- Aggregate precision across all packages
- Common architectural patterns
- Framework detection recommendations
- Next steps for analyzer v3

### Create Context for Next Phase

`dev-notes/contexts/0007-framework-pattern-detection.md`:
- Focus: Detect framework-level error handling
- Goal: Reduce false positives
- Patterns: NestJS decorators, Express middleware, GraphQL formatters

---

**Ready to Start:** Test real repos using Stripe, OpenAI, and pg\!

**Recommended Order:**
1. Search for repos with these packages
2. Start with Stripe (most common in SaaS apps)
3. Then OpenAI (growing rapidly)
4. Then pg (very common in Node.js backends)

**Good luck\!** 🚀
