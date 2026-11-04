import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authHeaders,
  buildUserAgent,
  checkForUpdate,
  isNewerVersion,
  oneTimeNotice,
  sanitizeToken,
  updateNotice,
} from './client-id.js';
import { SERVER_VERSION } from '../instructions.js';

// ── User-Agent ────────────────────────────────────────────────────────────────

test('user agent names version, transport and client', () => {
  assert.equal(
    buildUserAgent('stdio', { name: 'claude-ai', version: '0.1.0' }, '1.2.3'),
    'creatordb-mcp/1.2.3 (stdio; client=claude-ai/0.1.0)',
  );
});

test('user agent leaves out client= when the client did not identify itself', () => {
  assert.equal(buildUserAgent('hosted', undefined, '1.2.3'), 'creatordb-mcp/1.2.3 (hosted)');
  assert.equal(buildUserAgent('hosted', { name: '' }, '1.2.3'), 'creatordb-mcp/1.2.3 (hosted)');
});

test('user agent keeps a client without a version', () => {
  assert.equal(buildUserAgent('stdio', { name: 'cursor' }, '1.2.3'), 'creatordb-mcp/1.2.3 (stdio; client=cursor)');
});

test('user agent uses the package version by default', () => {
  assert.match(buildUserAgent('embedded'), new RegExp(`^creatordb-mcp/${SERVER_VERSION.replace(/\./g, '\\.')} \\(embedded\\)$`));
  assert.match(SERVER_VERSION, /^\d+\.\d+\.\d+/);
});

test('client names are made ASCII-safe and capped', () => {
  assert.equal(sanitizeToken('My Client (beta)'), 'My-Client-beta');
  assert.equal(sanitizeToken('Clïent; x=1, "q"'), 'Client-x-1-q');
  assert.equal(sanitizeToken('日本語'), '');
  assert.equal(sanitizeToken('a'.repeat(200)).length, 64);
  const ua = buildUserAgent('stdio', { name: 'Ünïcode Client\r\nX-Injected: 1', version: '2.0 beta' }, '1.0.0');
  assert.equal(ua, 'creatordb-mcp/1.0.0 (stdio; client=Unicode-Client-X-Injected-1/2.0-beta)');
  assert.match(ua, /^[\x20-\x7e]+$/);
});

test('auth headers carry the key and the user agent', () => {
  const h = authHeaders({ apiKey: 'k', userAgent: () => 'creatordb-mcp/1.0.0 (stdio)' });
  assert.deepEqual(h, { 'api-key': 'k', 'User-Agent': 'creatordb-mcp/1.0.0 (stdio)' });
  const plain = authHeaders('k2');
  assert.equal(plain['api-key'], 'k2');
  assert.match(plain['User-Agent'], /^creatordb-mcp\/\S+ \(embedded\)$/);
});

// ── Update notice ─────────────────────────────────────────────────────────────

test('version comparison', () => {
  assert.equal(isNewerVersion('1.12.4', '1.12.3'), true);
  assert.equal(isNewerVersion('1.13.0', '1.12.9'), true);
  assert.equal(isNewerVersion('2.0.0', '1.99.99'), true);
  assert.equal(isNewerVersion('1.12.3', '1.12.3'), false);
  assert.equal(isNewerVersion('1.12.2', '1.12.3'), false);
  assert.equal(isNewerVersion('1.12.10', '1.12.9'), true);
  assert.equal(isNewerVersion('v1.12.4', '1.12.3'), true);
  assert.equal(isNewerVersion('1.12.4-beta.1', '1.12.4'), false);
});

const registry = (version: unknown, ok = true) => async () => ({ ok, json: async () => ({ version }) });

test('notice when the registry has a newer version', async () => {
  assert.equal(await checkForUpdate('1.12.3', { env: {}, fetcher: registry('1.13.0') }), updateNotice('1.13.0'));
  assert.match(updateNotice('1.13.0'), /1\.13\.0.*@creatordbai\/mcp-server@latest/);
});

test('no notice when running the latest or a newer version', async () => {
  assert.equal(await checkForUpdate('1.12.3', { env: {}, fetcher: registry('1.12.3') }), null);
  assert.equal(await checkForUpdate('1.13.0', { env: {}, fetcher: registry('1.12.3') }), null);
});

test('no notice when the registry fails, times out or answers oddly', async () => {
  const throws = async () => {
    throw new Error('offline');
  };
  assert.equal(await checkForUpdate('1.0.0', { env: {}, fetcher: throws }), null);
  assert.equal(await checkForUpdate('1.0.0', { env: {}, fetcher: registry('9.9.9', false) }), null);
  assert.equal(await checkForUpdate('1.0.0', { env: {}, fetcher: registry(undefined) }), null);
  const hangs = (_url: string, init: { signal: AbortSignal }) =>
    new Promise<never>((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  assert.equal(await checkForUpdate('1.0.0', { env: {}, fetcher: hangs, timeoutMs: 20 }), null);
});

test('the opt-out skips the lookup', async () => {
  let called = false;
  const spy = async () => {
    called = true;
    return { ok: true, json: async () => ({ version: '9.9.9' }) };
  };
  assert.equal(await checkForUpdate('1.0.0', { env: { CREATORDB_MCP_NO_UPDATE_CHECK: '1' }, fetcher: spy }), null);
  assert.equal(called, false);
  assert.equal(await checkForUpdate('1.0.0', { env: { CREATORDB_MCP_NO_UPDATE_CHECK: '0' }, fetcher: spy }), updateNotice('9.9.9'));
});

test('the notice is handed out once, and only after the lookup finishes', async () => {
  let resolve!: (v: string | null) => void;
  const next = oneTimeNotice(new Promise((r) => (resolve = r)));
  assert.equal(next(), null); // lookup still running: nothing yet, and the notice is not used up
  resolve('newer');
  await new Promise((r) => setImmediate(r));
  assert.equal(next(), 'newer');
  assert.equal(next(), null);
});

test('a failed lookup never produces a notice', async () => {
  const next = oneTimeNotice(Promise.reject(new Error('x')));
  await new Promise((r) => setImmediate(r));
  assert.equal(next(), null);
});
