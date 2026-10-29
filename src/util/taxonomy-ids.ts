/**
 * `niches` and `topics` search filters match taxonomy IDs ("id_canva_Education"), not the
 * display names the list tools also return ("Canva"). V3 answers a name with an empty result
 * rather than an error, so an agent reads it as "no creators match" and moves on.
 *
 * Before a search reaches V3, names are converted to the IDs whose display name matches
 * exactly (ignoring case, spaces and punctuation). One name can map to several IDs; on
 * YouTube "Canva" exists in three categories. A name with no exact match is not guessed:
 * the search returns an error listing the closest entries so the agent can choose.
 */
import { callApi } from './api-client.js';
import { paginateTaxonomy, type TaxonomyItem } from './taxonomy.js';

export const TAXONOMY_ID_PREFIX = 'id_';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SUGGESTIONS = 5;

export type Platform = 'youtube' | 'instagram' | 'tiktok';
type TaxonomyField = 'niches' | 'topics';

export interface Filter {
  filterName: string;
  op: string;
  value: string | number | boolean | string[];
  isFuzzySearch?: boolean;
}

/** Fetches one taxonomy; returns the entries and the credits the fetch cost. */
export type TaxonomyLoader = (path: string) => Promise<{ items: TaxonomyItem[]; creditsUsed: number } | null>;

export type Resolution =
  | { ok: true; filters: Filter[]; notes: string[] }
  | { ok: false; message: string };

const isTaxonomyField = (name: string): name is TaxonomyField => name === 'niches' || name === 'topics';
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function taxonomyPath(platform: Platform, field: TaxonomyField): string {
  return field === 'topics' ? '/youtube/topics' : `/${platform}/niches`;
}

function listTool(platform: Platform, field: TaxonomyField): string {
  return field === 'topics' ? 'list_youtube_topics' : `list_${platform}_niches`;
}

/** Taxonomies are the same for every caller and change slowly, so one copy per process is shared. */
const cache = new Map<string, { at: number; items: TaxonomyItem[] }>();

export function apiTaxonomyLoader(apiKey: string): TaxonomyLoader {
  return async (path) => {
    const hit = cache.get(path);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { items: hit.items, creditsUsed: 0 };
    const res = await callApi(apiKey, path, { method: 'GET' });
    if (!res.success || !Array.isArray(res.data)) return null;
    const items = res.data as TaxonomyItem[];
    cache.set(path, { at: Date.now(), items });
    return { items, creditsUsed: res.creditsUsed ?? 0 };
  };
}

/** Converts niche/topic names in `filters` to IDs. Filters that already use IDs pass through untouched. */
export async function resolveTaxonomyFilters(
  platform: Platform,
  filters: Filter[],
  load: TaxonomyLoader,
): Promise<Resolution> {
  const notes: string[] = [];
  const problems: string[] = [];
  let lookupCredits = 0;
  const out: Filter[] = [];

  for (const f of filters) {
    if (!isTaxonomyField(f.filterName)) {
      out.push(f);
      continue;
    }
    const values = (Array.isArray(f.value) ? f.value : [f.value]).map(String);
    if (values.every((v) => v.startsWith(TAXONOMY_ID_PREFIX))) {
      out.push(f);
      continue;
    }

    const field = f.filterName;
    const loaded = await load(taxonomyPath(platform, field));
    if (!loaded) {
      problems.push(
        `\`${field}\` takes taxonomy IDs, not names, and the names could not be looked up right now. ` +
          `Call ${listTool(platform, field)} with search set to each name and use the \`id\` of the entries you want.`,
      );
      continue;
    }
    lookupCredits += loaded.creditsUsed;

    const ids: string[] = [];
    for (const v of values) {
      if (v.startsWith(TAXONOMY_ID_PREFIX)) {
        ids.push(v);
        continue;
      }
      const matches = loaded.items.filter((i) => i.id && i.name && normalize(i.name) === normalize(v));
      if (matches.length) {
        ids.push(...matches.map((m) => m.id!));
        notes.push(`${field} "${v}" → ${matches.map((m) => m.id).join(', ')}`);
        continue;
      }
      const near = paginateTaxonomy(loaded.items, { search: v, pageSize: SUGGESTIONS, offset: 0 }).items;
      problems.push(
        `No ${field} entry is named "${v}".` +
          (near.length
            ? ` Closest: ${near.map((n) => `${n.id} ("${n.name}", ${n.channelCount ?? 0} creators)`).join('; ')}.`
            : ` Call ${listTool(platform, field)} with a broader search.`),
      );
    }

    const unique = [...new Set(ids)];
    out.push({ ...f, op: unique.length > 1 ? 'in' : f.op, value: unique.length > 1 || f.op === 'in' ? unique : unique[0]! });
  }

  if (problems.length) {
    return {
      ok: false,
      message:
        problems.join('\n') +
        `\n\`niches\` and \`topics\` filters take taxonomy IDs (the \`id\` field of the list tools). ` +
        `No search was run.` +
        (lookupCredits ? ` Name lookup: ${lookupCredits} credit(s).` : ''),
    };
  }
  if (notes.length) {
    notes.push(
      lookupCredits
        ? `Name lookup: ${lookupCredits} credit(s); repeat lookups are cached.`
        : 'Name lookup: cached, no credits.',
    );
  }
  return { ok: true, filters: out, notes };
}

export function taxonomyIdError(message: string) {
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: `Error: INVALID_TAXONOMY_VALUE\n${message}` }],
  };
}
