/**
 * BHOJORA — Automated Secret & Forbidden File Scanner
 * Used locally (`npm run security:secrets`), in CI, and in Checkpoint 04 verification tests.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
  '.vercel',
  '.playwright-mcp',
]);

const SKIP_DIR_PREFIXES = ['client/public/Elaborate Food Safety Solution_files'];

const FORBIDDEN_FILE_PATTERNS = [
  { name: 'Committed environment file', regex: /(^|\/)\.env(\.(?!example$).+)?$/i },
  { name: 'Private key or keystore binary', regex: /\.(pem|key|p12|pfx|jks|keystore)$/i },
];

const SECRET_PATTERNS = [
  {
    name: 'Private Key Material',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  {
    name: 'AWS Access Key ID',
    regex: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    name: 'GitHub Personal Access Token',
    regex: /\b(?:ghp|gho|ghu|ghs)_[A-Za-z0-9_]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  },
  {
    name: 'Razorpay / Stripe Live Key',
    regex: /\b(?:rzp_live|sk_live|rk_live)_[A-Za-z0-9]{14,}\b/,
  },
  {
    name: 'Google / Firebase API Key',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/,
  },
  {
    name: 'Connection URI with Embedded Credentials',
    regex: /\bmongodb(?:\+srv)?:\/\/[^/\s:@]+:[^/\s@]+@[^\s/]+/i,
  },
];

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.pdf',
  '.zip',
]);

function normalizeRel(filePath) {
  return filePath.split(path.sep).join('/');
}

function isAllowedTemplate(relPath) {
  return relPath === '.env.example' || relPath.endsWith('/.env.example');
}

function scanFilePath(relPath) {
  const normalized = normalizeRel(relPath);
  if (isAllowedTemplate(normalized)) {
    return [];
  }

  const findings = [];
  for (const rule of FORBIDDEN_FILE_PATTERNS) {
    if (rule.regex.test(normalized)) {
      findings.push({ file: normalized, rule: rule.name, line: 0 });
    }
  }
  return findings;
}

function scanContent(content, relPath) {
  const normalized = normalizeRel(relPath);
  if (isAllowedTemplate(normalized)) {
    return [];
  }

  const findings = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((lineText, idx) => {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.regex.test(lineText)) {
        findings.push({
          file: normalized,
          rule: pattern.name,
          line: idx + 1,
        });
      }
    }
  });

  return findings;
}

function walkFiles(dirPath, baseDir, collector) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(dirPath, entry.name);
    const relPath = normalizeRel(path.relative(baseDir, absPath));

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      if (SKIP_DIR_PREFIXES.some((prefix) => relPath.startsWith(prefix))) continue;
      walkFiles(absPath, baseDir, collector);
      continue;
    }

    collector.push({ absPath, relPath });
  }
}

function scanRepository(rootDir = ROOT_DIR) {
  const files = [];
  walkFiles(rootDir, rootDir, files);

  const findings = [];
  for (const { absPath, relPath } of files) {
    findings.push(...scanFilePath(relPath));

    const ext = path.extname(relPath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext) || relPath === 'package-lock.json') {
      continue;
    }

    const stat = fs.statSync(absPath);
    if (stat.size > 1024 * 1024) {
      continue;
    }

    const content = fs.readFileSync(absPath, 'utf8');
    findings.push(...scanContent(content, relPath));
  }

  return { scannedFiles: files.length, findings };
}

if (require.main === module) {
  const { scannedFiles, findings } = scanRepository(ROOT_DIR);
  if (findings.length > 0) {
    console.error(
      `[SECRET SCAN FAILED] Found ${findings.length} potential secret/file violation(s):`,
    );
    for (const f of findings) {
      console.error(` - ${f.file}:${f.line} [${f.rule}]`);
    }
    process.exit(1);
  }
  console.log(`✓ Secret & forbidden-file scan clean across ${scannedFiles} file(s).`);
}

module.exports = {
  scanContent,
  scanFilePath,
  scanRepository,
};
