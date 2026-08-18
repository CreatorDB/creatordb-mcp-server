import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BASE_URL, callApi } from '../util/api-client.js';
import { formatToolResult } from '../util/response.js';

const channelLookupParam = {
  channelId: z
    .string()
    .optional()
    .describe(
      'YouTube channel ID (the immutable UC… form, e.g. "UCX6OQ3DkcsbYNE6H8uQQuVA"). ' +
        'Provide exactly one of channelId or uniqueId. "/c/vanity" and "/user/legacy" URLs ' +
        'are NOT accepted — pass the @handle as uniqueId instead.',
    ),
  uniqueId: z
    .string()
    .optional()
    .describe(
      'YouTube channel handle, e.g. "@mrbeast" (the "@" prefix is optional). Provide exactly ' +
        'one of channelId or uniqueId. Resolves against creators already indexed by CreatorDB — ' +
        'an unindexed handle returns 404; submit it via submit_youtube_creators (free) first.',
    ),
};

/**
 * V3 requires exactly one identifier; fail here rather than sending a 400 to the API.
 * Returns Record<string, string> so it can spread into both a JSON body and GET params.
 */
function ytLookup(channelId?: string, uniqueId?: string): Record<string, string> {
  if (channelId && !uniqueId) return { channelId };
  if (uniqueId && !channelId) return { uniqueId };
  throw new Error('Provide exactly one of channelId or uniqueId.');
}

const profileFields = {
  fields: z.array(z.string())
    .optional()
    .describe("Fractional Calls — request only the profile fields you need to pay less than the full 2 credits. Each field is 0.1 credit (languages and subscriberGrowth are 0.2), capped at 2. Field names are the response keys (e.g. displayName, country, mainLanguage, totalSubscribers/totalFollowers, bio, isVerified, hasSponsors, hashtags, niches). Example: ['country'] = 0.1; ['displayName','totalSubscribers'] = 0.2. Omit for the full profile (2)."),
};

const performanceFields = {
  fields: z.array(z.string())
    .optional()
    .describe("Fractional Calls — request only these performance blocks (capped at 2): contentCountByDays (0.2), ranking (0.4), videosPerformanceRecent (1), shortsPerformanceRecent (1), videosPerformanceAll (1), shortsPerformanceAll (1), recentVideosGrowth (0.2), recentShortsGrowth (0.2), videoPrice (0.5), shortsPrice (0.5). Example: ['videoPrice','shortsPrice'] = 1. Omit for the full set (2)."),
};

const audienceFields = {
  fields: z.array(z.string())
    .optional()
    .describe("Fractional Calls — request only the audience blocks you need (capped at 10): audienceLocations (4), audienceGender (4), audienceAvgAge (2), audienceAgeBreakdown (4). Example: ['audienceGender'] = 4 for gender only (vs 10 for the full bundle). Omit for all four (10)."),
};

const contactFields = {
  fields: z.array(z.string())
    .optional()
    .describe("This endpoint has one billable field, emails (15) = the full price, so fractional selection yields no savings. Just omit fields."),
};

const contentDetailFields = {
  fields: z.object({ recentVideos: z.number().int().positive().optional(), recentShorts: z.number().int().positive().optional() })
    .optional()
    .describe("Fractional Calls — an OBJECT mapping content type to the number of items to return, billed 0.1 per item, capped at 3 (~30 items). Keys: recentVideos, recentShorts. Example: { recentVideos: 5 } = 0.5. Omit for the full recent set (3)."),
};

const sponsorshipFields = {
  fields: z.object({ sponsorList: z.number().int().positive() })
    .optional()
    .describe("Fractional Calls — pass { sponsorList: N } to cap the sponsoring brands returned, billed 0.5 per brand, capped at 5 (~10 brands). Example: { sponsorList: 5 } = 2.5. Omit for the full list (5)."),
};

export function registerYoutubeTools(server: McpServer, apiKey: string) {
  server.tool(
    'get_youtube_profile',
    'Get a YouTube creator\'s profile: display name, subscriber count, description, isVerified, ' +
      'country (ISO 3166-1 alpha-3), main language, linked socials, channel-level hashtags, ' +
      'YouTube native channel categories, AI-classified `topics` (coarse) and `niches` (granular), ' +
      '`subscriberGrowth.g7/g30/g90` trend deltas, `relatedCreators` UC IDs for discovery, and ' +
      'sponsored `videoPrice` + `shortsPrice` blocks with low/raw/high CPM and dollar bands ' +
      '(YouTube-only — IG/TT do not return pricing). Use list_youtube_topics / list_youtube_niches ' +
      'to resolve topic/niche IDs to human names. Costs 2 credits.',
    { ...channelLookupParam, ...profileFields },
    async ({ channelId, uniqueId, fields }) => {
      const result = await callApi(apiKey, '/youtube/profile', {
        method: 'POST',
        body: { ...ytLookup(channelId, uniqueId), ...(fields ? { fields } : {}) },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_youtube_contact',
    'Get a YouTube creator\'s contact email addresses (channel "for business" + public). ' +
      'Costs 15 credits.',
    { ...channelLookupParam, ...contactFields },
    async ({ channelId, uniqueId, fields }) => {
      const result = await callApi(apiKey, '/youtube/contact', {
        method: 'POST',
        body: { ...ytLookup(channelId, uniqueId), ...(fields ? { fields } : {}) },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_youtube_performance',
    'Get a YouTube creator\'s engagement metrics. Returns four sibling objects: ' +
      'videosPerformanceRecent + shortsPerformanceRecent (R20: last 20 of each) and ' +
      'videosPerformanceAll + shortsPerformanceAll (up to 800). Each has avg/median/min/max/' +
      'percentile25/percentile75/iqr for likes/comments/views, plus an engagement block with ' +
      '(L+C+V)/subscribers and consistencyScore (0–100; bands: high 81–100, moderate 51–80, ' +
      'low 0–50; requires ≥6 content pieces). `ranking` block carries global/country/language ' +
      'percentiles. `recentVideosGrowth.g7/g30/g90` shows engagement-rate trend. ' +
      '`contentCountByDays.7d/30d/90d` shows posting cadence. Costs 2 credits.',
    { ...channelLookupParam, ...performanceFields },
    async ({ channelId, uniqueId, fields }) => {
      const result = await callApi(apiKey, '/youtube/performance', {
        method: 'POST',
        body: { ...ytLookup(channelId, uniqueId), ...(fields ? { fields } : {}) },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_youtube_performance_history',
    'Get daily metric snapshots (subscribers, total content count, all-time performance) for a ' +
      'YouTube creator. Returns the `histories` array of timestamped snapshots over the past N ' +
      'days. Costs 3–5 credits depending on the requested day range (3 for up to 7 days, rising to 5 for a full 365-day range).',
    {
      ...channelLookupParam,
      pastDayRange: z
        .string()
        .describe('How many past days of daily snapshots to return. String integer, 1–365.'),
    },
    async ({ channelId, uniqueId, pastDayRange }) => {
      const result = await callApi(apiKey, '/youtube/performance-history', {
        method: 'GET',
        params: { ...ytLookup(channelId, uniqueId), pastDayRange },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_youtube_audience',
    'Get a YouTube creator\'s audience demographics: `audienceLocations` (top 6 countries with ' +
      'shares), `audienceGender` (maleRatio + femaleRatio, binary only), `audienceAvgAge` (integer), ' +
      '`audienceAgeBreakdown` (fixed 7 buckets: 13-17/18-24/25-34/35-44/45-54/55-64/65+). When ' +
      'data is missing the endpoint returns the placeholder shape (all 0.0) — treat male+female=0 ' +
      'as missing. Costs 10 credits.',
    { ...channelLookupParam, ...audienceFields },
    async ({ channelId, uniqueId, fields }) => {
      const result = await callApi(apiKey, '/youtube/audience', {
        method: 'POST',
        body: { ...ytLookup(channelId, uniqueId), ...(fields ? { fields } : {}) },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_youtube_content_detail',
    'Get a YouTube creator\'s recent content (videos + shorts) with per-item engagement: views, ' +
      'likes, comments, length (seconds), isMemberOnly flag (filter for member-only content), ' +
      'hashtags (with "#"), publishTime (Unix-ms), engagementRate. Content from the last 4 days ' +
      'is excluded from metric calculations. Costs 3 credits.',
    { ...channelLookupParam, ...contentDetailFields },
    async ({ channelId, uniqueId, fields }) => {
      const result = await callApi(apiKey, '/youtube/content-detail', {
        method: 'POST',
        body: { ...ytLookup(channelId, uniqueId), ...(fields ? { fields } : {}) },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_youtube_sponsorship',
    'Get a YouTube creator\'s sponsored content grouped by brand. Returns `sponsorList: [{ ' +
      'brandName, brandId, brandIgIds, sponsoredVideos, sponsoredVideosPerformance }]`. ' +
      '`brandIgIds` are the brand\'s Instagram handles — useful to pivot from a sponsored creator ' +
      'back to the brand\'s own IG profile. `sponsoredVideos` carries per-item engagement (same ' +
      'shape as content-detail). DEPTH: returns up to 60 of the creator\'s most recent ' +
      'brand-matched sponsored videos (verified live: a high-cadence creator hit exactly 60, ' +
      'spanning ~108 days). COUNTING: a video with multiple sponsors is repeated under each ' +
      'brand, so de-duplicate on contentId — summing sponsoredVideos lengths overcounts (105 ' +
      'entries for 60 unique videos on that creator). CAVEAT: only brands already indexed in ' +
      'CreatorDB are matched, and unknown-sponsor videos are never returned — an empty ' +
      'sponsorList is NOT proof of no sponsorships. Costs 5 credits.',
    { ...channelLookupParam, ...sponsorshipFields },
    async ({ channelId, uniqueId, fields }) => {
      const result = await callApi(apiKey, '/youtube/sponsorship', {
        method: 'POST',
        body: { ...ytLookup(channelId, uniqueId), ...(fields ? { fields } : {}) },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'list_youtube_topics',
    'List the full YouTube TOPIC taxonomy used by CreatorDB — every available topic (~470+ entries) ' +
      'with channelCount per topic. TOPICS are a coarse, evolving classification (e.g. "Academic", ' +
      '"Finance", "Health Education"). YOUTUBE-ONLY: Instagram and TikTok do not have a topic ' +
      'taxonomy. To see which topics a specific creator is classified under, use get_youtube_profile ' +
      'and read the `topics` field. Takes no parameters. Costs 1 credit.',
    {},
    async () => {
      const result = await callApi(apiKey, '/youtube/topics', { method: 'GET' });
      return formatToolResult(result);
    },
  );

  server.tool(
    'list_youtube_niches',
    'List the full YouTube NICHE taxonomy used by CreatorDB — every available niche (14000+ entries) ' +
      'with channelCount per niche. NICHES are granular subcategories (e.g. "Vlog/People Blogs", ' +
      '"ASMR/People Blogs"). To see which niches a specific creator is classified under, use ' +
      'get_youtube_profile and read the `niches` field. Per-platform: YT/IG/TT each have their own ' +
      'niche taxonomy — they are not interchangeable. Takes no parameters. Costs 1 credit.',
    {},
    async () => {
      const result = await callApi(apiKey, '/youtube/niches', { method: 'GET' });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_youtube_subtitles_meta',
    'List available subtitle tracks for a SINGLE YouTube video. Returns ' +
      '`availableSubtitles: [{ vssId, lang, langCode }]` — e.g. `vssId: "a.en"` for ' +
      'auto-generated English, `vssId: ".en-US"` for human-uploaded English (US). The `vssId` ' +
      'is what get_youtube_subtitles_download requires — call this tool first to discover the ' +
      'vssId of the track you want, then pass that vssId to download. Per-video, not per-channel. ' +
      'Costs 1 credit.',
    {
      videoId: z.string().describe('YouTube video ID (the v= value in a watch URL)'),
    },
    async ({ videoId }) => {
      const result = await callApi(apiKey, '/youtube/subtitles/meta', {
        method: 'GET',
        params: { videoId },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'search_youtube_content',
    'Search individual YouTube content (videos, shorts, streams) across CreatorDB\'s index. ' +
      'Different from search_youtube (which searches CREATORS) — this returns individual posts ' +
      'matching content-level filters. Response includes `contentList[]` with contentId, ' +
      'contentType (video|shorts|stream), title, description, thumbnail, url, publishTime ' +
      '(Unix-ms), lengthSec, isSponsored, partneredBrands[], views/likes/comments/engagementRate, ' +
      'hashtags, language, category, and a nested creator block. Plus totalResults, hasNextPage, ' +
      'nextOffset for pagination. Content-level filterable fields: postType, title, description ' +
      '(NOTE: description filter is currently deferred — returns 400), hashtag, publishTime ' +
      '(filter value is integer "days ago", not Unix-ms — semantic split with the response field), ' +
      'views, likes, comments, engagement, isSponsored, partneredBrands, lengthSec, language, ' +
      'category, performanceViews, performanceEngagement. Creator-level filters also supported ' +
      '(creatorDisplayName, country, contentTopics, contentNiches, audienceLocation, etc.). ' +
      'The 4-day fresh-content exclusion does NOT apply here. EXPENSIVE: costs 50 credits per page — or 100 if you pass a `description` filter (it triggers an extra description-table join), so omit that filter unless you need it.',
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
          'views',
          'likes',
          'comments',
          'engagement',
          'lengthSec',
          'performanceViews',
          'performanceEngagement',
        ])
        .default('publishTime')
        .describe('Sort field.'),
      desc: z.boolean().default(true).describe('Sort descending (true) or ascending (false).'),
    },
    async (params) => {
      const result = await callApi(apiKey, '/youtube/content-search', {
        method: 'POST',
        body: params,
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_youtube_subtitles_download',
    'Download a specific subtitle track for a YouTube video. Returns an array of ' +
      '`{ text, start, dur }` entries (seconds). Per-video — pass videoId + vssId. The vssId ' +
      'identifies which track to download (e.g. "a.en" = auto-generated English; ".en-US" = ' +
      'human-uploaded English-US). Get valid vssIds from get_youtube_subtitles_meta — call that ' +
      'first to enumerate tracks for the video. Costs 3 credits per download.',
    {
      videoId: z.string().describe('YouTube video ID (the v= value in a watch URL)'),
      vssId: z
        .string()
        .describe(
          'Subtitle track identifier returned by get_youtube_subtitles_meta. Auto-generated ' +
            'tracks are prefixed with "a." (e.g. "a.en"); human-uploaded tracks start with "." ' +
            '(e.g. ".en-US").',
        ),
    },
    async ({ videoId, vssId }) => {
      // This endpoint returns a bare JSON array on success (subtitle entries) and the standard
      // {errorCode, details, ...} envelope on failure — different from every other tool — so we
      // bypass callApi/formatToolResult and handle both shapes here.
      const url = new URL('/youtube/subtitles/download', BASE_URL);
      url.searchParams.set('videoId', videoId);
      url.searchParams.set('vssId', vssId);
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      });
      const body: unknown = await res.json();

      if (Array.isArray(body)) {
        // Successful download. V3 doesn't include creditsUsed in this response — documented
        // cost is 3 credits per call; verify via get_api_usage if needed.
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(body, null, 2) },
            {
              type: 'text' as const,
              text: `Subtitle track downloaded (${body.length} entries). Cost: 3 credits (per V3 docs).`,
            },
          ],
        };
      }

      // Error envelope path — same shape as the rest of V3, hand to formatToolResult so the
      // 401 / 400 / 404 / VALIDATION_ERROR / SUBTITLE_VSSID_NOT_FOUND messages look familiar.
      return formatToolResult(body as Parameters<typeof formatToolResult>[0]);
    },
  );

  server.tool(
    'submit_youtube_creators',
    'Submit YouTube channels for indexing so they become available in CreatorDB. Returns `results[]`, one entry per submitted id (request order) with `status`: "accepted" (newly queued for scraping), "done" (already indexed, with `existingChannelId`), or "rejected" (invalid id). FREE — 0 credits for every outcome (accepted, done and rejected alike). Submitted creators enter a processing queue and are NOT immediately available via other tools. Limits: 1–100 ids per call; 10,000 ids/day per API key, counted per UTC day and shared across all platforms (429 RATE_LIMIT_EXCEEDED beyond that). Accepts ONLY the immutable UC channelId (/^UC[A-Za-z0-9_-]{22}$/) — @handles and vanity/legacy URLs are rejected. Unlike Instagram and TikTok submit, which do accept handles.',
    {
      channelIds: z
        .array(z.string())
        .min(1)
        .max(100)
        .describe('YouTube channel IDs in the UC… form (1–100 per call).'),
    },
    async ({ channelIds }) => {
      const result = await callApi(apiKey, '/youtube/submitCreators', {
        method: 'POST',
        body: { channelIds },
      });
      return formatToolResult(result);
    },
  );
}
