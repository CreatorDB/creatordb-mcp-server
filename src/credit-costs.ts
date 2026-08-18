/**
 * CreatorDB V3 credit costs — the source table behind the
 * `creatordb://credits/costs` MCP resource.
 *
 * PROVENANCE — every value here was confirmed against the LIVE V3 API on the
 * date in CREDIT_COSTS_VERIFIED_ON (contact, audience, YT/IG content-search,
 * and the fractional 0.1/field + 0.1/item + 0.2-block rates were hit directly;
 * the rest come from tool descriptions that were themselves corrected against
 * live in v1.4.2, commit 875b0d5). The scrapers-repo `endpointCreditCost.ts` is
 * STALE on several rows (contact, tiktok performance, content-detail) and must
 * NOT be treated as the source — live wins.
 *
 * RE-VERIFIED 2026-08-17 — the submit rows only. API-308 made creator submission
 * free and API-309 raised the daily cap 1,000 -> 10,000 (both released
 * 2026-08-13, after this table was first written). Confirmed live: submitting an
 * already-indexed channel returned `status: "done"` with `creditsUsed: 0`. The
 * `accepted` outcome is 0 by construction — `perAcceptedCreator` is the only
 * multiplier and is now 0 — but was NOT observed, since observing it requires
 * injecting a real unindexed creator into the scrape queue. Every other row still
 * carries its 2026-08-10 verification.
 *
 * The exact charge for any call is ALWAYS returned as `creditsUsed` in the
 * response envelope; this table is the up-front estimate so an agent can budget
 * before spending. Keep it in sync with the "Costs N credits" sentence in each
 * tool description — they must not drift.
 */

export const CREDIT_COSTS_VERIFIED_ON = '2026-08-10';

/** The submit rows were re-verified separately after API-308 / API-309 shipped. */
export const SUBMIT_REVERIFIED_ON = '2026-08-17';

export interface CreditCostRow {
  /** Section heading the row is grouped under. */
  group: string;
  /** Tool name(s). `{a,b}` brace form denotes per-platform variants. */
  tool: string;
  /** Human-readable cost in display credits. */
  cost: string;
  /** Caveats: fractional rules, per-page/per-day limits, platform gaps. */
  notes?: string;
}

export const CREDIT_COST_ROWS: CreditCostRow[] = [
  // ── Creator search ─────────────────────────────────────────────────────────
  {
    group: 'Creator search',
    tool: 'search_{youtube,instagram,tiktok}',
    cost: '1 per 10 filters',
    notes: 'ceil(filters / 10). Max 10 filters, max 100 results/page.',
  },
  {
    group: 'Creator search',
    tool: 'search_creators_nls',
    cost: 'dynamic (~1–10)',
    notes: 'Natural-language search; token-based, so cost scales with the query.',
  },

  // ── Content search (individual posts, not creators) ────────────────────────
  {
    group: 'Content search (individual posts)',
    tool: 'search_youtube_content',
    cost: '50 / page',
    notes: 'EXPENSIVE. A `description` filter would add a join (→100/page), but that filter is currently deferred (returns 400) — so 50 is the effective cost today.',
  },
  {
    group: 'Content search (individual posts)',
    tool: 'search_{instagram,tiktok}_content',
    cost: '2 / page',
  },

  // ── Creator profile & analytics (mostly POST + fractional `fields`; ─────────
  //    performance_history is GET and range-priced, not fractional) ────────────
  {
    group: 'Creator profile & analytics',
    tool: 'get_{youtube,instagram,tiktok}_profile',
    cost: '2',
    notes: 'Fractional: 0.1 / field (languages & subscriberGrowth 0.2), capped at 2.',
  },
  {
    group: 'Creator profile & analytics',
    tool: 'get_{youtube,instagram}_performance / get_tiktok_performance',
    cost: '2 (TikTok 1.5)',
    notes: 'Fractional by block; the full bundle is capped at the numbers shown.',
  },
  {
    group: 'Creator profile & analytics',
    tool: 'get_{youtube,instagram,tiktok}_performance_history',
    cost: '3–5',
    notes: 'GET. Scales with day range: 3 for ≤7 days, rising to 5 at the full 365-day range.',
  },
  {
    group: 'Creator profile & analytics',
    tool: 'get_{youtube,instagram,tiktok}_audience',
    cost: '10',
    notes: 'Fractional blocks (audienceLocations 4, audienceGender 4, audienceAvgAge 2, audienceAgeBreakdown 4), capped at 10.',
  },
  {
    group: 'Creator profile & analytics',
    tool: 'get_{youtube,instagram,tiktok}_content_detail',
    cost: '3',
    notes: 'Fractional: 0.1 / item, capped at 3 (~30 items).',
  },
  {
    group: 'Creator profile & analytics',
    tool: 'get_{youtube,instagram,tiktok}_contact',
    cost: '15',
    notes: 'EXPENSIVE — the priciest per-creator call. One billable field (emails) = full price, so fractional selection saves nothing.',
  },
  {
    group: 'Creator profile & analytics',
    tool: 'get_{youtube,instagram}_sponsorship',
    cost: '5',
    notes: 'YouTube + Instagram only (no TikTok sponsorship endpoint). Fractional: 0.5 / brand, capped at 5.',
  },

  // ── Taxonomies ─────────────────────────────────────────────────────────────
  {
    group: 'Taxonomies',
    tool: 'list_{youtube,instagram,tiktok}_niches',
    cost: '1',
  },
  {
    group: 'Taxonomies',
    tool: 'list_youtube_topics',
    cost: '1',
    notes: 'YouTube only (IG/TT have no topic taxonomy).',
  },

  // ── YouTube subtitles ──────────────────────────────────────────────────────
  { group: 'YouTube subtitles', tool: 'get_youtube_subtitles_meta', cost: '1' },
  { group: 'YouTube subtitles', tool: 'get_youtube_subtitles_download', cost: '3' },

  // ── Sponsor / brand intelligence ───────────────────────────────────────────
  { group: 'Sponsor / brand intel', tool: 'search_sponsors', cost: '2 / page' },
  { group: 'Sponsor / brand intel', tool: 'list_sponsors', cost: '1 / page' },
  { group: 'Sponsor / brand intel', tool: 'get_sponsor_information', cost: '2' },
  {
    group: 'Sponsor / brand intel',
    tool: 'get_sponsor_creators',
    cost: '15 / page',
    notes: 'EXPENSIVE.',
  },
  {
    group: 'Sponsor / brand intel',
    tool: 'get_sponsor_performance',
    cost: '15 / page',
    notes: 'EXPENSIVE.',
  },
  { group: 'Sponsor / brand intel', tool: 'get_sponsor_audience', cost: '15', notes: 'EXPENSIVE.' },
  { group: 'Sponsor / brand intel', tool: 'get_sponsor_summary', cost: '15', notes: 'EXPENSIVE.' },
  {
    group: 'Sponsor / brand intel',
    tool: 'submit_sponsor',
    cost: '1 on acceptance',
    notes: '0 on duplicate ("done") or rejection. Rate-limited to 100 submissions/day per API key (separate from the credit pool).',
  },

  // ── Submit creators for indexing ───────────────────────────────────────────
  {
    group: 'Submit for indexing',
    tool: 'submit_{youtube,instagram,tiktok}_creators',
    cost: '0 (free)',
    notes: 'Free for every outcome — accepted, already-indexed ("done"), and invalid ("rejected"). Limits still apply: 1–100 ids/call; 10,000 ids/day per API key (one shared counter across all platforms, per UTC day; over-limit returns 429 RATE_LIMIT_EXCEEDED).',
  },

  // ── Account ────────────────────────────────────────────────────────────────
  {
    group: 'Account',
    tool: 'get_api_usage',
    cost: '0 (free)',
    notes: 'Returns usage history + your remaining credit balance.',
  },
];

/**
 * Render the cost table as a Markdown document — the body of the
 * `creatordb://credits/costs` resource.
 */
export function renderCreditCostsMarkdown(): string {
  const groups: string[] = [];
  for (const row of CREDIT_COST_ROWS) {
    if (!groups.includes(row.group)) groups.push(row.group);
  }

  const sections = groups
    .map((group) => {
      const rows = CREDIT_COST_ROWS.filter((r) => r.group === group)
        .map((r) => `| \`${r.tool}\` | ${r.cost} | ${r.notes ?? ''} |`)
        .join('\n');
      return `### ${group}\n\n| Tool | Credits | Notes |\n| --- | --- | --- |\n${rows}`;
    })
    .join('\n\n');

  return `# CreatorDB — credit costs per tool

Up-front credit cost for every tool. Read this **before** making paid calls so you
can budget credits and avoid surprises (e.g. \`search_youtube_content\` costs 50).

- Costs are in **display credits**. The **exact** charge for any call is returned
  as \`creditsUsed\` in that call's response — this table is the estimate.
- Check your **live balance** any time with \`get_api_usage\` (free, 0 credits).
- Several tools support **fractional \`fields\`**: request only the fields/blocks you
  need to pay less than the full price (see per-row notes). For the exact
  per-field / per-block prices, see each tool's \`fields\` parameter.
- \`{a,b,c}\` in a tool name is shorthand for the per-platform variants.

${sections}

---
_Costs verified against the live CreatorDB V3 API on ${CREDIT_COSTS_VERIFIED_ON}; the
creator-submit rows re-verified ${SUBMIT_REVERIFIED_ON} after submission became free
(API-308) and the daily cap rose to 10,000 (API-309). If a call's \`creditsUsed\` ever
disagrees with this table, trust \`creditsUsed\` and report the drift._
`;
}
