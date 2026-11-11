/**
 * Checkpoint 04 — CI, Developer Tooling & Secret Scanning Verification Test
 *
 * Verifies runtime/package-manager pins, CI workflows, Coding Standards & Contributing docs,
 * strict TypeScript / ESLint / Prettier configuration, and secret-scanner unit assertions.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { scanContent, scanFilePath, scanRepository } = require('./secret-scan');

const ROOT_DIR = path.resolve(__dirname, '../..');

console.log('--- Starting Checkpoint 04 Verification Suite ---');

// Test 1: Validate pinned runtime & package manager
console.log('[Test 1] Validating pinned Node.js LTS & npm configuration...');
const nvmrcPath = path.join(ROOT_DIR, '.nvmrc');
const nodeVerPath = path.join(ROOT_DIR, '.node-version');
const rootPkgPath = path.join(ROOT_DIR, 'package.json');

assert.ok(fs.existsSync(nvmrcPath), 'Missing .nvmrc');
assert.ok(fs.existsSync(nodeVerPath), 'Missing .node-version');
assert.ok(fs.existsSync(rootPkgPath), 'Missing root package.json');

const pinnedNode = fs.readFileSync(nvmrcPath, 'utf8').trim();
assert.ok(pinnedNode.startsWith('22.'), `Expected Node 22 LTS pin, got "${pinnedNode}"`);
assert.strictEqual(
  fs.readFileSync(nodeVerPath, 'utf8').trim(),
  pinnedNode,
  '.node-version must match .nvmrc',
);

const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
assert.strictEqual(rootPkg.private, true, 'Root workspace package.json must be private');
assert.ok(
  rootPkg.packageManager && rootPkg.packageManager.startsWith('npm@11.'),
  'packageManager must pin npm@11.x',
);
assert.ok(rootPkg.engines && rootPkg.engines.node, 'Root package.json must declare engines.node');

for (const scriptName of [
  'format',
  'format:check',
  'lint',
  'typecheck',
  'build',
  'test',
  'security:secrets',
  'ci',
]) {
  assert.ok(
    rootPkg.scripts && rootPkg.scripts[scriptName],
    `Missing required root script: "${scriptName}"`,
  );
}
console.log(
  `✓ Pinned runtime (${pinnedNode}) and packageManager (${rootPkg.packageManager}) verified.`,
);

// Test 2: Validate GitHub Actions CI workflows & tooling configs
console.log('[Test 2] Validating CI workflows, ESLint, Prettier, TypeScript, and .env.example...');
const requiredConfigFiles = [
  '.github/workflows/ci.yml',
  '.editorconfig',
  '.prettierrc.json',
  '.prettierignore',
  '.env.example',
  'eslint.config.mjs',
  'tsconfig.base.json',
  'client/shared/package.json',
  'client/shared/tsconfig.json',
  'server/package.json',
  'server/tsconfig.json',
  'server/src/index.ts',
];

for (const relFile of requiredConfigFiles) {
  assert.ok(fs.existsSync(path.join(ROOT_DIR, relFile)), `Missing tooling/CI file: "${relFile}"`);
}

const ciYml = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yml'), 'utf8');
for (const ciStep of [
  'npm ci',
  'npm run format:check',
  'npm run lint',
  'npm run typecheck',
  'npm run build',
  'npm test',
  'npm run security:secrets',
  'npm audit',
]) {
  assert.ok(ciYml.includes(ciStep), `CI workflow must run "${ciStep}"`);
}

const tsBase = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'tsconfig.base.json'), 'utf8'));
assert.strictEqual(
  tsBase.compilerOptions.strict,
  true,
  'tsconfig.base.json must enable strict: true',
);
assert.strictEqual(
  tsBase.compilerOptions.noUncheckedIndexedAccess,
  true,
  'tsconfig.base.json must enable noUncheckedIndexedAccess',
);
console.log('✓ CI workflow and strict formatter/linter/TypeScript configurations verified.');

// Test 3: Validate Coding Standards, Contributing Guide, and ADR-008
console.log('[Test 3] Validating Coding Standards, Contributing Guide, and ADR-008...');
const codingStandardsPath = path.join(ROOT_DIR, 'docs/02-EXECUTION-AGENTS/CODING_STANDARDS.md');
const contributingPath = path.join(ROOT_DIR, 'docs/02-EXECUTION-AGENTS/CONTRIBUTING.md');
const adrsPath = path.join(ROOT_DIR, 'docs/01-CORE-PLANNING-DESIGN/ADRS.md');

assert.ok(
  fs.existsSync(codingStandardsPath),
  'Missing docs/02-EXECUTION-AGENTS/CODING_STANDARDS.md',
);
assert.ok(fs.existsSync(contributingPath), 'Missing docs/02-EXECUTION-AGENTS/CONTRIBUTING.md');
assert.ok(fs.readFileSync(adrsPath, 'utf8').includes('ADR-008'), 'ADRS.md must document ADR-008');
console.log('✓ Coding standards, contribution guide, and ADR-008 verified.');

// Test 4: Unit-test Secret Scanner catches synthetic secrets cleanly without false positives
console.log('[Test 4] Running unit assertions on secret & forbidden-file scanner...');
assert.ok(scanFilePath('.env').length > 0, 'Scanner must flag committed .env files');
assert.ok(scanFilePath('config/prod.pem').length > 0, 'Scanner must flag .pem private key files');
assert.strictEqual(
  scanFilePath('.env.example').length,
  0,
  'Scanner must allow .env.example template',
);

const syntheticAws = 'key=' + 'AKIA' + 'IOSFODNN7EXAMPLE';
const syntheticPem = '-----BEGIN ' + 'RSA PRIVATE KEY' + '-----\nMIIE';
const syntheticMongo = 'uri=' + 'mongodb+srv://bhojora' + ':secretpass@cluster.example.net/db';
const syntheticRazorpay = 'k=' + 'rzp_live_' + '1234567890abcdef';

assert.ok(
  scanContent(syntheticAws, 'dummy.ts').length > 0,
  'Scanner must detect AWS access key patterns',
);
assert.ok(
  scanContent(syntheticPem, 'dummy.ts').length > 0,
  'Scanner must detect private key headers',
);
assert.ok(
  scanContent(syntheticMongo, 'dummy.ts').length > 0,
  'Scanner must detect MongoDB credentials in URI',
);
assert.ok(
  scanContent(syntheticRazorpay, 'dummy.ts').length > 0,
  'Scanner must detect live payment keys',
);
assert.strictEqual(
  scanContent('JWT_ACCESS_SECRET=replace-with-local-dev-access-secret', '.env.example').length,
  0,
);

const repoScan = scanRepository(ROOT_DIR);
assert.strictEqual(
  repoScan.findings.length,
  0,
  `Repository secret scan failed: ${JSON.stringify(repoScan.findings)}`,
);
console.log(
  `✓ Secret scanner unit tests passed and live repo scan clean (${repoScan.scannedFiles} files).`,
);

console.log('--- ALL CHECKPOINT 04 CHECKS PASSED SUCCESSFULLY ---');
