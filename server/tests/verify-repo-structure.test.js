/**
 * Checkpoint 00 — Repository Structure & Integrity Verification Test
 *
 * Asserts all structural constraints, mandatory root directory boundaries,
 * complete documentation sets (15 core docs + 39 checkpoints), and zero
 * premature application dependencies.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '../..');

console.log('--- Starting Checkpoint 00 Verification Suite ---');

// Test 1: Root directory contains ONLY docs, client, server (and hidden VCS/CI folders: .git, .github)
console.log('[Test 1] Validating root directory structure...');
const allowedRootFolders = new Set(['docs', 'client', 'server']);
const ignoredVcsFolders = new Set(['.git', '.github', 'node_modules']);

const rootEntries = fs.readdirSync(ROOT_DIR, { withFileTypes: true });
const rootFolders = rootEntries
  .filter((e) => e.isDirectory() && !ignoredVcsFolders.has(e.name))
  .map((e) => e.name);

for (const folder of rootFolders) {
  assert.ok(
    allowedRootFolders.has(folder),
    `Violation: Extraneous root folder found: "${folder}". Only docs/, client/, and server/ are allowed.`,
  );
}

for (const expectedFolder of allowedRootFolders) {
  assert.ok(
    rootFolders.includes(expectedFolder),
    `Missing required root folder: "${expectedFolder}"`,
  );
}
console.log('✓ Root directory contains ONLY docs/, client/, and server/.');

// Test 2: Client application surfaces exist
console.log('[Test 2] Validating client application surfaces...');
const expectedClientSurfaces = [
  'customer-web',
  'restaurant-web',
  'admin-web',
  'customer-mobile',
  'delivery-mobile',
  'inspector-mobile',
  'shared',
];

for (const surface of expectedClientSurfaces) {
  const surfacePath = path.join(ROOT_DIR, 'client', surface);
  assert.ok(fs.existsSync(surfacePath), `Missing client surface directory: "client/${surface}"`);
  assert.ok(
    fs.statSync(surfacePath).isDirectory(),
    `Client surface "client/${surface}" must be a directory`,
  );
}
console.log(
  `✓ All ${expectedClientSurfaces.length} client application surfaces are properly scaffolded.`,
);

// Test 3: Server structure exists
console.log('[Test 3] Validating server directories...');
const expectedServerDirs = ['src/modules', 'src/config', 'src/middleware', 'tests'];

for (const dir of expectedServerDirs) {
  const dirPath = path.join(ROOT_DIR, 'server', dir);
  assert.ok(fs.existsSync(dirPath), `Missing server directory: "server/${dir}"`);
}
console.log('✓ Server directory architecture verified.');

// Test 4: All 15 core documents + BRAND.md exist
console.log('[Test 4] Validating core documentation catalogue...');
const coreDocs = [
  '01-CORE-PLANNING-DESIGN/BRAND.md',
  '01-CORE-PLANNING-DESIGN/PRD.md',
  '01-CORE-PLANNING-DESIGN/DESIGN.md',
  '01-CORE-PLANNING-DESIGN/ARCHITECTURE.md',
  '01-CORE-PLANNING-DESIGN/DATABASE.md',
  '01-CORE-PLANNING-DESIGN/API.md',
  '02-EXECUTION-AGENTS/AGENTS.md',
  '02-EXECUTION-AGENTS/README.md',
  '02-EXECUTION-AGENTS/PLAN.md',
  '02-EXECUTION-AGENTS/SETUP.md',
  '02-EXECUTION-AGENTS/FEATURES.md',
  '03-SECURITY-QUALITY/AUTH.md',
  '03-SECURITY-QUALITY/MCP.md',
  '03-SECURITY-QUALITY/INTEGRATIONS.md',
  '03-SECURITY-QUALITY/TESTING.md',
  '03-SECURITY-QUALITY/DEBUGGING.md',
  'INDEX.md',
];

for (const doc of coreDocs) {
  const docPath = path.join(ROOT_DIR, 'docs', doc);
  assert.ok(fs.existsSync(docPath), `Missing core document: "docs/${doc}"`);
  assert.ok(fs.statSync(docPath).size > 0, `Core document "docs/${doc}" cannot be empty`);
}
console.log(`✓ All ${coreDocs.length} core documents are intact and verified.`);

// Test 5: All 39 Checkpoint files exist (00 to 38 + INDEX)
console.log('[Test 5] Validating checkpoint files (00 to 38)...');
const checkpointIndexPath = path.join(ROOT_DIR, 'docs/CHECKPOINTS/CHECKPOINT_INDEX.md');
assert.ok(fs.existsSync(checkpointIndexPath), 'Missing CHECKPOINT_INDEX.md');

for (let i = 0; i <= 38; i++) {
  const numStr = String(i).padStart(2, '0');
  const cpFile = path.join(ROOT_DIR, 'docs/CHECKPOINTS', `CHECKPOINT_${numStr}.md`);
  assert.ok(fs.existsSync(cpFile), `Missing checkpoint file: "CHECKPOINT_${numStr}.md"`);
  assert.ok(
    fs.statSync(cpFile).size > 0,
    `Checkpoint file "CHECKPOINT_${numStr}.md" cannot be empty`,
  );
}
console.log('✓ All 39 sequential checkpoint specifications (00-38 + INDEX) verified.');

// Test 6: Dependency & Secret Discipline (zero premature runtime frameworks before CP05)
console.log('[Test 6] Checking dependency boundary & clean env hygiene...');
const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
assert.strictEqual(
  Object.keys(rootPkg.dependencies || {}).length,
  0,
  'Root workspace package.json must not carry runtime dependencies.',
);
assert.ok(
  !fs.existsSync(path.join(ROOT_DIR, '.env')),
  'Violation: .env file must never exist in tracked workspace baseline.',
);

const prematureRuntimeLibs = ['next', 'react', 'bullmq', 'ioredis', 'prisma'];
const serverPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'server/package.json'), 'utf8'));
const allServerDeps = { ...(serverPkg.dependencies || {}), ...(serverPkg.devDependencies || {}) };
for (const pkg of prematureRuntimeLibs) {
  assert.ok(
    !allServerDeps[pkg],
    `Violation: Premature runtime library "${pkg}" installed before its checkpoint.`,
  );
}
console.log('✓ Premature runtime framework guard (CP06+) and clean .env hygiene confirmed.');

console.log('--- ALL CHECKPOINT 00 CHECKS PASSED SUCCESSFULLY ---');
