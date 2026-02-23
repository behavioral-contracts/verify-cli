/**
 * AST Analyzer - uses TypeScript Compiler API to detect behavioral contract violations
 */

import * as ts from 'typescript';
import * as path from 'path';
import type {
  PackageContract,
  Violation,
  CallSite,
  CallSiteAnalysis,
  AnalyzerConfig,
  Postcondition,
} from './types.js';

/**
 * Main analyzer that coordinates the verification process
 */
export class Analyzer {
  private program: ts.Program;
  private contracts: Map<string, PackageContract>;
  private violations: Violation[] = [];

  constructor(config: AnalyzerConfig, contracts: Map<string, PackageContract>) {
    this.contracts = contracts;

    // Create TypeScript program
    const configFile = ts.readConfigFile(config.tsconfigPath, ts.sys.readFile);
    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(config.tsconfigPath)
    );

    this.program = ts.createProgram({
      rootNames: parsedConfig.fileNames,
      options: parsedConfig.options,
    });
  }

  /**
   * Analyzes all files in the program and returns violations
   */
  analyze(): Violation[] {
    this.violations = [];

    for (const sourceFile of this.program.getSourceFiles()) {
      // Skip declaration files and node_modules
      if (sourceFile.isDeclarationFile || sourceFile.fileName.includes('node_modules')) {
        continue;
      }

      this.analyzeFile(sourceFile);
    }

    return this.violations;
  }

  /**
   * Analyzes a single source file
   */
  private analyzeFile(sourceFile: ts.SourceFile): void {
    const visit = (node: ts.Node) => {
      // Look for call expressions
      if (ts.isCallExpression(node)) {
        this.analyzeCallExpression(node, sourceFile);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  /**
   * Analyzes a call expression to see if it violates any contracts
   */
  private analyzeCallExpression(node: ts.CallExpression, sourceFile: ts.SourceFile): void {
    const callSite = this.extractCallSite(node, sourceFile);
    if (!callSite) return;

    const contract = this.contracts.get(callSite.packageName);
    if (!contract) return;

    const functionContract = contract.functions.find(f => f.name === callSite.functionName);
    if (!functionContract) return;

    // Analyze what error handling exists at this call site
    const analysis = this.analyzeErrorHandling(node, sourceFile);

    // Check each postcondition
    for (const postcondition of functionContract.postconditions || []) {
      if (postcondition.severity !== 'error') continue;
      if (!postcondition.required_handling) continue;

      const violation = this.checkPostcondition(
        callSite,
        postcondition,
        analysis,
        contract.package,
        functionContract.name
      );

      if (violation) {
        this.violations.push(violation);
      }
    }
  }

  /**
   * Extracts call site information from a call expression
   */
  private extractCallSite(node: ts.CallExpression, sourceFile: ts.SourceFile): CallSite | null {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());

    // Try to determine the function and package being called
    let functionName: string | null = null;
    let packageName: string | null = null;

    if (ts.isPropertyAccessExpression(node.expression)) {
      // axios.get(...) pattern
      functionName = node.expression.name.text;

      if (ts.isIdentifier(node.expression.expression)) {
        packageName = node.expression.expression.text;
      }
    } else if (ts.isIdentifier(node.expression)) {
      // get(...) pattern after import
      functionName = node.expression.text;
    }

    if (!functionName) return null;

    // Try to resolve package name from imports
    if (!packageName) {
      packageName = this.resolvePackageFromImports(functionName, sourceFile);
    }

    if (!packageName || !this.contracts.has(packageName)) {
      return null;
    }

    return {
      file: sourceFile.fileName,
      line: line + 1,
      column: character + 1,
      functionName,
      packageName,
    };
  }

  /**
   * Resolves which package a function comes from by looking at imports
   */
  private resolvePackageFromImports(functionName: string, sourceFile: ts.SourceFile): string | null {
    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement)) {
        const moduleSpecifier = statement.moduleSpecifier;

        if (ts.isStringLiteral(moduleSpecifier)) {
          const packageName = moduleSpecifier.text;

          if (!this.contracts.has(packageName)) continue;

          // Check if this import includes our function
          const importClause = statement.importClause;
          if (!importClause) continue;

          // Handle: import axios from 'axios'
          if (importClause.name?.text === functionName) {
            return packageName;
          }

          // Handle: import { get } from 'axios'
          if (importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
            for (const element of importClause.namedBindings.elements) {
              if (element.name.text === functionName) {
                return packageName;
              }
            }
          }

          // Handle: import * as axios from 'axios'
          if (importClause.namedBindings && ts.isNamespaceImport(importClause.namedBindings)) {
            // This would require tracking property access - simplified for MVP
            continue;
          }
        }
      }
    }

    return null;
  }

  /**
   * Analyzes what error handling exists around a call site
   */
  private analyzeErrorHandling(node: ts.CallExpression, sourceFile: ts.SourceFile): CallSiteAnalysis {
    const analysis: CallSiteAnalysis = {
      callSite: {
        file: sourceFile.fileName,
        line: 0,
        column: 0,
        functionName: '',
        packageName: '',
      },
      hasTryCatch: false,
      hasPromiseCatch: false,
      checksResponseExists: false,
      checksStatusCode: false,
      handledStatusCodes: [],
      hasRetryLogic: false,
    };

    // Check if call is inside a try-catch block
    analysis.hasTryCatch = this.isInTryCatch(node);

    // Check if there's a .catch() handler
    const parent = node.parent;
    if (parent && ts.isPropertyAccessExpression(parent) && parent.name.text === 'catch') {
      analysis.hasPromiseCatch = true;
    }

    // Look for error.response checks in surrounding catch blocks
    const catchClause = this.findEnclosingCatchClause(node);
    if (catchClause) {
      analysis.checksResponseExists = this.catchChecksResponseExists(catchClause);
      analysis.checksStatusCode = this.catchChecksStatusCode(catchClause);
      analysis.handledStatusCodes = this.extractHandledStatusCodes(catchClause);
      analysis.hasRetryLogic = this.catchHasRetryLogic(catchClause);
    }

    return analysis;
  }

  /**
   * Checks if a node is inside a try-catch block
   */
  private isInTryCatch(node: ts.Node): boolean {
    let current: ts.Node | undefined = node;

    while (current) {
      if (ts.isTryStatement(current)) {
        return true;
      }
      current = current.parent;
    }

    return false;
  }

  /**
   * Finds the enclosing catch clause for a node
   */
  private findEnclosingCatchClause(node: ts.Node): ts.CatchClause | null {
    let current: ts.Node | undefined = node;

    while (current) {
      if (ts.isTryStatement(current) && current.catchClause) {
        return current.catchClause;
      }
      current = current.parent;
    }

    return null;
  }

  /**
   * Checks if a catch block checks error.response exists
   */
  private catchChecksResponseExists(catchClause: ts.CatchClause): boolean {
    let found = false;

    const visit = (node: ts.Node) => {
      // Look for: error.response, err.response, e.response, etc.
      if (ts.isPropertyAccessExpression(node) && node.name.text === 'response') {
        // Check if it's used in a conditional or optional chain
        const parent = node.parent;
        if (parent && (ts.isIfStatement(parent) || ts.isBinaryExpression(parent))) {
          found = true;
        }
      }

      // Look for optional chaining: error.response?.status
      if (ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.QuestionDotToken) {
        if (ts.isPropertyAccessExpression(node.expression) &&
            (node.expression as ts.PropertyAccessExpression).name.text === 'response') {
          found = true;
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(catchClause.block);
    return found;
  }

  /**
   * Checks if a catch block checks status codes
   */
  private catchChecksStatusCode(catchClause: ts.CatchClause): boolean {
    let found = false;

    const visit = (node: ts.Node) => {
      // Look for: error.response.status
      if (ts.isPropertyAccessExpression(node) && node.name.text === 'status') {
        const expr = node.expression;
        if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'response') {
          found = true;
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(catchClause.block);
    return found;
  }

  /**
   * Extracts which status codes are explicitly handled
   */
  private extractHandledStatusCodes(catchClause: ts.CatchClause): number[] {
    const codes: number[] = [];

    const visit = (node: ts.Node) => {
      // Look for: error.response.status === 429
      if (ts.isBinaryExpression(node) &&
          (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken ||
           node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken)) {

        if (ts.isNumericLiteral(node.right)) {
          const statusCode = parseInt(node.right.text, 10);
          if (statusCode >= 100 && statusCode < 600) {
            codes.push(statusCode);
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(catchClause.block);
    return codes;
  }

  /**
   * Checks if catch block has retry logic
   */
  private catchHasRetryLogic(catchClause: ts.CatchClause): boolean {
    // Look for common retry patterns: retry, attempt, backoff, setTimeout, etc.
    const text = catchClause.getText().toLowerCase();
    return text.includes('retry') ||
           text.includes('backoff') ||
           text.includes('attempt') ||
           (text.includes('settimeout') && text.includes('delay'));
  }

  /**
   * Checks if a postcondition is violated at a call site
   */
  private checkPostcondition(
    callSite: CallSite,
    postcondition: Postcondition,
    analysis: CallSiteAnalysis,
    packageName: string,
    functionName: string
  ): Violation | null {
    // Specific violation checks based on postcondition ID
    if (postcondition.id.includes('429') || postcondition.id.includes('rate-limit')) {
      // Rate limiting check
      if (!analysis.hasTryCatch) {
        return this.createViolation(callSite, postcondition, packageName, functionName,
          'No try-catch block found. Rate limit errors (429) will crash the application.');
      }

      if (!analysis.handledStatusCodes.includes(429) && !analysis.hasRetryLogic) {
        return this.createViolation(callSite, postcondition, packageName, functionName,
          'Rate limit response (429) is not explicitly handled and no retry logic detected.');
      }
    }

    if (postcondition.id.includes('network')) {
      // Network failure check
      if (!analysis.hasTryCatch) {
        return this.createViolation(callSite, postcondition, packageName, functionName,
          'No try-catch block found. Network failures will crash the application.');
      }

      if (!analysis.checksResponseExists) {
        return this.createViolation(callSite, postcondition, packageName, functionName,
          'Catch block does not check if error.response exists before accessing it.');
      }
    }

    if (postcondition.id.includes('error') && postcondition.severity === 'error') {
      // Generic error handling check
      if (!analysis.hasTryCatch && !analysis.hasPromiseCatch) {
        return this.createViolation(callSite, postcondition, packageName, functionName,
          'No error handling found. Errors will crash the application.');
      }
    }

    return null;
  }

  /**
   * Creates a violation object
   */
  private createViolation(
    callSite: CallSite,
    postcondition: Postcondition,
    packageName: string,
    functionName: string,
    description: string
  ): Violation {
    return {
      id: `${packageName}-${postcondition.id}`,
      severity: postcondition.severity,
      file: callSite.file,
      line: callSite.line,
      column: callSite.column,
      package: packageName,
      function: functionName,
      contract_clause: postcondition.id,
      description,
      source_doc: postcondition.source,
      suggested_fix: postcondition.required_handling,
    };
  }

  /**
   * Gets statistics about the analysis run
   */
  getStats() {
    return {
      filesAnalyzed: this.program.getSourceFiles().filter(
        sf => !sf.isDeclarationFile && !sf.fileName.includes('node_modules')
      ).length,
      contractsApplied: Array.from(this.contracts.values()).reduce(
        (sum, contract) => sum + (contract.functions?.length || 0),
        0
      ),
    };
  }
}
