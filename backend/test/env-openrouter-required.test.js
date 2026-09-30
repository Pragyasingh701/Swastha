// Startup validation: OPENROUTER_API_KEY must be required only when
// ALLOW_OPENROUTER_FALLBACK === "true" — with the flag false (the
// default), a missing key must not fail startup, since runAI's OpenRouter
// branch can never run anyway (see aiClient.js's gate).
//
// Runs backend/rag/config/env.js in a real child process with a
// controlled environment, rather than importing it in-process: env.js
// calls process.exit(1) directly on a missing required var (not a thrown
// error), which would kill this test runner's own process if imported
// in-process with a deliberately-broken environment. A subprocess is the
// only way to observe that exit behavior safely.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const envJsPath = fileURLToPath(new URL('../rag/config/env.js', import.meta.url));
const repoRoot = path.resolve(path.dirname(envJsPath), '../../../');

// A minimal but complete environment satisfying every OTHER required var,
// so a failure can only come from the OPENROUTER_API_KEY logic under test,
// not an unrelated missing var. No real .env is loaded (NODE_OPTIONS/cwd
// point away from one implicitly) — this env object is the only source of
// truth for the child process.
function runEnvJs(extraEnv) {
  return spawnSync(process.execPath, [envJsPath], {
    cwd: repoRoot,
    env: {
      PATH: process.env.PATH, // needed to spawn node at all on most systems
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      JWT_SECRET: 'test-jwt-secret',
      GEMINI_API_KEY: 'test-gemini-key',
      ...extraEnv,
    },
    encoding: 'utf8',
    timeout: 10_000,
  });
}

test('startup validation passes without OPENROUTER_API_KEY when ALLOW_OPENROUTER_FALLBACK is false', () => {
  const result = runEnvJs({ ALLOW_OPENROUTER_FALLBACK: 'false', OPENROUTER_API_KEY: '' });
  assert.equal(result.status, 0, `expected clean exit, got status ${result.status}, stderr: ${result.stderr}`);
  assert.ok(!result.stderr.includes('OPENROUTER_API_KEY'), 'stderr must not mention OPENROUTER_API_KEY as missing');
});

test('startup validation ALSO passes without OPENROUTER_API_KEY when the flag is entirely unset (default false)', () => {
  const result = runEnvJs({ OPENROUTER_API_KEY: '' });
  assert.equal(result.status, 0, `expected clean exit, got status ${result.status}, stderr: ${result.stderr}`);
  assert.ok(!result.stderr.includes('OPENROUTER_API_KEY'));
});

test('startup validation FAILS without OPENROUTER_API_KEY when ALLOW_OPENROUTER_FALLBACK is true', () => {
  const result = runEnvJs({ ALLOW_OPENROUTER_FALLBACK: 'true', OPENROUTER_API_KEY: '' });
  assert.equal(result.status, 1, 'expected startup to fail when the flag opts into OpenRouter but no key is configured');
  assert.match(result.stderr, /OPENROUTER_API_KEY/);
});

test('startup validation passes with OPENROUTER_API_KEY present and the flag true', () => {
  const result = runEnvJs({ ALLOW_OPENROUTER_FALLBACK: 'true', OPENROUTER_API_KEY: 'test-openrouter-key' });
  assert.equal(result.status, 0, `expected clean exit, got status ${result.status}, stderr: ${result.stderr}`);
});
