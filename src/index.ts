#!/usr/bin/env node

/**
 * CLI Entry Point - behavioral contract verification tool
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import { loadCorpus } from './corpus-loader.js';
import { Analyzer } from './analyzer.js';
import {
  generateAuditRecord,
  writeAuditRecord,
  printTerminalReport,
  printCorpusErrors,
} from './reporter.js';
import type { AnalyzerConfig } from './types.js';

const program = new Command();

program
  .name('verify-cli')
  .description('Verify TypeScript code against behavioral contracts')
  .version('0.1.0');

program
  .option('--tsconfig <path>', 'Path to tsconfig.json', './tsconfig.json')
  .option('--corpus <path>', 'Path to corpus directory', findDefaultCorpusPath())
  .option('--output <path>', 'Output path for audit record JSON', './behavioral-audit.json')
  .option('--no-terminal', 'Disable terminal output (JSON only)')
  .option('--fail-on-warnings', 'Exit with error code if warnings are found')
  .parse(process.argv);

const options = program.opts();

/**
 * Main execution
 */
async function main() {
  console.log(chalk.bold('\nBehavioral Contract Verification\n'));

  // Validate tsconfig exists
  if (!fs.existsSync(options.tsconfig)) {
    console.error(chalk.red(`Error: tsconfig.json not found at ${options.tsconfig}`));
    process.exit(1);
  }

  // Validate corpus exists
  if (!fs.existsSync(options.corpus)) {
    console.error(chalk.red(`Error: Corpus directory not found at ${options.corpus}`));
    console.error(chalk.yellow('Tip: Use --corpus <path> to specify corpus location'));
    process.exit(1);
  }

  console.log(chalk.gray(`  tsconfig: ${options.tsconfig}`));
  console.log(chalk.gray(`  corpus: ${options.corpus}`));
  console.log(chalk.gray(`  output: ${options.output}\n`));

  // Load corpus
  console.log(chalk.dim('Loading behavioral contracts...'));
  const corpusResult = await loadCorpus(options.corpus);

  if (corpusResult.errors.length > 0) {
    printCorpusErrors(corpusResult.errors);
    process.exit(1);
  }

  if (corpusResult.contracts.size === 0) {
    console.error(chalk.red('Error: No contracts loaded from corpus'));
    process.exit(1);
  }

  console.log(chalk.green(`✓ Loaded ${corpusResult.contracts.size} package contracts\n`));

  // Create analyzer
  const config: AnalyzerConfig = {
    tsconfigPath: path.resolve(options.tsconfig),
    corpusPath: path.resolve(options.corpus),
  };

  console.log(chalk.dim('Analyzing TypeScript code...'));
  const analyzer = new Analyzer(config, corpusResult.contracts);

  // Run analysis
  const violations = analyzer.analyze();
  const stats = analyzer.getStats();

  console.log(chalk.green(`✓ Analyzed ${stats.filesAnalyzed} files\n`));

  // Generate audit record
  const packagesAnalyzed = Array.from(corpusResult.contracts.keys());
  const auditRecord = generateAuditRecord(violations, {
    tsconfigPath: options.tsconfig,
    packagesAnalyzed,
    contractsApplied: stats.contractsApplied,
    filesAnalyzed: stats.filesAnalyzed,
    corpusVersion: '1.0.0', // TODO: Read from corpus metadata
  });

  // Write JSON output
  writeAuditRecord(auditRecord, options.output);
  console.log(chalk.gray(`Audit record written to ${options.output}`));

  // Print terminal report
  if (options.terminal !== false) {
    printTerminalReport(auditRecord);
  }

  // Exit with appropriate code
  const hasErrors = auditRecord.summary.error_count > 0;
  const hasWarnings = auditRecord.summary.warning_count > 0;

  if (hasErrors) {
    process.exit(1);
  }

  if (options.failOnWarnings && hasWarnings) {
    process.exit(1);
  }

  process.exit(0);
}

/**
 * Finds the default corpus path by looking for the corpus repo
 */
function findDefaultCorpusPath(): string {
  // Look for corpus in common locations
  const possiblePaths = [
    path.join(process.cwd(), '../corpus'),
    path.join(process.cwd(), '../../corpus'),
    path.join(__dirname, '../../corpus'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(path.join(p, 'packages'))) {
      return p;
    }
  }

  // Default fallback
  return path.join(process.cwd(), '../corpus');
}

/**
 * Handle errors
 */
process.on('uncaughtException', (error) => {
  console.error(chalk.red('\nUnexpected error:'));
  console.error(error);
  process.exit(1);
});

// Run
main().catch((error) => {
  console.error(chalk.red('\nError during execution:'));
  console.error(error);
  process.exit(1);
});
