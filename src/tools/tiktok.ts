import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callApi } from '../util/api-client.js';
import { formatToolResult } from '../util/response.js';

const uniqueIdParam = {
  uniqueId: z
    .string()
    .describe('TikTok handle (e.g. "charlidamelio"). No "@" prefix and no URL.'),
};

export function registerTiktokTools(server: McpServer, apiKey: string) {
  server.tool(
    'get_tiktok_profile',
    'Get a TikTok creator\'s profile: display name, follower count, biography, isVerified flag, ' +
      'country (ISO 3166-1 alpha-3), main language, linked socials, hashtags, and the creator\'s ' +
      'AI-classified `niches`. To browse the full TT niche taxonomy use list_tiktok_niches. ' +
      'Costs 2 credits.',
    uniqueIdParam,
    async ({ uniqueId }) => {
      const result = await callApi(apiKey, '/tiktok/profile', {
        method: 'GET',
        params: { uniqueId },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_tiktok_contact',
    'Get a TikTok creator\'s contact email addresses (public-listed). Costs 15 credits.',
    uniqueIdParam,
    async ({ uniqueId }) => {
      const result = await callApi(apiKey, '/tiktok/contact', {
        method: 'GET',
        params: { uniqueId },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_tiktok_performance',
    'Get a TikTok creator\'s engagement metrics on recent videos. Returns videosPerformanceRecent ' +
      'with avg/median/min/max views, likes, comments, shares, plus an engagement block using ' +
      '(L+C+Shares)/followers and consistencyScore (0–100; bands: high 81–100, moderate 51–80, ' +
      'low 0–50; requires ≥6 videos). `ranking` block carries global/country/language percentiles. ' +
      '`recentVideosGrowth.g7/g30/g90` shows engagement-rate trend. `contentCountByDays.7d/30d/90d` ' +
      'shows posting cadence. TikTok has no all-time window (YouTube-only). Costs 2 credits.',
    uniqueIdParam,
    async ({ uniqueId }) => {
      const result = await callApi(apiKey, '/tiktok/performance', {
        method: 'GET',
        params: { uniqueId },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_tiktok_performance_history',
    'Get daily metric snapshots (followers, content count, recent engagement) for a TikTok ' +
      'creator. Returns the `histories` array of timestamped snapshots over the past N days. ' +
      'Costs 3 credits.',
    {
      ...uniqueIdParam,
      pastDayRange: z
        .string()
        .describe('How many past days of daily snapshots to return. String integer, 1–365.'),
    },
    async ({ uniqueId, pastDayRange }) => {
      const result = await callApi(apiKey, '/tiktok/performance-history', {
        method: 'GET',
        params: { uniqueId, pastDayRange },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_tiktok_audience',
    'Get a TikTok creator\'s audience demographics: `audienceLocations` (top 6 countries with ' +
      'shares), `audienceGender` (maleRatio + femaleRatio, binary only), `audienceAvgAge` (integer), ' +
      '`audienceAgeBreakdown` (fixed 7 buckets: 13-17/18-24/25-34/35-44/45-54/55-64/65+). When ' +
      'data is missing the endpoint returns the placeholder shape (all 0.0) — treat male+female=0 ' +
      'as missing. Costs 10 credits.',
    uniqueIdParam,
    async ({ uniqueId }) => {
      const result = await callApi(apiKey, '/tiktok/audience', {
        method: 'GET',
        params: { uniqueId },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_tiktok_content_detail',
    'Get a TikTok creator\'s recent videos with per-item engagement: views, likes, comments, ' +
      'shares, engagementRate, length (seconds), isAd, hashtags (with "#"), publishTime (Unix-ms). ' +
      'Each item also carries TT-only audio metadata (audioId, audioTitle, audioAuthor, audioAlbum) ' +
      'and isDuetEnabled — the audio block is the cheapest hook into trending-sound analysis. ' +
      'Content from the last 4 days is excluded from metric calculations. Pinned posts >90 days old ' +
      'are excluded if they would be the oldest item. Costs 2 credits.',
    uniqueIdParam,
    async ({ uniqueId }) => {
      const result = await callApi(apiKey, '/tiktok/content-detail', {
        method: 'GET',
        params: { uniqueId },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'search_tiktok_content',
    'Search individual TikTok content (videos) across CreatorDB\'s index. Different from ' +
      'search_tiktok (which searches CREATORS) — this returns individual posts. Response ' +
      'includes `contentList[]` with contentId, description, thumbnail, url, publishTime ' +
      '(Unix-ms), lengthSec, plays/likes/comments/shares/engagementRate, hashtags, audioTitle, ' +
      'audioAuthor, and a nested creator block. NO contentType field. NO isSponsored / ' +
      'partneredBrands — TikTok brand-attribution is not implemented (native isAd flag exists on ' +
      'get_tiktok_content_detail only). Content-level filterable: description, hashtag, ' +
      'publishTime (integer "days ago"), plays, diggs (request name) / likes (response name), ' +
      'comments, shares, engagement, lengthSec, performanceDiggs, performanceEngagement. ' +
      'Creator-level filters also supported. Engagement formula = (likes+comments+shares)/' +
      'followers. Costs 2 credits per page.',
    {
      filters: z
        .array(
          z.object({
            filterName: z.string().describe('Field to filter on. See description for full list.'),
            op: z.enum(['>', '=', '<', 'in']).describe('Comparison operator.'),
            value: z
              .union([z.string(), z.number(), z.boolean(), z.array(z.string()).max(100)])
              .describe('Filter value (type must match the field).'),
            isFuzzySearch: z.boolean().default(false).describe('Fuzzy matching for string fields.'),
          }),
        )
        .min(1)
        .max(10)
        .describe('Content filters (1–10).'),
      pageSize: z.number().min(1).max(100).default(20).describe('Results per page (max 100).'),
      offset: z.number().min(0).default(0).describe('Number of records to skip for pagination.'),
      sortBy: z
        .enum([
          'publishTime',
          'plays',
          'diggs',
          'comments',
          'shares',
          'engagement',
          'lengthSec',
          'performanceDiggs',
          'performanceEngagement',
        ])
        .default('publishTime')
        .describe('Sort field.'),
      desc: z.boolean().default(true).describe('Sort descending (true) or ascending (false).'),
    },
    async (params) => {
      const result = await callApi(apiKey, '/tiktok/content-search', {
        method: 'POST',
        body: params,
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'list_tiktok_niches',
    'List the full TikTok NICHE taxonomy used by CreatorDB — every available niche with ' +
      'channelCount per niche (the response is large: ~10K+ entries). NICHES are granular ' +
      'subcategories (e.g. "Capcut/All", "Dance/All"). To see which niches a specific creator ' +
      'is classified under, use get_tiktok_profile and read the `niches` field. Per-platform: ' +
      'TT/YT/IG each have their own niche taxonomy — they are not interchangeable. TikTok does ' +
      'NOT have a "topics" taxonomy (that is YouTube-only) and does NOT have a per-brand ' +
      'sponsorship endpoint. Takes no parameters. Costs 1 credit.',
    {},
    async () => {
      const result = await callApi(apiKey, '/tiktok/niches', { method: 'GET' });
      return formatToolResult(result);
    },
  );
}
