import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Identifies this MCP server to the CreatorDB API on every request, so V3 can tell MCP traffic
 * apart from direct API calls and from each other:
 *
 *   User-Agent: creatordb-mcp/<package version> (<transport>; client=<mcp client>/<version>)
 *   X-CreatorDB-MCP-Tool: <tool name>
 *
 * `transport` is `stdio` for the npm package run locally and `hosted` for the remote connector.
 * The MCP client (e.g. Claude, Cursor) is whatever the connected client reported in its
 * `initialize` handshake; it and the tool name are known only while a tool call is running, so they
 * travel through AsyncLocalStorage set by the tool-registration wrapper in register-tools.ts.
 */

export type ClientTransport = 'stdio' | 'hosted';

/** What is known about the tool call currently executing */
export interface ToolCallContext {
  transport: ClientTransport;
  tool: string;
  /** The MCP client's self-reported name/version from `initialize`; undefined before it */
  mcpClient?: { name: string; version: string };
}

const toolCallContext = new AsyncLocalStorage<ToolCallContext>();

/** Run `fn` with `context` visible to every API request it makes. */
export function runInToolCall<T>(context: ToolCallContext, fn: () => T): T {
  return toolCallContext.run(context, fn);
}

// From dist/util/client-info.js, the package's package.json is two directories up — true both for
// the published package and for the connector, which imports it from node_modules.
const here = dirname(fileURLToPath(import.meta.url));
let packageVersion = 'unknown';
try {
  packageVersion = JSON.parse(readFileSync(join(here, '..', '..', 'package.json'), 'utf8')).version ?? 'unknown';
} catch {
  // A missing package.json must never break a tool call; the version is informational.
}

/** Keep header values to a safe token set and a bounded length. */
function clean(value: string): string {
  return value.replace(/[^A-Za-z0-9._\-+@]/g, '-').slice(0, 64);
}

/**
 * Headers identifying this server (and, inside a tool call, the transport, MCP client and tool).
 * Outside a tool call the transport is reported as stdio — the only code path that runs without
 * one is the stdio package's own startup.
 */
export function clientHeaders(): Record<string, string> {
  const context = toolCallContext.getStore();
  const transport = context?.transport ?? 'stdio';
  const client = context?.mcpClient
    ? `; client=${clean(context.mcpClient.name)}/${clean(context.mcpClient.version)}`
    : '';
  const headers: Record<string, string> = {
    'User-Agent': `creatordb-mcp/${clean(packageVersion)} (${transport}${client})`,
  };
  if (context?.tool) {
    headers['X-CreatorDB-MCP-Tool'] = clean(context.tool);
  }
  return headers;
}
