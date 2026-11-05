// Runs the Node test suites of every KIRO repository in the workspace and saves the counts to artifacts/unit.json.
// A repository that is not checked out next to this one is reported as "not checked out", never as passed.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { QA as qa, WORKSPACE as repo } from './workspace.mjs';

const PROJECTS = [
  { dir: 'kiro-backend/api', name: 'Core API (Express + PostgreSQL)', install: true, note: 'real-PostgreSQL and HTTP API tests run when TEST_DATABASE_URL (Neon "qa" branch) is set, else they skip' },
  { dir: 'kiro-payments/service/node', name: 'KIRO PAY service (payments disabled)', install: true },
  { dir: 'kiro-database', name: 'Database migrations', install: true },
  { dir: 'kiro-mobile', name: 'Admin app logic (Expo)' },
  { dir: 'kiro-backend/ai-relay', name: 'AI relay (Cloudflare Worker)' },
  { dir: 'kiro-backend/packages/erp-validator', name: 'ERP validator' },
];

// qa/.env (git-ignored) may hold TEST_DATABASE_URL: the Neon "qa" branch. With it, the server's
// real-PostgreSQL and HTTP API tests run instead of being skipped. CI passes it as a secret.
const envFile = path.join(qa, '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
console.log(process.env.TEST_DATABASE_URL ? '(real-PostgreSQL tests: on, using TEST_DATABASE_URL)' : '(real-PostgreSQL tests: skipped, TEST_DATABASE_URL not set)');

const results = [];
for (const p of PROJECTS) {
  if (!fs.existsSync(path.join(repo, p.dir))) { results.push({ ...p, status: 'not-tested', reason: 'repository not checked out next to kiro-qa-testing' }); console.log(`- ${p.dir}: NOT CHECKED OUT`); continue; }
  const testDir = path.join(repo, p.dir, 'test');
  const files = fs.existsSync(testDir) ? fs.readdirSync(testDir).filter((f) => f.endsWith('.test.js')).map((f) => path.join(testDir, f)) : [];
  if (!files.length) { results.push({ ...p, status: 'not-tested', reason: 'no test files in test/' }); console.log(`- ${p.dir}: NO TESTS`); continue; }
  if (p.install && !fs.existsSync(path.join(repo, p.dir, 'node_modules'))) {
    spawnSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: path.join(repo, p.dir), stdio: 'inherit', shell: true });
  }
  // One file at a time: the database tests share one test database.
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=spec', ...files], { cwd: path.join(repo, p.dir), encoding: 'utf8', env: process.env });
  const out = (r.stdout || '') + (r.stderr || '');
  const num = (k) => Number((out.match(new RegExp(`ℹ ${k} (\\d+)`)) || [, 0])[1]);
  const failures = out.split('\n').filter((l) => /^\s*✖/.test(l) && !/failing tests/.test(l)).map((l) => l.trim()).slice(0, 20);
  const res = { ...p, tests: num('tests'), pass: num('pass'), fail: num('fail'), skipped: num('skipped'), status: r.status === 0 ? 'passed' : 'failed', failures };
  results.push(res);
  console.log(`- ${p.dir}: ${res.pass}/${res.tests} passed, ${res.fail} failed, ${res.skipped} skipped`);
}
fs.mkdirSync(path.join(qa, 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(qa, 'artifacts/unit.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 1));
process.exit(results.some((r) => r.status === 'failed') ? 1 : 0);
