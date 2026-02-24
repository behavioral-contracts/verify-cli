#!/usr/bin/env node
/**
 * Calculates precision metrics from validated violations CSV
 */

const fs = require('fs');
const readline = require('readline');

const csvPath = process.argv[2];

if (!csvPath || !fs.existsSync(csvPath)) {
  console.error('Usage: node calculate-precision.js <path-to-violations-csv>');
  console.error('Example: node calculate-precision.js output/20260223/violations-for-review.csv');
  process.exit(1);
}

let total = 0;
let validated = 0;
let truePositives = 0;
let falsePositives = 0;
let edgeCases = 0;

const byContract = {};

const rl = readline.createInterface({
  input: fs.createReadStream(csvPath),
  crlfDelay: Infinity
});

let lineNum = 0;

rl.on('line', (line) => {
  lineNum++;
  if (lineNum === 1) return; // Skip header

  // Parse CSV (basic - doesn't handle commas in quoted strings perfectly)
  const cols = line.split(',').map(c => c.replace(/^"|"$/g, ''));

  const repo = cols[0];
  const contract = cols[5];
  const validatedCol = cols[7];
  const classification = cols[8];

  total++;

  // Track by contract type
  const contractKey = contract || 'unknown';
  if (!byContract[contractKey]) {
    byContract[contractKey] = { total: 0, validated: 0, tp: 0, fp: 0, ec: 0 };
  }
  byContract[contractKey].total++;

  if (!validatedCol || validatedCol.toLowerCase() === 'no' || validatedCol === '') {
    return; // Not yet reviewed
  }

  validated++;
  byContract[contractKey].validated++;

  const cls = classification.toUpperCase();

  if (cls === 'TP' || cls === 'TRUE' || validatedCol.toLowerCase() === 'true') {
    truePositives++;
    byContract[contractKey].tp++;
  } else if (cls === 'FP' || cls === 'FALSE' || validatedCol.toLowerCase() === 'false') {
    falsePositives++;
    byContract[contractKey].fp++;
  } else if (cls === 'EC' || cls === 'EDGE') {
    edgeCases++;
    byContract[contractKey].ec++;
  }
});

rl.on('close', () => {
  const precision = validated > 0 ? (truePositives / validated * 100).toFixed(1) : 0;
  const validatedPercent = total > 0 ? (validated / total * 100).toFixed(1) : 0;

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║         VIOLATION VALIDATION METRICS          ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  console.log('📊 Overall Statistics:\n');
  console.log(`  Total violations:     ${total}`);
  console.log(`  Validated:            ${validated} (${validatedPercent}%)`);
  console.log(`  Pending validation:   ${total - validated}\n`);

  console.log('✅ Validation Results:\n');
  console.log(`  True Positives:       ${truePositives} (${validated > 0 ? (truePositives / validated * 100).toFixed(1) : 0}%)`);
  console.log(`  False Positives:      ${falsePositives} (${validated > 0 ? (falsePositives / validated * 100).toFixed(1) : 0}%)`);
  console.log(`  Edge Cases:           ${edgeCases} (${validated > 0 ? (edgeCases / validated * 100).toFixed(1) : 0}%)\n`);

  console.log('🎯 Precision Metrics:\n');
  console.log(`  Precision:            ${precision}%`);

  if (validated < 30) {
    console.log('\n⚠️  Sample size < 30. Validate more for statistical confidence (95% CI).');
  } else if (validated < 100) {
    console.log('\n✓  Good sample size. Consider validating more for higher confidence.');
  } else {
    console.log('\n✓✓ Excellent sample size. Results are statistically significant.');
  }

  // Per-contract breakdown
  console.log('\n📋 By Contract Type:\n');

  const sortedContracts = Object.entries(byContract)
    .filter(([_, stats]) => stats.validated > 0)
    .sort((a, b) => b[1].validated - a[1].validated);

  if (sortedContracts.length === 0) {
    console.log('  (No contracts validated yet)\n');
  } else {
    sortedContracts.forEach(([contract, stats]) => {
      const prec = stats.validated > 0 ? (stats.tp / stats.validated * 100).toFixed(1) : 0;
      console.log(`  ${contract}:`);
      console.log(`    Validated: ${stats.validated}/${stats.total} | Precision: ${prec}% | TP: ${stats.tp}, FP: ${stats.fp}, EC: ${stats.ec}`);
    });
    console.log('');
  }

  // Recommendations
  console.log('💡 Next Steps:\n');

  if (validated === 0) {
    console.log('  1. Open the CSV file in a spreadsheet');
    console.log('  2. For each violation, inspect the code');
    console.log('  3. Mark "Validated?" as "yes" and "Classification" as TP/FP/EC');
    console.log('  4. Run this script again to see precision');
  } else if (validated < total * 0.1) {
    console.log(`  - Continue validation (${(total * 0.1 - validated).toFixed(0)} more for 10% sample)`);
  } else if (precision < 70) {
    console.log('  ⚠️  Precision is low. Consider:');
    console.log('     - Reviewing false positive patterns');
    console.log('     - Improving analyzer logic');
    console.log('     - Refining contracts');
  } else if (precision >= 90) {
    console.log('  ✅ Precision is excellent!');
    console.log('     - Document true positive patterns');
    console.log('     - Consider expanding to more repos');
    console.log('     - Use findings to improve contracts');
  } else {
    console.log('  ✓ Precision is good.');
    console.log('    - Continue validation to reach statistical significance');
    console.log('    - Document patterns observed');
  }

  console.log('');
});
