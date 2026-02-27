import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { EventListenerAnalyzer } from './dist/analyzers/event-listener-analyzer.js';

// Create a simple test program
const code = `
import WebSocket from 'ws';

function connect(url: string) {
  const ws = new WebSocket(url);
  ws.on('open', () => {
    console.log('Connected');
  });
  // Missing: ws.on('error', handler)
}
`;

// Create a simple ws contract
const wsContract = {
  package: 'ws',
  semver: '*',
  contract_version: '1.0.0',
  maintainer: 'test',
  status: 'production',
  detection: {
    class_names: ['WebSocket'],
    require_instance_tracking: true,
    required_event_listeners: [
      {
        event: 'error',
        required: true,
        severity: 'error',
      },
    ],
  },
  functions: [],
};

const contracts = new Map();
contracts.set('ws', wsContract);

// Create TypeScript program
const sourceFile = ts.createSourceFile(
  'test.ts',
  code,
  ts.ScriptTarget.Latest,
  true
);

// Create a minimal program and type checker
const program = ts.createProgram(['test.ts'], {}, {
  getSourceFile: (fileName) => fileName === 'test.ts' ? sourceFile : undefined,
  writeFile: () => {},
  getCurrentDirectory: () => '',
  getDirectories: () => [],
  fileExists: () => true,
  readFile: () => '',
  getCanonicalFileName: (fileName) => fileName,
  useCaseSensitiveFileNames: () => true,
  getNewLine: () => '\n'
});

const typeChecker = program.getTypeChecker();

// Create analyzer
const analyzer = new EventListenerAnalyzer(sourceFile, contracts, typeChecker);

// Find the function
function findFunctions(node) {
  if (ts.isFunctionDeclaration(node)) {
    console.log('Found function:', node.name?.text);
    const violations = analyzer.analyze(node);
    console.log('Violations:', violations.length);
    if (violations.length > 0) {
      console.log('First violation:', violations[0]);
    }
  }
  ts.forEachChild(node, findFunctions);
}

findFunctions(sourceFile);
