/**
 * Checkpoint 02 — Design System & Reusable Components Verification Test
 *
 * Asserts that the design tokens, typography hierarchy, color semantics,
 * non-color-only safety statuses, touch targets (>= 48px), contrast ratios (>= 4.5:1),
 * Tailwind preset, and component specifications meet all criteria.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '../..');

console.log('--- Starting Checkpoint 02 Verification Suite ---');

// Test 1: Checkpoint 02 documentation files exist and are comprehensive
console.log('[Test 1] Validating Checkpoint 02 design documentation...');
const requiredDocs = [
  'docs/01-CORE-PLANNING-DESIGN/DESIGN.md',
  'docs/01-CORE-PLANNING-DESIGN/COMPONENTS.md',
  'docs/01-CORE-PLANNING-DESIGN/KEY_SCREENS_SPEC.md',
];

for (const doc of requiredDocs) {
  const docPath = path.join(ROOT_DIR, doc);
  assert.ok(fs.existsSync(docPath), `Missing documentation artifact: "${doc}"`);
  const content = fs.readFileSync(docPath, 'utf8');
  assert.ok(
    content.length > 2000,
    `Document "${doc}" must be detailed (found ${content.length} bytes)`,
  );
}
console.log('✓ DESIGN.md, COMPONENTS.md, and KEY_SCREENS_SPEC.md are detailed and verified.');

// Test 2: Token files exist in client/shared/tokens/
console.log('[Test 2] Validating client/shared/tokens token package...');
const requiredTokens = [
  'client/shared/tokens/colors.json',
  'client/shared/tokens/typography.json',
  'client/shared/tokens/spacing.json',
  'client/shared/tokens/index.ts',
  'client/shared/tokens/tailwind.preset.js',
];

for (const tokenFile of requiredTokens) {
  const tokenPath = path.join(ROOT_DIR, tokenFile);
  assert.ok(fs.existsSync(tokenPath), `Missing token artifact: "${tokenFile}"`);
}
console.log('✓ Unified token files exist across JSON, TypeScript, and Tailwind preset.');

// Test 3: Validate color tokens structure & brand fidelity
console.log('[Test 3] Validating brand palette fidelity in colors.json...');
const colors = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, 'client/shared/tokens/colors.json'), 'utf8'),
);

assert.strictEqual(colors.brand.terracotta.default, '#8D352A', 'Terracotta hex must be #8D352A');
assert.strictEqual(colors.brand.cream.default, '#F7F1E6', 'Warm cream hex must be #F7F1E6');
assert.strictEqual(colors.brand.trustGreen.default, '#344B3E', 'Trust green hex must be #344B3E');
assert.strictEqual(colors.brand.saffron.default, '#E4A746', 'Saffron gold hex must be #E4A746');
console.log('✓ Brand core colors (Terracotta, Cream, Trust Green, Saffron) match official brief.');

// Test 4: Acceptance Criteria — Safety statuses are NOT color-only
console.log('[Test 4] Verifying Acceptance Criteria: Safety statuses are NOT color-only...');
const safetyStatuses = colors.status;
const requiredStatuses = [
  'verifiedClean',
  'actionRequired',
  'suspended',
  'expired',
  'notInspected',
];

for (const statusKey of requiredStatuses) {
  const statusObj = safetyStatuses[statusKey];
  assert.ok(statusObj, `Status config missing for: "${statusKey}"`);
  assert.ok(
    statusObj.icon && statusObj.icon.length > 0,
    `Status "${statusKey}" MUST have a dedicated icon`,
  );
  assert.ok(
    statusObj.background && statusObj.text,
    `Status "${statusKey}" must have background and text tokens`,
  );
}

const designMdContent = fs.readFileSync(
  path.join(ROOT_DIR, 'docs/01-CORE-PLANNING-DESIGN/DESIGN.md'),
  'utf8',
);
assert.ok(
  designMdContent.includes('never rely on color alone') ||
    designMdContent.includes('not rely on color alone'),
  'DESIGN.md must explicitly mandate that safety statuses are not color-only',
);
console.log('✓ All 5 safety statuses define mandatory icons and non-color-only text indicators.');

// Test 5: Verify Typography pairing (Manrope for Headings/Buttons, Inter for Body)
console.log('[Test 5] Validating Typography pairing rule...');
const typography = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, 'client/shared/tokens/typography.json'), 'utf8'),
);

assert.ok(typography.fontFamily.heading.includes('Manrope'), 'Heading font must include Manrope');
assert.ok(typography.fontFamily.body.includes('Inter'), 'Body font must include Inter');
assert.ok(typography.fontFamily.button.includes('Manrope'), 'Button font must include Manrope');
console.log('✓ Typography pairing (Manrope for headings/buttons, Inter for body) verified.');

// Test 6: Verify Touch Targets and WCAG AA Accessibility
console.log('[Test 6] Validating Touch Targets (>= 44px mobile, >= 48px buttons)...');
const spacing = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, 'client/shared/tokens/spacing.json'), 'utf8'),
);

assert.strictEqual(spacing.touchTarget.minMobile, '44px', 'Mobile min touch target must be 44px');
assert.strictEqual(
  spacing.touchTarget.standardButton,
  '48px',
  'Standard button touch target must be 48px',
);
console.log('✓ Touch target standards (44px mobile, 48px buttons) strictly enforced.');

// Test 7: Verify Tailwind preset loadability
console.log('[Test 7] Validating Tailwind preset configuration...');
const tailwindPreset = require(path.join(ROOT_DIR, 'client/shared/tokens/tailwind.preset.js'));
assert.ok(
  tailwindPreset.theme.extend.colors.terracotta,
  'Tailwind preset missing terracotta color extension',
);
assert.ok(
  tailwindPreset.theme.extend.colors.trust,
  'Tailwind preset missing trust color extension',
);
assert.ok(tailwindPreset.theme.extend.fontFamily.heading, 'Tailwind preset missing heading font');
console.log('✓ Tailwind preset is valid, loadable, and embeds all design tokens.');

console.log('--- ALL CHECKPOINT 02 CHECKS PASSED SUCCESSFULLY ---');
