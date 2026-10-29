/**
 * Search enrichment (`fields`) can add each creator's recent content, and post descriptions are most of
 * that payload: about two thirds of a 30-result response with three items each, which then runs past the
 * size many MCP clients pass to the model (larger results are cut off or moved out of the conversation).
 * Titles, hashtags, bios and niches carry most of what shows whether a creator fits, so long descriptions
 * and bios are shortened in search results; the per-creator content and profile tools return them in full.
 */

export const DESCRIPTION_CHARS = 200;
export const BIO_CHARS = 300;

const shorten = (text: unknown, max: number) =>
  typeof text === 'string' && text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;

type Item = Record<string, unknown> & { description?: unknown };
type Creator = Record<string, unknown> & {
  profile?: Record<string, unknown> & { bio?: unknown };
  'content-detail'?: Record<string, unknown>;
};

/** Shortens descriptions and bios in a search response's creatorList. Returns how many fields it shortened. */
export function compactSearchEnrichment(data: unknown): number {
  const list = (data as { creatorList?: Creator[] } | null)?.creatorList;
  if (!Array.isArray(list)) return 0;
  let shortened = 0;
  for (const c of list) {
    if (c.profile && typeof c.profile.bio === 'string' && c.profile.bio.length > BIO_CHARS) {
      c.profile.bio = shorten(c.profile.bio, BIO_CHARS);
      shortened++;
    }
    for (const items of Object.values(c['content-detail'] ?? {})) {
      if (!Array.isArray(items)) continue;
      for (const it of items as Item[]) {
        if (typeof it.description === 'string' && it.description.length > DESCRIPTION_CHARS) {
          it.description = shorten(it.description, DESCRIPTION_CHARS);
          shortened++;
        }
      }
    }
  }
  return shortened;
}
