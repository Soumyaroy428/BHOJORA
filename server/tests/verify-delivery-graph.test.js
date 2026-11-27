'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const unitTestPath = path.join(REPO_ROOT, 'client/customer-web/tests/deliveryGraph.test.mjs');

execFileSync(process.execPath, ['--experimental-strip-types', unitTestPath], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
});
