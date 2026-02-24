#!/usr/bin/env node

/**
 * Extracts violations from audit JSON files into CSV format for manual validation
 * Usage: node scripts/extract-violations-csv.js output/20260223
 */

const fs = require('fs');
const path = require('path');

function extractViolationsToCSV(outputDir) {
  const auditFiles = fs.readdirSync(outputDir)
    .filter(f => f.endsWith('-audit.json') || f.endsWith('-audit-v2.json'));

  if (auditFiles.length === 0) {
    console.error(`No audit files found in ${outputDir}`);
    process.exit(1);
  }

  const violations = [];
  let totalByRepo = {};
  let totalBySeverity = { error: 0, warning: 0, info: 0 };
  let totalByContract = {};

  // Extract violations from all audit files
  for (const file of auditFiles) {
    const filePath = path.join(outputDir, file);
    const audit = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const repoName = file.replace(/-audit(-v\d+)?\.json$/, '');

    totalByRepo[repoName] = audit.violations.length;

    for (const violation of audit.violations) {
      violations.push({
        repo: repoName,
        severity: violation.severity,
        package: violation.package,
        function: violation.function,
        contract: violation.contract_clause,
        file: violation.file,
        line: violation.line,
        description: violation.description,
        validated: '', // For manual validation
        classification: '', // TP/FP/EC
        notes: ''
      });

      // Count by severity
      totalBySeverity[violation.severity] = (totalBySeverity[violation.severity] || 0) + 1;

      // Count by contract type
      const contractKey = `${violation.package}::${violation.contract_clause}`;
      totalByContract[contractKey] = (totalByContract[contractKey] || 0) + 1;
    }
  }

  // Print summary to console
  console.log('\n=== Violation Summary ===\n');
  console.log(`Total violations: ${violations.length}\n`);

  console.log('By Repository:');
  Object.entries(totalByRepo)
    .sort((a, b) => b[1] - a[1])
    .forEach(([repo, count]) => {
      console.log(`  ${repo}: ${count}`);
    });

  console.log('\nBy Severity:');
  Object.entries(totalBySeverity)
    .sort((a, b) => b[1] - a[1])
    .forEach(([severity, count]) => {
      console.log(`  ${severity.toUpperCase()}: ${count}`);
    });

  console.log('\nBy Contract Type:');
  Object.entries(totalByContract)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10) // Top 10
    .forEach(([contract, count]) => {
      console.log(`  ${contract}: ${count}`);
    });

  // Generate CSV
  const csvPath = path.join(outputDir, 'violations-for-review.csv');
  const headers = [
    'Repo',
    'Severity',
    'Package',
    'Function',
    'Contract',
    'File',
    'Line',
    'Description',
    'Validated?',
    'Classification',
    'Notes'
  ];

  const csvLines = [
    headers.join(','),
    ...violations.map(v => [
      v.repo,
      v.severity,
      v.package,
      v.function,
      v.contract,
      `"${v.file.replace(/"/g, '""')}"`, // Escape quotes in file paths
      v.line,
      `"${v.description.replace(/"/g, '""')}"`, // Escape quotes in description
      v.validated,
      v.classification,
      v.notes
    ].join(','))
  ];

  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');

  console.log(`\n✅ CSV exported to: ${csvPath}`);
  console.log(`\nNext steps:`);
  console.log(`1. Open CSV in spreadsheet: open ${csvPath}`);
  console.log(`2. For each violation (or sample):`);
  console.log(`   - Mark "Validated?" as "yes"`);
  console.log(`   - Mark "Classification" as TP (true positive), FP (false positive), or EC (edge case)`);
  console.log(`   - Add notes explaining your decision`);
  console.log(`3. Calculate precision: node scripts/calculate-precision.js ${csvPath}`);
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/extract-violations-csv.js <output-directory>');
  console.error('Example: node scripts/extract-violations-csv.js output/20260223');
  process.exit(1);
}

const outputDir = args[0];
if (!fs.existsSync(outputDir)) {
  console.error(`Directory not found: ${outputDir}`);
  process.exit(1);
}

extractViolationsToCSV(outputDir);
