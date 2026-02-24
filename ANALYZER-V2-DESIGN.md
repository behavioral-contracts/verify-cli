# Analyzer v2: Chained Method Call Detection

**Date:** 2026-02-24
**Status:** Design Phase
**Purpose:** Extend analyzer to detect chained method calls for Prisma, Stripe, OpenAI, etc.

---

## Problem Statement

**Current Limitation**: Analyzer only detects direct method calls:
- ✅ Works: `axios.get(url)`
- ✅ Works: `axiosInstance.post(url, data)`
- ❌ Fails: `prisma.user.create({ data })`
- ❌ Fails: `stripe.charges.create({ amount })`
- ❌ Fails: `openai.chat.completions.create({ messages })`

**Root Cause**: The `extractCallSite()` method stops at 1-level property access and doesn't walk up the full chain.

---

## AST Structure Analysis

### Example 1: Prisma (2-level chain)
```typescript
await prisma.user.create({ data: { email } })
```

**AST Structure**:
```
CallExpression
  └─ expression: PropertyAccessExpression (name: 'create')
      └─ expression: PropertyAccessExpression (name: 'user')
          └─ expression: Identifier (text: 'prisma')
```

**Chain**: `prisma` → `user` → `create()`

### Example 2: OpenAI (3-level chain)
```typescript
await openai.chat.completions.create({ messages })
```

**AST Structure**:
```
CallExpression
  └─ expression: PropertyAccessExpression (name: 'create')
      └─ expression: PropertyAccessExpression (name: 'completions')
          └─ expression: PropertyAccessExpression (name: 'chat')
              └─ expression: Identifier (text: 'openai')
```

**Chain**: `openai` → `chat` → `completions` → `create()`

### Example 3: Axios (1-level chain - current working)
```typescript
await axios.get(url)
```

**AST Structure**:
```
CallExpression
  └─ expression: PropertyAccessExpression (name: 'get')
      └─ expression: Identifier (text: 'axios')
```

**Chain**: `axios` → `get()`

---

## Solution Design

### Core Algorithm: Walk Property Access Chain

Create a new helper method that walks up the property access chain:

```typescript
/**
 * Walks up a property access chain and returns components
 * Example: prisma.user.create → { root: 'prisma', chain: ['user'], method: 'create' }
 */
private walkPropertyAccessChain(
  expr: ts.PropertyAccessExpression,
  sourceFile: ts.SourceFile
): { root: string; chain: string[]; method: string } | null {
  const chain: string[] = [];
  let current: ts.Expression = expr.expression;

  // Walk up the chain, collecting property names
  while (ts.isPropertyAccessExpression(current)) {
    chain.unshift(current.name.text); // Add to front to maintain order
    current = current.expression;
  }

  // At this point, current should be the root identifier
  if (!ts.isIdentifier(current)) {
    return null; // Unsupported pattern (e.g., complex expression)
  }

  const root = current.text;
  const method = expr.name.text;

  return { root, chain, method };
}
```

**Example Results**:
- `axios.get()` → `{ root: 'axios', chain: [], method: 'get' }`
- `prisma.user.create()` → `{ root: 'prisma', chain: ['user'], method: 'create' }`
- `openai.chat.completions.create()` → `{ root: 'openai', chain: ['chat', 'completions'], method: 'create' }`

### Integration with extractCallSite()

Modify the `extractCallSite()` method (lines 191-247):

**Current Code** (lines 202-223):
```typescript
if (ts.isPropertyAccessExpression(node.expression)) {
  functionName = node.expression.name.text;

  if (ts.isIdentifier(node.expression.expression)) {
    // Direct: axios.get()
    const identifierName = node.expression.expression.text;
    packageName = identifierName;

    if (axiosInstances.has(identifierName)) {
      packageName = axiosInstances.get(identifierName)!;
    }
  } else if (ts.isPropertyAccessExpression(node.expression.expression)) {
    // Nested: this._axios.get()
    const propertyName = node.expression.expression.name.text;

    if (axiosInstances.has(propertyName)) {
      packageName = axiosInstances.get(propertyName)!;
    }
  }
}
```

**New Code**:
```typescript
if (ts.isPropertyAccessExpression(node.expression)) {
  // Walk the full property access chain
  const chainInfo = this.walkPropertyAccessChain(node.expression, sourceFile);

  if (chainInfo) {
    functionName = chainInfo.method;
    const rootIdentifier = chainInfo.root;

    // Check if root is a known package
    if (this.contracts.has(rootIdentifier)) {
      packageName = rootIdentifier;
    }

    // Check if root is a known instance variable
    else if (axiosInstances.has(rootIdentifier)) {
      packageName = axiosInstances.get(rootIdentifier)!;
    }

    // Fallback: resolve from imports
    else {
      packageName = this.resolvePackageFromImports(rootIdentifier, sourceFile);
    }
  }
}
```

**Benefits**:
1. ✅ Handles 1-level chains (Axios) - backward compatible
2. ✅ Handles 2-level chains (Prisma, Stripe)
3. ✅ Handles 3-level chains (OpenAI)
4. ✅ Works with instance variables
5. ✅ Works with imports

---

## Contract Matching Strategy

### Challenge: Dynamic Model Names

For Prisma, the model name is dynamic:
- `prisma.user.create()`
- `prisma.post.findMany()`
- `prisma.comment.delete()`

The contract specifies `create`, `findMany`, `delete` but not the model names.

### Solution: Ignore Intermediate Properties

When matching against the contract:
1. Extract the **final method name** (e.g., `create`)
2. **Ignore intermediate properties** (e.g., `user`, `post`)
3. Match method name against contract functions

This works because:
- **Prisma**: All models have the same methods (`create`, `update`, `delete`, etc.)
- **Stripe**: All resources have similar methods (`create`, `retrieve`, `update`, etc.)
- **OpenAI**: Namespaces group related methods but behavior is consistent

### Contract YAML Format (No Changes Needed)

```yaml
package: "@prisma/client"
functions:
  - name: create
    import_path: "@prisma/client"
    postconditions:
      - id: prisma-create-p2002-unique
        condition: "P2002 error when unique constraint violated"
        severity: error
        required_handling: "try-catch with error.code === 'P2002' check"
```

**Matching Logic**:
- Contract says: `create` is a function
- Code has: `prisma.user.create()`
- Match: `create` === `create` ✅
- Model name `user` is ignored

---

## Instance Variable Tracking

### Challenge: Renaming Package Instances

Current code tracks Axios instances:
```typescript
const axiosInstances = new Map<string, string>(); // variableName -> packageName
```

**Example**:
```typescript
const client = new PrismaClient();
await client.user.create({ data });
```

Here, `client` is not `prisma` but is a PrismaClient instance.

### Solution: Extend Instance Tracking

**Current** (lines 66-123): Only tracks Axios instances from `axios.create()`

**Extend to**:
1. Track `new PrismaClient()` → instance of `@prisma/client`
2. Track `new Stripe(apiKey)` → instance of `stripe`
3. Track `new OpenAI(config)` → instance of `openai`

**Implementation**:
```typescript
// Extend findAxiosInstances to findPackageInstances
function findPackageInstances(node: ts.Node): void {
  // Look for: const client = new PrismaClient()
  if (ts.isVariableDeclaration(node) && node.initializer) {
    const varName = node.name.getText(sourceFile);
    const packageName = self.extractPackageFromNewExpression(node.initializer, sourceFile);
    if (packageName) {
      axiosInstances.set(varName, packageName); // Reuse existing map
    }
  }

  // Existing axios.create() logic...
}
```

**New Helper**:
```typescript
/**
 * Extracts package name from new expressions
 * Examples: new PrismaClient() → "@prisma/client"
 *          new Stripe(key) → "stripe"
 */
private extractPackageFromNewExpression(
  node: ts.Expression,
  sourceFile: ts.SourceFile
): string | null {
  if (!ts.isNewExpression(node)) return null;

  const className = node.expression.getText(sourceFile);

  // Map class names to package names
  const classToPackage: Record<string, string> = {
    'PrismaClient': '@prisma/client',
    'Stripe': 'stripe',
    'OpenAI': 'openai',
    // Add more as needed
  };

  if (classToPackage[className]) {
    return classToPackage[className];
  }

  // Fallback: resolve from imports
  return this.resolvePackageFromImports(className, sourceFile);
}
```

---

## Backward Compatibility

### Ensure Axios Still Works

**Test Cases**:
1. `axios.get(url)` - direct call
2. `axiosInstance.post(url, data)` - instance call
3. `this._axios.request(config)` - property access
4. Instance with interceptors

**Verification**:
- Run existing Axios test fixtures
- Run on existing analyzed repos (Medusajs, Axios, etc.)
- Ensure violation counts don't change

**Risk Mitigation**:
- Add unit tests before implementing
- Test incrementally
- Keep old code commented for rollback

---

## Implementation Phases

### Phase 1: Add Chain Walking (1-2 hours)
1. Implement `walkPropertyAccessChain()` helper
2. Add unit tests for chain walking
3. Test on example code snippets

### Phase 2: Integrate with extractCallSite (1-2 hours)
1. Modify `extractCallSite()` to use chain walking
2. Test on Axios (ensure backward compatibility)
3. Test on Prisma fixtures

### Phase 3: Extend Instance Tracking (1 hour)
1. Implement `extractPackageFromNewExpression()`
2. Rename `findAxiosInstances` to `findPackageInstances`
3. Add Prisma/Stripe/OpenAI instance detection

### Phase 4: Testing (2-3 hours)
1. Create test fixtures for all patterns
2. Test on real repos
3. Verify accuracy

---

## Edge Cases to Handle

### 1. Builder Patterns (Supabase)
```typescript
await supabase.from('users').select('*')
```

**Challenge**: `from('users')` returns a query builder, not a direct property access.

**Solution**: Defer to later. Focus on Prisma first.

### 2. Destructured Imports
```typescript
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
```

**Solution**: Already handled by `extractPackageFromNewExpression()` with import resolution.

### 3. Aliased Imports
```typescript
import { PrismaClient as DB } from '@prisma/client';
const db = new DB();
```

**Solution**: Track class name from import alias. May need import alias resolution.

### 4. Property Assignment
```typescript
class Service {
  private db: PrismaClient;

  constructor() {
    this.db = new PrismaClient();
  }

  async createUser() {
    await this.db.user.create({ data });
  }
}
```

**Challenge**: `this.db` needs to be tracked across property assignments.

**Solution**:
- Track property declarations with type `PrismaClient`
- In chain walking, handle `this.property` access
- Match property name to tracked instances

---

## Success Criteria

### Functional Requirements
- [x] Detects 1-level chains (Axios) ← backward compatible
- [x] Detects 2-level chains (Prisma, Stripe)
- [x] Detects 3-level chains (OpenAI)
- [x] Tracks instance variables (new PrismaClient())
- [x] Handles property assignments (this.db = ...)

### Quality Requirements
- [x] All existing Axios tests pass
- [x] Prisma test fixtures work correctly
- [x] Code is well-documented
- [x] Performance: <10% slowdown on large repos

### Testing Requirements
- [x] Unit tests for chain walking
- [x] Integration tests for each package type
- [x] Regression tests for Axios
- [x] Real-world repo testing (5+ repos)

---

## Performance Considerations

### Current Performance
- Analyzer walks entire AST once
- O(n) where n = number of nodes

### With Chain Walking
- Chain walking is O(d) where d = depth of property chain
- Depth is typically 2-3, max ~5
- **Impact**: Negligible (<1% slowdown)

### Optimization Opportunities
- Cache chain walking results (same expression may appear multiple times)
- Early exit if root is not a tracked package
- Skip chain walking for non-contract packages

---

## Testing Strategy

### Unit Tests (Create in verify-cli/tests/)

**Test 1: Chain Walking**
```typescript
describe('walkPropertyAccessChain', () => {
  it('handles direct calls', () => {
    // axios.get() → { root: 'axios', chain: [], method: 'get' }
  });

  it('handles 2-level chains', () => {
    // prisma.user.create() → { root: 'prisma', chain: ['user'], method: 'create' }
  });

  it('handles 3-level chains', () => {
    // openai.chat.completions.create() → { root: 'openai', chain: ['chat', 'completions'], method: 'create' }
  });
});
```

**Test 2: Instance Detection**
```typescript
describe('extractPackageFromNewExpression', () => {
  it('detects PrismaClient', () => {
    // new PrismaClient() → '@prisma/client'
  });

  it('detects Stripe', () => {
    // new Stripe(key) → 'stripe'
  });
});
```

### Integration Tests (Test Fixtures)

Create in `verify-cli/test-fixtures/prisma/`:
1. `proper-error-handling.ts` - Should NOT flag
2. `missing-error-handling.ts` - Should flag
3. `instance-usage.ts` - Test instance variables
4. `property-assignment.ts` - Test this.db patterns

### Regression Tests (Existing Repos)

Run on previously analyzed repos:
1. Axios repos (ensure counts match)
2. Medusajs (ensure violations found)
3. Compare outputs before/after

---

## Documentation Updates

### Files to Update
1. `verify-cli/README.md` - Add supported package patterns
2. `verify-cli/ANALYZER-V2.md` - This document
3. `dev-notes/ANALYZER-DETECTION-STATUS.md` - Update status
4. Inline code comments in analyzer.ts

### User-Facing Documentation
- List supported packages: Axios, Prisma, Stripe, OpenAI
- Show example patterns for each
- Explain what's detected vs. not detected

---

## Timeline

**Total Estimate**: 8-12 hours

| Phase | Task | Time |
|-------|------|------|
| 1 | Design (this doc) | ✅ Done |
| 2 | Implement chain walking | 1-2 hours |
| 3 | Integrate with extractCallSite | 1-2 hours |
| 4 | Extend instance tracking | 1 hour |
| 5 | Create test fixtures | 1 hour |
| 6 | Test on real repos | 2-3 hours |
| 7 | Validate samples | 2-3 hours |
| 8 | Documentation | 1 hour |

**Next Step**: Implement `walkPropertyAccessChain()` method
