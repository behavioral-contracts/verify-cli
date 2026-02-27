/**
 * Return Value Detection Tests
 * Tests analyzer's ability to detect unprotected error checks on return values
 *
 * Related: dev-notes/analyzer-enhancement/RETURN_VALUE_RESEARCH.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { Analyzer } from '../src/analyzer.js';
import type { PackageContract, AnalyzerConfig } from '../src/types.js';

describe('Return Value Detection', () => {
  let testDir: string;
  let contracts: Map<string, PackageContract>;

  beforeEach(() => {
    // Create temp directory for test files
    testDir = path.join(process.cwd(), 'tests', 'fixtures', 'return-value-test');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create a mock validator contract
    contracts = new Map();
    contracts.set('validator', {
      package: 'validator',
      semver: '*',
      contract_version: '1.0.0',
      maintainer: 'test',
      status: 'production',
      detection: {
        class_names: [],
        type_names: [],
        factory_methods: [],
        await_patterns: [],
        require_instance_tracking: false,
      },
      functions: [
        {
          name: 'normalizeEmail',
          import_path: 'validator',
          description: 'Normalize email address',
          postconditions: [
            {
              id: 'invalid-email',
              condition: 'Email is invalid',
              throws: 'Returns null/false',
              required_handling: 'Check return value for null/false before using',
              severity: 'error',
            },
          ],
        },
        {
          name: 'isEmail',
          import_path: 'validator',
          description: 'Check if string is email',
          postconditions: [
            {
              id: 'validation-check',
              condition: 'Validation check returns false',
              throws: 'Returns false',
              required_handling: 'Check return value',
              severity: 'error',
            },
          ],
        },
      ],
    });
  });

  /**
   * Helper to analyze a code snippet
   */
  function analyzeCode(code: string): any[] {
    // Clean up test directory first
    if (fs.existsSync(testDir)) {
      const files = fs.readdirSync(testDir);
      for (const file of files) {
        if (file.endsWith('.ts') && file !== 'tsconfig.json') {
          fs.unlinkSync(path.join(testDir, file));
        }
      }
    }

    // Create test file
    const testFile = path.join(testDir, 'test.ts');
    const fullCode = `import validator from 'validator';\n\n${code}`;
    fs.writeFileSync(testFile, fullCode);

    // Create tsconfig
    const tsconfigPath = path.join(testDir, 'tsconfig.json');
    const tsconfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
      },
      include: ['*.ts'],
    };
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));

    // Run analyzer
    const config: AnalyzerConfig = {
      tsconfigPath,
      corpusPath: process.cwd(),
      includeTests: true, // Must be true to analyze test fixtures
    };

    const analyzer = new Analyzer(config, contracts);
    return analyzer.analyze();
  }

  describe('Pattern 1: Direct return value check', () => {
    it('should detect unprotected null check on return value', () => {
      const code = `
        function processEmail(email: string) {
          const result = validator.normalizeEmail(email);
          if (!result) {
            throw new Error('Invalid email');
          }
          return result;
        }
      `;

      const violations = analyzeCode(code);

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].contract_clause).toContain('invalid-email');
      expect(violations[0].description).toContain('unprotected error check');
    });

    it('should NOT flag when return value check is in try-catch', () => {
      const code = `
        function processEmail(email: string) {
          try {
            const result = validator.normalizeEmail(email);
            if (!result) {
              throw new Error('Invalid email');
            }
            return result;
          } catch (error) {
            console.error('Email processing error:', error);
            throw error;
          }
        }
      `;

      const violations = analyzeCode(code);

      // Should have 0 violations for this specific pattern
      const returnValueViolations = violations.filter(v =>
        v.contract_clause.includes('invalid-email')
      );
      expect(returnValueViolations.length).toBe(0);
    });

    it('should detect when return value is not checked at all', () => {
      const code = `
        function processEmail(email: string) {
          const result = validator.normalizeEmail(email);
          // No error check - will crash if result is null
          return result.toLowerCase();
        }
      `;

      const violations = analyzeCode(code);

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].contract_clause).toContain('invalid-email');
    });
  });

  describe('Pattern 2: Boolean return check', () => {
    it('should detect unprotected boolean check', () => {
      const code = `
        function validateEmail(email: string) {
          const isValid = validator.isEmail(email);
          if (!isValid) {
            throw new Error('Invalid email format');
          }
        }
      `;

      const violations = analyzeCode(code);

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].contract_clause).toContain('validation-check');
    });

    it('should NOT flag when boolean check is in try-catch', () => {
      const code = `
        function validateEmail(email: string) {
          try {
            const isValid = validator.isEmail(email);
            if (!isValid) {
              throw new Error('Invalid email format');
            }
          } catch (error) {
            console.error('Validation error:', error);
            throw error;
          }
        }
      `;

      const violations = analyzeCode(code);

      const validationViolations = violations.filter(v =>
        v.contract_clause.includes('validation-check')
      );
      expect(validationViolations.length).toBe(0);
    });
  });

  describe('Pattern 3: Variable tracking across scopes', () => {
    it('should track return value across multiple lines', () => {
      const code = `
        function processEmail(email: string) {
          const normalized = validator.normalizeEmail(email);

          // Several lines later...
          const processed = doSomething();

          // Error check happens here (unprotected)
          if (!normalized) {
            throw new Error('Invalid');
          }

          return normalized;
        }
      `;

      const violations = analyzeCode(code);

      expect(violations.length).toBeGreaterThan(0);
    });

    it('should handle early returns with error checks', () => {
      const code = `
        function processEmail(email: string) {
          const result = validator.normalizeEmail(email);

          if (!result) {
            return null; // Early return instead of throw
          }

          return result;
        }
      `;

      const violations = analyzeCode(code);

      // Early return without throw is still unprotected
      expect(violations.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle reassigned variables', () => {
      const code = `
        function processEmail(email: string) {
          let result = validator.normalizeEmail(email);
          result = result || 'default@example.com';
          return result;
        }
      `;

      const violations = analyzeCode(code);

      // This is actually handling the null case (with ||)
      // But it's still unprotected - should be in try-catch
      expect(violations.length).toBeGreaterThan(0);
    });

    it('should handle nested functions', () => {
      const code = `
        function outer(email: string) {
          function inner() {
            const result = validator.normalizeEmail(email);
            if (!result) {
              throw new Error('Invalid');
            }
            return result;
          }

          return inner();
        }
      `;

      const violations = analyzeCode(code);

      // Nested function has unprotected error check
      expect(violations.length).toBeGreaterThan(0);
    });

    it('should NOT flag when entire function is wrapped in try-catch', () => {
      const code = `
        function processEmail(email: string) {
          try {
            const result = validator.normalizeEmail(email);
            if (!result) {
              throw new Error('Invalid');
            }

            const another = doSomethingElse();
            if (!another) {
              throw new Error('Also invalid');
            }

            return result + another;
          } catch (error) {
            console.error(error);
            throw error;
          }
        }
      `;

      const violations = analyzeCode(code);

      // Entire function body is in try-catch - should be clean
      const returnValueViolations = violations.filter(v =>
        v.contract_clause.includes('invalid-email')
      );
      expect(returnValueViolations.length).toBe(0);
    });
  });
});
