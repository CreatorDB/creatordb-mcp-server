import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { renderCreditCostsMarkdown } from './credit-costs.js';

/**
 * Register read-only MCP resources.
 *
 * Resources are ambient reference material an MCP client can pull into context
 * *before* it calls a paid tool — they take no API key and cost 0 credits.
 * Registering the first resource turns on the server's `resources` capability.
 *
 * Called from registerAllTools so both entry points (the stdio npm package and
 * the remote HTTP connector, which both go through registerAllTools) expose the
 * same resources without touching the connector.
 */
export function registerResources(server: McpServer): void {
  server.registerResource(
    'credit-costs',
    'creatordb://credits/costs',
    {
      title: 'CreatorDB credit costs',
      description:
        'Up-front credit cost of every CreatorDB tool (search, profile, ' +
        'analytics, sponsor intel, submit). Read before making paid calls to ' +
        'budget credits. The exact charge is also returned as `creditsUsed` on ' +
        'each call; check your live balance with get_api_usage.',
      mimeType: 'text/markdown',
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: renderCreditCostsMarkdown(),
        },
      ],
    }),
  );
}
