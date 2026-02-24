# Findings: Stripe, OpenAI, and pg Fixture Validation

**Date:** 2026-02-24
**Packages Tested:** Stripe, OpenAI, pg
**Analyzer Version:** v2 (supports 2-3 level property chains)

---

## Summary

Successfully created and validated test fixtures for three additional packages:
- **Stripe**: Payment processing API
- **OpenAI**: AI/ML API
- **pg**: PostgreSQL database client

All packages now have comprehensive test fixtures demonstrating proper and improper error handling patterns.

---

## Key Discovery: Contract Method Name Simplification

### Issue
The analyzer matches only the **final method name** in property access chains, not the full path.

For example:
- `stripe.charges.create()` → matches on `create` (not `charges.create`)
- `openai.chat.completions.create()` → matches on `create` (not `chat.completions.create`)
- `client.query()` → matches on `query` (not `Client.query`)

### Solution
Simplified all contracts to use simple method names:

**Stripe:**
- ✅ `create` (was: would need compound name)
- ✅ `confirm`
- ✅ `retrieve`
- ✅ `constructEvent`

**OpenAI:**
- ✅ `create` (consolidates: chat.completions.create, embeddings.create, audio.transcriptions.create)
- ✅ `generate` (for: images.generate)

**pg:**
- ✅ `query` (consolidates: Client.query, Pool.query)
- ✅ `connect` (consolidates: Client.connect, Pool.connect)

### Cross-Package False Positives: NOT AN ISSUE ✅

**Why:** The analyzer matches in two steps:
1. Determine package name from root identifier (`stripe`, `openai`, `pg`)
2. Match function name within that package's contract only

This means:
- `stripe.charges.create()` → package="stripe" → matches Stripe's `create` only
- `openai.chat.completions.create()` → package="openai" → matches OpenAI's `create` only
- `prisma.user.create()` → package="@prisma/client" → matches Prisma's `create` only

**No cross-contamination between packages.**

---

## Test Results

### Stripe Fixtures

**Location:** `corpus/packages/stripe/fixtures/`

**Files:**
- `proper-error-handling.ts` - Demonstrates correct Stripe error handling
- `missing-error-handling.ts` - Missing try-catch blocks
- `instance-usage.ts` - Tests instance detection (`this.stripe.charges.create()`)
- `tsconfig.json` - TypeScript configuration

**Results:**
- ✅ **31 ERROR violations** detected in missing/instance files
- ✅ **0 ERROR violations** in proper-error-handling.ts
- ⚠️ 19 WARNING violations (generic catch blocks)

**Methods Detected:**
- `stripe.charges.create()`
- `stripe.paymentIntents.create()`
- `stripe.paymentIntents.confirm()`
- `stripe.customers.create()`
- `stripe.refunds.create()`
- `stripe.subscriptions.create()`
- `stripe.webhooks.constructEvent()`
- `stripe.charges.retrieve()`

**Instance Patterns:**
```typescript
class PaymentService {
  private stripe: Stripe;
  
  async createCharge() {
    // ❌ Detected as violation
    await this.stripe.charges.create({ ... });
  }
}
```

---

### OpenAI Fixtures

**Location:** `corpus/packages/openai/fixtures/`

**Files:**
- `proper-error-handling.ts`
- `missing-error-handling.ts`
- `instance-usage.ts`
- `tsconfig.json`

**Results:**
- ✅ **46 ERROR violations** detected
- ✅ **0 ERROR violations** in proper-error-handling.ts
- ⚠️ 28 WARNING violations (generic catch blocks)

**Methods Detected:**
- `openai.chat.completions.create()`
- `openai.embeddings.create()`
- `openai.audio.transcriptions.create()`
- `openai.audio.translations.create()`
- `openai.images.generate()`
- `openai.moderations.create()`
- `openai.fineTuning.jobs.create()`

**Instance Patterns:**
```typescript
class AIService {
  private openai: OpenAI;
  
  async generateCompletion() {
    // ❌ Detected as violation
    await this.openai.chat.completions.create({ ... });
  }
}
```

**Contract Consolidation:**
- Single `create` function covers all `*.create()` methods
- Single `generate` function covers `images.generate()`
- Shared postconditions (auth, rate limit, server errors) apply to all

---

### PostgreSQL (pg) Fixtures

**Location:** `corpus/packages/pg/fixtures/`

**Files:**
- `proper-error-handling.ts`
- `missing-error-handling.ts`
- `instance-usage.ts`
- `tsconfig.json`

**Results:**
- ✅ **32 ERROR violations** detected
- ✅ **0 ERROR violations** in proper-error-handling.ts
- ⚠️ 23 WARNING violations (generic catch blocks)

**Methods Detected:**
- `client.query()` (Client instance)
- `pool.query()` (Pool instance)
- `client.connect()` (Client connection)
- `pool.connect()` (Pool connection)

**Instance Patterns:**
```typescript
class DatabaseService {
  private pool: Pool;
  
  async getUser(id: number) {
    // ❌ Detected as violation
    const result = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
  }
}
```

**Contract Simplification:**
- `query` function covers both `Client.query()` and `Pool.query()`
- `connect` function covers both `Client.connect()` and `Pool.connect()`

---

## Comparison with Previous Packages

| Package | ERROR Violations | Fixture Files | Instance Detection | Status |
|---------|-----------------|---------------|-------------------|---------|
| **Axios** | 12 | ✅ | ✅ | Complete |
| **Prisma** | 16 | ✅ | ✅ | Complete |
| **Stripe** | 31 | ✅ | ✅ | Complete |
| **OpenAI** | 46 | ✅ | ✅ | Complete |
| **pg** | 32 | ✅ | ✅ | Complete |
| **Supabase** | TBD | ❌ | ❌ | Pending |

**Total packages validated:** 5 of 6

---

## Key Patterns Observed

### 1. Instance Detection Works Across All Packages

All packages correctly detect instance-based usage:
- Constructor injection: `constructor(private stripe: Stripe)`
- Property assignment: `this.openai = new OpenAI()`
- Module-level instances: `const pool = new Pool()`

### 2. Proper Error Handling = 0 Errors

Files with proper try-catch blocks consistently show **0 ERROR violations**.

Only warnings appear for:
- Generic catch blocks (not package-specific error types)
- Missing specific status code checks

This is expected and acceptable behavior.

### 3. Missing Error Handling = Multiple Errors Per Call

Each unprotected call generates multiple ERROR violations:
- One per postcondition with `severity: error`

For example:
- Stripe `create()` → 4 errors (card-error, rate-limit, auth, network)
- OpenAI `create()` → 5 errors (auth, rate-limit, server, timeout, invalid-request)
- pg `query()` → 6 errors (syntax, unique, foreign-key, not-null, connection, undefined-table)

### 4. No False Positives Across Packages

Testing all 5 packages simultaneously (Stripe, OpenAI, pg, Axios, Prisma):
- Each package's violations only appear for that package's calls
- No cross-contamination
- Package-first matching strategy works perfectly

---

## Contract Schema Improvements

### Before
Contracts used compound names that didn't match analyzer behavior:

```yaml
# ❌ Doesn't work
functions:
  - name: charges.create  # Analyzer only matches "create"
  - name: Client.query    # Analyzer only matches "query"
```

### After
Simplified to match analyzer's final method name extraction:

```yaml
# ✅ Works correctly
functions:
  - name: create  # Matches stripe.charges.create(), stripe.customers.create(), etc.
  - name: query   # Matches client.query(), pool.query()
```

**Benefits:**
- Contracts match analyzer behavior
- Simpler contract definitions
- Can consolidate similar methods with shared error handling

**Trade-offs:**
- Less specificity in method naming
- Documentation must clarify which API calls are covered
- But: This mirrors how TypeScript method overloads work anyway

---

## Files Created

### Fixture Files
```
corpus/packages/stripe/fixtures/
├── proper-error-handling.ts
├── missing-error-handling.ts
├── instance-usage.ts
└── tsconfig.json

corpus/packages/openai/fixtures/
├── proper-error-handling.ts
├── missing-error-handling.ts
├── instance-usage.ts
└── tsconfig.json

corpus/packages/pg/fixtures/
├── proper-error-handling.ts
├── missing-error-handling.ts
├── instance-usage.ts
└── tsconfig.json
```

### Test Output
```
verify-cli/output/20260224/
├── stripe-fixtures-output.txt (31 errors)
├── openai-fixtures-output.txt (46 errors)
├── pg-fixtures-output.txt (0 errors - before fix)
└── pg-fixtures-output-v2.txt (32 errors - after fix)
```

### Contract Updates
- `corpus/packages/openai/contract.yaml` - Simplified to `create` and `generate`
- `corpus/packages/pg/contract.yaml` - Simplified to `query` and `connect`

---

## Recommendations

### ✅ Next Steps

1. **Supabase Fixtures** - Create fixtures for Supabase (builder pattern may need special handling)
2. **Real Repo Testing** - Test analyzer against real repos using these packages
3. **Aggregate Metrics** - Calculate precision across all 6 packages
4. **Documentation Update** - Update SCHEMA.md to document method name simplification pattern

### 💡 Future Enhancements

1. **Chain-Aware Matching** - Extend analyzer to optionally match on full chain (e.g., `chat.completions.create` vs `embeddings.create`)
2. **Method Disambiguation** - Add optional `method_path` field to contracts for documentation
3. **Smarter Consolidation** - Allow contracts to specify multiple method paths that map to same function definition

---

## Lessons Learned

### Contract Schema Pattern

**Rule:** Contracts must use the **final method name** from property chains.

**Examples:**
- `axios.get()` → `name: get` ✅
- `stripe.charges.create()` → `name: create` ✅
- `openai.chat.completions.create()` → `name: create` ✅
- `client.query()` → `name: query` ✅

**Not:**
- ❌ `name: charges.create`
- ❌ `name: chat.completions.create`
- ❌ `name: Client.query`

### Instance Detection

Works for all patterns:
- Direct imports: `import Stripe from 'stripe'; const stripe = new Stripe(key);`
- Constructor injection: `constructor(private readonly stripe: Stripe)`
- Property assignment: `this.client = new Client(config);`
- Factory methods: `const client = await pool.connect();`

### Package Isolation

No need to worry about method name collisions across packages:
- Each package's contract is matched independently
- `create` in Stripe won't match `create` in OpenAI
- Analyzer uses package-first, then method-name matching

---

## Status: Complete ✅

All three packages (Stripe, OpenAI, pg) now have:
- ✅ Comprehensive test fixtures
- ✅ Validated analyzer detection
- ✅ Instance usage patterns tested
- ✅ Simplified contracts matching analyzer behavior
- ✅ Zero false positives across packages

**Ready for real-world repo testing\!**
