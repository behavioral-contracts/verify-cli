# NPM Publishing Guide

This guide covers how to publish new versions of `@behavioral-contracts/verify-cli` to npm.

---

## Prerequisites

1. **npm account**: Must be logged in to npm
2. **Write access**: Must have publish permissions for `@behavioral-contracts` scope
3. **Clean git state**: All changes committed

---

## Publishing Workflow

### 1. Login to npm (if needed)

```bash
npm login
```

Enter your credentials when prompted.

### 2. Verify you're logged in

```bash
npm whoami
```

Should show your npm username.

### 3. Make your changes

Edit code, fix bugs, add features, update docs, etc.

### 4. Build and test locally

```bash
cd verify-cli
npm run build
npm test

# Test on a real codebase
node dist/index.js --tsconfig ../test-repos/some-repo --corpus ../corpus
```

Ensure everything works as expected.

### 5. Bump the version

Use npm version to increment the version number:

**For bug fixes (1.2.1 → 1.2.2):**
```bash
npm version patch
```

**For new features (1.2.1 → 1.3.0):**
```bash
npm version minor
```

**For breaking changes (1.2.1 → 2.0.0):**
```bash
npm version major
```

This command:
- Updates the version in package.json
- Creates a git commit with message "1.2.2"
- Creates a git tag "v1.2.2"

### 6. Review the changes

```bash
git log -1              # Check the commit
git tag                 # Check the tag was created
cat package.json | grep version  # Verify version number
```

### 7. Push to GitHub

Push both the commit AND the tag:

```bash
git push origin main
git push origin --tags
```

**Important:** Both commands are required!
- `git push origin main` - Pushes the commit
- `git push origin --tags` - Pushes the version tag (v1.2.2)

### 8. Publish to npm

```bash
npm publish --access public
```

The `--access public` flag is required for scoped packages (@behavioral-contracts/verify-cli).

### 9. Verify publication

```bash
npm view @behavioral-contracts/verify-cli version
```

Should show the new version you just published.

### 10. Test the published version

Install globally and test:

```bash
npm install -g @behavioral-contracts/verify-cli@latest

# Test it
behavioral-contracts --version  # Should show new version
behavioral-contracts --tsconfig /path/to/project --corpus /path/to/corpus
```

Or test locally in a project:

```bash
cd some-test-project
npm install --save-dev @behavioral-contracts/verify-cli@latest
npx behavioral-contracts --tsconfig . --corpus ../corpus
```

---

## Troubleshooting

### Error: "You do not have permission to publish"

You need publish access to the `@behavioral-contracts` scope.

**Solution:** Contact the package owner to add you as a maintainer.

### Error: "Version already published"

You tried to publish a version that already exists on npm.

**Solution:** Bump the version again:
```bash
npm version patch  # Increments to next patch version
git push origin main --tags
npm publish --access public
```

### Error: "Git working directory not clean"

You have uncommitted changes.

**Solution:** Commit all changes first:
```bash
git add .
git commit -m "Describe your changes"
# Then retry npm version
```

### Version shows as "0.0.0" after update

The version reading code is broken (should be fixed now).

**Solution:** Ensure `src/reporter.ts` reads from `../package.json` (not `../../package.json`).

---

## Version History Examples

```bash
# Current version
npm view @behavioral-contracts/verify-cli version
# Output: 1.2.1

# Publish a bug fix (1.2.1 → 1.2.2)
npm version patch
git push origin main --tags
npm publish --access public

# Publish a new feature (1.2.2 → 1.3.0)
npm version minor
git push origin main --tags
npm publish --access public

# Publish breaking change (1.3.0 → 2.0.0)
npm version major
git push origin main --tags
npm publish --access public
```

---

## Testing Locally Before Publishing

To test the current built version without publishing:

```bash
# Build
npm run build

# Link globally for testing
npm link

# Now you can use it anywhere
cd ../some-test-repo
behavioral-contracts --tsconfig . --corpus ../corpus

# When done testing, unlink
npm unlink -g @behavioral-contracts/verify-cli
```

---

## Quick Reference

### Full publish workflow (patch version)

```bash
cd verify-cli

# 1. Make changes, commit them
git add .
git commit -m "Fix bug in analyzer"

# 2. Build and test
npm run build
npm test

# 3. Bump version, push, publish
npm version patch
git push origin main
git push origin --tags
npm publish --access public

# 4. Verify
npm view @behavioral-contracts/verify-cli version
npm install -g @behavioral-contracts/verify-cli@latest
behavioral-contracts --version
```

---

## Versioning Guidelines

### Patch (x.y.Z)
- Bug fixes
- Documentation updates
- Performance improvements (no API changes)
- Internal refactoring

### Minor (x.Y.0)
- New features
- New CLI flags (backward compatible)
- New contract support
- Enhancements to existing features

### Major (X.0.0)
- Breaking changes to CLI API
- Removing/renaming flags
- Changing output format (breaking)
- Contract schema changes (breaking)

---

## See Also

- [Semantic Versioning](https://semver.org/) - Version numbering rules
- [npm publish documentation](https://docs.npmjs.com/cli/v9/commands/npm-publish)
- [npm version documentation](https://docs.npmjs.com/cli/v9/commands/npm-version)
