import { Analyzer } from './dist/analyzer.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a minimal mock contract
const contracts = new Map();
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
  ],
});

console.log('Creating analyzer...');
const analyzer = new Analyzer(
  {
    tsconfigPath: path.join(__dirname, 'tests/fixtures/return-value-test/tsconfig.json'),
    corpusPath: path.join(__dirname, '../corpus'),
    includeTests: true, // Must be true to analyze test fixtures
  },
  contracts
);

console.log('Running analysis...');
const violations = analyzer.analyze();

console.log(`\nAnalysis complete. Found ${violations.length} violations`);
violations.forEach((v, i) => {
  console.log(`\nViolation ${i + 1}:`);
  console.log(`  Package: ${v.package}`);
  console.log(`  Function: ${v.function}`);
  console.log(`  Contract clause: ${v.contract_clause}`);
  console.log(`  Description: ${v.description}`);
  console.log(`  File: ${v.file}:${v.line}`);
});
