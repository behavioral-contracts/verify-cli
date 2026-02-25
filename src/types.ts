/**
 * Core type definitions for behavioral contract verification
 */

export type Severity = 'error' | 'warning' | 'info';

/**
 * A precondition that must be true before calling a function
 */
export interface Precondition {
  id: string;
  description: string;
  source: string;
  severity: Severity;
}

/**
 * A postcondition describing what happens after calling a function
 */
export interface Postcondition {
  id: string;
  condition: string;
  returns?: string;
  throws?: string;
  required_handling?: string;
  source: string;
  severity: Severity;
}

/**
 * An edge case documenting surprising but not incorrect behavior
 */
export interface EdgeCase {
  id: string;
  description: string;
  source: string;
  severity: 'warning' | 'info';
}

/**
 * A function contract specifying behavioral expectations
 */
export interface FunctionContract {
  name: string;
  import_path: string;
  description: string;
  namespace?: string; // For namespace methods like ts.sys.readFile() where namespace="sys"
  preconditions?: Precondition[];
  postconditions?: Postcondition[];
  edge_cases?: EdgeCase[];
}

/**
 * Detection rules for identifying package usage in code
 */
export interface DetectionRules {
  /** Class names used for instantiation (e.g., ["Octokit", "PrismaClient"]) */
  class_names?: string[];
  /** TypeScript type names used in declarations (e.g., ["Octokit", "AxiosInstance"]) */
  type_names?: string[];
  /** Factory method names (e.g., ["createClient", "create"]) */
  factory_methods?: string[];
  /** Patterns to match in await expressions (e.g., [".repos.", ".pulls."]) */
  await_patterns?: string[];
}

/**
 * A complete package contract
 */
export interface PackageContract {
  package: string;
  semver: string;
  contract_version: string;
  maintainer: string;
  last_verified: string;
  deprecated?: boolean;
  deprecated_reason?: string;
  deprecated_date?: string;
  /** Detection rules for analyzer integration */
  detection?: DetectionRules;
  functions: FunctionContract[];
}

/**
 * A violation found in user code
 */
export interface Violation {
  id: string;
  severity: Severity;
  file: string;
  line: number;
  column: number;
  package: string;
  function: string;
  contract_clause: string;
  description: string;
  source_doc: string;
  suggested_fix?: string;
  code_snippet?: {
    startLine: number;
    endLine: number;
    lines: Array<{ line: number; content: string; highlighted: boolean }>;
  };
}

/**
 * Summary statistics for a verification run
 */
export interface VerificationSummary {
  total_violations: number;
  error_count: number;
  warning_count: number;
  info_count: number;
  passed: boolean;
}

/**
 * Complete audit record produced by a verification run
 */
export interface AuditRecord {
  tool: string;
  tool_version: string;
  corpus_version: string;
  timestamp: string;
  git_commit?: string;
  git_branch?: string;
  tsconfig: string;
  packages_analyzed: string[];
  contracts_applied: number;
  files_analyzed: number;
  violations: Violation[];
  summary: VerificationSummary;
}

/**
 * Location of a function call in the AST
 */
export interface CallSite {
  file: string;
  line: number;
  column: number;
  functionName: string;
  packageName: string;
}

/**
 * Result of analyzing a single call site
 */
export interface CallSiteAnalysis {
  callSite: CallSite;
  hasTryCatch: boolean;
  hasPromiseCatch: boolean;
  checksResponseExists: boolean;
  checksStatusCode: boolean;
  handledStatusCodes: number[];
  hasRetryLogic: boolean;
}

/**
 * Configuration options for the analyzer
 */
export interface AnalyzerConfig {
  tsconfigPath: string;
  corpusPath: string;
  includePaths?: string[];
  excludePaths?: string[];
  severityThreshold?: Severity;
}

/**
 * Result of loading the corpus
 */
export interface CorpusLoadResult {
  contracts: Map<string, PackageContract>;
  errors: string[];
}

/**
 * A package discovered in the project
 */
export interface DiscoveredPackage {
  name: string;
  version: string;
  source: 'package.json' | 'import' | 'both';
  hasContract: boolean;
  contractVersion?: string;
  usedIn: string[]; // Files where the package is imported
}

/**
 * Result of package discovery scan
 */
export interface PackageDiscoveryResult {
  total: number;
  withContracts: number;
  withoutContracts: number;
  packages: DiscoveredPackage[];
}

/**
 * Enhanced audit record with package discovery
 */
export interface EnhancedAuditRecord extends AuditRecord {
  package_discovery: PackageDiscoveryResult;
  violations_by_package: Record<string, {
    total: number;
    errors: number;
    warnings: number;
    info: number;
    violations: Violation[];
  }>;
}

/**
 * A positive pattern (best practice) detected in code
 */
export interface PositivePattern {
  id: string;
  name: string;
  description: string;
  file: string;
  line: number;
  column: number;
  category: 'configuration' | 'error-handling' | 'performance' | 'consistency';
  benefit: string;
  code_snippet?: {
    startLine: number;
    endLine: number;
    lines: Array<{ line: number; content: string; highlighted: boolean }>;
  };
}

/**
 * React Query hook call detection
 */
export interface HookCall {
  hookName: 'useQuery' | 'useMutation' | 'useInfiniteQuery' | 'QueryClient';
  location: {
    file: string;
    line: number;
    column: number;
  };
  returnValues: Map<string, string>; // variableName -> property (error, isError, data, etc.)
  options: {
    onError?: boolean;
    onMutate?: boolean;
    onSuccess?: boolean;
    retry?: 'default' | 'number' | 'boolean' | 'function';
  };
}

/**
 * Variable usage tracking for hook return values
 */
export interface VariableUsage {
  variableName: string;
  propertyName: string; // 'error', 'isError', 'data', etc.
  declaredAt: {
    file: string;
    line: number;
  };
  usedIn: {
    conditionals: number; // Count of if/ternary checks
    jsxExpressions: number; // Count of JSX usage
    callbacks: number; // Count of callback usage
  };
}

/**
 * Analysis of error handling in React Query hooks
 */
export interface HookErrorHandling {
  hasErrorStateCheck: boolean; // Checks isError or error
  hasOnErrorCallback: boolean; // Has onError in options
  hasGlobalHandler: boolean; // QueryCache/MutationCache configured
  errorCheckedBeforeDataAccess: boolean; // Proper order
  hasOptimisticUpdateRollback?: boolean; // For mutations with onMutate
  retryAnalysis?: {
    type: 'default' | 'number' | 'boolean' | 'function';
    avoidsClientErrors: boolean; // Checks for 4xx before retrying
  };
}
