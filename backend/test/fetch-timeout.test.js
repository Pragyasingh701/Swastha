// fetchWithTimeout gives up on a server that never answers, so a stuck provider cannot
// hang the request that called it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fetchWithTimeout } from '../utils/fetchWithTimeout.js';

const hung = http.createServer(() => { /* never answers */ });
const ok = http.createServer((req, res) => res.end('hello'));
await new Promise((r) => hung.listen(0, r));
await new Promise((r) => ok.listen(0, r));
after(() => { hung.closeAllConnections?.(); hung.close(); ok.close(); });

test('a server that never answers is given up on', async () => {
  const started = Date.now();
  await assert.rejects(
    fetchWithTimeout(`http://localhost:${hung.address().port}/`, {}, 150),
    (err) => err.name === 'TimeoutError',
  );
  assert.ok(Date.now() - started < 2000);
});

test('a normal answer comes through, and the caller can still cancel', async () => {
  const res = await fetchWithTimeout(`http://localhost:${ok.address().port}/`, {}, 2000);
  assert.equal(await res.text(), 'hello');

  const controller = new AbortController();
  const pending = fetchWithTimeout(`http://localhost:${hung.address().port}/`, { signal: controller.signal }, 5000);
  controller.abort();
  await assert.rejects(pending, (err) => err.name === 'AbortError');
});
