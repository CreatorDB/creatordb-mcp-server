import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSearchTools } from './tools/search.js';
import { registerYoutubeTools } from './tools/youtube.js';
import { registerInstagramTools } from './tools/instagram.js';
import { registerTiktokTools } from './tools/tiktok.js';
import { registerSponsorTools } from './tools/sponsors.js';
import { registerAccountTools } from './tools/account.js';
import { registerResources } from './resources.js';
import { TOOL_ANNOTATIONS } from './tool-annotations.js';
import { buildUserAgent, type ApiCaller, type Transport } from './util/client-id.js';

export { SERVER_INSTRUCTIONS } from './instructions.js';
export type { Transport } from './util/client-id.js';

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
type ToolResult = { content?: Array<{ type: string; text?: string }> } & Record<string, unknown>;

/**
 * Wrap `server.tool` so every registration is enriched with the behavior
 * annotations for its name from TOOL_ANNOTATIONS — keeping annotations in one
 * place instead of scattered across 45 call sites. Every tool here is
 * registered as `tool(name, description, paramsSchema, handler)`, so we insert
 * the annotations object before the handler (the last arg), producing the
 * unambiguous `tool(name, description, paramsSchema, annotations, cb)` overload.
 * A tool with no annotation entry is logged (drift guard) and registered as-is.
 * When `notice` is given, the text it returns (at most once) is added to that tool result.
 */
function withToolAnnotations(server: McpServer, notice?: () => string | null): void {
  const original = server.tool.bind(server) as ToolFn;
  const wrapped = ((name: string, ...rest: unknown[]) => {
    const annotations = TOOL_ANNOTATIONS[name];
    const call = original as (...args: unknown[]) => ReturnType<ToolFn>;
    const inner = rest[rest.length - 1] as (...a: unknown[]) => Promise<ToolResult>;
    const handler = notice
      ? async (...a: unknown[]) => {
          const result = await inner(...a);
          const text = notice();
          if (text && Array.isArray(result?.content)) {
            return { ...result, content: [...result.content, { type: 'text' as const, text }] };
          }
          return result;
        }
      : inner;
    const head = rest.slice(0, -1); // [description, paramsSchema]
    if (!annotations) {
      console.error(`[creatordb-mcp] no annotations registered for tool "${name}"`);
      return call(name, ...head, handler);
    }
    return call(name, ...head, annotations, handler);
  }) as unknown as ToolFn;
  server.tool = wrapped;
}

export interface RegisterOptions {
  /** How this server is run; sent to the API in the User-Agent. Defaults to `embedded`. */
  transport?: Transport;
  /** Text to add to one tool result, once (e.g. an update notice). Return null when there is nothing to add. */
  notice?: () => string | null;
}

/**
 * Register every CreatorDB MCP tool on the given server instance, bound to the
 * given V3 API key. Used by both the stdio entry (one key for the lifetime of
 * the process) and the HTTP entry (a fresh server + key per request).
 * `options.transport` labels API requests; `options.notice` adds a one-time line to a tool result.
 */
export function registerAllTools(server: McpServer, key: string, options: RegisterOptions = {}): void {
  const transport = options.transport ?? 'embedded';
  // The client's name and version arrive with its initialize request, after registration, so the
  // User-Agent is built per request.
  const apiKey: ApiCaller = {
    apiKey: key,
    userAgent: () => buildUserAgent(transport, server.server.getClientVersion()),
  };
  withToolAnnotations(server, options.notice);
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
