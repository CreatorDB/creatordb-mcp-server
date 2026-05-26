import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callApi } from '../util/api-client.js';
import { formatToolResult } from '../util/response.js';

const channelIdParam = {
  channelId: z
    .string()
    .describe(
      'YouTube channel ID (the immutable UC… form, e.g. "UCX6OQ3DkcsbYNE6H8uQQuVA"). ' +
        '"@handle", "/c/vanity", and "/user/legacy" URLs are NOT accepted here — resolve them ' +
        'to a UC channelId first.',
    ),
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
    channelIdParam,
    async ({ channelId }) => {
      const result = await callApi(apiKey, '/youtube/profile', {
        method: 'GET',
        params: { channelId },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_youtube_contact',
    'Get a YouTube creator\'s contact email addresses (channel "for business" + public). ' +
      'Costs 15 credits.',
    channelIdParam,
    async ({ channelId }) => {
      const result = await callApi(apiKey, '/youtube/contact', {
        method: 'GET',
        params: { channelId },
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
    channelIdParam,
    async ({ channelId }) => {
      const result = await callApi(apiKey, '/youtube/performance', {
        method: 'GET',
        params: { channelId },
      });
      return formatToolResult(result);
    },
  );

  server.tool(
    'get_youtube_performance_history',
    'Get daily metric snapshots (subscribers, total content count, all-time performance) for a ' +
      'YouTube creator. Returns the `histories` array of timestamped snapshots over the past N ' +
      'days. Costs 3 credits.',
    {
      ...channelIdParam,
      pastDayRange: z
        .string()
        .describe('How many past days of daily snapshots to return. String integer, 1–365.'),
    },
    async ({ channelId, pastDayRange }) => {
      const result = await callApi(apiKey, '/youtube/performance-history', {
        method: 'GET',
        params: { channelId, pastDayRange },
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
    channelIdParam,
    async ({ channelId }) => {
      const result = await callApi(apiKey, '/youtube/audience', {
        method: 'GET',
        params: { channelId },
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
    channelIdParam,
    async ({ channelId }) => {
      const result = await callApi(apiKey, '/youtube/content-detail', {
        method: 'GET',
        params: { channelId },
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
      'shape as content-detail). CAVEAT: only scans the most recent ~20–30 posts AND only detects ' +
      'brands already indexed in CreatorDB — an empty sponsorList is NOT proof of no sponsorships. ' +
      'Costs 5 credits.',
    channelIdParam,
    async ({ channelId }) => {
      const result = await callApi(apiKey, '/youtube/sponsorship', {
        method: 'GET',
        params: { channelId },
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
    'List available subtitle tracks for a SINGLE YouTube video: language codes, auto-generated ' +
      'vs human-uploaded. Per-video, not per-channel — pass the videoId of one video at a time. ' +
      'Use this before calling get_youtube_subtitles_download to know what languages exist. ' +
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
    'get_youtube_subtitles_download',
    'Download the subtitle track for a specific YouTube video. Per-video — pass videoId, not ' +
      'channelId. Costs 3 credits per download.',
    {
      videoId: z.string().describe('YouTube video ID (the v= value in a watch URL)'),
      language: z
        .string()
        .optional()
        .describe('Subtitle language code (ISO 639-3, e.g. "eng", "jpn"). Defaults to the primary track.'),
    },
    async ({ videoId, language }) => {
      const params: Record<string, string> = { videoId };
      if (language) params.language = language;
      const result = await callApi(apiKey, '/youtube/subtitles/download', {
        method: 'GET',
        params,
      });
      return formatToolResult(result);
    },
  );
}
