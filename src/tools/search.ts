import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callApi, callSseApi } from '../util/api-client.js';
import { formatToolResult } from '../util/response.js';
import { apiTaxonomyLoader, resolveTaxonomyFilters, taxonomyIdError } from '../util/taxonomy-ids.js';

const filterSchema = z.object({
  filterName: z
    .string()
    .describe(
      'Field to filter on. Common across all platforms: displayName, uniqueId, country (ISO 3166-1 ' +
        'alpha-3, e.g. "USA"), mainLanguage (ISO 639-3, e.g. "eng"), hashtags, niches, ' +
        'mainAudienceLocation, mainAudienceAge, mainAudienceGender, hasSponsors. ' +
        'Platform-specific count fields: YT uses totalSubscribers; IG/TT use totalFollowers. ' +
        'YT-only: topics, isPodcast. Engagement fields exist on all three. `niches` and `topics` take ' +
        'taxonomy IDs (e.g. "id_canva_Education") from the `id` field of list_*_niches / ' +
        'list_youtube_topics. A display name ("Canva") is converted to every ID with that exact ' +
        'name (first lookup per taxonomy costs 1 credit, then cached); a name with no exact match ' +
        'returns the closest IDs instead of searching.',
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
        'string or string array. Boolean ops take true/false. Hashtag values match with or ' +
        'without a leading # and are case-insensitive. Ratio and percentile fields ' +
        '(audienceMaleRatio, audienceFemaleRatio, and YouTube\'s *Percentile fields) take a ' +
        'decimal from 0 to 1, not 0-100: 0.6 = 60%, 0.9 = top 10%.',
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
    .describe(
      'Field to sort by. OPTIONAL — when omitted this defaults to the platform follower count ' +
        '(YouTube: totalSubscribers, Instagram/TikTok: totalFollowers) so the most prominent ' +
        'match ranks first. Without a sort the API returns matches in an arbitrary order, which ' +
        'buries well-known creators behind small look-alike channels — e.g. a fuzzy displayName ' +
        'search for "MrBeast" put the 42K-subscriber "MrBeast - Topic" channel first and the real ' +
        '513M-subscriber channel 21st. Pass an explicit value to override, and use `desc: false` ' +
        'for ascending. Valid values are PLATFORM-SPECIFIC — common ones: YouTube ' +
        '`totalSubscribers`, `totalViews`, `subscriberGrowthIn30d`, `avgRecentVideosEngagementRate`, ' +
        '`platformScore`; Instagram `totalFollowers`, `followerGrowthIn30d`, ' +
        '`avgRecentReelsEngagementRate`, `platformScore`; TikTok `totalFollowers`, ' +
        '`followerGrowthIn30d`, `avgRecentVideosEngagementRate`, `platformScore`. Note there is no ' +
        'bare `avgEngagementRate` field on any platform. An invalid value returns VALIDATION_ERROR ' +
        'whose message enumerates every accepted field for that platform.',
    ),
  desc: z.boolean().default(true).describe('Sort descending (true) or ascending (false).'),
  fields: z
    .object({
      profile: z.array(z.string()).optional(),
      performance: z.array(z.string()).optional(),
      audience: z.array(z.string()).optional(),
      contact: z.array(z.string()).optional(),
      'content-detail': z.record(z.string(), z.number().int().min(0)).optional(),
      'performance-history': z.object({ pastDayRange: z.string() }).optional(),
      sponsorship: z.record(z.string(), z.number().int().min(0)).optional(),
    })
    .optional()
    .describe(
      'OPTIONAL enrichment: add data from other endpoints to EACH result, billed per result ' +
        'returned at that endpoint\'s fractional field prices (so cost scales with pageSize). Each ' +
        'key is an endpoint name and takes that endpoint\'s `fields` shape: profile/performance/' +
        'audience/contact take field-name arrays; content-detail takes per-item counts ' +
        '(YouTube recentVideos/recentShorts, Instagram recentImages/recentReels, TikTok ' +
        'recentVideos; 0.1 credit per item); sponsorship takes { sponsorList: n } (YouTube and ' +
        'Instagram only); performance-history takes { pastDayRange: "90" }. An empty array or ' +
        'object requests the full bundle at the endpoint\'s full price. Useful for checking fit ' +
        'without a profile call per creator, e.g. { "profile": ["bio", "niches", "country", ' +
        '"mainLanguage"], "content-detail": { "recentVideos": 3 } } = 0.7 credits per result.',
    ),
};

/**
 * Apply the platform's default sort field unless the caller chose one.
 *
 * V3 has no relevance ranking on filter matches, so an unsorted search returns
 * results in an arbitrary order. Defaulting to follower count makes the obvious
 * match lead; an explicit `sortBy` from the caller always wins, so this only
 * fills a gap and never overrides intent.
 */
function withDefaultSort<T extends { sortBy?: string }>(params: T, defaultSortBy: string): T {
  return params.sortBy ? params : { ...params, sortBy: defaultSortBy };
}

/** Append notes after the result, e.g. which IDs niche/topic names became. */
/**
 * A search with no matches gets a note on how to widen it, so the agent loosens the query
 * instead of reporting that no such creators exist.
 */
function emptyResultNote(result: { content: Array<{ type: 'text'; text: string }>; isError?: boolean }, filterCount: number): string[] {
  if (result.isError) return [];
  try {
    const data = JSON.parse(result.content[0]?.text ?? '{}') as { totalResults?: number };
    if (data.totalResults !== 0) return [];
  } catch {
    return [];
  }
  return [
    `No creators match all ${filterCount} filters. Filters are exact and combined with AND, so one narrow ` +
      'filter empties the result. Remove or loosen one at a time (hashtags, niches, engagement and ' +
      'count thresholds are the usual causes). Hashtags match exact tags only. Location is ' +
      'country-level; there is no state or city filter.',
  ];
}

function withNotes<T extends { content: Array<{ type: 'text'; text: string }> }>(result: T, notes: string[]): T {
  if (!notes.length) return result;
  return { ...result, content: [...result.content, ...notes.map((text) => ({ type: 'text' as const, text }))] };
}

export function registerSearchTools(server: McpServer, apiKey: string) {
  // Natural Language Search
  server.tool(
    'search_creators_nls',
    'ONLY when the user explicitly asks for natural-language search (NLS) by name. Not the default ' +
      'way to find creators, and not a fallback when structured searches return few results: use ' +
      'search_youtube, search_instagram and search_tiktok for every other creator request. Converts ' +
      'one sentence into filters in a single pass and returns up to 20 creators without checking them ' +
      'against the request, so results are often loose. Response includes `creatorList` and the ' +
      '`platform` chosen. Credit cost is dynamic (token-based, typically 1–10 credits).',
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
      'also on IG/TT but derived separately), `isPodcast` (boolean, `=` only, not sortable; AI-labelled ' +
      'podcast channels; unclassified channels match neither true nor false). Response: `creatorList`, `totalResults`, ' +
      '`hasNextPage`, `nextOffset` — pass nextOffset as the next request\'s offset to paginate. ' +
      'Results are sorted by totalSubscribers (descending) unless you pass your own `sortBy`.',
    searchBodySchema,
    async (params) => {
      const resolved = await resolveTaxonomyFilters('youtube', params.filters, apiTaxonomyLoader(apiKey));
      if (!resolved.ok) return taxonomyIdError(resolved.message);
      const result = await callApi(apiKey, '/youtube/search', {
        method: 'POST',
        body: withDefaultSort({ ...params, filters: resolved.filters }, 'totalSubscribers'),
      });
      const formatted = formatToolResult(result);
      const conversions = resolved.notes.length ? [`Converted to taxonomy IDs: ${resolved.notes.join('; ')}`] : [];
      return withNotes(formatted, [...conversions, ...emptyResultNote(formatted, params.filters.length)]);
    },
  );

  // Instagram Search
  server.tool(
    'search_instagram',
    'Search Instagram creators using structured filters. Costs 1 credit per 10 filters (max 10). ' +
      'Use totalFollowers (NOT totalSubscribers) for count thresholds. IG has `niches` but NOT ' +
      '`topics` (YouTube-only). Hashtag values match with or without a leading # and are ' +
      'case-insensitive. Response: `creatorList`, `totalResults`, `hasNextPage`, `nextOffset`. ' +
      'Results are sorted by totalFollowers (descending) unless you pass your own `sortBy`.',
    searchBodySchema,
    async (params) => {
      const resolved = await resolveTaxonomyFilters('instagram', params.filters, apiTaxonomyLoader(apiKey));
      if (!resolved.ok) return taxonomyIdError(resolved.message);
      const result = await callApi(apiKey, '/instagram/search', {
        method: 'POST',
        body: withDefaultSort({ ...params, filters: resolved.filters }, 'totalFollowers'),
      });
      const formatted = formatToolResult(result);
      const conversions = resolved.notes.length ? [`Converted to taxonomy IDs: ${resolved.notes.join('; ')}`] : [];
      return withNotes(formatted, [...conversions, ...emptyResultNote(formatted, params.filters.length)]);
    },
  );

  // TikTok Search
  server.tool(
    'search_tiktok',
    'Search TikTok creators using structured filters. Costs 1 credit per 10 filters (max 10). ' +
      'Use totalFollowers (NOT totalSubscribers) for count thresholds. TT has `niches` but NOT ' +
      '`topics` (YouTube-only). Hashtag values match with or without a leading # and are ' +
      'case-insensitive. Note: TikTok does not expose ' +
      'a per-brand sponsorship endpoint, so hasSponsors-style filtering is coarser than on YT/IG. ' +
      'Response: `creatorList`, `totalResults`, `hasNextPage`, `nextOffset`. ' +
      'Results are sorted by totalFollowers (descending) unless you pass your own `sortBy`.',
    searchBodySchema,
    async (params) => {
      const resolved = await resolveTaxonomyFilters('tiktok', params.filters, apiTaxonomyLoader(apiKey));
      if (!resolved.ok) return taxonomyIdError(resolved.message);
      const result = await callApi(apiKey, '/tiktok/search', {
        method: 'POST',
        body: withDefaultSort({ ...params, filters: resolved.filters }, 'totalFollowers'),
      });
      const formatted = formatToolResult(result);
      const conversions = resolved.notes.length ? [`Converted to taxonomy IDs: ${resolved.notes.join('; ')}`] : [];
      return withNotes(formatted, [...conversions, ...emptyResultNote(formatted, params.filters.length)]);
    },
  );
}
