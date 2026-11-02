/**
 * Tests for the three content-search tools: they register, carry annotations, and accept the
 * launch request shape (timeRange, followers sort, offset default). Node built-in runner: `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerYoutubeTools } from './youtube.js';
import { registerInstagramTools } from './instagram.js';
import { registerTiktokTools } from './tiktok.js';
import { TOOL_ANNOTATIONS } from '../tool-annotations.js';

type Registered = { description: string; params: z.ZodRawShape };

function collectTools(): Map<string, Registered> {
  const tools = new Map<string, Registered>();
  const fake = {
    tool: (name: string, description: string, params: z.ZodRawShape) => {
      tools.set(name, { description, params });
    },
  } as unknown as McpServer;
  registerYoutubeTools(fake, 'test-key');
  registerInstagramTools(fake, 'test-key');
  registerTiktokTools(fake, 'test-key');
  return tools;
}

const CONTENT_TOOLS = ['search_youtube_content', 'search_instagram_content', 'search_tiktok_content'];

test('all three content-search tools register with annotations', () => {
  const tools = collectTools();
  for (const name of CONTENT_TOOLS) {
    assert.ok(tools.has(name), `${name} is registered`);
    assert.ok(TOOL_ANNOTATIONS[name], `${name} has annotations`);
  }
});

test('content-search tools accept timeRange, followers sort, and default offset to 0', () => {
  const tools = collectTools();
  for (const name of CONTENT_TOOLS) {
    const schema = z.object(tools.get(name)!.params);
    const parsed = schema.parse({
      filters: [{ filterName: 'hashtag', op: '=', value: '#skincare' }],
      timeRange: { from: 1792998000000 },
      sortBy: 'followers',
    });
    assert.equal(parsed.offset, 0);
    assert.deepEqual(parsed.timeRange, { from: 1792998000000 });
  }
});

test('content-search descriptions state the 30-day default and grid price, not a flat per-page price', () => {
  const tools = collectTools();
  for (const name of CONTENT_TOOLS) {
    const { description } = tools.get(name)!;
    assert.match(description, /last 30 days/);
    assert.match(description, /fixed grid/);
    assert.doesNotMatch(description, /per page/);
  }
});
