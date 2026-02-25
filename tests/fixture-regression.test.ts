/**
 * Fixture Regression Test Suite
 *
 * Tests fixture expected outputs against actual analyzer violations.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loadCorpus } from '../src/corpus-loader.js';
import { Analyzer } from '../src/analyzer.js';
import type { AnalyzerConfig } from '../src/types.js';
import { validateFixtureViolations, formatDiscrepancies } from '../src/fixture-tester.js';
import type { ExpectedViolations } from '../../corpus/types/index.js';
import * as fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Fixture Regression Tests', () => {
  let corpus: any;
  const corpusPath = path.join(__dirname, '../../corpus');

  beforeAll(async () => {
    const corpusResult = await loadCorpus(corpusPath);
    if (corpusResult.errors.length > 0) {
      throw new Error(`Failed to load corpus: ${corpusResult.errors.length} errors`);
    }
    corpus = corpusResult;
  });

  // Test packages explicitly (vitest doesn't support dynamic test generation well)
  const packages = [
    { name: 'axios', fixtures: ['proper-error-handling', 'missing-error-handling', 'instance-usage'] },
    { name: 'stripe', fixtures: ['proper-error-handling', 'missing-error-handling', 'instance-usage'] },
    { name: 'pg', fixtures: ['proper-error-handling', 'missing-error-handling', 'instance-usage'] },
    { name: 'openai', fixtures: ['proper-error-handling', 'missing-error-handling', 'instance-usage'] },
    { name: 'express', fixtures: ['proper-error-handling', 'missing-error-handling', 'instance-usage'] },
    { name: 'zod', fixtures: ['proper-error-handling', 'missing-error-handling', 'instance-usage'] },
    { name: 'firebase-admin', fixtures: ['proper-error-handling', 'missing-error-handling', 'instance-usage'] },
    { name: 'mongodb', fixtures: ['proper-error-handling', 'missing-error-handling', 'instance-usage'] }
  ];

  for (const pkg of packages) {
    describe(pkg.name, () => {
      for (const fixtureName of pkg.fixtures) {
        it(`should match expected violations for ${fixtureName}`, async () => {
          const fixtureDir = path.join(corpusPath, 'packages', pkg.name, 'fixtures');
          const expectedPath = path.join(fixtureDir, `${fixtureName}.expected.ts`);

          // Check if expected file exists
          try {
            await fs.access(expectedPath);
          } catch {
            console.log(`⏭️  Skipping: ${pkg.name}/${fixtureName} (no .expected.ts file)`);
            return;
          }

          // Load expected output
          const expectedModule = await import(expectedPath);
          const expected: ExpectedViolations = expectedModule.expected;

          // Check if pending
          if (expected.pending) {
            console.log(`⏭️  Skipping pending: ${pkg.name}/${fixtureName}`);
            console.log(`   Reason: ${expected.pendingReason || 'Pending analyzer support'}`);
            return;
          }

          // Run analyzer
          const tsconfigPath = path.join(fixtureDir, 'tsconfig.json');
          const config: AnalyzerConfig = {
            tsconfigPath,
            corpusPath,
          };

          const analyzer = new Analyzer(config, corpus.contracts);
          const allViolations = analyzer.analyze();

          // Filter to this fixture
          const fixtureViolations = allViolations.filter(v =>
            v.file.includes(`${fixtureName}.ts`)
          );

          // Validate
          const result = validateFixtureViolations(fixtureViolations, expected);

          if (!result.passed) {
            const errorMessage = [
              `\nFixture: ${pkg.name}/${fixtureName}`,
              `Expected: ${expected.expectations.length} patterns`,
              `Actual: ${result.actualViolations} violations`,
              `\nDiscrepancies:`,
              formatDiscrepancies(result)
            ].join('\n');

            expect(result.passed, errorMessage).toBe(true);
          }

          expect(result.passed).toBe(true);
        });
      }
    });
  }
});
