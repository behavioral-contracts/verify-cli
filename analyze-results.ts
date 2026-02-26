#!/usr/bin/env node
/**
 * Phase 6.1: Analyze baseline test results
 * Parses audit JSON files and generates summary report
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Violation {
  file: string;
  line: number;
  column: number;
  severity: string;
  message: string;
  package: string;
  method: string;
}

interface AuditResult {
  violations: Violation[];
  summary: {
    totalViolations: number;
    byPackage: Record<string, number>;
    bySeverity: Record<string, number>;
  };
}

interface PackageResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  totalViolations: number;
  properViolations: number;
  missingViolations: number;
  instanceViolations: number;
  violations: Violation[];
  error?: string;
}

const OUTPUT_DATE = process.argv[2] || new Date().toISOString().split('T')[0].replace(/-/g, '');
const OUTPUT_DIR = path.join(path.dirname(__dirname), 'output', OUTPUT_DATE);

function parseAuditFile(filePath: string): AuditResult | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as AuditResult;
  } catch (err) {
    console.error(`Failed to parse ${filePath}:`, err);
    return null;
  }
}

function analyzePackage(packageName: string): PackageResult {
  const safeName = packageName.replace(/\//g, '-');
  const auditPath = path.join(OUTPUT_DIR, `${safeName}-audit.json`);

  const result: PackageResult = {
    name: packageName,
    status: 'ERROR',
    totalViolations: 0,
    properViolations: 0,
    missingViolations: 0,
    instanceViolations: 0,
    violations: [],
  };

  if (!fs.existsSync(auditPath)) {
    result.error = 'Audit file not found';
    return result;
  }

  const audit = parseAuditFile(auditPath);
  if (!audit) {
    result.error = 'Failed to parse audit file';
    return result;
  }

  result.totalViolations = audit.violations.length;
  result.violations = audit.violations;

  // Categorize violations by fixture file
  for (const violation of audit.violations) {
    const filename = path.basename(violation.file);

    if (filename === 'proper-error-handling.ts') {
      result.properViolations++;
    } else if (filename === 'missing-error-handling.ts') {
      result.missingViolations++;
    } else if (filename === 'instance-usage.ts') {
      result.instanceViolations++;
    }
  }

  // PASS if no violations in proper-error-handling.ts
  result.status = result.properViolations === 0 ? 'PASS' : 'FAIL';

  return result;
}

function generateReport(results: PackageResult[]): string {
  const passed = results.filter(r => r.status === 'PASS');
  const failed = results.filter(r => r.status === 'FAIL');
  const errors = results.filter(r => r.status === 'ERROR');

  let report = `# Phase 6.1: Baseline Fixture Testing - Complete Results

**Date:** ${new Date().toISOString().split('T')[0]}
**Output Directory:** \`verify-cli/output/${OUTPUT_DATE}/\`

---

## Summary

- **Total Packages:** ${results.length}
- **Passed:** ${passed.length} (${((passed.length / results.length) * 100).toFixed(1)}%)
- **Failed:** ${failed.length} (${((failed.length / results.length) * 100).toFixed(1)}%)
- **Errors:** ${errors.length}

**Pass Criteria:** 0 violations in \`proper-error-handling.ts\`

---

## Overall Results

### ✅ Passed Packages (${passed.length})

${passed.length > 0 ? passed.map(r => `- **${r.name}** - ${r.totalViolations} total violations (${r.missingViolations} missing, ${r.instanceViolations} instance)`).join('\n') : '_None_'}

### ❌ Failed Packages (${failed.length})

${failed.length > 0 ? failed.map(r => `- **${r.name}** - ${r.properViolations} violations in proper-error-handling.ts`).join('\n') : '_None_'}

### ⚠️ Error Packages (${errors.length})

${errors.length > 0 ? errors.map(r => `- **${r.name}** - ${r.error}`).join('\n') : '_None_'}

---

## Detailed Results by Package

`;

  // Sort by status then name
  const sortedResults = results.sort((a, b) => {
    if (a.status !== b.status) {
      const order = { PASS: 0, FAIL: 1, ERROR: 2 };
      return order[a.status] - order[b.status];
    }
    return a.name.localeCompare(b.name);
  });

  for (const result of sortedResults) {
    const emoji = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';

    report += `### ${emoji} ${result.name}\n\n`;
    report += `**Status:** ${result.status}\n\n`;

    if (result.status === 'ERROR') {
      report += `**Error:** ${result.error}\n\n`;
      report += `---\n\n`;
      continue;
    }

    report += `**Violations:**\n`;
    report += `- Total: ${result.totalViolations}\n`;
    report += `- In proper-error-handling.ts: ${result.properViolations}\n`;
    report += `- In missing-error-handling.ts: ${result.missingViolations}\n`;
    report += `- In instance-usage.ts: ${result.instanceViolations}\n\n`;

    if (result.properViolations > 0) {
      report += `**Issues in proper-error-handling.ts:**\n\n`;
      const properViolations = result.violations.filter(v =>
        path.basename(v.file) === 'proper-error-handling.ts'
      );

      for (const v of properViolations) {
        report += `- Line ${v.line}: ${v.message}\n`;
        report += `  - Package: \`${v.package}\`, Method: \`${v.method}\`\n`;
        report += `  - Severity: ${v.severity}\n\n`;
      }
    }

    report += `---\n\n`;
  }

  // Pattern analysis
  report += `## Pattern Analysis\n\n`;

  const failurePatterns: Record<string, number> = {};
  for (const result of failed) {
    for (const v of result.violations) {
      if (path.basename(v.file) === 'proper-error-handling.ts') {
        const key = `${v.package}:${v.method}`;
        failurePatterns[key] = (failurePatterns[key] || 0) + 1;
      }
    }
  }

  if (Object.keys(failurePatterns).length > 0) {
    report += `### Common False Positives\n\n`;
    const sorted = Object.entries(failurePatterns).sort((a, b) => b[1] - a[1]);
    for (const [pattern, count] of sorted) {
      report += `- \`${pattern}\` - ${count} occurrence(s)\n`;
    }
    report += `\n`;
  }

  // Recommendations
  report += `## Recommendations\n\n`;

  if (failed.length > 0) {
    report += `### High Priority Fixes\n\n`;
    report += `The following packages have violations in proper-error-handling.ts and need investigation:\n\n`;
    for (const result of failed.slice(0, 10)) {
      report += `1. **${result.name}**\n`;
      report += `   - Review proper-error-handling.ts fixture\n`;
      report += `   - Verify error handling patterns are actually proper\n`;
      report += `   - Update contract or analyzer if needed\n\n`;
    }

    if (failed.length > 10) {
      report += `_...and ${failed.length - 10} more packages_\n\n`;
    }
  }

  report += `### Next Steps\n\n`;
  report += `1. **Investigate Failed Packages**: Review each package with proper-error-handling.ts violations\n`;
  report += `2. **Fix Contracts**: Update contracts to match actual proper patterns\n`;
  report += `3. **Fix Analyzer**: Improve analyzer detection logic if needed\n`;
  report += `4. **Fix Fixtures**: Correct fixture code if patterns are actually improper\n`;
  report += `5. **Re-test**: Run Phase 6.1 again after fixes\n\n`;

  report += `---\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n`;

  return report;
}

async function main() {
  console.log(`Analyzing results in: ${OUTPUT_DIR}`);

  const packages = [
    "axios",
    "cloudinary",
    "discord.js",
    "express",
    "firebase-admin",
    "ioredis",
    "mongodb",
    "mongoose",
    "openai",
    "pg",
    "react-hook-form",
    "redis",
    "square",
    "stripe",
    "twilio",
    "typescript",
    "zod",
    "@anthropic-ai/sdk",
    "@aws-sdk/client-s3",
    "@clerk/nextjs",
    "@octokit/rest",
    "@prisma/client",
    "@sendgrid/mail",
    "@slack/web-api",
    "@supabase/supabase-js",
    "@tanstack/react-query",
    "bullmq",
    "@vercel/postgres",
    "drizzle-orm",
    "socket.io",
    "joi",
    "ethers",
    "fastify",
    "next",
    "dotenv",
    "jsonwebtoken",
    "bcrypt",
    "multer",
    "helmet",
    "cors",
    "winston",
    "passport",
    "knex",
    "typeorm",
    "graphql",
    "uuid",
    "date-fns",
    "@nestjs/common",
    "@hapi/hapi",
  ];

  const results: PackageResult[] = [];

  for (const pkg of packages) {
    const result = analyzePackage(pkg);
    results.push(result);

    const emoji = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${emoji} ${pkg}: ${result.status} (${result.properViolations} proper violations)`);
  }

  console.log(`\nGenerating report...`);

  const report = generateReport(results);
  const reportPath = path.join(__dirname, '../dev-notes/findings/phase6-baseline-complete-results.md');

  // Ensure directory exists
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report, 'utf-8');

  console.log(`\nReport saved to: ${reportPath}`);
  console.log(`\nSummary:`);
  console.log(`  Passed: ${results.filter(r => r.status === 'PASS').length}`);
  console.log(`  Failed: ${results.filter(r => r.status === 'FAIL').length}`);
  console.log(`  Errors: ${results.filter(r => r.status === 'ERROR').length}`);
}

main().catch(console.error);
