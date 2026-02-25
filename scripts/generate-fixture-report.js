#!/usr/bin/env node

/**
 * Fixture Regression Report Generator
 *
 * Runs analyzer on all package fixtures and generates comprehensive reports:
 * - Per-package fixture test results
 * - Comparison between expected and actual violations
 * - Human-readable markdown summaries
 * - Machine-readable JSON outputs
 *
 * Output Structure:
 *   output/fixture-runs/<run-id>/
 *   ├── run-metadata.json
 *   ├── summary.md
 *   └── <package>/
 *       ├── summary.md
 *       ├── test-results.json
 *       └── <fixture>/
 *           ├── violations.json
 *           ├── expected.json
 *           ├── comparison.json
 *           └── status.txt
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { glob } from 'glob';
import { fileURLToPath } from 'url';
import { loadCorpus } from '../dist/corpus-loader.js';
import { Analyzer } from '../dist/analyzer.js';
import { validateFixtureViolations, formatDiscrepancies } from '../dist/fixture-tester.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
  const args = process.argv.slice(2);
  const outputDir = args[0] || path.join(__dirname, '../output/fixture-runs', `${Date.now()}`);

  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('  Fixture Regression Report Generator', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('');

  const corpusPath = path.join(__dirname, '../../corpus');
  const verifyCliPath = path.join(__dirname, '..');

  // Load corpus
  log('Loading corpus...', 'cyan');
  const corpusResult = await loadCorpus(corpusPath);

  if (corpusResult.errors.length > 0) {
    log('❌ Corpus loading errors:', 'red');
    corpusResult.errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  }

  log(`✓ Loaded ${corpusResult.contracts.size} contracts\n`, 'green');

  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });

  // Discover all packages with fixtures
  const packagesWithFixtures = glob.sync('packages/*/fixtures', {
    cwd: corpusPath,
    absolute: false
  });

  // Also check for scoped packages
  const scopedPackagesWithFixtures = glob.sync('packages/@*/*/fixtures', {
    cwd: corpusPath,
    absolute: false
  });

  const allPackagesWithFixtures = [...packagesWithFixtures, ...scopedPackagesWithFixtures];

  log(`Found ${allPackagesWithFixtures.length} packages with fixtures\n`, 'cyan');

  // Initialize counters
  const stats = {
    totalPackages: 0,
    totalFixtures: 0,
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    totalViolations: 0,
    totalErrors: 0,
    totalWarnings: 0,
    totalInfo: 0,
    packagesHealthy: 0,
    packagesDegraded: 0,
    packagesFailed: 0,
  };

  const packageResults = [];

  // Process each package
  for (const packageFixturesPath of allPackagesWithFixtures) {
    const packageMatch = packageFixturesPath.match(/packages\/((?:@[^/]+\/)?[^/]+)\/fixtures/);
    const packageName = packageMatch?.[1] || 'unknown';

    stats.totalPackages++;

    log(`[${stats.totalPackages}] ${packageName}`, 'blue');

    const packageDir = path.join(corpusPath, 'packages', packageName);
    const fixturesDir = path.join(packageDir, 'fixtures');

    // Discover fixture files (skip .expected.ts and tsconfig.json)
    const fixtureFiles = glob.sync('*.{ts,tsx}', {
      cwd: fixturesDir,
      ignore: ['*.expected.ts', '*.expected.tsx', 'tsconfig.json'],
      absolute: false
    });

    stats.totalFixtures += fixtureFiles.length;

    // Create package output directory
    const packageOutputDir = path.join(outputDir, packageName);
    await fs.mkdir(packageOutputDir, { recursive: true });

    const packageResult = {
      package: packageName,
      fixtures: [],
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      totalViolations: 0,
      errors: 0,
      warnings: 0,
      info: 0,
      status: 'healthy', // healthy, degraded, failed
    };

    // Process each fixture
    for (const fixtureFile of fixtureFiles) {
      const fixtureName = path.basename(fixtureFile, '.ts');
      const tsconfigPath = path.join(fixturesDir, 'tsconfig.json');

      log(`  📝 ${fixtureName}`, 'cyan');

      const fixtureOutputDir = path.join(packageOutputDir, fixtureName);
      await fs.mkdir(fixtureOutputDir, { recursive: true });

      try {
        // Check if expected file exists
        const expectedPath = path.join(fixturesDir, `${fixtureName}.expected.ts`);
        let hasExpected = false;
        let expected = null;

        try {
          await fs.access(expectedPath);
          const expectedModule = await import(expectedPath);
          expected = expectedModule.expected;
          hasExpected = true;

          // Check if pending
          if (expected.pending) {
            log(`     ⏭️  Pending: ${expected.pendingReason || 'Analyzer support needed'}`, 'yellow');
            packageResult.fixtures.push({
              name: fixtureName,
              status: 'pending',
              reason: expected.pendingReason,
            });
            continue;
          }
        } catch (e) {
          log(`     ⚠️  No .expected.ts file found`, 'yellow');
        }

        // Run analyzer on this fixture
        const config = {
          tsconfigPath,
          corpusPath,
        };

        const analyzer = new Analyzer(config, corpusResult.contracts);
        const allViolations = analyzer.analyze();

        // Filter to only violations from this fixture file
        const violations = allViolations.filter(v =>
          v.file.includes(fixtureName + '.ts') || v.file.includes(fixtureName + '.tsx')
        );

        // Save actual violations
        const violationsData = {
          fixture: fixtureName,
          package: packageName,
          violations: violations,
          summary: {
            total: violations.length,
            errors: violations.filter(v => v.severity === 'error').length,
            warnings: violations.filter(v => v.severity === 'warning').length,
            info: violations.filter(v => v.severity === 'info').length,
          }
        };

        await fs.writeFile(
          path.join(fixtureOutputDir, 'violations.json'),
          JSON.stringify(violationsData, null, 2)
        );

        // Update stats
        packageResult.totalViolations += violations.length;
        packageResult.errors += violationsData.summary.errors;
        packageResult.warnings += violationsData.summary.warnings;
        packageResult.info += violationsData.summary.info;

        stats.totalViolations += violations.length;
        stats.totalErrors += violationsData.summary.errors;
        stats.totalWarnings += violationsData.summary.warnings;
        stats.totalInfo += violationsData.summary.info;

        // Compare with expected if available
        if (hasExpected && expected) {
          const result = validateFixtureViolations(violations, expected);

          // Count tests (expectations)
          const testCount = expected.expectations?.length || 0;
          packageResult.totalTests += testCount;
          stats.totalTests += testCount;

          const comparison = {
            fixture: fixtureName,
            package: packageName,
            passed: result.passed,
            expected: {
              fixtures: expected.fixtures,
              expectations: expected.expectations,
              summary: expected.summary,
            },
            actual: violationsData.summary,
            discrepancies: result.discrepancies || [],
            details: result.passed ? null : formatDiscrepancies(result),
          };

          await fs.writeFile(
            path.join(fixtureOutputDir, 'comparison.json'),
            JSON.stringify(comparison, null, 2)
          );

          await fs.writeFile(
            path.join(fixtureOutputDir, 'expected.json'),
            JSON.stringify(expected, null, 2)
          );

          if (result.passed) {
            packageResult.passedTests += testCount;
            stats.passedTests += testCount;
            await fs.writeFile(
              path.join(fixtureOutputDir, 'status.txt'),
              `PASS\n\nAll ${testCount} expectations matched.\n`
            );
            log(`     ✓ PASS (${testCount} expectations)`, 'green');
          } else {
            packageResult.failedTests += testCount;
            stats.failedTests += testCount;
            const statusText = `FAIL\n\nExpected ${testCount} patterns to match, but found discrepancies:\n\n${formatDiscrepancies(result)}`;
            await fs.writeFile(
              path.join(fixtureOutputDir, 'status.txt'),
              statusText
            );
            log(`     ✗ FAIL (${testCount} expectations)`, 'red');
            log(`     ${formatDiscrepancies(result)}`, 'red');
          }

          packageResult.fixtures.push({
            name: fixtureName,
            status: result.passed ? 'pass' : 'fail',
            tests: testCount,
            violations: violations.length,
            expected: expected.summary,
            actual: violationsData.summary,
          });
        } else {
          // No expected file - just report what we found
          await fs.writeFile(
            path.join(fixtureOutputDir, 'status.txt'),
            `NO BASELINE\n\nFound ${violations.length} violations.\nGenerate baseline with: npm run test:fixtures:generate\n`
          );
          log(`     ⚠️  NO BASELINE (${violations.length} violations found)`, 'yellow');

          packageResult.fixtures.push({
            name: fixtureName,
            status: 'no-baseline',
            violations: violations.length,
            actual: violationsData.summary,
          });
        }

      } catch (error) {
        log(`     ❌ Error: ${error.message}`, 'red');
        packageResult.fixtures.push({
          name: fixtureName,
          status: 'error',
          error: error.message,
        });
      }
    }

    // Determine package health status
    if (packageResult.failedTests > 0) {
      packageResult.status = 'failed';
      stats.packagesFailed++;
    } else if (packageResult.totalTests === 0) {
      packageResult.status = 'no-baseline';
      stats.packagesDegraded++;
    } else {
      packageResult.status = 'healthy';
      stats.packagesHealthy++;
    }

    // Write package test results
    await fs.writeFile(
      path.join(packageOutputDir, 'test-results.json'),
      JSON.stringify(packageResult, null, 2)
    );

    // Generate package summary markdown
    await generatePackageSummary(packageOutputDir, packageResult);

    packageResults.push(packageResult);
    log('');
  }

  // Generate main summary
  await generateMainSummary(outputDir, packageResults, stats);

  // Generate run metadata
  await generateRunMetadata(outputDir, stats);

  // Print final summary
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('  Summary', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  log('');
  log(`Packages:      ${stats.totalPackages}`, 'cyan');
  log(`Fixtures:      ${stats.totalFixtures}`, 'cyan');
  log(`Tests:         ${stats.totalTests}`, 'cyan');
  log(`Passed:        ${stats.passedTests}`, 'green');
  log(`Failed:        ${stats.failedTests}`, stats.failedTests > 0 ? 'red' : 'green');
  log('');
  log(`Package Health:`, 'cyan');
  log(`  Healthy:     ${stats.packagesHealthy}`, 'green');
  log(`  No Baseline: ${stats.packagesDegraded}`, 'yellow');
  log(`  Failed:      ${stats.packagesFailed}`, stats.packagesFailed > 0 ? 'red' : 'green');
  log('');
  log(`Violations:    ${stats.totalViolations}`, 'cyan');
  log(`  Errors:      ${stats.totalErrors}`, 'red');
  log(`  Warnings:    ${stats.totalWarnings}`, 'yellow');
  log(`  Info:        ${stats.totalInfo}`, 'cyan');
  log('');
  log(`Output:        ${outputDir}`, 'cyan');
  log(`Summary:       ${path.join(outputDir, 'summary.md')}`, 'cyan');
  log('');

  if (stats.failedTests > 0) {
    log('❌ Some fixture tests failed!', 'red');
    process.exit(1);
  } else if (stats.packagesDegraded > 0) {
    log('⚠️  Some packages have no baselines. Generate with: npm run test:fixtures:generate', 'yellow');
  } else {
    log('✅ All fixture tests passed!', 'green');
  }
}

async function generatePackageSummary(packageOutputDir, packageResult) {
  const lines = [];

  lines.push(`# ${packageResult.package} - Fixture Test Results`);
  lines.push('');
  lines.push(`**Status:** ${getStatusIcon(packageResult.status)} ${packageResult.status.toUpperCase()}`);
  lines.push(`**Tests:** ${packageResult.passedTests}/${packageResult.totalTests}`);
  lines.push(`**Fixtures:** ${packageResult.fixtures.length}`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|--------|-------|');
  lines.push(`| Total Tests | ${packageResult.totalTests} |`);
  lines.push(`| Passed | ${packageResult.passedTests} |`);
  lines.push(`| Failed | ${packageResult.failedTests} |`);
  lines.push(`| Total Violations | ${packageResult.totalViolations} |`);
  lines.push(`| Errors | ${packageResult.errors} |`);
  lines.push(`| Warnings | ${packageResult.warnings} |`);
  lines.push(`| Info | ${packageResult.info} |`);
  lines.push('');

  lines.push('## Fixtures');
  lines.push('');
  lines.push('| Fixture | Expected | Actual | Match | Status | Errors | Warnings | Info | Details |');
  lines.push('|---------|----------|--------|-------|--------|--------|----------|------|---------|');

  for (const fixture of packageResult.fixtures) {
    if (fixture.status === 'pending') {
      lines.push(`| ${fixture.name} | - | - | - | ⏭️ Pending | - | - | - | ${fixture.reason || 'Analyzer support needed'} |`);
    } else if (fixture.status === 'no-baseline') {
      lines.push(`| ${fixture.name} | - | ${fixture.violations} | - | ⚠️ No Baseline | ${fixture.actual.errors} | ${fixture.actual.warnings} | ${fixture.actual.info} | [📄](./${fixture.name}/violations.json) |`);
    } else if (fixture.status === 'error') {
      lines.push(`| ${fixture.name} | - | - | - | ❌ Error | - | - | - | ${fixture.error} |`);
    } else {
      const expectedTotal = (fixture.expected?.expectedErrorCount?.min || 0) +
                           (fixture.expected?.expectedWarningCount?.min || 0) +
                           (fixture.expected?.expectedInfoCount?.min || 0);
      const match = fixture.status === 'pass' ? '✅' : '❌';
      const status = fixture.status === 'pass' ? 'PASS' : 'FAIL';
      lines.push(`| ${fixture.name} | ${expectedTotal} | ${fixture.violations} | ${match} | ${status} | ${fixture.actual.errors} | ${fixture.actual.warnings} | ${fixture.actual.info} | [📄](./${fixture.name}/) |`);
    }
  }

  await fs.writeFile(
    path.join(packageOutputDir, 'summary.md'),
    lines.join('\n')
  );
}

async function generateMainSummary(outputDir, packageResults, stats) {
  const lines = [];

  lines.push('# Fixture Regression Test - Summary');
  lines.push('');
  lines.push(`**Date:** ${new Date().toISOString().split('T')[0]}`);
  lines.push(`**Timestamp:** ${new Date().toISOString()}`);
  lines.push('');

  lines.push('## Overall Results');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|--------|-------|');
  lines.push(`| Total Packages | ${stats.totalPackages} |`);
  lines.push(`| Total Fixtures | ${stats.totalFixtures} |`);
  lines.push(`| Total Tests | ${stats.totalTests} |`);
  lines.push(`| Passed Tests | ${stats.passedTests} |`);
  lines.push(`| Failed Tests | ${stats.failedTests} |`);
  lines.push(`| Pass Rate | ${stats.totalTests > 0 ? Math.round((stats.passedTests / stats.totalTests) * 100) : 0}% |`);
  lines.push('');

  lines.push('## Package Health');
  lines.push('');
  lines.push('| Status | Count | Percentage |');
  lines.push('|--------|-------|------------|');
  lines.push(`| ✅ Healthy | ${stats.packagesHealthy} | ${Math.round((stats.packagesHealthy / stats.totalPackages) * 100)}% |`);
  lines.push(`| ⚠️ No Baseline | ${stats.packagesDegraded} | ${Math.round((stats.packagesDegraded / stats.totalPackages) * 100)}% |`);
  lines.push(`| ❌ Failed | ${stats.packagesFailed} | ${Math.round((stats.packagesFailed / stats.totalPackages) * 100)}% |`);
  lines.push('');

  lines.push('## Violation Statistics');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  lines.push(`| Total | ${stats.totalViolations} |`);
  lines.push(`| Errors | ${stats.totalErrors} |`);
  lines.push(`| Warnings | ${stats.totalWarnings} |`);
  lines.push(`| Info | ${stats.totalInfo} |`);
  lines.push('');

  lines.push('## Package Results');
  lines.push('');
  lines.push('| Package | Fixtures | Tests | Passed | Failed | Total Violations | Errors | Warnings | Info | Status | Details |');
  lines.push('|---------|----------|-------|--------|--------|------------------|--------|----------|------|--------|---------|');

  // Sort: failed first, then no-baseline, then healthy
  const sortedResults = [...packageResults].sort((a, b) => {
    const statusOrder = { failed: 0, 'no-baseline': 1, healthy: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  for (const pkg of sortedResults) {
    const statusIcon = getStatusIcon(pkg.status);
    const details = `[📊](./${pkg.package}/summary.md) · [📄](./${pkg.package}/test-results.json)`;
    lines.push(`| [${pkg.package}](./${pkg.package}/) | ${pkg.fixtures.length} | ${pkg.totalTests} | ${pkg.passedTests} | ${pkg.failedTests} | ${pkg.totalViolations} | ${pkg.errors} | ${pkg.warnings} | ${pkg.info} | ${statusIcon} ${pkg.status} | ${details} |`);
  }

  await fs.writeFile(
    path.join(outputDir, 'summary.md'),
    lines.join('\n')
  );
}

async function generateRunMetadata(outputDir, stats) {
  const metadata = {
    run_id: path.basename(outputDir),
    timestamp: new Date().toISOString(),
    type: 'fixture-regression',
    stats: stats,
  };

  await fs.writeFile(
    path.join(outputDir, 'run-metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
}

function getStatusIcon(status) {
  switch (status) {
    case 'healthy':
    case 'pass':
      return '✅';
    case 'failed':
    case 'fail':
      return '❌';
    case 'no-baseline':
      return '⚠️';
    case 'pending':
      return '⏭️';
    case 'error':
      return '❌';
    default:
      return '❓';
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
