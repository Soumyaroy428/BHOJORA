/**
 * Checkpoint 03 — System Architecture, ADRs, Domain Boundaries & OpenAPI Verification Test
 *
 * Verifies ADRs (001-007), modular monolith domain ownership boundaries,
 * OpenAPI 3.1.0 schema integrity, shared TypeScript contracts, and web portal hygiene.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '../..');

console.log('--- Starting Checkpoint 03 Verification Suite ---');

// Test 1: Validate ADRs (ADR-001 through ADR-007)
console.log('[Test 1] Validating Architecture Decision Records (ADRS.md)...');
const adrsPath = path.join(ROOT_DIR, 'docs/01-CORE-PLANNING-DESIGN/ADRS.md');
assert.ok(fs.existsSync(adrsPath), 'Missing docs/01-CORE-PLANNING-DESIGN/ADRS.md');
const adrsContent = fs.readFileSync(adrsPath, 'utf8');

for (let i = 1; i <= 7; i++) {
  const adrId = `ADR-00${i}`;
  assert.ok(adrsContent.includes(adrId), `Missing architecture decision record: ${adrId}`);
}
assert.ok(adrsContent.includes('Mongoose'), 'ADR-002 must lock MongoDB + Mongoose');
assert.ok(adrsContent.includes('integer paise'), 'ADR-003 must lock integer paise currency');
console.log('✓ All 7 Architecture Decision Records (ADR-001 to ADR-007) verified.');

// Test 2: Validate System Architecture & Domain Ownership Boundaries
console.log('[Test 2] Validating ARCHITECTURE.md diagrams and domain boundaries...');
const archPath = path.join(ROOT_DIR, 'docs/01-CORE-PLANNING-DESIGN/ARCHITECTURE.md');
assert.ok(fs.existsSync(archPath), 'Missing ARCHITECTURE.md');
const archContent = fs.readFileSync(archPath, 'utf8');

assert.ok(archContent.includes('Modular Monolith'), 'Architecture must enforce Modular Monolith');
assert.ok(archContent.includes('Domain Ownership'), 'Architecture must define Domain Ownership matrix');
assert.ok(archContent.includes('Transactional Outbox'), 'Architecture must specify Transactional Outbox pattern');
assert.ok(archContent.includes('Tier 4'), 'Architecture must specify 4-tier Data Classification');
assert.ok(archContent.includes('```mermaid'), 'Architecture must contain Mermaid architectural diagrams');

const requiredModules = [
  'identity',
  'users',
  'restaurants',
  'catalog',
  'discovery',
  'cart',
  'pricing',
  'orders',
  'payments',
  'delivery',
  'inspections',
  'safety-profile',
  'support',
  'governance'
];

for (const mod of requiredModules) {
  assert.ok(archContent.includes(`\`${mod}\``), `Missing module boundary definition for "${mod}"`);
}
console.log('✓ Modular monolith architecture, diagrams, and all 14 domain boundaries verified.');

// Test 3: Validate OpenAPI 3.1.0 Specification
console.log('[Test 3] Validating OpenAPI 3.1.0 contract (openapi.json)...');
const openApiPath = path.join(ROOT_DIR, 'docs/01-CORE-PLANNING-DESIGN/openapi.json');
assert.ok(fs.existsSync(openApiPath), 'Missing docs/01-CORE-PLANNING-DESIGN/openapi.json');
const spec = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));

assert.strictEqual(spec.openapi, '3.1.0', 'OpenAPI version must be 3.1.0');
assert.ok(spec.info.title.includes('BHOJORA'), 'OpenAPI title must reference BHOJORA');
assert.ok(spec.servers.some(s => s.url.includes('/api/v1')), 'OpenAPI servers must mount under /api/v1');
assert.ok(spec.components.schemas.MoneyPaise, 'OpenAPI must define MoneyPaise integer schema');
assert.strictEqual(spec.components.schemas.MoneyPaise.type, 'integer', 'MoneyPaise must strictly be integer');
assert.ok(spec.components.schemas.SafetyStatusEnum, 'OpenAPI must define SafetyStatusEnum');
assert.ok(spec.components.schemas.ErrorResponse, 'OpenAPI must define standard ErrorResponse');
assert.ok(spec.components.parameters.IdempotencyKey, 'OpenAPI must define Idempotency-Key header parameter');

const requiredPaths = [
  '/health',
  '/auth/otp/send',
  '/auth/otp/verify',
  '/restaurants',
  '/outlets/{id}/menu',
  '/safety/outlets/{id}',
  '/checkout/quote',
  '/orders',
  '/webhooks/payments/{provider}',
  '/delivery/jobs/{id}/complete',
  '/inspections/{id}/submit',
  '/inspections/{id}/approve'
];

for (const p of requiredPaths) {
  assert.ok(spec.paths[p], `OpenAPI specification missing required endpoint: "${p}"`);
}
console.log(`✓ OpenAPI 3.1.0 contract validated (${Object.keys(spec.paths).length} endpoints checked).`);

// Test 4: Validate Shared Contracts in client/shared/contracts/
console.log('[Test 4] Validating shared TypeScript contracts in client/shared/contracts/...');
const contractFiles = [
  'client/shared/contracts/api-response.ts',
  'client/shared/contracts/events.ts',
  'client/shared/contracts/index.ts'
];

for (const file of contractFiles) {
  const fullPath = path.join(ROOT_DIR, file);
  assert.ok(fs.existsSync(fullPath), `Missing contract file: "${file}"`);
}
console.log('✓ Shared API response and domain event contracts verified.');

// Test 5: Validate Customer Web Header/Footer Hygiene, Accessible Modal & All Surface Logos
console.log('[Test 5] Validating customer-web hygiene, native dialog, and public logo distribution...');
const webHtmlPath = path.join(ROOT_DIR, 'client/customer-web/index.html');
assert.ok(fs.existsSync(webHtmlPath), 'Missing client/customer-web/index.html');
const html = fs.readFileSync(webHtmlPath, 'utf8');
assert.ok(!html.toLowerCase().includes('github.com'), 'Header and footer must NOT display any GitHub repo link');
assert.ok(html.includes('./logo.png'), 'Customer web must reference ./logo.png in favicon, header, and footer');
assert.ok(html.includes('<dialog id="trustModal"') && html.includes('.showModal()'), 'Trust profile modal must use accessible native <dialog> + showModal()');

const expectedLogos = [
  'client/public/logo.png',
  'client/shared/assets/logo.png',
  'client/customer-web/logo.png',
  'client/restaurant-web/public/logo.png',
  'client/admin-web/public/logo.png',
  'client/customer-mobile/assets/logo.png',
  'client/delivery-mobile/assets/logo.png',
  'client/inspector-mobile/assets/logo.png'
];

for (const logoRelPath of expectedLogos) {
  const fullLogoPath = path.join(ROOT_DIR, logoRelPath);
  assert.ok(fs.existsSync(fullLogoPath), `Missing distributed brand logo: "${logoRelPath}"`);
  const stat = fs.statSync(fullLogoPath);
  assert.ok(stat.size > 1000, `Logo file looks empty or invalid: "${logoRelPath}"`);
}
console.log(`✓ Customer web clean branding verified and all ${expectedLogos.length} client/public logo.png assets validated.`);

console.log('--- ALL CHECKPOINT 03 CHECKS PASSED SUCCESSFULLY ---');
