#!/usr/bin/env node

/**
 * CLI Entry Point - behavioral contract verification tool
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { loadCorpus } from './corpus-loader.js';
import { Analyzer } from './analyzer.js';
import { PackageDiscovery } from './package-discovery.js';
import {
  generateAuditRecord,
  generateEnhancedAuditRecord,
  writeAuditRecord,
  printTerminalReport,
  printEnhancedTerminalReport,
  printCorpusErrors,
} from './reporter.js';
import {
  printPositiveEvidenceReport,
  writePositiveEvidenceReport,
  writePositiveEvidenceReportMarkdown,
  writeD3Visualization,
  calculateHealthScore,
  buildPackageBreakdown,
  compareAgainstBenchmark,
  loadBenchmark,
} from './reporters/index.js';
import { ensureTsconfig } from './tsconfig-generator.js';
import type { AnalyzerConfig } from './types.js';
import { createSuppressionsCommand } from './cli/suppressions.js';
import { generateAIPrompt } from './ai-prompt-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name('verify-cli')
  .description('Verify TypeScript code against behavioral contracts')
  .version('0.1.0');

// Add suppressions subcommand
program.addCommand(createSuppressionsCommand());

program
  .option('--tsconfig <path>', 'Path to tsconfig.json or project directory (default: ./tsconfig.json)', './tsconfig.json')
  .option('--corpus <path>', 'Path to corpus directory', findDefaultCorpusPath())
  .option('--output <path>', 'Output path for audit record JSON (default: auto-generated in output/runs/)')
  .option('--project <path>', 'Path to project root (for package.json discovery)', process.cwd())
  .option('--no-terminal', 'Disable terminal output (JSON only)')
  .option('--fail-on-warnings', 'Exit with error code if warnings are found')
  .option('--discover-packages', 'Enable package discovery and coverage reporting', true)
  .option('--include-tests', 'Include test files in analysis (default: excludes test files)', false)
  .option('--include-drafts', 'Include draft and in-development contracts (default: excludes draft/in-development)', false)
  .option('--include-deprecated', 'Include deprecated contracts (default: excludes deprecated)', false)
  .option('--positive-report', 'Generate positive evidence report (default: true)', true)
  .option('--no-positive-report', 'Disable positive evidence report')
  .option('--show-suppressions', 'Show suppressed violations in output', false)
  .option('--check-dead-suppressions', 'Check for and report dead suppressions', false)
  .option('--fail-on-dead-suppressions', 'Exit with error if dead suppressions are found', false)
  .action(async (options) => {
    // This action handler is called when the main command is invoked
    // (i.e., not a subcommand like 'suppressions')
    await main(options);
  });

program.parse(process.argv);

/**
 * Find git repository root by walking up from a given path
 */
function findGitRepoRoot(startPath: string): string | null {
  let currentDir = path.dirname(path.resolve(startPath));
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const gitPath = path.join(currentDir, '.git');
    if (fs.existsSync(gitPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * Get git hash from the analyzed repository (not verify-cli)
 */
function getGitHashFromRepo(tsconfigPath: string): string {
  try {
    const { execSync } = require('child_process');

    // Get the directory containing the tsconfig (the repo root)
    const repoDir = path.dirname(path.resolve(tsconfigPath));

    // Run git command in the analyzed repo's directory
    const gitHash = execSync('git rev-parse --short HEAD', {
      cwd: repoDir,
      encoding: 'utf-8',
    }).trim();

    return gitHash;
  } catch {
    // Not a git repo or git not available
    return 'nogit';
  }
}

/**
 * Ensure .behavioral-contracts is in .gitignore
 */
function ensureGitignore(projectRoot: string): void {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const entry = '.behavioral-contracts';

  try {
    let gitignoreContent = '';
    if (fs.existsSync(gitignorePath)) {
      gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    }

    // Check if already ignored
    const lines = gitignoreContent.split('\n');
    const alreadyIgnored = lines.some(line => line.trim() === entry);

    if (!alreadyIgnored) {
      // Add entry to .gitignore
      const newContent = gitignoreContent.endsWith('\n')
        ? gitignoreContent + entry + '\n'
        : gitignoreContent + '\n' + entry + '\n';
      fs.writeFileSync(gitignorePath, newContent, 'utf-8');
    }
  } catch (err) {
    // If we can't update .gitignore, just warn but don't fail
    console.warn(chalk.yellow(`Warning: Could not update .gitignore: ${err}`));
  }
}

/**
 * Generate organized output path in the analyzed project's .behavioral-contracts directory
 */
function generateOutputPath(tsconfigPath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);

  // Get git commit hash from the analyzed repo
  const gitHash = getGitHashFromRepo(tsconfigPath);

  // Find the project root (git root or directory containing tsconfig)
  const projectRoot = findGitRepoRoot(tsconfigPath) || path.dirname(path.resolve(tsconfigPath));

  // Create run directory name
  const runDir = `${timestamp.replace(/T/, '-').replace(/-/g, '').substring(0, 13)}-${gitHash}`;

  // Output goes to .behavioral-contracts/runs/{runDir}/ in the analyzed project
  const outputDir = path.join(projectRoot, '.behavioral-contracts', 'runs', runDir);

  // Create directory if it doesn't exist
  fs.mkdirSync(outputDir, { recursive: true });

  // Ensure .behavioral-contracts is in .gitignore
  ensureGitignore(projectRoot);

  return path.join(outputDir, 'audit.json');
}

/**
 * Setup output logging to capture all terminal output to output.txt
 */
function setupOutputLogging(outputDir: string): () => void {
  const outputTxtPath = path.join(outputDir, 'output.txt');
  const logStream = fs.createWriteStream(outputTxtPath, { flags: 'w' });

  // Store original console methods
  const originalLog = console.log;
  const originalError = console.error;

  // Strip ANSI codes for file output
  const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');

  // Override console.log
  console.log = (...args: any[]) => {
    const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
    originalLog(...args); // Original output to terminal (with colors)
    logStream.write(stripAnsi(message) + '\n'); // Clean output to file
  };

  // Override console.error
  console.error = (...args: any[]) => {
    const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
    originalError(...args); // Original output to terminal (with colors)
    logStream.write(stripAnsi(message) + '\n'); // Clean output to file
  };

  // Return cleanup function
  return () => {
    console.log = originalLog;
    console.error = originalError;
    logStream.end();
  };
}

/**
 * Normalize tsconfig path (accept directory or file)
 * If directory is provided, append /tsconfig.json
 */
function normalizeTsconfigPath(tsconfigPath: string): string {
  const resolved = path.resolve(tsconfigPath);

  // If it's a directory, append tsconfig.json
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    return path.join(resolved, 'tsconfig.json');
  }

  // Otherwise assume it's already pointing to tsconfig.json
  return resolved;
}

/**
 * Main execution
 */
async function main(options: any) {
  console.log(chalk.bold('\nBehavioral Contract Verification\n'));

  // Normalize tsconfig path (allow directory or file)
  const tsconfigPath = normalizeTsconfigPath(options.tsconfig);

  // Ensure tsconfig exists (generate if missing)
  ensureTsconfig(tsconfigPath);

  // Validate corpus exists
  if (!fs.existsSync(options.corpus)) {
    console.error(chalk.red(`Error: Corpus directory not found at ${options.corpus}`));
    console.error(chalk.yellow('Tip: Use --corpus <path> to specify corpus location'));
    process.exit(1);
  }

  // Generate organized output path if not specified
  const outputPath = options.output || generateOutputPath(tsconfigPath);
  const outputDir = path.dirname(outputPath);

  // Setup output logging (capture all terminal output to output.txt)
  const cleanupLogging = setupOutputLogging(outputDir);

  console.log(chalk.gray(`  tsconfig: ${tsconfigPath}`));
  console.log(chalk.gray(`  corpus: ${options.corpus}`));

  // Show corpus source (npm package vs local)
  if (options.corpus === findDefaultCorpusPath()) {
    try {
      require.resolve('@behavioral-contracts/corpus');
      console.log(chalk.dim(`  (using npm package @behavioral-contracts/corpus)`));
    } catch {
      console.log(chalk.dim(`  (using local corpus for development)`));
    }
  } else {
    console.log(chalk.dim(`  (using custom corpus path)`));
  }

  console.log(chalk.gray(`  output: ${outputPath}\n`));

  // Load corpus
  console.log(chalk.dim('Loading behavioral contracts...'));
  const corpusResult = await loadCorpus(options.corpus, {
    includeDrafts: options.includeDrafts,
    includeDeprecated: options.includeDeprecated,
    includeInDevelopment: options.includeDrafts, // in-development included with drafts
  });

  if (corpusResult.errors.length > 0) {
    printCorpusErrors(corpusResult.errors);
    process.exit(1);
  }

  if (corpusResult.contracts.size === 0) {
    console.error(chalk.red('Error: No contracts loaded from corpus'));
    process.exit(1);
  }

  console.log(chalk.green(`✓ Loaded ${corpusResult.contracts.size} package contracts`));

  // Show skipped contracts (if any)
  if (corpusResult.skipped && corpusResult.skipped.length > 0) {
    const draftCount = corpusResult.skipped.filter(s => s.status === 'draft').length;
    const inDevCount = corpusResult.skipped.filter(s => s.status === 'in-development').length;
    const deprecatedCount = corpusResult.skipped.filter(s => s.status === 'deprecated').length;

    const skippedParts: string[] = [];
    if (draftCount > 0) skippedParts.push(`${draftCount} draft`);
    if (inDevCount > 0) skippedParts.push(`${inDevCount} in-development`);
    if (deprecatedCount > 0) skippedParts.push(`${deprecatedCount} deprecated`);

    console.log(chalk.dim(`  (Skipped ${skippedParts.join(', ')} - use --include-drafts to include)`));
  }
  console.log();

  // Discover packages (if enabled)
  let packageDiscovery;
  if (options.discoverPackages !== false) {
    console.log(chalk.dim('Discovering packages...'));
    const discoveryTool = new PackageDiscovery(corpusResult.contracts);
    packageDiscovery = await discoveryTool.discoverPackages(
      options.project,
      path.resolve(tsconfigPath)
    );
    console.log(chalk.green(`✓ Discovered ${packageDiscovery.total} packages\n`));
  }

  // Create analyzer
  const config: AnalyzerConfig = {
    tsconfigPath: path.resolve(tsconfigPath),
    corpusPath: path.resolve(options.corpus),
    includeTests: options.includeTests,
  };

  console.log(chalk.dim('Analyzing TypeScript code...'));
  const analyzer = new Analyzer(config, corpusResult.contracts);

  // Run analysis
  const violations = analyzer.analyze();
  const stats = analyzer.getStats();

  console.log(chalk.green(`✓ Analyzed ${stats.filesAnalyzed} files\n`));

  // Report suppressions if requested
  if (options.showSuppressions) {
    const suppressedViolations = analyzer.getSuppressedViolations();
    if (suppressedViolations.length > 0) {
      console.log(chalk.yellow(`⚠️  ${suppressedViolations.length} suppressions active\n`));
    }
  }

  // Check for dead suppressions if requested
  if (options.checkDeadSuppressions || options.failOnDeadSuppressions) {
    const deadSuppressions = analyzer.detectDeadSuppressions();
    if (deadSuppressions.length > 0) {
      console.log(chalk.yellow(`\n🎉 Found ${deadSuppressions.length} dead suppressions (analyzer improved!):\n`));
      deadSuppressions.forEach((dead) => {
        console.log(analyzer.formatDeadSuppression(dead));
      });

      if (options.failOnDeadSuppressions) {
        console.error(chalk.red('\n❌ Failing due to dead suppressions (--fail-on-dead-suppressions)'));
        process.exit(1);
      }
    } else {
      console.log(chalk.green('✨ No dead suppressions found!\n'));
    }
  }

  // Generate audit record
  const packagesAnalyzed = Array.from(corpusResult.contracts.keys());
  const auditRecord = await generateAuditRecord(violations, {
    tsconfigPath: options.tsconfig,
    packagesAnalyzed,
    contractsApplied: stats.contractsApplied,
    filesAnalyzed: stats.filesAnalyzed,
    corpusVersion: '1.0.0', // TODO: Read from corpus metadata
  });

  // Generate enhanced audit record if package discovery was run
  const finalRecord = packageDiscovery
    ? generateEnhancedAuditRecord(auditRecord, packageDiscovery)
    : auditRecord;

  // Write JSON output
  writeAuditRecord(finalRecord, outputPath);
  console.log(chalk.gray(`Audit record written to ${outputPath}`));

  // Generate AI agent prompt file
  const aiPromptPath = await generateAIPrompt(finalRecord, outputPath);

  // Print terminal report
  if (options.terminal !== false) {
    if (packageDiscovery) {
      printEnhancedTerminalReport(finalRecord as any);
    } else {
      printTerminalReport(auditRecord);
    }
  }

  // Generate and print positive evidence report (default: on)
  if (options.positiveReport !== false && options.terminal !== false) {
    console.log(''); // Add spacing

    const reportOptions = {
      showHealthScore: true,
      showPackageBreakdown: true,
      showInsights: true,
      showRecommendations: true,
      showBenchmarking: true, // Phase 2 - now enabled!
    };

    await printPositiveEvidenceReport(finalRecord as any, reportOptions);

    // Write positive evidence report to file (both .txt and .md)
    const positiveReportTxtPath = path.join(outputDir, 'positive-report.txt');
    const positiveReportMdPath = path.join(outputDir, 'positive-report.md');

    await writePositiveEvidenceReport(finalRecord as any, positiveReportTxtPath, reportOptions);
    await writePositiveEvidenceReportMarkdown(finalRecord as any, positiveReportMdPath, reportOptions);

    // Generate D3.js interactive visualization
    const d3HtmlPath = path.join(outputDir, 'index.html');

    // Calculate metrics for D3 visualization
    const healthMetrics = calculateHealthScore(finalRecord);
    const packageBreakdown = buildPackageBreakdown(finalRecord);

    // Load benchmark if available
    let benchmarkComparison;
    let benchmarkData;
    try {
      const benchmarkPath = path.join(__dirname, '../data/benchmarks.json');
      benchmarkData = await loadBenchmark(benchmarkPath);
      if (benchmarkData) {
        benchmarkComparison = compareAgainstBenchmark(finalRecord, benchmarkData);
      }
    } catch {
      // Benchmark not available
    }

    await writeD3Visualization(
      {
        audit: finalRecord,
        health: healthMetrics,
        packageBreakdown,
        benchmarking: benchmarkComparison,
        benchmark: benchmarkData || undefined,
      },
      d3HtmlPath
    );

    const outputTxtPath = path.join(outputDir, 'output.txt');

    console.log(chalk.gray(`Reports written to:`));
    console.log(chalk.gray(`  - ${outputTxtPath} (full terminal output)`));
    console.log(chalk.gray(`  - ${positiveReportTxtPath}`));
    console.log(chalk.gray(`  - ${positiveReportMdPath}`));
    console.log(chalk.green(`  - file://${d3HtmlPath} (interactive visualization)`));

    // Only show AI prompt if it was generated (i.e., if there are violations)
    if (aiPromptPath) {
      console.log(chalk.hex('#FFA500')(`  - ${aiPromptPath} (AI agent instructions)`));
    }
    console.log('');
  }

  // Final summary at the very end (easy to spot after all output)
  const totalViolations = auditRecord.summary.error_count + auditRecord.summary.warning_count;
  if (totalViolations > 0) {
    console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.yellow.bold(`  ⚠️  ${totalViolations} violation${totalViolations === 1 ? '' : 's'} found - scroll up for full report`));
    console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  } else {
    console.log(chalk.green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.green.bold('  ✓ No violations found - great work!'));
    console.log(chalk.green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  }

  // Cleanup logging
  cleanupLogging();

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
 * Finds the default corpus path by trying:
 * 1. Published npm package (@behavioral-contracts/corpus)
 * 2. Local development paths (for contributors)
 */
function findDefaultCorpusPath(): string {
  // Try 1: Use published npm package (production use)
  try {
    // Dynamic import to avoid issues if package not installed
    const corpusModule = require('@behavioral-contracts/corpus');
    const corpusPath = corpusModule.getCorpusPath();

    if (fs.existsSync(corpusPath)) {
      return corpusPath;
    }
  } catch (err) {
    // Package not installed - fall through to local paths
  }

  // Try 2: Look for local corpus repo (development use)
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

  // Fallback: assume npm package will be installed
  // (This path will error if neither npm package nor local corpus exists)
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
