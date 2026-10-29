import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callApi, callSseApi } from '../util/api-client.js';
import { formatToolResult } from '../util/response.js';
import { apiTaxonomyLoader, resolveTaxonomyFilters, taxonomyIdError, type Platform } from '../util/taxonomy-ids.js';
import type { ApiResponse } from '../util/api-client.js';
import { canRank, profileFieldsFor, rankByMatches, wantedSignals } from '../util/relevance.js';

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
  rankBy: z
    .enum(['sort', 'relevance'])
    .default('sort')
    .describe(
      'OPTIONAL. "sort" (default) returns results in `sortBy` order. "relevance" ranks creators by how ' +
        'many of the requested niches, topics and hashtags they match (most first; ties go to heavier ' +
        'hashtag use), so a creator tagged with 6 of 8 requested niches beats one tagged with 1. It needs ' +
        'at least two requested values across niches/topics/hashtags. The server fetches a pool of ' +
        '`poolSize` matches in `sortBy` order with their niches/topics/hashtags (0.1 credit per field per ' +
        'creator), ranks it, and returns the top `pageSize` with `matchCount` and `matched` on each; ' +
        '`fields` enrichment then applies only to those top results. Pagination (`offset`) is not used.',
    ),
  poolSize: z
    .number()
    .int()
    .min(50)
    .max(300)
    .default(200)
    .describe('With rankBy "relevance": how many matches to fetch and rank (default 200, max 300).'),
  fields: z
    .object({
      profile: z.array(z.string()).optional(),
      performance: z.array(z.string()).optional(),
      audience: z.array(z.string()).optional(),
      contact: z.array(z.string()).optional(),
      'content-detail': z.record(z.number().int().min(0)).optional(),
      'performance-history': z.object({ pastDayRange: z.string() }).optional(),
      sponsorship: z.record(z.number().int().min(0)).optional(),
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

type SearchParams = {
  filters: Array<{ filterName: string; op: '>' | '=' | '<' | 'in'; value: string | number | boolean | string[]; isFuzzySearch?: boolean }>;
  pageSize: number;
  offset: number;
  sortBy?: string;
  desc: boolean;
  rankBy?: 'sort' | 'relevance';
  poolSize?: number;
  fields?: Record<string, unknown>;
};

/** One search request for every platform: name→ID conversion, optional relevance ranking, notes. */
async function runSearch(apiKey: string, platform: Platform, defaultSort: string, params: SearchParams) {
  const resolved = await resolveTaxonomyFilters(platform, params.filters, apiTaxonomyLoader(apiKey));
  if (!resolved.ok) return taxonomyIdError(resolved.message);
  const { rankBy, poolSize, ...apiParams } = params;
  const filters = resolved.filters as SearchParams['filters'];
  const path = `/${platform}/search`;
  const conversions = resolved.notes.length ? [`Converted to taxonomy IDs: ${resolved.notes.join('; ')}`] : [];

  if (rankBy !== 'relevance') {
    const result = await callApi(apiKey, path, {
      method: 'POST',
      body: withDefaultSort({ ...apiParams, filters }, defaultSort),
    });
    const formatted = formatToolResult(result);
    return withNotes(formatted, [...conversions, ...emptyResultNote(formatted, filters.length)]);
  }

  const wanted = wantedSignals(filters);
  if (!canRank(wanted)) {
    return {
      isError: true as const,
      content: [{ type: 'text' as const, text: 'Error: VALIDATION_ERROR (no credits used)\nrankBy "relevance" needs at least two requested values across niches, topics and hashtags.' }],
    };
  }

  // Fetch the pool with just the signals needed to count matches.
  type Creator = { uniqueId?: string; channelId?: string; profile?: Record<string, unknown> } & Record<string, unknown>;
  const pool: Creator[] = [];
  let credits = 0;
  let total: unknown;
  let last: ApiResponse | undefined;
  for (let offset = 0; offset < (poolSize ?? 200); offset += 100) {
    last = await callApi(apiKey, path, {
      method: 'POST',
      body: withDefaultSort(
        { ...apiParams, filters, pageSize: Math.min(100, (poolSize ?? 200) - offset), offset, fields: { profile: profileFieldsFor(wanted) } },
        defaultSort,
      ),
    });
    if (!last.success) return formatToolResult(last);
    credits += last.creditsUsed ?? 0;
    const data = last.data as { creatorList?: Creator[]; totalResults?: unknown; hasNextPage?: boolean };
    total = data.totalResults;
    pool.push(...(data.creatorList ?? []));
    if (!data.hasNextPage) break;
  }

  const top = rankByMatches(pool as Array<Creator & { profile?: never }>, wanted).slice(0, params.pageSize);
  let creatorList = top.map(({ creator, matchCount, matched }) => {
    const { profile, ...rest } = creator as Creator;
    return { ...rest, matchCount, matched };
  });

  // Caller-requested enrichment, for the top results only.
  if (apiParams.fields && creatorList.length) {
    const ids = creatorList.map((c) => (c as Creator).uniqueId).filter((v): v is string => !!v);
    const res = await callApi(apiKey, path, {
      method: 'POST',
      body: { filters: [{ filterName: 'uniqueId', op: 'in', value: ids }], pageSize: ids.length, offset: 0, desc: true, sortBy: defaultSort, fields: apiParams.fields },
    });
    if (res.success) {
      credits += res.creditsUsed ?? 0;
      const byId = new Map(((res.data as { creatorList?: Creator[] }).creatorList ?? []).map((c) => [c.uniqueId, c]));
      creatorList = creatorList.map((c) => ({ ...byId.get((c as Creator).uniqueId), ...c }));
    }
  }

  const response: ApiResponse = {
    ...(last as ApiResponse),
    creditsUsed: Math.round(credits * 100) / 100,
    data: { creatorList, totalResults: total, rankedBy: 'relevance', rankedPool: pool.length },
  };
  const formatted = formatToolResult(response);
  const poolNote =
    typeof total === 'number' && total > pool.length
      ? [`Ranked the first ${pool.length} of ${total} matches (in ${apiParams.sortBy ?? defaultSort} order) by match count.`]
      : [];
  return withNotes(formatted, [...conversions, ...poolNote, ...emptyResultNote(formatted, filters.length)]);
}

export function registerSearchTools(server: McpServer, apiKey: string) {
  // Natural Language Search
  server.tool(
    'search_creators_nls',
    'Quick natural-language search: converts one sentence into filters in a single pass and ' +
      'returns up to 20 creators. Results are NOT checked against the request and are often ' +
      'loose, so do not use this to build a result list; use search_youtube, search_instagram ' +
      'and search_tiktok instead. Use it only when the user explicitly asks for natural-language ' +
      'search. Response includes `creatorList` and the `platform` chosen. Credit cost is dynamic ' +
      '(token-based, typically 1–10 credits).',
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
    async (params) => runSearch(apiKey, 'youtube', 'totalSubscribers', params),
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
    async (params) => runSearch(apiKey, 'instagram', 'totalFollowers', params),
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
    async (params) => runSearch(apiKey, 'tiktok', 'totalFollowers', params),
  );
}
