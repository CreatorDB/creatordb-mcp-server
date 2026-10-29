/**
 * Relevance ranking for searches that OR many topic signals together.
 *
 * V3 search sorts by a metric (followers by default), not by how well a creator matches. When a
 * search lists many niches, topics or hashtags, a creator tagged with one of them ranks the same as
 * one tagged with six. Here the server fetches a candidate pool with each creator's niches, topics
 * and hashtags, counts how many of the requested values each one carries, and re-sorts the pool.
 *
 * The pool is still drawn in the search's sort order, so with many thousands of matches only the
 * top of that order is ranked; a native V3 sort would rank every match.
 */

export interface Filter {
  filterName: string;
  op: string;
  value: string | number | boolean | string[];
}

/** Requested values per signal, normalized for matching. */
export interface Wanted {
  niches: Set<string>;
  topics: Set<string>;
  hashtags: Set<string>;
}

const SIGNALS = ['niches', 'topics', 'hashtags'] as const;
const normTag = (t: string) => t.toLowerCase().replace(/^#/, '');

export function wantedSignals(filters: Filter[]): Wanted {
  const wanted: Wanted = { niches: new Set(), topics: new Set(), hashtags: new Set() };
  for (const f of filters) {
    if (!(SIGNALS as readonly string[]).includes(f.filterName)) continue;
    const values = (Array.isArray(f.value) ? f.value : [f.value]).map(String);
    const set = wanted[f.filterName as keyof Wanted];
    for (const v of values) set.add(f.filterName === 'hashtags' ? normTag(v) : v);
  }
  return wanted;
}

/** Ranking needs something to count: at least two requested values across the topic signals. */
export function canRank(w: Wanted): boolean {
  return w.niches.size + w.topics.size + w.hashtags.size >= 2;
}

/** Profile fields the pool must carry so matches can be counted. */
export function profileFieldsFor(w: Wanted): string[] {
  return SIGNALS.filter((s) => w[s].size > 0);
}

interface Profile {
  niches?: string[];
  topics?: string[];
  hashtags?: Array<{ name?: string; contentCount?: number }>;
}

export interface Ranked<T> {
  creator: T;
  matchCount: number;
  matched: string[];
  /** Posts using the matched hashtags; breaks ties between equal match counts. */
  tagPosts: number;
}

/** Sort a pool by matches, most first; ties keep tag usage, then the pool's original order. */
export function rankByMatches<T extends { profile?: Profile }>(pool: T[], w: Wanted): Ranked<T>[] {
  const scored = pool.map((creator, i) => {
    const p = creator.profile ?? {};
    const matched: string[] = [];
    for (const n of p.niches ?? []) if (w.niches.has(n)) matched.push(n);
    for (const t of p.topics ?? []) if (w.topics.has(t)) matched.push(t);
    let tagPosts = 0;
    for (const h of p.hashtags ?? []) {
      const tag = normTag(h.name ?? '');
      if (w.hashtags.has(tag)) {
        matched.push(`#${tag}`);
        tagPosts += h.contentCount ?? 0;
      }
    }
    const unique = [...new Set(matched)];
    return { creator, matchCount: unique.length, matched: unique, tagPosts, i };
  });
  scored.sort((a, b) => b.matchCount - a.matchCount || b.tagPosts - a.tagPosts || a.i - b.i);
  return scored.map(({ i: _i, ...rest }) => rest);
}
