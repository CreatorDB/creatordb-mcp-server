import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callApi, callSseApi } from '../util/api-client.js';
import { formatToolResult } from '../util/response.js';

const filterSchema = z.object({
  filterName: z
    .string()
    .describe(
      'Field to filter on. Common across all platforms: displayName, uniqueId, country (ISO 3166-1 ' +
        'alpha-3, e.g. "USA"), mainLanguage (ISO 639-3, e.g. "eng"), hashtags, niches, ' +
        'mainAudienceLocation, mainAudienceAge, mainAudienceGender, hasSponsors. ' +
        'Platform-specific count fields: YT uses totalSubscribers; IG/TT use totalFollowers. ' +
        'YT-only: topics. Engagement fields exist on all three.',
    ),
  op: z
    .enum(['>', '=', '<', 'in'])
    .describe(
      'Comparison operator. Number fields: >, =, <. String fields: = or in (in takes an array of ' +
        'up to 100 values). Boolean fields: =.',
    ),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string()).max(100)])
    .describe(
      'Filter value — TYPE MUST MATCH THE FIELD. For numeric ops (>, <, = on count/rate fields) ' +
        'send a number, NOT a numeric string ("1000000" → VALIDATION_ERROR; 1000000 → ok). ' +
        'For string ops (= / in on country, language, displayName, hashtags, niches) send a ' +
        'string or string array. Boolean ops take true/false. Hashtags on IG/TT carry a leading ' +
        '"#" in the index, so values usually want "#beauty", not "beauty".',
    ),
  isFuzzySearch: z
    .boolean()
    .default(false)
    .describe('Enable fuzzy matching for string fields (e.g. displayName).'),
});

const searchBodySchema = {
  filters: z
    .array(filterSchema)
    .min(1)
    .max(10)
    .describe('Search filters (max 10). Billed at 1 credit per 10 filters.'),
  pageSize: z.number().min(1).max(100).default(20).describe('Results per page (max 100).'),
  offset: z.number().min(0).default(0).describe('Number of records to skip for pagination.'),
  sortBy: z
    .string()
    .optional()
    .describe('Field to sort by (e.g. totalSubscribers, totalFollowers, avgEngagementRate).'),
  desc: z.boolean().default(true).describe('Sort descending (true) or ascending (false).'),
};

export function registerSearchTools(server: McpServer, apiKey: string) {
  // Natural Language Search
  server.tool(
    'search_creators_nls',
    'Search for creators using natural language across YouTube, Instagram, and TikTok. ' +
      'The AI determines the platform from your query and converts it into structured filters. ' +
      'Response includes `creatorList` AND a `platform` field telling you which platform was ' +
      'chosen. Best for exploratory queries where you don\'t know exact filter names — fall back ' +
      'to search_youtube/instagram/tiktok when you need precise control over filters. Credit cost ' +
      'is dynamic (token-based, typically 1–10 credits).',
    {
      description: z
        .string()
        .min(1)
        .max(1000)
        .describe(
          'Natural language search query, e.g. "Find US-based YouTube beauty creators with over 1M subscribers".',
        ),
    },
    async ({ description }) => {
      const result = await callSseApi(apiKey, '/nls', {
        method: 'POST',
        body: { description },
      });
      return formatToolResult(result);
    },
  );

  // YouTube Search
  server.tool(
    'search_youtube',
    'Search YouTube creators using structured filters. Costs 1 credit per 10 filters (max 10). ' +
      'Use totalSubscribers (NOT totalFollowers) for count thresholds. YT-specific filterable ' +
      'fields: `topics` (coarse ~400-theme taxonomy — IG/TT don\'t have it), `niches` (granular; ' +
      'also on IG/TT but derived separately). Response: `creatorList`, `totalResults`, ' +
      '`hasNextPage`, `nextOffset` — pass nextOffset as the next request\'s offset to paginate.',
    searchBodySchema,
    async (params) => {
      const result = await callApi(apiKey, '/youtube/search', {
        method: 'POST',
        body: params,
      });
      return formatToolResult(result);
    },
  );

  // Instagram Search
  server.tool(
    'search_instagram',
    'Search Instagram creators using structured filters. Costs 1 credit per 10 filters (max 10). ' +
      'Use totalFollowers (NOT totalSubscribers) for count thresholds. IG has `niches` but NOT ' +
      '`topics` (YouTube-only). Hashtag values need the "#" prefix to match the indexed ' +
      'hashTagsSearch field. Response: `creatorList`, `totalResults`, `hasNextPage`, `nextOffset`.',
    searchBodySchema,
    async (params) => {
      const result = await callApi(apiKey, '/instagram/search', {
        method: 'POST',
        body: params,
      });
      return formatToolResult(result);
    },
  );

  // TikTok Search
  server.tool(
    'search_tiktok',
    'Search TikTok creators using structured filters. Costs 1 credit per 10 filters (max 10). ' +
      'Use totalFollowers (NOT totalSubscribers) for count thresholds. TT has `niches` but NOT ' +
      '`topics` (YouTube-only). Hashtag values need the "#" prefix. Note: TikTok does not expose ' +
      'a per-brand sponsorship endpoint, so hasSponsors-style filtering is coarser than on YT/IG. ' +
      'Response: `creatorList`, `totalResults`, `hasNextPage`, `nextOffset`.',
    searchBodySchema,
    async (params) => {
      const result = await callApi(apiKey, '/tiktok/search', {
        method: 'POST',
        body: params,
      });
      return formatToolResult(result);
    },
  );
}
