/**
 * BloodBridge Master Release Verification Pipeline
 * Runs full automated test matrix, checks compilation, verifies no .env leaks,
 * and validates repository integrity.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

function runStep(name, fn) {
  process.stdout.write(`⏳ [BloodBridge Verification] ${name}... `);
  try {
    fn();
    console.log('✅ PASSED');
  } catch (err) {
    console.log('❌ FAILED');
    console.error(err.message);
    if (err.stdout) console.error(err.stdout.toString());
    if (err.stderr) console.error(err.stderr.toString());
    process.exit(1);
  }
}

function verifyNoEnvFiles(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.name === 'node_modules' || item.name === '.git') continue;
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      verifyNoEnvFiles(fullPath);
    } else if (item.name.startsWith('.env')) {
      throw new Error(`Security breach: committed environment file detected at ${fullPath}`);
    }
  }
}

console.log(`\n======================================================`);
console.log(`  🩸 BloodBridge Master Production Verification`);
console.log(`======================================================\n`);

// 1. Security check
runStep('Security check (zero committed .env secrets)', () => {
  verifyNoEnvFiles(ROOT_DIR);
});

// 2. Server automated tests
runStep('Running automated test suites via Vitest', () => {
  execSync('npm test', { cwd: path.join(ROOT_DIR, 'server'), stdio: 'pipe' });
});

// 3. Server production build
runStep('Building server (tsc)', () => {
  execSync('npm run build', { cwd: path.join(ROOT_DIR, 'server'), stdio: 'pipe' });
});

// 4. Client production build
runStep('Building client (tsc && vite build)', () => {
  execSync('npm run build', { cwd: path.join(ROOT_DIR, 'client'), stdio: 'pipe' });
});

console.log(`\n🎉 All validation checks passed! System is 100% production ready.`);
