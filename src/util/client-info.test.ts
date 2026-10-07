/**
 * Tests for the headers that identify MCP traffic to the CreatorDB API. Node built-in test runner.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { clientHeaders, runInToolCall } from './client-info.js';

const here = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(here, '..', '..', 'package.json'), 'utf8'));

test('outside a tool call: package version, stdio, no tool header', () => {
  assert.deepEqual(clientHeaders(), { 'User-Agent': `creatordb-mcp/${version} (stdio)` });
});

test('inside a hosted tool call: transport, MCP client and tool are reported', () => {
  const headers = runInToolCall(
    { transport: 'hosted', tool: 'get_sponsor_creators', mcpClient: { name: 'claude-ai', version: '0.1.0' } },
    () => clientHeaders()
  );
  assert.deepEqual(headers, {
    'User-Agent': `creatordb-mcp/${version} (hosted; client=claude-ai/0.1.0)`,
    'X-CreatorDB-MCP-Tool': 'get_sponsor_creators',
  });
});

test('survives awaits inside the tool call', async () => {
  const headers = await runInToolCall({ transport: 'stdio', tool: 'search_youtube' }, async () => {
    await new Promise(resolve => setTimeout(resolve, 1));
    return clientHeaders();
  });
  assert.equal(headers['X-CreatorDB-MCP-Tool'], 'search_youtube');
  assert.equal(headers['User-Agent'], `creatordb-mcp/${version} (stdio)`);
});

test('client-supplied names are reduced to a safe token set and bounded', () => {
  const headers = runInToolCall(
    { transport: 'hosted', tool: 'x', mcpClient: { name: 'Evil Client\r\nX-Injected: 1', version: '1.0 (beta)' } },
    () => clientHeaders()
  );
  assert.equal(headers['User-Agent'], `creatordb-mcp/${version} (hosted; client=Evil-Client--X-Injected--1/1.0--beta-)`);
  assert.ok(!/[\r\n]/.test(headers['User-Agent']));
});
