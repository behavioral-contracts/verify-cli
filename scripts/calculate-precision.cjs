#\!/usr/bin/env node

/**
 * Calculates precision metrics from a validated CSV file
 * Usage: node scripts/calculate-precision.js output/20260223/violations-for-review.csv
 */

const fs = require('fs');

function parseCSV(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());

  // Simple CSV parser (handles quoted fields)
  const rows = lines.map(line => {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = \!inQuotes;
      } else if (char === ',' && \!inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current.trim());

    return fields;
  });

  return rows;
}

function calculatePrecision(csvPath) {
  const rows = parseCSV(csvPath);
  const headers = rows[0];
  const data = rows.slice(1);

  // Find column indices
  const validatedIdx = headers.indexOf('Validated?');
  const classificationIdx = headers.indexOf('Classification');
  const severityIdx = headers.indexOf('Severity');
  const contractIdx = headers.indexOf('Contract');

  if (validatedIdx === -1 || classificationIdx === -1) {
    console.error('Error: CSV must have "Validated?" and "Classification" columns');
    process.exit(1);
  }

  // Filter to validated rows
  const validated = data.filter(row =>
    row[validatedIdx] && row[validatedIdx].toLowerCase() === 'yes'
  );

  if (validated.length === 0) {
    console.log('\n⚠️  No validated violations found.');
    console.log('Please validate violations by:');
    console.log('1. Opening the CSV in a spreadsheet');
    console.log('2. Marking "Validated?" as "yes"');
    console.log('3. Marking "Classification" as TP, FP, or EC');
    process.exit(0);
  }

  // Count classifications
  const counts = { TP: 0, FP: 0, EC: 0 };
  const bySeverity = { error: { TP: 0, FP: 0, EC: 0 }, warning: { TP: 0, FP: 0, EC: 0 } };
  const byContract = {};

  for (const row of validated) {
    const classification = (row[classificationIdx] || '').toUpperCase();
    const severity = (row[severityIdx] || 'error').toLowerCase();
    const contract = row[contractIdx] || 'unknown';

    if (['TP', 'FP', 'EC'].includes(classification)) {
      counts[classification]++;

      if (bySeverity[severity]) {
        bySeverity[severity][classification]++;
      }

      if (\!byContract[contract]) {
        byContract[contract] = { TP: 0, FP: 0, EC: 0 };
      }
      byContract[contract][classification]++;
    }
  }

  const total = validated.length;
  const precision = total > 0 ? ((counts.TP / total) * 100).toFixed(1) : 0;
  const precisionWithEC = total > 0 ? (((counts.TP + counts.EC) / total) * 100).toFixed(1) : 0;

  // Print results
  console.log('\n=== Precision Analysis ===\n');
  console.log(`Total Validated: ${total}`);
  console.log(`True Positives: ${counts.TP} (${((counts.TP / total) * 100).toFixed(1)}%)`);
  console.log(`False Positives: ${counts.FP} (${((counts.FP / total) * 100).toFixed(1)}%)`);
  console.log(`Edge Cases: ${counts.EC} (${((counts.EC / total) * 100).toFixed(1)}%)`);
  console.log(`\n✨ Precision: ${precision}%`);
  console.log(`✨ Precision (including EC): ${precisionWithEC}%`);

  // Severity breakdown
  console.log('\n=== By Severity ===\n');
  for (const [severity, counts] of Object.entries(bySeverity)) {
    const severityTotal = counts.TP + counts.FP + counts.EC;
    if (severityTotal > 0) {
      const severityPrecision = ((counts.TP / severityTotal) * 100).toFixed(1);
      console.log(`${severity.toUpperCase()}:`);
      console.log(`  Total: ${severityTotal}`);
      console.log(`  TP: ${counts.TP}, FP: ${counts.FP}, EC: ${counts.EC}`);
      console.log(`  Precision: ${severityPrecision}%`);
    }
  }

  // Contract type breakdown
  console.log('\n=== By Contract Type (Top 5) ===\n');
  const contractEntries = Object.entries(byContract)
    .map(([contract, counts]) => {
      const total = counts.TP + counts.FP + counts.EC;
      const precision = total > 0 ? ((counts.TP / total) * 100).toFixed(1) : 0;
      return { contract, counts, total, precision };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  for (const { contract, counts, total, precision } of contractEntries) {
    console.log(`${contract}:`);
    console.log(`  Total: ${total}`);
    console.log(`  TP: ${counts.TP}, FP: ${counts.FP}, EC: ${counts.EC}`);
    console.log(`  Precision: ${precision}%\n`);
  }

  // Statistical confidence
  console.log('=== Statistical Confidence ===\n');
  if (total < 30) {
    console.log(`⚠️  Sample size (${total}) is small. Recommend validating at least 30 violations.`);
  } else if (total < 50) {
    console.log(`✅ Sample size (${total}) provides ~85% confidence.`);
  } else if (total < 100) {
    console.log(`✅ Sample size (${total}) provides ~90% confidence.`);
  } else {
    console.log(`✅ Sample size (${total}) provides ~95% confidence.`);
  }

  // Recommendations
  console.log('\n=== Recommendations ===\n');
  if (parseFloat(precision) >= 90) {
    console.log('✅ Excellent precision\! Analyzer is working well.');
    console.log('   - Document patterns observed');
    console.log('   - Expand to more repos or packages');
  } else if (parseFloat(precision) >= 70) {
    console.log('⚠️  Good but improvable precision.');
    console.log('   - Review false positive patterns');
    console.log('   - Refine analyzer detection logic');
    console.log('   - Re-run and re-validate');
  } else {
    console.log('❌ Low precision - needs improvement.');
    console.log('   - Review all false positives');
    console.log('   - Identify root causes');
    console.log('   - Fix analyzer or contracts');
    console.log('   - Re-run on same repos');
  }
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/calculate-precision.js <csv-file>');
  console.error('Example: node scripts/calculate-precision.js output/20260223/violations-for-review.csv');
  process.exit(1);
}

const csvPath = args[0];
if (\!fs.existsSync(csvPath)) {
  console.error(`File not found: ${csvPath}`);
  process.exit(1);
}

calculatePrecision(csvPath);
