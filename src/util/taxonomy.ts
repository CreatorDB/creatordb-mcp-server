/**
 * Shared paging + lexical search for the taxonomy tools
 * (`list_{youtube,instagram,tiktok}_niches`, `list_youtube_topics`).
 *
 * WHY THIS EXISTS
 * The V3 `/{platform}/niches` endpoints take no parameters and return the whole
 * taxonomy: ~40,000 entries for Instagram and TikTok, ~16,000 for YouTube. Serialised
 * that is 2-4.3 MB — far past what fits in a model context, so the tools were
 * effectively uncallable by an agent. Until V3 gains native paging, the server slices
 * the payload before it reaches the client.
 *
 * This is a client-side guardrail, NOT the fix: the full taxonomy still crosses the
 * wire from V3 on every call. Native `pageSize`/`offset`/`search` support on the V3
 * endpoints removes that.
 *
 * SHAPE OF THE DATA, AND WHY `search` MATTERS MORE THAN PAGING
 * Instagram and TikTok expose a single category ("All") — a flat, hashtag-derived list
 * with no structure to browse. The top 100 entries by creator count cover only ~18% of
 * all creator assignments, so no default page is representative. Callers reach for these
 * tools to resolve a phrase ("cottagecore fashion") into valid `niches` filter values,
 * which is a lookup, not a browse. `search` is the parameter that makes that work; paging
 * is the guardrail that keeps any single response sane.
 *
 * The scoring below is ported from the whole-word matcher that backs the internal query
 * builder, where it has been the first tier of niche resolution since May 2026.
 * Substring matching is deliberately avoided: short niches ("Ev", "Tok", "Ski") would
 * match inside unrelated words ("reviewers", "TikTokers", "skincare") and swamp the
 * result set.
 */

/** One taxonomy entry as returned by V3. */
export interface TaxonomyItem {
  id?: string;
  name?: string;
  category?: string;
  channelCount?: number;
}

export interface TaxonomyQuery {
  search?: string;
  minChannelCount?: number;
  category?: string;
  pageSize: number;
  offset: number;
}

export interface TaxonomyPage {
  /** Entries in the full taxonomy, before any filtering. */
  total: number;
  /** Entries remaining after search/category/minChannelCount filters. */
  matched: number;
  offset: number;
  pageSize: number;
  returned: number;
  /** Present only when `matched` exceeds what this page returned. */
  hint?: string;
  items: TaxonomyItem[];
}

const TOKEN_RE = /[a-z0-9]+/g;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'or', 'the', 'for', 'with', 'from', 'in', 'on', 'at', 'to', 'of', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having',
  'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'they', 'them', 'their',
  'find', 'get', 'show', 'list', 'all', 'each', 'every', 'who', 'what', 'where', 'when', 'how',
  'creator', 'creators', 'channel', 'channels', 'user', 'users', 'account', 'accounts',
  'youtuber', 'youtubers', 'tiktoker', 'tiktokers', 'influencer', 'influencers', 'without',
  // Platform names: redundant next to the per-platform tool, and they appear as tokens
  // inside generic catalog niches (`Youtube`, `ShortsYoutube`, `TikTokSong`), which would
  // pull meta-noise into any query that names the platform.
  'youtube', 'tiktok', 'instagram', 'facebook', 'twitter',
]);

/** Canonicalise common variants so query and catalog tokens collide on one form. */
const STEM_MAP: Record<string, string> = {
  vlogger: 'vlog', vloggers: 'vlog', vlogging: 'vlog',
  blogger: 'blog', bloggers: 'blog', blogging: 'blog',
  gamer: 'game', gamers: 'game', gaming: 'game',
  cooker: 'cook', cookers: 'cook', cooking: 'cook',
  reviewer: 'review', reviewers: 'review', reviewing: 'review',
  streamer: 'stream', streamers: 'stream', streaming: 'stream',
  baker: 'bake', bakers: 'bake', baking: 'bake',
  dancer: 'dance', dancers: 'dance', dancing: 'dance',
  singer: 'sing', singers: 'sing', singing: 'sing',
  // Nationality adjective → country, so "Japanese food" reaches "JapanFood".
  japanese: 'japan', korean: 'korea', chinese: 'china', taiwanese: 'taiwan',
  vietnamese: 'vietnam', spanish: 'spain', french: 'france', german: 'germany',
  italian: 'italy', brazilian: 'brazil', mexican: 'mexico', indian: 'india',
  polish: 'poland', russian: 'russia', turkish: 'turkey', thai: 'thailand',
  filipino: 'philippines', indonesian: 'indonesia', malaysian: 'malaysia',
  australian: 'australia', canadian: 'canada', american: 'america', british: 'britain',
  irish: 'ireland', scottish: 'scotland', dutch: 'netherlands', swedish: 'sweden',
  norwegian: 'norway', finnish: 'finland', danish: 'denmark', greek: 'greece',
  egyptian: 'egypt', argentinian: 'argentina', argentine: 'argentina',
  colombian: 'colombia', chilean: 'chile', peruvian: 'peru',
};

/**
 * `splitCamel` is for catalog names only (`StreetFood` → street, food). User queries are
 * left intact so coined CamelCase terms ("BookTok") stay whole rather than splitting into
 * `book` + `tok` and matching every generic `Tok` niche.
 */
export function tokenize(text: string, splitCamel = false): string[] {
  const prepared = splitCamel ? text.replace(/([a-z0-9])([A-Z])/g, '$1 $2') : text;
  return (prepared.toLowerCase().match(TOKEN_RE) ?? [])
    .filter((t) => !STOP_WORDS.has(t) && t.length > 1)
    .map((t) => STEM_MAP[t] ?? t);
}

/** Whole-word overlap score; 0 means no match. */
export function scoreName(queryTokens: Set<string>, name: string): number {
  const nameTokens = tokenize(name, true);
  if (nameTokens.length === 0) return 0;

  if (nameTokens.length === 1) {
    return queryTokens.has(nameTokens[0]!) ? 100 : 0;
  }

  let matched = 0;
  for (const t of nameTokens) if (queryTokens.has(t)) matched += 1;
  if (matched === 0) return 0;

  // Every token matched means the whole phrase landed — rank it above partials.
  return 50 * matched + (matched === nameTokens.length ? 50 : 0);
}

/**
 * Filter, rank and slice a taxonomy payload.
 *
 * Ordering: when `search` is supplied, by match score then creator count, so the best
 * lexical hit leads. Otherwise by creator count alone, which puts the largest and most
 * broadly useful niches on the first page.
 */
export function paginateTaxonomy(all: TaxonomyItem[], q: TaxonomyQuery): TaxonomyPage {
  const total = all.length;
  let items = all;

  if (q.category) {
    const wanted = q.category.toLowerCase();
    items = items.filter((i) => (i.category ?? '').toLowerCase() === wanted);
  }

  if (typeof q.minChannelCount === 'number') {
    const min = q.minChannelCount;
    items = items.filter((i) => (i.channelCount ?? 0) >= min);
  }

  if (q.search && q.search.trim()) {
    const queryTokens = new Set(tokenize(q.search));
    if (queryTokens.size > 0) {
      const scored: Array<{ item: TaxonomyItem; score: number }> = [];
      for (const item of items) {
        const score = scoreName(queryTokens, item.name ?? '');
        if (score > 0) scored.push({ item, score });
      }
      scored.sort((a, b) => b.score - a.score || (b.item.channelCount ?? 0) - (a.item.channelCount ?? 0));
      items = scored.map((s) => s.item);
    } else {
      // Query was entirely stop-words — treat as no search rather than returning nothing.
      items = [...items].sort((a, b) => (b.channelCount ?? 0) - (a.channelCount ?? 0));
    }
  } else {
    items = [...items].sort((a, b) => (b.channelCount ?? 0) - (a.channelCount ?? 0));
  }

  const matched = items.length;
  const page = items.slice(q.offset, q.offset + q.pageSize);

  const remaining = matched - (q.offset + page.length);
  let hint: string | undefined;
  if (matched === 0 && q.search) {
    // A dead end is worse than a long list: say why it matched nothing and what to try.
    hint =
      `No entry name contains any word from "${q.search}". Matching is whole-word, so partial ` +
      `words do not hit ("skin" will not find "Skincare"). Try single broader words, drop ` +
      `qualifiers, or omit search to browse the largest entries.`;
  } else if (matched === 0) {
    hint = 'No entries matched the given filters. Try lowering minChannelCount or clearing category.';
  } else if (remaining > 0) {
    hint =
      `${remaining} more entries match. Raise offset to page through them, or narrow with ` +
      `search / minChannelCount.`;
  }

  return { total, matched, offset: q.offset, pageSize: q.pageSize, returned: page.length, hint, items: page };
}
