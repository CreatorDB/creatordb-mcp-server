import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callApi } from '../util/api-client.js';
import { formatToolResult } from '../util/response.js';

const uniqueIdParam = {
  uniqueId: z
    .string()
    .describe('Instagram handle (e.g. "natgeo"). No "@" prefix and no URL.'),
};

export function registerInstagramTools(server: McpServer, apiKey: string) {
  server.tool(
    'get_instagram_profile',
    'Get an Instagram creator\'s profile: display name, follower count, biography, ' +
      'isVerified/isBusinessAccount flags, country (ISO 3166-1 alpha-3), main language, ' +
      'linked socials (YouTube/TikTok), hashtags used, account-level categories, and the ' +
      'creator\'s AI-classified `niches`. To browse the full IG niche taxonomy use ' +
      'list_instagram_niches. Costs 2 credits.',
    uniqueIdParam,
    async ({ uniqueId }) => {
      const result = await callApi(apiKey, '/instagram/profile', {
        method: 'GET',
        params: { uniqueId },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_instagram_contact',
    'Get an Instagram creator\'s contact email addresses (business/public-listed emails). ' +
      'Costs 15 credits.',
    uniqueIdParam,
    async ({ uniqueId }) => {
      const result = await callApi(apiKey, '/instagram/contact', {
        method: 'GET',
        params: { uniqueId },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_instagram_performance',
    'Get an Instagram creator\'s engagement metrics on first-page content. Returns ' +
      'imagesPerformanceRecent + reelsPerformanceRecent with avg/median/min/max likes, comments, ' +
      'and (for reels) views, plus an engagement block using (L+C)/followers and consistencyScore ' +
      '(0–100; bands: high 81–100, moderate 51–80, low 0–50; requires ≥6 posts). `ranking` block ' +
      'carries global/country/language percentiles. `recentReelsGrowth.g7/g30/g90` shows ' +
      'engagement-rate trend. `contentCountByDays.7d/30d/90d` shows posting cadence. IG has no ' +
      'all-time window (YouTube-only). Costs 2 credits.',
    uniqueIdParam,
    async ({ uniqueId }) => {
      const result = await callApi(apiKey, '/instagram/performance', {
        method: 'GET',
        params: { uniqueId },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_instagram_performance_history',
    'Get daily metric snapshots (followers, content count, first-page engagement) for an ' +
      'Instagram creator. Returns the `histories` array of timestamped snapshots over the past N ' +
      'days. Costs 3 credits.',
    {
      ...uniqueIdParam,
      pastDayRange: z
        .string()
        .describe('How many past days of daily snapshots to return. String integer, 1–365.'),
    },
    async ({ uniqueId, pastDayRange }) => {
      const result = await callApi(apiKey, '/instagram/performance-history', {
        method: 'GET',
        params: { uniqueId, pastDayRange },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_instagram_audience',
    'Get an Instagram creator\'s audience demographics: `audienceLocations` (top 6 countries with ' +
      'shares), `audienceGender` (maleRatio + femaleRatio, binary only), `audienceAvgAge` (integer), ' +
      '`audienceAgeBreakdown` (fixed 7 buckets: 13-17/18-24/25-34/35-44/45-54/55-64/65+). When ' +
      'data is missing the endpoint returns the placeholder shape (all 0.0) — treat male+female=0 ' +
      'as missing, not "no gender data." Costs 10 credits.',
    uniqueIdParam,
    async ({ uniqueId }) => {
      const result = await callApi(apiKey, '/instagram/audience', {
        method: 'GET',
        params: { uniqueId },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_instagram_content_detail',
    'Get an Instagram creator\'s recent content (images + reels) with per-item engagement: ' +
      'likes, comments, views (reels only — images have no view count), caption, hashtags (with ' +
      '"#"), mentionedCreators (@-mentions), publishTime (Unix-ms), engagementRate. Content from ' +
      'the last 4 days is excluded from metric calculations. Pinned posts >90 days old are ' +
      'excluded if they would be the oldest item. Costs 2 credits.',
    uniqueIdParam,
    async ({ uniqueId }) => {
      const result = await callApi(apiKey, '/instagram/content-detail', {
        method: 'GET',
        params: { uniqueId },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_instagram_sponsorship',
    'Get an Instagram creator\'s sponsored content grouped by brand. Returns `sponsorList: [{ ' +
      'brandName, brandId, brandIgIds, sponsoredVideos, sponsoredVideosPerformance }]`. Each ' +
      'sponsoredVideo carries per-item engagement (same shape as content-detail). CAVEAT: only ' +
      'scans the most recent ~20–30 posts AND only detects brands already indexed — an empty ' +
      'sponsorList is NOT proof the creator has no sponsors. Costs 5 credits.',
    uniqueIdParam,
    async ({ uniqueId }) => {
      const result = await callApi(apiKey, '/instagram/sponsorship', {
        method: 'GET',
        params: { uniqueId },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'list_instagram_niches',
    'List the full Instagram NICHE taxonomy used by CreatorDB — every available niche with ' +
      'channelCount per niche (the response is large: ~10K+ entries). NICHES are granular ' +
      'subcategories (e.g. "love/All", "fashion/All"). To see which niches a specific creator ' +
      'is classified under, use get_instagram_profile and read the `niches` field. Per-platform: ' +
      'IG/YT/TT each have their own niche taxonomy — they are not interchangeable. Instagram does ' +
      'NOT have a "topics" taxonomy (that is YouTube-only). Takes no parameters. Costs 1 credit.',
    {},
    async () => {
      const result = await callApi(apiKey, '/instagram/niches', { method: 'GET' });
      return formatToolResult(result);
    },
  );
}
