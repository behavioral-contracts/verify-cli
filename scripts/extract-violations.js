#!/usr/bin/env node
/**
 * Extracts violations from audit files for manual review
 */

const fs = require('fs');
const path = require('path');

const outputDir = process.argv[2] || 'output/20260223';

if (!fs.existsSync(outputDir)) {
  console.error(`Error: Directory not found: ${outputDir}`);
  console.error('Usage: node extract-violations.js <output-directory>');
  process.exit(1);
}

const files = fs.readdirSync(outputDir).filter(f => f.endsWith('-audit.json'));

if (files.length === 0) {
  console.error(`No audit files found in ${outputDir}`);
  process.exit(1);
}

let allViolations = [];

for (const file of files) {
  const repoName = file.replace('-audit.json', '');
  const filePath = path.join(outputDir, file);
  const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  if (!content.violations) {
    console.warn(`Warning: No violations field in ${file}`);
    continue;
  }

  content.violations.forEach(v => {
    allViolations.push({
      repo: repoName,
      file: v.file_path || v.location?.file || 'unknown',
      line: v.line_number || v.location?.line || 0,
      column: v.column_number || v.location?.column || 0,
      package: v.package_name || 'unknown',
      function: v.function_name || 'unknown',
      contract: v.contract_id || v.violation_type || 'unknown',
      message: v.message || v.description || '',
      severity: v.severity || 'unknown',
      fix: v.fix_suggestion || '',
    });
  });
}

// Group by contract type
const byContract = {};
allViolations.forEach(v => {
  const key = `${v.package}::${v.contract}`;
  if (!byContract[key]) {
    byContract[key] = [];
  }
  byContract[key].push(v);
});

// Output summary
console.log('# Violation Summary\n');
console.log(`Total violations: ${allViolations.length}`);
console.log(`Repos analyzed: ${files.length}\n`);

console.log('## By Contract Type:\n');

const sortedContracts = Object.entries(byContract).sort((a, b) => b[1].length - a[1].length);

for (const [contract, violations] of sortedContracts) {
  console.log(`### ${contract} (${violations.length} violations)\n`);

  // Show first 5 examples
  violations.slice(0, 5).forEach((v, i) => {
    console.log(`${i + 1}. **${v.repo}** - \`${path.basename(v.file)}:${v.line}\``);
    const shortMsg = v.message.length > 80 ? v.message.substring(0, 77) + '...' : v.message;
    console.log(`   ${shortMsg}`);
    console.log('');
  });

  if (violations.length > 5) {
    console.log(`   _... and ${violations.length - 5} more_\n`);
  }
}

// Group by repo
console.log('\n## By Repository:\n');
const byRepo = {};
allViolations.forEach(v => {
  if (!byRepo[v.repo]) byRepo[v.repo] = 0;
  byRepo[v.repo]++;
});

const sortedRepos = Object.entries(byRepo).sort((a, b) => b[1] - a[1]);
sortedRepos.forEach(([repo, count]) => {
  console.log(`- **${repo}**: ${count} violations`);
});

// Write detailed CSV for spreadsheet review
const csv = [
  'Repo,File,Line,Package,Function,Contract,Severity,Validated?,Classification,Notes',
  ...allViolations.map(v => {
    const file = v.file.replace(/"/g, '""'); // Escape quotes
    const msg = v.message.replace(/"/g, '""').substring(0, 100);
    return `"${v.repo}","${file}",${v.line},"${v.package}","${v.function}","${v.contract}","${v.severity}","","",""`;
  })
].join('\n');

const csvPath = path.join(outputDir, 'violations-for-review.csv');
fs.writeFileSync(csvPath, csv, 'utf-8');

console.log(`\n✅ Detailed CSV written to: ${csvPath}`);
console.log('\n📋 Next steps:');
console.log('1. Open CSV in spreadsheet for manual validation');
console.log('2. For each violation, mark "Validated?" as "yes"');
console.log('3. Mark "Classification" as: TP (true positive), FP (false positive), or EC (edge case)');
console.log('4. Add notes about why');
console.log('5. Run calculate-precision.js to get metrics\n');
