/**
 * Search enrichment (`fields`) can add each creator's recent content, hashtags and more, and a page of
 * enriched results easily runs past the size MCP clients pass to the model: larger results are cut off or
 * moved out of the conversation, and the agent loses them. Post descriptions are most of the payload, and
 * per-creator hashtag lists can run to ~100 tags. Titles, bios, top niches and top hashtags carry most of what
 * shows whether a creator fits, so search results are shortened in steps until they fit a size budget; the
 * per-creator content and profile tools return everything in full.
 */

export const DESCRIPTION_CHARS = 200;
export const BIO_CHARS = 300;
/**
 * Serialized size a search result is shortened to fit, in characters. Measured: Claude Code shows a ~38K-character
 * result to the model and moves a ~59K one out of the conversation; other clients have similar limits.
 */
export const RESULT_BUDGET_CHARS = 38_000;
const TOP_LIST = 10;
const SHORT_DESCRIPTION_CHARS = 80;
const SHORT_BIO_CHARS = 120;
/** What a recent post keeps once the budget forces it down to the essentials. */
const ITEM_KEEP = new Set(['title', 'description', 'publishTime', 'views', 'engagementRate', 'isSponsored']);

const shorten = (text: unknown, max: number) =>
  typeof text === 'string' && text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;

type Item = Record<string, unknown> & { description?: unknown };
type Creator = Record<string, unknown> & {
  profile?: Record<string, unknown>;
  'content-detail'?: Record<string, unknown>;
};

function contentItems(c: Creator): Item[] {
  return Object.values(c['content-detail'] ?? {}).flatMap((v) => (Array.isArray(v) ? (v as Item[]) : []));
}

/** The steps, mildest first; each returns true when it changed something. */
const STEPS: Array<{ note: string; apply: (c: Creator) => boolean }> = [
  {
    note: `descriptions shortened to ${DESCRIPTION_CHARS} characters and bios to ${BIO_CHARS}`,
    apply: (c) => {
      let changed = false;
      if (c.profile && typeof c.profile.bio === 'string' && c.profile.bio.length > BIO_CHARS) {
        c.profile.bio = shorten(c.profile.bio, BIO_CHARS);
        changed = true;
      }
      for (const it of contentItems(c)) {
        if (typeof it.description === 'string' && it.description.length > DESCRIPTION_CHARS) {
          it.description = shorten(it.description, DESCRIPTION_CHARS);
          changed = true;
        }
      }
      return changed;
    },
  },
  {
    note: `hashtags and niches limited to each creator's top ${TOP_LIST}`,
    apply: (c) => {
      let changed = false;
      for (const key of ['hashtags', 'niches', 'topics']) {
        const list = c.profile?.[key];
        if (Array.isArray(list) && list.length > TOP_LIST) {
          const sorted = list.every((x) => typeof x === 'object' && x && 'contentCount' in x)
            ? [...list].sort((a, b) => (b.contentCount ?? 0) - (a.contentCount ?? 0))
            : list;
          c.profile![key] = sorted.slice(0, TOP_LIST);
          changed = true;
        }
      }
      return changed;
    },
  },
  {
    note: `descriptions shortened to ${SHORT_DESCRIPTION_CHARS} characters`,
    apply: (c) => {
      let changed = false;
      for (const it of contentItems(c)) {
        if (typeof it.description === 'string' && it.description.length > SHORT_DESCRIPTION_CHARS) {
          it.description = shorten(it.description, SHORT_DESCRIPTION_CHARS);
          changed = true;
        }
      }
      return changed;
    },
  },
  {
    note: 'recent posts reduced to title, date, views, engagement and sponsored flag; avatar URLs removed',
    apply: (c) => {
      let changed = false;
      if ('avatarUrl' in c) {
        delete c.avatarUrl;
        changed = true;
      }
      for (const it of contentItems(c)) {
        for (const k of Object.keys(it)) {
          if (!ITEM_KEEP.has(k)) {
            delete it[k];
            changed = true;
          }
        }
      }
      return changed;
    },
  },
  {
    note: 'descriptions removed (titles kept)',
    apply: (c) => {
      let changed = false;
      for (const it of contentItems(c)) {
        if ('description' in it) {
          delete it.description;
          changed = true;
        }
      }
      return changed;
    },
  },
  {
    note: `bios shortened to ${SHORT_BIO_CHARS} characters`,
    apply: (c) => {
      if (c.profile && typeof c.profile.bio === 'string' && c.profile.bio.length > SHORT_BIO_CHARS) {
        c.profile.bio = shorten(c.profile.bio, SHORT_BIO_CHARS);
        return true;
      }
      return false;
    },
  },
];

/**
 * Shortens an enriched search response's creatorList until it fits the budget (the first step always runs).
 * Returns a note for the agent naming what was shortened, or null when nothing was.
 */
export function compactSearchEnrichment(data: unknown, budget = RESULT_BUDGET_CHARS): string | null {
  const list = (data as { creatorList?: Creator[] } | null)?.creatorList;
  if (!Array.isArray(list)) return null;
  const applied: string[] = [];
  for (const [i, step] of STEPS.entries()) {
    if (i > 0 && JSON.stringify(data).length <= budget) break;
    let changed = false;
    for (const c of list) changed = step.apply(c) || changed;
    if (changed) applied.push(step.note);
  }
  if (!applied.length) return null;
  const over = JSON.stringify(data).length > budget;
  return (
    `To keep this result readable: ${applied.join('; ')}. get_*_profile and get_*_content_detail return full text.` +
    (over ? ' Still large: use a smaller pageSize or fewer enrichment fields.' : '')
  );
}
