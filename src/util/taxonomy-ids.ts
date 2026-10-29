/**
 * `niches` and `topics` search filters match taxonomy IDs ("id_canva_Education"), not the
 * display names the list tools also return ("Canva"). V3 answers a name with an empty result
 * rather than an error, so an agent reads it as "no creators match" and moves on. Catching it
 * here costs no credits and tells the agent exactly how to recover.
 */

export const TAXONOMY_ID_PREFIX = 'id_';

interface Filter {
  filterName: string;
  value: unknown;
}

type Platform = 'youtube' | 'instagram' | 'tiktok';

function listTool(platform: Platform, field: string): string {
  return field === 'topics' ? 'list_youtube_topics' : `list_${platform}_niches`;
}

/** Returns an error message when a niches/topics filter carries names instead of IDs, else null. */
export function checkTaxonomyIds(platform: Platform, filters: Filter[]): string | null {
  const problems: string[] = [];
  for (const f of filters) {
    if (f.filterName !== 'niches' && f.filterName !== 'topics') continue;
    const values = Array.isArray(f.value) ? f.value : [f.value];
    const names = values.filter((v) => typeof v !== 'string' || !v.startsWith(TAXONOMY_ID_PREFIX));
    if (!names.length) continue;
    const tool = listTool(platform, f.filterName);
    const quoted = names.map((v) => JSON.stringify(v)).join(', ');
    problems.push(
      `\`${f.filterName}\` takes taxonomy IDs, not names: ${quoted}. ` +
        `Call ${tool} with search set to each name and use the \`id\` of the entries you want ` +
        `(a name can map to several IDs, e.g. "Canva" → id_canva_Education, id_canva_HowtoStyle).`,
    );
  }
  return problems.length ? problems.join('\n') : null;
}

export function taxonomyIdError(message: string) {
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: `Error: INVALID_TAXONOMY_VALUE (no credits used)\n${message}` }],
  };
}
