import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSearchTools } from './tools/search.js';
import { registerYoutubeTools } from './tools/youtube.js';
import { registerInstagramTools } from './tools/instagram.js';
import { registerTiktokTools } from './tools/tiktok.js';
import { registerSponsorTools } from './tools/sponsors.js';
import { registerAccountTools } from './tools/account.js';
import { TOOL_ANNOTATIONS } from './tool-annotations.js';

type ToolFn = McpServer['tool'];

/**
 * Wrap `server.tool` so every registration is enriched with the behavior
 * annotations for its name from TOOL_ANNOTATIONS — keeping annotations in one
 * place instead of scattered across 45 call sites. Every tool here is
 * registered as `tool(name, description, paramsSchema, handler)`, so we insert
 * the annotations object before the handler (the last arg), producing the
 * unambiguous `tool(name, description, paramsSchema, annotations, cb)` overload.
 * A tool with no annotation entry is logged (drift guard) and registered as-is.
 */
function withToolAnnotations(server: McpServer): void {
  const original = server.tool.bind(server) as ToolFn;
  const wrapped = ((name: string, ...rest: unknown[]) => {
    const annotations = TOOL_ANNOTATIONS[name];
    const call = original as (...args: unknown[]) => ReturnType<ToolFn>;
    if (!annotations) {
      console.error(`[creatordb-mcp] no annotations registered for tool "${name}"`);
      return call(name, ...rest);
    }
    const handler = rest[rest.length - 1];
    const head = rest.slice(0, -1); // [description, paramsSchema]
    return call(name, ...head, annotations, handler);
  }) as unknown as ToolFn;
  server.tool = wrapped;
}

/**
 * Register every CreatorDB MCP tool on the given server instance, bound to the
 * given V3 API key. Used by both the stdio entry (one key for the lifetime of
 * the process) and the HTTP entry (a fresh server + key per request).
 */
export function registerAllTools(server: McpServer, apiKey: string): void {
  withToolAnnotations(server);
  registerSearchTools(server, apiKey);
  registerYoutubeTools(server, apiKey);
  registerInstagramTools(server, apiKey);
  registerTiktokTools(server, apiKey);
  registerSponsorTools(server, apiKey);
  registerAccountTools(server, apiKey);
}
