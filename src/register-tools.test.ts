import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerAllTools, type RegisterOptions } from './register-tools.js';
import { SERVER_VERSION } from './instructions.js';

/** Connects a client named `clientName` to a server with all tools, capturing outgoing API requests. */
async function connect(options: RegisterOptions, clientName = 'test-client') {
  const sent: Array<{ url: string; headers: Record<string, string> }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    sent.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) } });
    return new Response(
      JSON.stringify({ success: true, data: { used: 1 }, creditsUsed: 0, creditsAvailable: 10, traceId: 't' }),
      { headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  const server = new McpServer({ name: 'creatordb', version: SERVER_VERSION });
  registerAllTools(server, 'test-key', options);
  const client = new Client({ name: clientName, version: '9.8.7' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const close = async () => {
    globalThis.fetch = realFetch;
    await client.close();
  };
  return { client, sent, close };
}

const texts = (r: unknown) => ((r as { content: Array<{ text?: string }> }).content ?? []).map((c) => c.text ?? '');

test('API requests identify the server, transport and MCP client', async () => {
  const { client, sent, close } = await connect({ transport: 'stdio' }, 'Claude Desktop');
  try {
    await client.callTool({ name: 'get_api_usage', arguments: {} });
    assert.ok(sent.length >= 1);
    for (const req of sent) {
      assert.equal(req.headers['api-key'], 'test-key');
      assert.equal(req.headers['User-Agent'], `creatordb-mcp/${SERVER_VERSION} (stdio; client=Claude-Desktop/9.8.7)`);
    }
  } finally {
    await close();
  }
});

test('transport defaults to embedded', async () => {
  const { client, sent, close } = await connect({});
  try {
    await client.callTool({ name: 'get_api_usage', arguments: {} });
    assert.match(sent[0].headers['User-Agent'], /^creatordb-mcp\/\S+ \(embedded; client=test-client\/9\.8\.7\)$/);
  } finally {
    await close();
  }
});

test('a notice is added to one tool result only', async () => {
  let given = false;
  const notice = () => {
    if (given) return null;
    given = true;
    return 'A newer CreatorDB MCP (99.0.0) is available.';
  };
  const { client, close } = await connect({ transport: 'stdio', notice });
  try {
    const first = texts(await client.callTool({ name: 'get_api_usage', arguments: {} }));
    const second = texts(await client.callTool({ name: 'get_api_usage', arguments: {} }));
    assert.equal(first.at(-1), 'A newer CreatorDB MCP (99.0.0) is available.');
    assert.ok(!second.some((t) => t.includes('newer CreatorDB MCP')));
  } finally {
    await close();
  }
});

test('no notice option leaves tool results unchanged', async () => {
  const { client, close } = await connect({ transport: 'hosted' });
  try {
    const out = texts(await client.callTool({ name: 'get_api_usage', arguments: {} }));
    assert.ok(!out.some((t) => t.includes('newer CreatorDB MCP')));
  } finally {
    await close();
  }
});
