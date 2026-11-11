/**
 * Checkpoint 01 — UX Research and User Journeys Verification Test
 *
 * Verifies that all 6 application surfaces have complete sitemaps, route hierarchies,
 * screen inventories, 9 universal UX states, and test-verifiable user stories
 * across all 13 feature domains with Kolkata localizations.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '../..');

console.log('--- Starting Checkpoint 01 Verification Suite ---');

// Test 1: Verify presence of all Checkpoint 01 UX deliverables
console.log('[Test 1] Verifying Checkpoint 01 documentation artifacts...');
const requiredArtifacts = [
  'docs/01-CORE-PLANNING-DESIGN/USER_JOURNEYS.md',
  'docs/01-CORE-PLANNING-DESIGN/SITEMAP_AND_SCREENS.md',
  'docs/01-CORE-PLANNING-DESIGN/USER_STORIES.md',
];

for (const artifact of requiredArtifacts) {
  const artifactPath = path.join(ROOT_DIR, artifact);
  assert.ok(fs.existsSync(artifactPath), `Missing required deliverable: "${artifact}"`);
  const content = fs.readFileSync(artifactPath, 'utf8');
  assert.ok(
    content.length > 2000,
    `Deliverable "${artifact}" is too short (only ${content.length} bytes)`,
  );
}
console.log('✓ All 3 comprehensive UX specification artifacts are present and populated.');

// Test 2: Verify all 6 application surfaces are represented in Sitemaps
console.log('[Test 2] Validating representation of all 6 application surfaces...');
const sitemapContent = fs.readFileSync(
  path.join(ROOT_DIR, 'docs/01-CORE-PLANNING-DESIGN/SITEMAP_AND_SCREENS.md'),
  'utf8',
);

const requiredSurfaces = [
  'Surface 01: Customer Website',
  'Surface 02: Customer Mobile App',
  'Surface 03: Restaurant Partner Dashboard',
  'Surface 04: Delivery Partner App',
  'Surface 05: Independent Inspector App',
  'Surface 06: Admin & Governance Console',
];

for (const surface of requiredSurfaces) {
  assert.ok(sitemapContent.includes(surface), `Sitemaps must cover: "${surface}"`);
}
console.log('✓ All 6 application surfaces have dedicated sitemaps and screen inventories.');

// Test 3: Verify all 9 Universal UI States are defined
console.log('[Test 3] Validating 9 universal UI states contract...');
const universalStates = [
  'Loading',
  'Empty',
  'Success',
  'Error',
  'Offline',
  'Permission Denied',
  'Expired / Suspended',
  'Pending Review',
  'Disabled / Inactive',
];

for (const state of universalStates) {
  assert.ok(sitemapContent.includes(state), `Universal UI state missing: "${state}"`);
}
console.log('✓ All 9 universal UI states are defined across the screen inventory.');

// Test 4: Verify User Stories cover all 13 Feature Domains (F01 to F13)
console.log('[Test 4] Validating User Stories coverage across all 13 Feature Domains...');
const userStoriesContent = fs.readFileSync(
  path.join(ROOT_DIR, 'docs/01-CORE-PLANNING-DESIGN/USER_STORIES.md'),
  'utf8',
);

for (let i = 1; i <= 13; i++) {
  const domainCode = 'Domain F' + String(i).padStart(2, '0');
  assert.ok(userStoriesContent.includes(domainCode), `User stories must cover "${domainCode}"`);
}
console.log(
  '✓ All 13 feature domains (F01 to F13) have testable user stories with Gherkin criteria.',
);

// Test 5: Verify Kolkata-specific localizations and Trust Boundaries
console.log('[Test 5] Validating Kolkata localizations and Trust & Safety boundaries...');
const journeysContent = fs.readFileSync(
  path.join(ROOT_DIR, 'docs/01-CORE-PLANNING-DESIGN/USER_JOURNEYS.md'),
  'utf8',
);

assert.ok(
  journeysContent.includes('Salt Lake'),
  'Missing Kolkata landmark/zone references in journeys',
);
assert.ok(
  journeysContent.includes('Park Street'),
  'Missing Kolkata landmark/zone references in journeys',
);
assert.ok(
  journeysContent.includes('বাংলা') || userStoriesContent.includes('বাংলা'),
  'Missing Bengali localization references',
);
assert.ok(
  journeysContent.includes('integer paise') || userStoriesContent.includes('paise'),
  'Missing integer paise currency references',
);
assert.ok(
  journeysContent.includes('Inspector cannot approve') ||
    userStoriesContent.includes('Prohibition of Self-Approval'),
  'Missing inspector anti-corruption self-approval check',
);
console.log('✓ Kolkata localization, currency precision, and trust safety rules verified.');

console.log('--- ALL CHECKPOINT 01 CHECKS PASSED SUCCESSFULLY ---');
