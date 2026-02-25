const yaml = require('yaml');
const fs = require('fs');
const Ajv = require('ajv').default;

// Load schema
const schemaPath = '../corpus/schema/contract-schema.json';
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

// Load discord.js contract
const contractPath = '../corpus/packages/discord.js/contract.yaml.skip';
const contractContent = fs.readFileSync(contractPath, 'utf8');
const contract = yaml.parse(contractContent);

// Validate
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
const valid = validate(contract);

if (!valid) {
  console.log('❌ Validation errors found:');
  console.log('');
  validate.errors.forEach((err, i) => {
    console.log(`Error ${i + 1}:`);
    console.log(`  Path: ${err.instancePath || '(root)'}`);
    console.log(`  Message: ${err.message}`);
    if (err.params && Object.keys(err.params).length > 0) {
      console.log(`  Params: ${JSON.stringify(err.params, null, 2)}`);
    }
    console.log('');
  });
  process.exit(1);
} else {
  console.log('✅ Contract is valid!');
  console.log(`Package: ${contract.package}`);
  console.log(`Functions: ${contract.functions.length}`);
  console.log(`Detection patterns: ${contract.detection.await_patterns.length} await patterns`);
}
