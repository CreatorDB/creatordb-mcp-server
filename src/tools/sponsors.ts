import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callApi } from '../util/api-client.js';
import { formatToolResult } from '../util/response.js';

const filterSchema = z.object({
  filterName: z
    .string()
    .describe(
      'Brand field to filter on. Common: name, industry, country, sponsoringRegion, ' +
        'sponsoringPlatforms ("youtube"|"instagram"), sponsoredYoutubeCreatorId, ' +
        'sponsoredInstagramCreatorId, totalSponsoredContent, hasActiveCampaign. ' +
        'YouTube-only spend filters: estimatedTotalSpend7d / 30d / 90d.',
    ),
  op: z
    .enum(['>', '=', '<', 'in'])
    .describe('Number: >, =, <. String: = or in. Boolean: =. `in` takes an array (≤100 values).'),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string()).max(100)])
    .describe(
      'TYPE MUST MATCH THE FIELD. Numeric ops want number (not numeric string). ' +
        'Sponsored-creator filters take a YT channelId (UC…) or IG uniqueId.',
    ),
  isFuzzySearch: z.boolean().default(false).describe('Fuzzy matching for string fields like name.'),
});

const platformParam = z
  .enum(['youtube', 'instagram'])
  .describe('Platform scope. NOTE: TikTok sponsor data is not available — only YouTube and Instagram.');

export function registerSponsorTools(server: McpServer, apiKey: string) {
  server.tool(
    'search_sponsors',
    'Search the CreatorDB brand index using structured filters. Returns lean brand records ' +
      '(brandId, name, logo, industries, country). Costs 2 credits per page. Sponsor data covers ' +
      'YouTube and Instagram only — TikTok is not indexed for brands.',
    {
      filters: z
        .array(filterSchema)
        .max(10)
        .default([])
        .describe('Brand filters (max 10). Pass empty array to list unfiltered.'),
      pageSize: z.number().min(1).max(100).default(20).describe('Results per page (max 100).'),
      offset: z.number().min(0).default(0).describe('Number of records to skip for pagination.'),
      sortBy: z
        .string()
        .optional()
        .describe(
          'Sort field. One of: name, totalSponsoredContent, estimatedTotalSpend7d / 30d / 90d.',
        ),
      desc: z.boolean().default(true).describe('Sort descending (true) or ascending (false).'),
    },
    async (params) => {
      const result = await callApi(apiKey, '/sponsor/search', { method: 'POST', body: params });
      return formatToolResult(result);
    },
  );

  server.tool(
    'list_sponsors',
    'Paginated directory of every brand indexed in CreatorDB (10K+ brands). Returns brandId, ' +
      'name, logo, industries, country, sponsoringPlatforms (currently TitleCase: "YouTube" / ' +
      '"Instagram" — lowercase migration pending), totalSponsoredContent. Use search_sponsors when ' +
      'you need filtering; this is for browsing the full catalog. Costs 1 credit per page.',
    {
      pageSize: z.number().min(1).max(100).default(50).describe('Results per page (max 100).'),
      offset: z.number().min(0).default(0).describe('Number of records to skip for pagination.'),
      sortBy: z.enum(['name', 'totalSponsoredContent']).default('name').describe('Sort field.'),
      desc: z.boolean().default(false).describe('Sort descending (true) or ascending (false).'),
    },
    async (params) => {
      const url = new URLSearchParams();
      url.set('pageSize', String(params.pageSize));
      url.set('offset', String(params.offset));
      if (params.sortBy) url.set('sortBy', params.sortBy);
      url.set('desc', String(params.desc));
      const result = await callApi(apiKey, '/sponsor/list', {
        method: 'GET',
        params: Object.fromEntries(url),
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_sponsor_information',
    'Get a single brand\'s full profile: name, alias[], logo, description, companySize, ' +
      'keyPeople[], industries[], country, location, website, socialMedia[] (with platform-tagged ' +
      'URLs), competitors[], totalSponsoredContent, sponsoringPlatforms. Costs 2 credits.',
    {
      brandId: z
        .string()
        .describe('Brand ID (typically the brand\'s primary domain, e.g. "acer.com", "nike.com").'),
    },
    async ({ brandId }) => {
      const result = await callApi(apiKey, '/sponsor/information', {
        method: 'GET',
        params: { brandId },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_sponsor_creators',
    'List creators a brand has sponsored (inverse of get_*_sponsorship). Returns each creator ' +
      'with displayName, country, followers, sponsoredContent[] (URLs), topics, niches, ' +
      'sponsoredCount, lastSponsoredDate, avgRecentSponsoredEngagementRate (cross-brand aggregate ' +
      'today — lifetime on IG, R20 on YT — backend fix pending). ' +
      'EXPENSIVE: costs 25 credits per page.',
    {
      brandId: z.string().describe('Brand ID (e.g. "acer.com").'),
      platform: platformParam,
      pageSize: z.number().min(1).max(100).default(50).describe('Results per page (max 100).'),
      offset: z.number().min(0).default(0).describe('Number of records to skip for pagination.'),
      sortBy: z
        .enum(['lastSponsoredDate', 'followers', 'avgRecentSponsoredEngagementRate', 'sponsoredCount'])
        .default('lastSponsoredDate')
        .describe('Sort field.'),
      desc: z.boolean().default(true).describe('Sort descending (true) or ascending (false).'),
    },
    async ({ brandId, platform, pageSize, offset, sortBy, desc }) => {
      const result = await callApi(apiKey, '/sponsor/creators', {
        method: 'GET',
        params: {
          brandId,
          platform,
          pageSize: String(pageSize),
          offset: String(offset),
          sortBy,
          desc: String(desc),
        },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_sponsor_performance',
    'Detailed per-content sponsorship performance for a brand. Returns sponsoredCreators[] each ' +
      'with three stats scopes (creatorTotalStats = all content, creatorAllSponsoredStats = all ' +
      'sponsored content lifetime, creatorSpecificSponsoredStats = for this brand only) plus ' +
      'estimatedCost / estimatedCreatorCPM (YouTube-only — null for Instagram) and a content[] ' +
      'array with per-item views7d/30d/90d/Lifetime, likes, comments, engagementRate. ' +
      'EXPENSIVE: costs 25 credits per page.',
    {
      brandId: z.string().describe('Brand ID (e.g. "acer.com").'),
      platform: platformParam,
      pageSize: z.number().min(1).max(100).default(50).describe('Results per page (max 100).'),
      offset: z.number().min(0).default(0).describe('Number of records to skip for pagination.'),
      sortBy: z
        .enum(['publishTime', 'views', 'likes', 'engagementRate'])
        .default('publishTime')
        .describe('Sort field. Numeric sorts use per-creator averages; `views` uses viewsLifetime.'),
      desc: z.boolean().default(true).describe('Sort descending (true) or ascending (false).'),
    },
    async ({ brandId, platform, pageSize, offset, sortBy, desc }) => {
      const result = await callApi(apiKey, '/sponsor/performance', {
        method: 'GET',
        params: {
          brandId,
          platform,
          pageSize: String(pageSize),
          offset: String(offset),
          sortBy,
          desc: String(desc),
        },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_sponsor_audience',
    'Aggregated audience demographics across all creators a brand has sponsored. Returns ' +
      'data.youtube and/or data.instagram (each may be null) with audienceLocations (top 5 ' +
      'countries), audienceGender (maleRatio + femaleRatio), audienceAvgAge, audienceAgeBreakdown ' +
      '(fixed 7 buckets: 13-17/18-24/25-34/35-44/45-54/55-64/65+). IG block is reserved but ' +
      'always null today — backend only aggregates YT audience. Omit `platform` to request both. ' +
      'EXPENSIVE: costs 25 credits.',
    {
      brandId: z.string().describe('Brand ID (e.g. "acer.com").'),
      platform: platformParam.optional(),
    },
    async ({ brandId, platform }) => {
      const params: Record<string, string> = { brandId };
      if (platform) params.platform = platform;
      const result = await callApi(apiKey, '/sponsor/audience', { method: 'GET', params });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_sponsor_summary',
    'Cross-platform sponsorship rollup for a brand. Returns data.summary with totalSponsoredCreators, ' +
      'totalSponsoredContent, and per-platform youtube + instagram sub-objects each carrying a ' +
      'creators block (sponsoredCreators, sponsoredContent30d, top-5 creatorLocationBreakdown, ' +
      'top-5 creatorLanguageBreakdown) and a performance block (estimatedTotalSpend 7d/30d/90d, ' +
      'estimatedCPM30d, estimatedCPE30d, views/likes/comments aggregates, growth30d deltas). ' +
      'Instagram spend/CPM/CPE always null today. EXPENSIVE: costs 25 credits.',
    {
      brandId: z.string().describe('Brand ID (e.g. "acer.com").'),
    },
    async ({ brandId }) => {
      const result = await callApi(apiKey, '/sponsor/summary', { method: 'GET', params: { brandId } });
      return formatToolResult(result);
    },
  );

  server.tool(
    'submit_sponsor',
    'Submit a brand for indexing. Returns submissionId + status ("accepted" / "processing" / ' +
      '"done" / "rejected") and existingBrandId if the brand was already indexed. Costs 1 credit ' +
      'on acceptance, 0 on duplicate (status=done) or rejection. Rate-limited to 100 submissions/' +
      'day per API key (separate from the credit pool).',
    {
      brandName: z.string().min(1).max(100).describe('Brand name (1–100 chars).'),
      brandUrl: z.string().describe('Brand website URL — must include http:// or https://.'),
      competitors: z
        .array(z.string())
        .max(10)
        .optional()
        .describe('Optional competitor brand names or URLs (max 10).'),
      notes: z.string().max(500).optional().describe('Optional free-form notes (≤500 chars).'),
    },
    async (params) => {
      const result = await callApi(apiKey, '/sponsor/submit', { method: 'POST', body: params });
      return formatToolResult(result);
    },
  );
}
