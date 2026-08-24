/**
 * Wiring that turns a V3 taxonomy endpoint into a paged, searchable MCP tool.
 * The slicing rules and their rationale live in ./taxonomy.ts.
 */
import { z } from 'zod';
import { callApi } from './api-client.js';
import { formatToolResult } from './response.js';
import { paginateTaxonomy, type TaxonomyItem } from './taxonomy.js';

export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 1000;

/**
 * @param categoryHint per-platform wording for `category`. Instagram and TikTok expose a
 *   single "All" category, so the filter is inert there and the description says so
 *   rather than implying a structure the data does not have.
 */
export function taxonomyParams(categoryHint: string) {
  return {
    search: z
      .string()
      .optional()
      .describe(
        'Whole-word match against entry names, ranked best-first. Use this to resolve a ' +
          'phrase into valid filter values (e.g. "japanese street food") instead of paging ' +
          'the whole taxonomy. Matching is token-based, not substring: "ski" will not match ' +
          '"skincare". CamelCase entry names are split ("StreetFood" matches "street food"), ' +
          'and common variants are folded together ("vloggers"→"vlog", "japanese"→"japan").',
      ),
    minChannelCount: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Drop entries with fewer creators than this. Useful for skipping the long tail — ' +
          'on TikTok roughly 44% of niches have under 100 creators.',
      ),
    category: z.string().optional().describe(categoryHint),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_SIZE)
      .default(DEFAULT_PAGE_SIZE)
      .describe(`Entries per page (default ${DEFAULT_PAGE_SIZE}, max ${MAX_PAGE_SIZE}).`),
    offset: z.number().int().min(0).default(0).describe('Entries to skip, for paging.'),
  };
}

export interface TaxonomyArgs {
  search?: string;
  minChannelCount?: number;
  category?: string;
  pageSize?: number;
  offset?: number;
}

/** Fetch a taxonomy from V3, then filter/rank/slice before it reaches the client. */
export async function runTaxonomyTool(apiKey: string, path: string, args: TaxonomyArgs) {
  const result = await callApi(apiKey, path, { method: 'GET' });
  if (!result.success) return formatToolResult(result);

  const all: TaxonomyItem[] = Array.isArray(result.data) ? (result.data as TaxonomyItem[]) : [];
  const page = paginateTaxonomy(all, {
    search: args.search,
    minChannelCount: args.minChannelCount,
    category: args.category,
    pageSize: args.pageSize ?? DEFAULT_PAGE_SIZE,
    offset: args.offset ?? 0,
  });

  return formatToolResult({ ...result, data: page });
}
