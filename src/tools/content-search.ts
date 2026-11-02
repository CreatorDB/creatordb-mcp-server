import { z } from 'zod';

/**
 * Shared pieces of the three content-search tools (search_{youtube,instagram,tiktok}_content).
 * The rules below are stated once here and appended to each tool description.
 */

/** Rules every content-search tool states, appended to its description. */
export const CONTENT_SEARCH_RULES =
  ' TIME WINDOW: without `timeRange` or a `publishTime` filter the search covers the last 30 days. ' +
  'Pass `timeRange` {from, to} in Unix ms for any other window (`to` defaults to now); a `publishTime` ' +
  'filter still works and takes whole days ago (e.g. `publishTime < 7`). The searched window comes back ' +
  'as `data.timeRange` {from, to, isDefault}. ' +
  'For a 7-day search, use `publishTime < 7` (or a `timeRange` of at most 7 days). ' +
  'COST TIPS: a `hashtag` filter is far cheaper than a `description` filter at every window length; ' +
  'start with the 30-day default and widen only if it returns too few results. FUZZY: `isFuzzySearch: true` matches a substring and is ' +
  'allowed only on free-text filters (listed above); on any other field it returns a validation error. ' +
  '`in` with fuzzy matches content containing ANY of up to 10 values (e.g. several brand names in captions). ' +
  'Without fuzzy, `=` and `in` match the whole value. `totalResults` is approximate. ' +
  'PRICE: a fixed grid, known before the call, not per result: it depends on the window length ' +
  '(7 / 30 / 90 / 365 days / longer), whether there is a `description` filter, and whether a ' +
  '`followers > 100000` (or higher) filter is set. A shorter window, a narrower content type and a ' +
  'followers floor all cost less; a `description` filter costs more. Empty results are still charged. ' +
  'The exact charge is `creditsUsed` in the response.';

const filterSchema = z.object({
  filterName: z.string().describe('Field to filter on. See the tool description for the full list.'),
  op: z.enum(['>', '=', '<', 'in']).describe('Comparison operator.'),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string()).max(100)])
    .describe('Filter value (type must match the field).'),
  isFuzzySearch: z
    .boolean()
    .default(false)
    .describe('Substring matching. Free-text filters only (see the tool description); `in` + fuzzy allows up to 10 values.'),
});

/** Parameters shared by all three content-search tools; each tool adds its own `sortBy`. */
export const contentSearchParams = {
  filters: z.array(filterSchema).min(1).max(10).describe('Content and creator filters (1–10).'),
  timeRange: z
    .object({
      from: z.number().int().describe('Start of the publish-date range, Unix milliseconds, inclusive.'),
      to: z
        .number()
        .int()
        .optional()
        .describe('End of the range, Unix milliseconds, exclusive. Defaults to the time of the request.'),
    })
    .optional()
    .describe(
      'Publish-date range to search. Omit (with no `publishTime` filter) to search the last 30 days. ' +
        'Shorter windows cost less.',
    ),
  pageSize: z.number().min(1).max(100).default(20).describe('Results per page (max 100). Does not change the price.'),
  offset: z.number().min(0).default(0).describe('Number of records to skip for pagination.'),
  desc: z.boolean().default(true).describe('Sort descending (true) or ascending (false).'),
};
