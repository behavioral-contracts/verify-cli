const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

// Load ws contract
const contractPath = path.join(__dirname, '../corpus/packages/ws/contract.yaml');
const contractText = fs.readFileSync(contractPath, 'utf8');
const contract = yaml.parse(contractText);

console.log('WS Contract loaded:');
console.log('- package:', contract.package);
console.log('- status:', contract.status);
console.log('- detection:', contract.detection);
console.log('- class_names:', contract.detection?.class_names);
console.log('- required_event_listeners:', contract.detection?.required_event_listeners);

// Load test file
const testFilePath = path.join(__dirname, 'tests/fixtures/event-listener-test/module-level-test.ts');
const sourceText = fs.readFileSync(testFilePath, 'utf8');

console.log('\n\nTest file content:');
console.log(sourceText);

// Parse with TypeScript
const sourceFile = ts.createSourceFile(
  testFilePath,
  sourceText,
  ts.ScriptTarget.Latest,
  true
);

console.log('\n\nAST nodes:');

function visit(node, depth = 0) {
  const indent = '  '.repeat(depth);
  const kindName = ts.SyntaxKind[node.kind];

  if (ts.isVariableDeclaration(node)) {
    const varName = node.name.getText(sourceFile);
    console.log(`${indent}VariableDeclaration: ${varName}`);
    if (node.initializer) {
      console.log(`${indent}  initializer kind: ${ts.SyntaxKind[node.initializer.kind]}`);
      if (ts.isNewExpression(node.initializer)) {
        const className = node.initializer.expression.getText(sourceFile);
        console.log(`${indent}  NEW EXPRESSION: ${className}`);
      }
      if (ts.isCallExpression(node.initializer)) {
        const funcName = node.initializer.expression.getText(sourceFile);
        console.log(`${indent}  CALL EXPRESSION: ${funcName}`);
      }
    }
  }

  if (ts.isFunctionDeclaration(node)) {
    const funcName = node.name ? node.name.getText(sourceFile) : '(anonymous)';
    console.log(`${indent}FunctionDeclaration: ${funcName}`);
  }

  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const objName = node.expression.expression.getText(sourceFile);
    const methodName = node.expression.name.getText(sourceFile);
    if (methodName === 'on') {
      const args = node.arguments.map(arg => arg.getText(sourceFile)).join(', ');
      console.log(`${indent}EVENT LISTENER: ${objName}.on(${args})`);
    }
  }

  ts.forEachChild(node, child => visit(child, depth + 1));
}

visit(sourceFile);
