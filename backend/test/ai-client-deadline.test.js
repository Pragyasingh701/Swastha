// Each AI attempt has its own timeout, but a call can make many attempts (every key, every model,
// two tries each). With the providers stalling or failing, the person waiting could be kept
// hanging for minutes. The whole call now has a deadline, after which it gives up the way it does
// when every provider failed (embeddings throw, everything else returns a degraded result).
// Only the network is replaced; the real client logic runs.
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase } from './helpers/fakeSupabase.js';

Object.assign(process.env, {
  SUPABASE_URL: 'https://test-project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  JWT_SECRET: 'test-jwt-secret-not-used-anywhere-else',
  ALLOW_OPENROUTER_FALLBACK: 'false',
  GEMINI_API_KEYS: 'test-key-1,test-key-2,test-key-3',
});
// The request log writes to the database after every call; give it a harmless one.
mock.module(new URL('../rag/config/supabase.js', import.meta.url).href, {
  namedExports: { supabase: createFakeSupabase().client },
});

const { runAI, __testing } = await import('../rag/config/aiClient.js');

const realFetch = global.fetch;
const realDeadlines = { ...__testing.DEADLINE_MS };
afterEach(() => {
  global.fetch = realFetch;
  Object.assign(__testing.DEADLINE_MS, realDeadlines);
});

const isGemini = (url) => String(url).includes('generativelanguage.googleapis.com');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A provider that never answers; it only stops when the client cuts the attempt short.
const stalls = () => (url, init) => {
  if (!isGemini(url)) return realFetch(url, init);
  return new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
};

test('a provider that stalls cannot keep the call waiting past its deadline', async () => {
  __testing.DEADLINE_MS['intake-dialogue'] = 400; // each attempt alone may take 12 s
  global.fetch = stalls();
  const started = Date.now();
  const result = await runAI({ task: 'intake-dialogue', input: 'hello', json: true, label: 'deadline-test' });
  const took = Date.now() - started;
  assert.equal(result.ok, false);
  assert.equal(result.degraded, true);
  assert.equal(result.error_code, 'DEADLINE_EXCEEDED');
  assert.ok(took < 1500, `gave up after ${took} ms`);
  assert.equal(result.attempts, 1, 'the one attempt used the whole time left');
});

test('providers that keep failing are not tried forever', async () => {
  __testing.DEADLINE_MS.generation = 400;
  let calls = 0;
  global.fetch = async (url, init) => {
    if (!isGemini(url)) return realFetch(url, init);
    calls += 1;
    await wait(60);
    return { ok: false, status: 503, text: async () => 'unavailable' };
  };
  const started = Date.now();
  const result = await runAI({ task: 'generation', input: 'hello', label: 'deadline-test' });
  const took = Date.now() - started;
  assert.equal(result.error_code, 'DEADLINE_EXCEEDED');
  assert.ok(took < 1500, `gave up after ${took} ms`);
  // 3 keys x 2 models x 2 tries = 12 attempts without a deadline.
  assert.ok(calls < 12, `${calls} attempts`);
});

test('an embedding that runs out of time throws, like any other embedding failure', async () => {
  __testing.DEADLINE_MS.embedding = 300;
  global.fetch = stalls();
  await assert.rejects(
    () => runAI({ task: 'embedding', input: 'some text', label: 'deadline-test' }),
    /DEADLINE_EXCEEDED/
  );
});

test('a call that every provider refuses still ends as "all providers exhausted", well inside the deadline', async () => {
  global.fetch = async (url, init) => {
    if (!isGemini(url)) return realFetch(url, init);
    return { ok: false, status: 404, text: async () => 'NOT_FOUND' };
  };
  const result = await runAI({ task: 'generation', input: 'hello', label: 'deadline-test' });
  assert.equal(result.error_code, 'ALL_PROVIDERS_EXHAUSTED');
});

test('a normal call is not affected by the deadline', async () => {
  global.fetch = async (url, init) => {
    if (!isGemini(url)) return realFetch(url, init);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: 'fine' }] }, finishReason: 'STOP' }] }),
    };
  };
  const result = await runAI({ task: 'generation', input: 'hello', label: 'deadline-test' });
  assert.equal(result.ok, true);
  assert.equal(result.text, 'fine');
});
