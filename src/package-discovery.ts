/**
 * Package Discovery Module
 *
 * Scans a project to discover all packages used, check which have contracts,
 * and provide coverage statistics.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as ts from 'typescript';
import { DiscoveredPackage, PackageDiscoveryResult, PackageContract } from './types.js';

export class PackageDiscovery {
  private pathAliases: Set<string> = new Set();

  constructor(
    private corpusContracts: Map<string, PackageContract>
  ) {}

  /**
   * Discover all packages used in a project
   */
  async discoverPackages(projectRoot: string, tsconfigPath: string): Promise<PackageDiscoveryResult> {
    // Step 1: Read package.json dependencies
    const packageJsonDeps = await this.readPackageJson(projectRoot);

    // Step 2: Scan source files for actual imports
    const importedPackages = await this.scanImports(tsconfigPath);

    // Step 3: Merge and dedupe
    const allPackages = this.mergePackages(packageJsonDeps, importedPackages);

    // Step 4: Check which have contracts
    const packagesWithContracts = this.checkContracts(allPackages);

    // Step 5: Calculate statistics
    const withContracts = packagesWithContracts.filter(p => p.hasContract).length;
    const withoutContracts = packagesWithContracts.length - withContracts;

    return {
      total: packagesWithContracts.length,
      withContracts,
      withoutContracts,
      packages: packagesWithContracts,
    };
  }

  /**
   * Read dependencies from package.json
   */
  private async readPackageJson(projectRoot: string): Promise<Map<string, { version: string }>> {
    const packages = new Map<string, { version: string }>();

    try {
      const packageJsonPath = path.join(projectRoot, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);

      // Collect dependencies and devDependencies
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      for (const [name, version] of Object.entries(deps)) {
        packages.set(name, { version: version as string });
      }
    } catch (error) {
      console.warn('Could not read package.json:', error);
    }

    return packages;
  }

  /**
   * Scan TypeScript source files for import statements
   */
  private async scanImports(tsconfigPath: string): Promise<Map<string, Set<string>>> {
    const imports = new Map<string, Set<string>>(); // packageName -> Set<fileName>

    try {
      // Load tsconfig
      const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
      const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(tsconfigPath)
      );

      // Extract path aliases to filter them out
      this.extractPathAliases(configFile.config, tsconfigPath);

      // Create program
      const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);

      // Scan each source file
      for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) continue;
        if (sourceFile.fileName.includes('node_modules')) continue;

        this.extractImportsFromFile(sourceFile, imports);
      }
    } catch (error) {
      console.warn('Could not scan imports:', error);
    }

    return imports;
  }

  /**
   * Extract path aliases from tsconfig to filter them out
   *
   * Examples:
   * - "@/*" -> "@"
   * - "@/components/*" -> "@/components"
   * - "~/*" -> "~"
   */
  private extractPathAliases(config: any, tsconfigPath: string): void {
    this.pathAliases.clear();

    // Check current config
    const paths = config.compilerOptions?.paths;
    if (paths) {
      for (const alias of Object.keys(paths)) {
        // Extract the base alias (remove /* suffix)
        const baseAlias = alias.replace(/\/\*$/, '');
        this.pathAliases.add(baseAlias);
      }
    }

    // Check extends (recursively load parent tsconfig)
    if (config.extends) {
      try {
        const extendsPath = path.resolve(path.dirname(tsconfigPath), config.extends);
        const parentConfig = ts.readConfigFile(extendsPath, ts.sys.readFile);
        if (parentConfig.config) {
          this.extractPathAliases(parentConfig.config, extendsPath);
        }
      } catch {
        // Ignore errors loading parent config
      }
    }
  }

  /**
   * Extract import statements from a TypeScript source file
   */
  private extractImportsFromFile(
    sourceFile: ts.SourceFile,
    imports: Map<string, Set<string>>
  ): void {
    const visit = (node: ts.Node) => {
      // Handle: import { x } from 'package'
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;
        if (ts.isStringLiteral(moduleSpecifier)) {
          const packageName = this.extractPackageName(moduleSpecifier.text);
          if (packageName) {
            if (!imports.has(packageName)) {
              imports.set(packageName, new Set());
            }
            imports.get(packageName)!.add(sourceFile.fileName);
          }
        }
      }

      // Handle: require('package')
      if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.Identifier) {
          const identifier = node.expression as ts.Identifier;
          if (identifier.text === 'require' && node.arguments.length > 0) {
            const arg = node.arguments[0];
            if (ts.isStringLiteral(arg)) {
              const packageName = this.extractPackageName(arg.text);
              if (packageName) {
                if (!imports.has(packageName)) {
                  imports.set(packageName, new Set());
                }
                imports.get(packageName)!.add(sourceFile.fileName);
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  /**
   * Extract the package name from an import path
   *
   * Examples:
   * - 'axios' -> 'axios'
   * - '@prisma/client' -> '@prisma/client'
   * - 'axios/lib/core' -> 'axios'
   * - './local' -> null
   * - '../relative' -> null
   * - '@/components' -> null (path alias)
   */
  private extractPackageName(importPath: string): string | null {
    // Ignore relative imports
    if (importPath.startsWith('.')) {
      return null;
    }

    // Ignore path aliases (e.g., @/*, ~/* from tsconfig.json)
    for (const alias of this.pathAliases) {
      if (importPath === alias || importPath.startsWith(alias + '/')) {
        return null;
      }
    }

    // Ignore Node.js built-ins
    const builtins = [
      'fs', 'path', 'crypto', 'http', 'https', 'os', 'util', 'events',
      'stream', 'buffer', 'child_process', 'url', 'querystring', 'net',
      'zlib', 'assert', 'readline', 'process', 'fs/promises'
    ];
    if (builtins.includes(importPath)) {
      return null;
    }

    // Handle scoped packages: @scope/package or @scope/package/subpath
    if (importPath.startsWith('@')) {
      const parts = importPath.split('/');
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
      }
      return null;
    }

    // Handle regular packages: package or package/subpath
    const parts = importPath.split('/');
    return parts[0];
  }

  /**
   * Merge packages from package.json and actual imports
   */
  private mergePackages(
    packageJsonDeps: Map<string, { version: string }>,
    importedPackages: Map<string, Set<string>>
  ): Map<string, { version: string; source: 'package.json' | 'import' | 'both'; usedIn: string[] }> {
    const merged = new Map();

    // Add all package.json dependencies
    for (const [name, { version }] of packageJsonDeps) {
      merged.set(name, {
        version,
        source: 'package.json' as const,
        usedIn: [],
      });
    }

    // Add/update with actual imports
    for (const [name, files] of importedPackages) {
      if (merged.has(name)) {
        const existing = merged.get(name);
        existing.source = 'both';
        existing.usedIn = Array.from(files);
      } else {
        // Package is imported but not in package.json (might be transitive)
        merged.set(name, {
          version: 'unknown',
          source: 'import' as const,
          usedIn: Array.from(files),
        });
      }
    }

    return merged;
  }

  /**
   * Check which packages have contracts in the corpus
   */
  private checkContracts(
    packages: Map<string, { version: string; source: 'package.json' | 'import' | 'both'; usedIn: string[] }>
  ): DiscoveredPackage[] {
    const result: DiscoveredPackage[] = [];

    for (const [name, { version, source, usedIn }] of packages) {
      const contract = this.corpusContracts.get(name);

      result.push({
        name,
        version,
        source,
        hasContract: contract !== undefined,
        contractVersion: contract?.contract_version,
        usedIn,
      });
    }

    // Sort by: contracts first, then alphabetically
    result.sort((a, b) => {
      if (a.hasContract !== b.hasContract) {
        return a.hasContract ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return result;
  }

  /**
   * Generate a coverage report
   */
  generateCoverageReport(discovery: PackageDiscoveryResult): string {
    const lines: string[] = [];
    const coveragePercent = discovery.total > 0
      ? ((discovery.withContracts / discovery.total) * 100).toFixed(1)
      : '0.0';

    lines.push('');
    lines.push('════════════════════════════════════════════════════════════════');
    lines.push('Package Discovery & Coverage');
    lines.push('════════════════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Total packages: ${discovery.total}`);
    lines.push(`Packages with contracts: ${discovery.withContracts} (${coveragePercent}%)`);
    lines.push(`Packages without contracts: ${discovery.withoutContracts}`);
    lines.push('');

    if (discovery.withContracts > 0) {
      lines.push('✓ Packages with contracts:');
      for (const pkg of discovery.packages.filter(p => p.hasContract)) {
        lines.push(`  ${pkg.name}@${pkg.version} (contract v${pkg.contractVersion})`);
      }
      lines.push('');
    }

    if (discovery.withoutContracts > 0 && discovery.withoutContracts <= 20) {
      lines.push('⚠ Packages without contracts:');
      for (const pkg of discovery.packages.filter(p => !p.hasContract)) {
        lines.push(`  ${pkg.name}@${pkg.version}`);
      }
      lines.push('');
    } else if (discovery.withoutContracts > 20) {
      lines.push(`⚠ ${discovery.withoutContracts} packages without contracts (showing top 20):`);
      for (const pkg of discovery.packages.filter(p => !p.hasContract).slice(0, 20)) {
        lines.push(`  ${pkg.name}@${pkg.version}`);
      }
      lines.push(`  ... and ${discovery.withoutContracts - 20} more`);
      lines.push('');
    }

    return lines.join('\n');
  }
}
