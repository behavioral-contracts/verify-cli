/**
 * Fixture Regression Test Suite
 *
 * Automatically discovers all *.expected.ts files in corpus/packages/*/fixtures/
 * and validates that the analyzer produces expected violations.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import { loadCorpus } from '../src/corpus-loader.js';
import { Analyzer } from '../src/analyzer.js';
import type { AnalyzerConfig } from '../src/types.js';
import { validateFixtureViolations, formatDiscrepancies } from '../src/fixture-tester.js';
import type { ExpectedViolations } from '../../corpus/types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Fixture Regression Tests', () => {
  let corpus: any;

  beforeAll(async () => {
    // Load corpus once for all tests
    const corpusPath = path.join(__dirname, '../../corpus');
    const corpusResult = await loadCorpus(corpusPath);

    if (corpusResult.errors.length > 0) {
      console.error('Corpus loading errors:', corpusResult.errors);
      throw new Error(`Failed to load corpus: ${corpusResult.errors.length} errors`);
    }

    corpus = corpusResult;
  });

  // Dynamically discover all .expected.ts files
  const corpusPath = path.join(__dirname, '../../corpus');
  const expectedFiles = glob.sync('packages/*/fixtures/*.expected.ts', {
    cwd: corpusPath,
    absolute: false
  });

  if (expectedFiles.length === 0) {
    it.skip('no fixture expected outputs found', () => {
      console.log('⚠️  No .expected.ts files found in corpus/packages/*/fixtures/');
      console.log('   Run: npm run test:fixtures:generate to create them');
    });
  }

  // Create a test for each fixture
  for (const expectedFile of expectedFiles) {
    // Extract package name and fixture name
    const packageMatch = expectedFile.match(/packages\/([^/]+)\/fixtures/);
    const packageName = packageMatch?.[1] || 'unknown';

    const fixtureMatch = expectedFile.match(/([^/]+)\.expected\.ts$/);
    const fixtureName = fixtureMatch?.[1] || 'unknown';

    const fixtureSourceFile = `${fixtureName}.ts`;

    describe(`${packageName}/${fixtureName}`, () => {
      it('should match expected violations', async () => {
        // Load expected output
        const expectedPath = path.join(corpusPath, expectedFile);
        const expectedModule = await import(expectedPath);
        const expected: ExpectedViolations = expectedModule.expected;

        // Check if pending
        if (expected.pending) {
          console.log(`⏭️  Skipping pending fixture: ${packageName}/${fixtureName}`);
          console.log(`   Reason: ${expected.pendingReason || 'Pending analyzer support'}`);
          return; // Skip test
        }

        // Construct path to fixture directory
        const fixtureDir = path.join(
          corpusPath,
          'packages',
          packageName,
          'fixtures'
        );
        const tsconfigPath = path.join(fixtureDir, 'tsconfig.json');

        // Run analyzer on this fixture
        const config: AnalyzerConfig = {
          tsconfigPath,
          corpusPath,
        };

        const analyzer = new Analyzer(config, corpus.contracts);
        const allViolations = analyzer.analyze();

        // Filter to only violations from this specific fixture file
        const fixtureViolations = allViolations.filter(v =>
          v.file.includes(fixtureSourceFile)
        );

        // Validate against expectations
        const result = validateFixtureViolations(fixtureViolations, expected);

        // Assert with detailed error message
        if (!result.passed) {
          const errorMessage = [
            `\nFixture: ${packageName}/${fixtureName}`,
            `Expected violations: ${expected.expectations.length} patterns`,
            `Actual violations: ${result.actualViolations}`,
            `\nDiscrepancies:`,
            formatDiscrepancies(result)
          ].join('\n');

          expect(result.passed, errorMessage).toBe(true);
        }

        expect(result.passed).toBe(true);
      });
    });
  }
});
