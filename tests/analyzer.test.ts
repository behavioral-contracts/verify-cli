/**
 * Test suite for the analyzer
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { loadCorpus } from '../src/corpus-loader.js';
import { Analyzer } from '../src/analyzer.js';
import type { AnalyzerConfig } from '../src/types.js';

describe('Corpus Loader', () => {
  it('should load axios contract from corpus', async () => {
    const corpusPath = path.join(__dirname, '../../../corpus');
    const result = await loadCorpus(corpusPath);

    expect(result.errors).toHaveLength(0);
    expect(result.contracts.has('axios')).toBe(true);

    const axiosContract = result.contracts.get('axios');
    expect(axiosContract).toBeDefined();
    expect(axiosContract?.functions.length).toBeGreaterThan(0);
  });

  it('should validate contract schema', async () => {
    const corpusPath = path.join(__dirname, '../../../corpus');
    const result = await loadCorpus(corpusPath);

    // All contracts should be valid
    expect(result.errors).toHaveLength(0);

    // Axios contract should have required fields
    const axiosContract = result.contracts.get('axios');
    expect(axiosContract?.package).toBe('axios');
    expect(axiosContract?.contract_version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(axiosContract?.maintainer).toBeDefined();
    expect(axiosContract?.last_verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('Analyzer - Violations', () => {
  let analyzer: Analyzer;
  let corpus: any;

  beforeAll(async () => {
    // Load corpus
    const corpusPath = path.join(__dirname, '../../../corpus');
    const corpusResult = await loadCorpus(corpusPath);

    expect(corpusResult.errors).toHaveLength(0);
    expect(corpusResult.contracts.size).toBeGreaterThan(0);

    corpus = corpusResult;
  });

  it('should detect violations in axios-violations.ts', () => {
    // Create analyzer with violations fixture
    const config: AnalyzerConfig = {
      tsconfigPath: path.join(__dirname, '../tsconfig.test.json'),
      corpusPath: path.join(__dirname, '../../../corpus'),
    };

    analyzer = new Analyzer(config, corpus.contracts);
    const violations = analyzer.analyze();

    // Should find violations (exact count depends on implementation)
    expect(violations.length).toBeGreaterThan(0);

    // Check that we're detecting the right kinds of violations
    const violationIds = violations.map(v => v.contract_clause);

    // Should include network failure checks
    expect(violationIds.some(id => id.includes('network'))).toBe(true);

    // Violations should have proper structure
    violations.forEach(v => {
      expect(v.id).toBeDefined();
      expect(v.severity).toMatch(/^(error|warning|info)$/);
      expect(v.file).toBeDefined();
      expect(v.line).toBeGreaterThan(0);
      expect(v.column).toBeGreaterThan(0);
      expect(v.package).toBeDefined();
      expect(v.function).toBeDefined();
      expect(v.description).toBeDefined();
      expect(v.source_doc).toMatch(/^https:\/\//);
    });
  });

  it('should produce zero violations for clean-baseline.ts', () => {
    // Create analyzer with clean baseline
    const config: AnalyzerConfig = {
      tsconfigPath: path.join(__dirname, '../tsconfig.test.json'),
      corpusPath: path.join(__dirname, '../../../corpus'),
    };

    analyzer = new Analyzer(config, corpus.contracts);
    const violations = analyzer.analyze();

    // Filter to only clean-baseline.ts violations
    const baselineViolations = violations.filter(v =>
      v.file.includes('clean-baseline.ts')
    );

    // Should have ZERO violations in clean baseline
    expect(baselineViolations).toHaveLength(0);
  });
});

describe('Analyzer - Error Detection Patterns', () => {
  it('should detect missing try-catch blocks', () => {
    // This test validates the specific pattern detection
    // Implementation will depend on analyzer capabilities
    expect(true).toBe(true); // Placeholder
  });

  it('should detect missing error.response existence checks', () => {
    expect(true).toBe(true); // Placeholder
  });

  it('should detect missing 429 handling', () => {
    expect(true).toBe(true); // Placeholder
  });

  it('should recognize proper error handling patterns', () => {
    expect(true).toBe(true); // Placeholder
  });
});

describe('Analyzer - Stats', () => {
  it('should provide accurate analysis statistics', async () => {
    const corpusPath = path.join(__dirname, '../../../corpus');
    const corpusResult = await loadCorpus(corpusPath);

    const config: AnalyzerConfig = {
      tsconfigPath: path.join(__dirname, '../tsconfig.test.json'),
      corpusPath,
    };

    const analyzer = new Analyzer(config, corpusResult.contracts);
    analyzer.analyze();

    const stats = analyzer.getStats();

    expect(stats.filesAnalyzed).toBeGreaterThan(0);
    expect(stats.contractsApplied).toBeGreaterThan(0);
  });
});
