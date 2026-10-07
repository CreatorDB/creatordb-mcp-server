import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSearchTools } from './tools/search.js';
import { registerYoutubeTools } from './tools/youtube.js';
import { registerInstagramTools } from './tools/instagram.js';
import { registerTiktokTools } from './tools/tiktok.js';
import { registerSponsorTools } from './tools/sponsors.js';
import { registerAccountTools } from './tools/account.js';
import { registerResources } from './resources.js';
import { TOOL_ANNOTATIONS } from './tool-annotations.js';
import { runInToolCall, type ClientTransport } from './util/client-info.js';

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
function withToolAnnotations(server: McpServer, transport: ClientTransport): void {
  const original = server.tool.bind(server) as ToolFn;
  const wrapped = ((name: string, ...rest: unknown[]) => {
    const annotations = TOOL_ANNOTATIONS[name];
    const call = original as (...args: unknown[]) => ReturnType<ToolFn>;
    const handler = withToolCallContext(server, transport, name, rest[rest.length - 1]);
    const head = rest.slice(0, -1); // [description, paramsSchema]
    if (!annotations) {
      console.error(`[creatordb-mcp] no annotations registered for tool "${name}"`);
      return call(name, ...head, handler);
    }
    return call(name, ...head, annotations, handler);
  }) as unknown as ToolFn;
  server.tool = wrapped;
}

/**
 * Run a tool's handler with its call context (transport, tool name, the MCP client from the
 * `initialize` handshake) visible to the API client, which reports it in the User-Agent and
 * X-CreatorDB-MCP-Tool headers. The client is read when the call runs, not at registration —
 * the handshake has not happened yet when tools are registered.
 */
function withToolCallContext(server: McpServer, transport: ClientTransport, tool: string, handler: unknown): unknown {
  if (typeof handler !== 'function') {
    return handler;
  }
  return (...args: unknown[]) =>
    runInToolCall({ transport, tool, mcpClient: server.server.getClientVersion() }, () => handler(...args));
}

/** Options for registerAllTools */
export interface RegisterToolsOptions {
  /** How this server is reached: the local npm package (default) or the hosted connector */
  transport?: ClientTransport;
}

/**
 * Register every CreatorDB MCP tool on the given server instance, bound to the
 * given V3 API key. Used by both the stdio entry (one key for the lifetime of
 * the process) and the HTTP entry (a fresh server + key per request), which
 * passes `transport: 'hosted'` so its traffic is distinguishable in V3 usage.
 */
export function registerAllTools(server: McpServer, apiKey: string, options: RegisterToolsOptions = {}): void {
  withToolAnnotations(server, options.transport ?? 'stdio');
  registerSearchTools(server, apiKey);
  registerYoutubeTools(server, apiKey);
  registerInstagramTools(server, apiKey);
  registerTiktokTools(server, apiKey);
  registerSponsorTools(server, apiKey);
  registerAccountTools(server, apiKey);
  // Read-only reference resources (no key, 0 credits). Both the stdio package
  // and the remote connector reach resources through this one call site.
  registerResources(server);
}
