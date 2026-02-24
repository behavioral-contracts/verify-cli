#!/usr/bin/env node

/**
 * Generate Expected Output Files for Fixture Tests
 *
 * This script runs the analyzer against all fixture files and generates
 * .expected.ts files with the actual violations found. This creates a
 * baseline for regression testing.
 *
 * Usage:
 *   npm run test:fixtures:generate
 *   node scripts/generate-expected-outputs.js
 *   node scripts/generate-expected-outputs.js --package axios
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { glob } from 'glob';
import { fileURLToPath } from 'url';
import { loadCorpus } from '../dist/corpus-loader.js';
import { Analyzer } from '../dist/analyzer.js';
import { groupViolationsByFunction } from '../dist/fixture-tester.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const packageFilter = args.find(arg => !arg.startsWith('--'))?.replace('--package=', '');

async function main() {
  console.log('🔍 Generating expected outputs for fixture tests...\n');

  const corpusPath = path.join(__dirname, '../../corpus');
  const verifyCliPath = path.join(__dirname, '..');

  // Load corpus
  console.log('Loading corpus...');
  const corpusResult = await loadCorpus(corpusPath);

  if (corpusResult.errors.length > 0) {
    console.error('❌ Corpus loading errors:');
    corpusResult.errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  }

  console.log(`✓ Loaded ${corpusResult.contracts.size} contracts\n`);

  // Discover all fixture files
  const fixturePattern = packageFilter
    ? `packages/${packageFilter}/fixtures/*.ts`
    : 'packages/*/fixtures/*.ts';

  const fixtureFiles = glob.sync(fixturePattern, {
    cwd: corpusPath,
    ignore: ['**/*.expected.ts', '**/tsconfig.json'],
    absolute: false
  });

  console.log(`Found ${fixtureFiles.length} fixture files\n`);

  let generated = 0;
  let skipped = 0;
  let errors = 0;

  for (const fixtureFile of fixtureFiles) {
    const packageMatch = fixtureFile.match(/packages\/([^/]+)\/fixtures/);
    const packageName = packageMatch?.[1] || 'unknown';

    const fixtureBasename = path.basename(fixtureFile, '.ts');
    const fixtureDir = path.join(corpusPath, path.dirname(fixtureFile));
    const tsconfigPath = path.join(fixtureDir, 'tsconfig.json');

    console.log(`📝 ${packageName}/${fixtureBasename}.ts`);

    try {
      // Run analyzer on this fixture
      const config = {
        tsconfigPath,
        corpusPath,
      };

      const analyzer = new Analyzer(config, corpusResult.contracts);
      const allViolations = analyzer.analyze();

      // Filter to only violations from this fixture file
      const violations = allViolations.filter(v =>
        v.file.includes(fixtureBasename + '.ts')
      );

      // Generate expected output
      const expected = generateExpectedFromViolations(
        violations,
        fixtureBasename + '.ts',
        packageName
      );

      // Write to .expected.ts file
      const expectedPath = path.join(fixtureDir, `${fixtureBasename}.expected.ts`);
      await writeExpectedFile(expectedPath, expected);

      console.log(`   ✓ Generated ${violations.length} expectations\n`);
      generated++;
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}\n`);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Generated: ${generated}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Errors: ${errors}`);
  console.log('='.repeat(60) + '\n');

  if (errors > 0) {
    process.exit(1);
  }
}

/**
 * Generate ExpectedViolations object from actual violations
 */
function generateExpectedFromViolations(violations, fixtureFilename, packageName) {
  const expectations = [];

  // Group violations by function
  const grouped = groupViolationsByFunction(violations);

  for (const [functionName, viols] of grouped.entries()) {
    if (viols.length === 0) continue;

    const clauses = [...new Set(viols.map(v => v.contract_clause))];
    const severity = viols[0].severity;
    const lines = viols.map(v => v.line);

    expectations.push({
      id: `${functionName.replace(/[^a-zA-Z0-9]/g, '-')}-violations`,
      description: `Violations in ${functionName}`,
      functionName: functionName === 'unknown' ? undefined : functionName,
      minViolations: viols.length,
      expectedClauses: clauses,
      severity,
      approximateLines: lines.length > 0 ? [Math.min(...lines), Math.max(...lines)] : undefined
    });
  }

  // Calculate summary counts
  const errorCount = violations.filter(v => v.severity === 'error').length;
  const warningCount = violations.filter(v => v.severity === 'warning').length;
  const infoCount = violations.filter(v => v.severity === 'info').length;

  return {
    fixtures: fixtureFilename,
    expectations,
    summary: {
      expectedErrorCount: { min: errorCount, max: errorCount },
      expectedWarningCount: { min: warningCount, max: warningCount },
      expectedInfoCount: { min: infoCount, max: infoCount }
    }
  };
}

/**
 * Write expected output to TypeScript file
 */
async function writeExpectedFile(filePath, expected) {
  const content = `/**
 * Expected test output for ${expected.fixtures}
 *
 * Auto-generated by: npm run test:fixtures:generate
 * Do not edit manually - regenerate when analyzer or contracts change
 */

import type { ExpectedViolations } from '../../../types/index.js';

export const expected: ExpectedViolations = ${JSON.stringify(expected, null, 2)};
`;

  await fs.writeFile(filePath, content, 'utf8');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
