/**
 * Reporter - generates audit records and terminal output
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import type { AuditRecord, Violation, VerificationSummary } from './types.js';

const TOOL_NAME = '@behavioral-contracts/verify-cli';
const TOOL_VERSION = '0.1.0'; // Should match package.json

/**
 * Generates an audit record from violations
 */
export function generateAuditRecord(
  violations: Violation[],
  config: {
    tsconfigPath: string;
    packagesAnalyzed: string[];
    contractsApplied: number;
    filesAnalyzed: number;
    corpusVersion: string;
  }
): AuditRecord {
  const summary = generateSummary(violations);

  const record: AuditRecord = {
    tool: TOOL_NAME,
    tool_version: TOOL_VERSION,
    corpus_version: config.corpusVersion,
    timestamp: new Date().toISOString(),
    git_commit: getGitCommit(),
    git_branch: getGitBranch(),
    tsconfig: config.tsconfigPath,
    packages_analyzed: config.packagesAnalyzed,
    contracts_applied: config.contractsApplied,
    files_analyzed: config.filesAnalyzed,
    violations,
    summary,
  };

  return record;
}

/**
 * Generates summary statistics
 */
function generateSummary(violations: Violation[]): VerificationSummary {
  const errorCount = violations.filter(v => v.severity === 'error').length;
  const warningCount = violations.filter(v => v.severity === 'warning').length;
  const infoCount = violations.filter(v => v.severity === 'info').length;

  return {
    total_violations: violations.length,
    error_count: errorCount,
    warning_count: warningCount,
    info_count: infoCount,
    passed: errorCount === 0,
  };
}

/**
 * Gets current git commit hash
 */
function getGitCommit(): string | undefined {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Gets current git branch
 */
function getGitBranch(): string | undefined {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Writes audit record to JSON file
 */
export function writeAuditRecord(record: AuditRecord, outputPath: string): void {
  const json = JSON.stringify(record, null, 2);
  fs.writeFileSync(outputPath, json, 'utf-8');
}

/**
 * Prints violations to terminal in human-readable format
 */
export function printTerminalReport(record: AuditRecord): void {
  console.log('\n' + chalk.bold('Behavioral Contract Verification Report'));
  console.log(chalk.gray('─'.repeat(80)));

  // Summary
  console.log(`\n${chalk.bold('Summary:')}`);
  console.log(`  Files analyzed: ${record.files_analyzed}`);
  console.log(`  Packages: ${record.packages_analyzed.join(', ')}`);
  console.log(`  Contracts applied: ${record.contracts_applied}`);
  console.log(`  Timestamp: ${record.timestamp}`);

  if (record.git_commit) {
    console.log(`  Git commit: ${record.git_commit.substring(0, 8)}`);
  }
  if (record.git_branch) {
    console.log(`  Git branch: ${record.git_branch}`);
  }

  // Violations
  if (record.violations.length === 0) {
    console.log(`\n${chalk.green('✓')} ${chalk.bold('No violations found!')}`);
    console.log(chalk.gray('─'.repeat(80)) + '\n');
    return;
  }

  console.log(`\n${chalk.bold('Violations:')}`);

  // Group violations by severity
  const errors = record.violations.filter(v => v.severity === 'error');
  const warnings = record.violations.filter(v => v.severity === 'warning');
  const infos = record.violations.filter(v => v.severity === 'info');

  if (errors.length > 0) {
    console.log(`\n${chalk.red.bold(`Errors (${errors.length}):`)}`);
    errors.forEach(v => printViolation(v));
  }

  if (warnings.length > 0) {
    console.log(`\n${chalk.yellow.bold(`Warnings (${warnings.length}):`)}`);
    warnings.forEach(v => printViolation(v));
  }

  if (infos.length > 0) {
    console.log(`\n${chalk.blue.bold(`Info (${infos.length}):`)}`);
    infos.forEach(v => printViolation(v));
  }

  // Summary stats
  console.log(chalk.gray('\n─'.repeat(80)));
  console.log(chalk.bold('\nSummary:'));
  console.log(`  Total violations: ${record.summary.total_violations}`);
  console.log(`  ${chalk.red('Errors')}: ${record.summary.error_count}`);
  console.log(`  ${chalk.yellow('Warnings')}: ${record.summary.warning_count}`);
  console.log(`  ${chalk.blue('Info')}: ${record.summary.info_count}`);

  const statusIcon = record.summary.passed ? chalk.green('✓') : chalk.red('✗');
  const statusText = record.summary.passed ? chalk.green('PASSED') : chalk.red('FAILED');
  console.log(`\n${statusIcon} ${statusText}\n`);
}

/**
 * Prints a single violation
 */
function printViolation(violation: Violation): void {
  const icon = getSeverityIcon(violation.severity);
  const color = getSeverityColor(violation.severity);

  const relPath = path.relative(process.cwd(), violation.file);
  const location = `${relPath}:${violation.line}:${violation.column}`;

  console.log(`\n  ${icon} ${color(location)}`);
  console.log(`    ${chalk.bold(violation.description)}`);
  console.log(`    Package: ${violation.package}.${violation.function}()`);
  console.log(`    Contract: ${violation.contract_clause}`);

  if (violation.suggested_fix) {
    console.log(`    ${chalk.dim('Fix:')} ${violation.suggested_fix.split('\n')[0]}`);
  }

  console.log(`    ${chalk.dim('Docs:')} ${violation.source_doc}`);
}

/**
 * Gets the icon for a severity level
 */
function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'error':
      return chalk.red('✗');
    case 'warning':
      return chalk.yellow('⚠');
    case 'info':
      return chalk.blue('ℹ');
    default:
      return '•';
  }
}

/**
 * Gets the color function for a severity level
 */
function getSeverityColor(severity: string): (text: string) => string {
  switch (severity) {
    case 'error':
      return chalk.red;
    case 'warning':
      return chalk.yellow;
    case 'info':
      return chalk.blue;
    default:
      return chalk.white;
  }
}

/**
 * Prints corpus loading errors
 */
export function printCorpusErrors(errors: string[]): void {
  console.error(chalk.red.bold('\nCorpus Loading Errors:'));
  errors.forEach(err => {
    console.error(chalk.red(`  ✗ ${err}`));
  });
  console.error('');
}
