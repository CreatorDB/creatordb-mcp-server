import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSearchTools } from './tools/search.js';
import { registerYoutubeTools } from './tools/youtube.js';
import { registerInstagramTools } from './tools/instagram.js';
import { registerTiktokTools } from './tools/tiktok.js';
import { registerSponsorTools } from './tools/sponsors.js';
import { registerAccountTools } from './tools/account.js';

/**
 * Register every CreatorDB MCP tool on the given server instance, bound to the
 * given V3 API key. Used by both the stdio entry (one key for the lifetime of
 * the process) and the HTTP entry (a fresh server + key per request).
 */
export function registerAllTools(server: McpServer, apiKey: string): void {
  registerSearchTools(server, apiKey);
  registerYoutubeTools(server, apiKey);
  registerInstagramTools(server, apiKey);
  registerTiktokTools(server, apiKey);
  registerSponsorTools(server, apiKey);
  registerAccountTools(server, apiKey);
}
