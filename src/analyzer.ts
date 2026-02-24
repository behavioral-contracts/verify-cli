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
    const self = this;

    // Track variables that are AxiosInstance objects
    const axiosInstances = new Map<string, string>(); // variableName -> packageName
    const instancesWithInterceptors = new Set<string>(); // variableName

    // First pass: find all package instance declarations and interceptors
    function findAxiosInstances(node: ts.Node): void {
      // Look for: const instance = axios.create(...)
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const varName = node.name.getText(sourceFile);

        // Check for factory methods (axios.create, etc.)
        const packageName = self.extractPackageFromAxiosCreate(node.initializer, sourceFile);
        if (packageName) {
          axiosInstances.set(varName, packageName);
        }

        // Check for new expressions (new PrismaClient(), new Stripe(), etc.)
        const newPackageName = self.extractPackageFromNewExpression(node.initializer, sourceFile);
        if (newPackageName) {
          axiosInstances.set(varName, newPackageName);
        }
      }

      // Look for: this._axios = axios.create(...) or this.db = new PrismaClient()
      if (ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(node.left)) {
        const varName = node.left.name.text;

        // Check for factory methods
        const packageName = self.extractPackageFromAxiosCreate(node.right, sourceFile);
        if (packageName) {
          axiosInstances.set(varName, packageName);
        }

        // Check for new expressions
        const newPackageName = self.extractPackageFromNewExpression(node.right, sourceFile);
        if (newPackageName) {
          axiosInstances.set(varName, newPackageName);
        }
      }

      // Look for: private _axios: AxiosInstance or private prisma: PrismaClient
      if (ts.isPropertyDeclaration(node) && node.type) {
        const varName = node.name.getText(sourceFile);
        if (ts.isTypeReferenceNode(node.type) &&
            ts.isIdentifier(node.type.typeName)) {
          const typeName = node.type.typeName.text;

          // Map type names to package names
          const typeToPackage: Record<string, string> = {
            'AxiosInstance': 'axios',
            'PrismaClient': '@prisma/client',
            'PrismaService': '@prisma/client',
          };

          if (typeToPackage[typeName]) {
            axiosInstances.set(varName, typeToPackage[typeName]);
          }
        }
      }

      // Look for: constructor(private readonly prisma: PrismaService)
      // TypeScript/NestJS pattern where constructor parameters with modifiers create implicit properties
      if (ts.isParameter(node) &&
          (node.modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.PublicKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword)) &&
          node.type &&
          ts.isIdentifier(node.name)) {
        const varName = node.name.text;
        if (ts.isTypeReferenceNode(node.type) &&
            ts.isIdentifier(node.type.typeName)) {
          const typeName = node.type.typeName.text;

          // Map type names to package names
          const typeToPackage: Record<string, string> = {
            'AxiosInstance': 'axios',
            'PrismaClient': '@prisma/client',
            'PrismaService': '@prisma/client',
          };

          if (typeToPackage[typeName]) {
            axiosInstances.set(varName, typeToPackage[typeName]);
          }
        }
      }

      // Look for: instance.interceptors.response.use(...)
      if (ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression)) {
        const callText = node.expression.getText(sourceFile);
        // Match patterns like: axiosInstance.interceptors.response.use or instance.interceptors.request.use
        if (callText.includes('.interceptors.response.use') ||
            callText.includes('.interceptors.request.use')) {
          // Extract the instance variable name (first part before .interceptors)
          const parts = callText.split('.');
          if (parts.length >= 4) {
            const instanceVar = parts[0];
            instancesWithInterceptors.add(instanceVar);
          }
        }
      }

      ts.forEachChild(node, findAxiosInstances);
    }

    findAxiosInstances(sourceFile);

    function visit(node: ts.Node, parent?: ts.Node): void {
      // Set parent pointer if not already set
      if (parent && !(node as any).parent) {
        (node as any).parent = parent;
      }

      // Look for call expressions
      if (ts.isCallExpression(node)) {
        self.analyzeCallExpression(node, sourceFile, axiosInstances, instancesWithInterceptors);
      }

      // Recursively visit children, passing current node as parent
      ts.forEachChild(node, (child) => visit(child, node));
    }

    visit(sourceFile);
  }

  /**
   * Analyzes a call expression to see if it violates any contracts
   */
  private analyzeCallExpression(
    node: ts.CallExpression,
    sourceFile: ts.SourceFile,
    axiosInstances: Map<string, string>,
    instancesWithInterceptors: Set<string>
  ): void {
    const callSite = this.extractCallSite(node, sourceFile, axiosInstances);
    if (!callSite) return;

    const contract = this.contracts.get(callSite.packageName);
    if (!contract) return;

    const functionContract = contract.functions.find(f => f.name === callSite.functionName);
    if (!functionContract) return;

    // Check if this call is on an instance with error interceptors
    const instanceVar = this.extractInstanceVariable(node, sourceFile);
    const hasGlobalInterceptor = instanceVar ? instancesWithInterceptors.has(instanceVar) : false;

    // Analyze what error handling exists at this call site
    const analysis = this.analyzeErrorHandling(node, sourceFile, hasGlobalInterceptor);

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
   * Walks up a property access chain and returns components
   * Example: prisma.user.create → { root: 'prisma', chain: ['user'], method: 'create' }
   * Example: axios.get → { root: 'axios', chain: [], method: 'get' }
   * Example: openai.chat.completions.create → { root: 'openai', chain: ['chat', 'completions'], method: 'create' }
   */
  private walkPropertyAccessChain(
    expr: ts.PropertyAccessExpression,
    _sourceFile: ts.SourceFile
  ): { root: string; chain: string[]; method: string } | null {
    const chain: string[] = [];
    let current: ts.Expression = expr.expression;

    // Walk up the chain, collecting property names
    while (ts.isPropertyAccessExpression(current)) {
      chain.unshift(current.name.text); // Add to front to maintain order
      current = current.expression;
    }

    // At this point, current should be the root identifier
    if (!ts.isIdentifier(current)) {
      return null; // Unsupported pattern (e.g., complex expression)
    }

    const root = current.text;
    const method = expr.name.text;

    return { root, chain, method };
  }

  /**
   * Extracts call site information from a call expression
   */
  private extractCallSite(
    node: ts.CallExpression,
    sourceFile: ts.SourceFile,
    axiosInstances: Map<string, string>
  ): CallSite | null {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

    // Try to determine the function and package being called
    let functionName: string | null = null;
    let packageName: string | null = null;

    if (ts.isPropertyAccessExpression(node.expression)) {
      // Walk the full property access chain to handle both simple and chained calls
      // Simple: axios.get() → { root: 'axios', chain: [], method: 'get' }
      // Chained: prisma.user.create() → { root: 'prisma', chain: ['user'], method: 'create' }
      // Property: this.prisma.user.create() → { root: 'this', chain: ['prisma', 'user'], method: 'create' }
      const chainInfo = this.walkPropertyAccessChain(node.expression, sourceFile);

      if (chainInfo) {
        functionName = chainInfo.method;
        let rootIdentifier = chainInfo.root;

        // Special handling for 'this.property' patterns
        if (rootIdentifier === 'this' && chainInfo.chain.length > 0) {
          // For this.prisma.user.create(), use 'prisma' as the identifier
          rootIdentifier = chainInfo.chain[0];
          // Remove first element from chain since we're using it as root
          chainInfo.chain = chainInfo.chain.slice(1);
        }

        // Check if root is a direct package name
        if (this.contracts.has(rootIdentifier)) {
          packageName = rootIdentifier;
        }
        // Check if root is a known instance variable (e.g., axiosInstance, prismaClient)
        else if (axiosInstances.has(rootIdentifier)) {
          packageName = axiosInstances.get(rootIdentifier)!;
        }
        // Fallback: resolve from imports
        else {
          packageName = this.resolvePackageFromImports(rootIdentifier, sourceFile);
        }
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
   * Extracts the instance variable name from a call expression
   * e.g., for "axiosInstance.get(...)" returns "axiosInstance"
   */
  private extractInstanceVariable(node: ts.CallExpression, _sourceFile: ts.SourceFile): string | null {
    if (ts.isPropertyAccessExpression(node.expression)) {
      if (ts.isIdentifier(node.expression.expression)) {
        // Pattern: instance.get(...) - direct identifier
        return node.expression.expression.text;
      } else if (ts.isPropertyAccessExpression(node.expression.expression)) {
        // Pattern: this._axios.get(...) or obj.instance.get(...)
        return node.expression.expression.name.text;
      }
    }
    return null;
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
   * Extracts package name from new expressions
   * Examples: new PrismaClient() → "@prisma/client"
   *          new Stripe(key) → "stripe"
   *          new OpenAI(config) → "openai"
   */
  private extractPackageFromNewExpression(
    node: ts.Expression,
    sourceFile: ts.SourceFile
  ): string | null {
    if (!ts.isNewExpression(node)) return null;

    const className = node.expression.getText(sourceFile);

    // Map class names to package names
    const classToPackage: Record<string, string> = {
      'PrismaClient': '@prisma/client',
      'PrismaService': '@prisma/client', // NestJS wrapper around PrismaClient
      'Stripe': 'stripe',
      'OpenAI': 'openai',
    };

    if (classToPackage[className]) {
      return classToPackage[className];
    }

    // Fallback: resolve from imports
    return this.resolvePackageFromImports(className, sourceFile);
  }

  /**
   * Extracts package name from axios.create() call
   * Returns the package name if this is an axios.create() or similar factory call
   */
  private extractPackageFromAxiosCreate(node: ts.Expression, sourceFile: ts.SourceFile): string | null {
    // Check for: axios.create(...)
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text;

      // Check if this is a factory method (create, default, etc.)
      if (methodName === 'create' || methodName === 'default') {
        if (ts.isIdentifier(node.expression.expression)) {
          const objectName = node.expression.expression.text;

          // Check if this is from a package we track
          const packageName = this.resolvePackageFromImports(objectName, sourceFile);
          if (packageName) {
            return packageName;
          }

          // Direct match (e.g., axios.create where axios is imported as 'axios')
          if (this.contracts.has(objectName)) {
            return objectName;
          }
        }
      }
    }

    return null;
  }

  /**
   * Analyzes what error handling exists around a call site
   */
  private analyzeErrorHandling(
    node: ts.CallExpression,
    sourceFile: ts.SourceFile,
    hasGlobalInterceptor: boolean = false
  ): CallSiteAnalysis {
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

    // If instance has global error interceptor, consider it handled
    if (hasGlobalInterceptor) {
      analysis.hasTryCatch = true; // Treat global interceptor as equivalent to try-catch
    }

    // Check if call is inside a try-catch block
    if (!analysis.hasTryCatch) {
      analysis.hasTryCatch = this.isInTryCatch(node);
    }

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
      analysis.hasRetryLogic = this.catchHasRetryLogic(catchClause, sourceFile);
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
      // Look for if statements checking error.response
      if (ts.isIfStatement(node)) {
        const expression = node.expression;
        // Check the if condition for error.response patterns
        const hasResponseCheck = this.expressionChecksResponse(expression);
        if (hasResponseCheck) {
          found = true;
        }
      }

      // Look for optional chaining: error.response?.status or error.response?.data
      if (ts.isPropertyAccessExpression(node) && node.questionDotToken) {
        if (ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === 'response') {
          found = true;
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(catchClause.block);
    return found;
  }

  /**
   * Checks if an expression checks for response property
   */
  private expressionChecksResponse(node: ts.Expression): boolean {
    // Direct check: if (error.response)
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'response') {
      return true;
    }

    // Negated check: if (!error.response)
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
      if (ts.isPropertyAccessExpression(node.operand) && node.operand.name.text === 'response') {
        return true;
      }
    }

    // Binary expression: if (error.response && ...)
    if (ts.isBinaryExpression(node)) {
      return this.expressionChecksResponse(node.left) || this.expressionChecksResponse(node.right);
    }

    // Parenthesized: if ((error.response))
    if (ts.isParenthesizedExpression(node)) {
      return this.expressionChecksResponse(node.expression);
    }

    return false;
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
  private catchHasRetryLogic(catchClause: ts.CatchClause, sourceFile: ts.SourceFile): boolean {
    // Look for common retry patterns: retry, attempt, backoff, setTimeout, etc.
    const text = catchClause.getText(sourceFile).toLowerCase();
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
    const hasAnyErrorHandling = analysis.hasTryCatch || analysis.hasPromiseCatch;

    // Specific violation checks based on postcondition ID
    if (postcondition.id.includes('429') || postcondition.id.includes('rate-limit')) {
      // Rate limiting check
      if (!hasAnyErrorHandling) {
        return this.createViolation(callSite, postcondition, packageName, functionName,
          'No try-catch block found. Rate limit errors (429) will crash the application.', 'error');
      }

      // WARNING: Has error handling but doesn't handle 429 specifically
      if (!analysis.handledStatusCodes.includes(429) && !analysis.hasRetryLogic) {
        return this.createViolation(callSite, postcondition, packageName, functionName,
          'Rate limit response (429) is not explicitly handled. Consider implementing retry logic with exponential backoff.', 'warning');
      }
    }

    if (postcondition.id.includes('network')) {
      // Network failure check
      if (!hasAnyErrorHandling) {
        return this.createViolation(callSite, postcondition, packageName, functionName,
          'No try-catch block found. Network failures will crash the application.', 'error');
      }

      // WARNING: Has error handling but doesn't check response.exists
      if (hasAnyErrorHandling && !analysis.checksResponseExists) {
        return this.createViolation(callSite, postcondition, packageName, functionName,
          'Generic error handling found. Consider checking if error.response exists to distinguish network failures from HTTP errors.', 'warning');
      }
    }

    if (postcondition.id.includes('error') && postcondition.severity === 'error') {
      // Generic error handling check
      if (!hasAnyErrorHandling) {
        return this.createViolation(callSite, postcondition, packageName, functionName,
          'No error handling found. Errors will crash the application.', 'error');
      }

      // WARNING: Has generic error handling but doesn't inspect status codes
      if (hasAnyErrorHandling && !analysis.checksStatusCode) {
        return this.createViolation(callSite, postcondition, packageName, functionName,
          'Generic error handling found. Consider inspecting error.response.status to distinguish between 4xx client errors and 5xx server errors for better UX.', 'warning');
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
    description: string,
    severityOverride?: 'error' | 'warning' | 'info'
  ): Violation {
    return {
      id: `${packageName}-${postcondition.id}`,
      severity: severityOverride || postcondition.severity,
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
