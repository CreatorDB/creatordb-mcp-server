import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callApi } from '../util/api-client.js';
import { formatToolResult } from '../util/response.js';

export function registerAccountTools(server: McpServer, apiKey: string) {
  server.tool(
    'get_api_usage',
    'Get your CreatorDB API usage. Returns `records: [{ date (YYYYMMDD), requestCount, ' +
      'totalQuotaUsed (can be fractional, e.g. NLS), endpoints (camelCase per-endpoint counts: ' +
      'getYoutubeProfile, searchInstagram, getNLS, etc.), platforms, quotaByPlatform }]`. ' +
      'Free to call (0 credits). Defaults to last 7 days; pass `start`/`end` as Unix-ms strings ' +
      'to widen the window.',
    {
      start: z.string().optional().describe('Start date as Unix timestamp in milliseconds'),
      end: z.string().optional().describe('End date as Unix timestamp in milliseconds'),
    },
    async ({ start, end }) => {
      const params: Record<string, string> = {};
      if (start) params.start = start;
      if (end) params.end = end;
      const result = await callApi(apiKey, '/usage', {
        method: 'GET',
        params,
      });
      return formatToolResult(result);
    },
  );
}
