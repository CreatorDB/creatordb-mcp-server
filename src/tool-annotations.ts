import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

/**
 * Behavior annotations for every CreatorDB MCP tool, keyed by tool name.
 *
 * Single source of truth: `registerAllTools` injects these into each
 * `server.tool(...)` registration (see register-tools.ts), so the tools/list
 * response advertises accurate read-only / destructive hints. Anthropic's
 * Connectors Directory requires this, and a missing/incorrect hint is a common
 * rejection reason.
 *
 * Rules:
 * - Reads query live external social data (30M+ creators, updated near-daily)
 *   → readOnlyHint: true, openWorldHint: true. `get_api_usage` reads only the
 *   caller's own account → closed-world.
 * - The four `submit_*` tools enqueue an ADDITIVE, de-duplicated indexing
 *   request — they never modify or delete existing data → not read-only, not
 *   destructive, idempotent.
 */

// Live external creator data → open-world read.
const read = (title: string): ToolAnnotations => ({ title, readOnlyHint: true, openWorldHint: true });
// Enqueue an additive, de-duplicated indexing request.
const submit = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
});

export const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  // account — own account, closed-world
  get_api_usage: { title: 'Get API Usage & Remaining Credits', readOnlyHint: true, openWorldHint: false },

  // instagram
  get_instagram_profile: read('Get Instagram Profile'),
  get_instagram_contact: read('Get Instagram Contact Emails'),
  get_instagram_performance: read('Get Instagram Performance'),
  get_instagram_performance_history: read('Get Instagram Performance History'),
  get_instagram_audience: read('Get Instagram Audience Demographics'),
  get_instagram_content_detail: read('Get Instagram Content Detail'),
  get_instagram_sponsorship: read('Get Instagram Sponsorships'),
  search_instagram: read('Search Instagram Creators'),
  search_instagram_content: read('Search Instagram Content'),
  list_instagram_niches: read('List Instagram Niches'),
  submit_instagram_creators: submit('Submit Instagram Creators for Indexing'),

  // tiktok
  get_tiktok_profile: read('Get TikTok Profile'),
  get_tiktok_contact: read('Get TikTok Contact Emails'),
  get_tiktok_performance: read('Get TikTok Performance'),
  get_tiktok_performance_history: read('Get TikTok Performance History'),
  get_tiktok_audience: read('Get TikTok Audience Demographics'),
  get_tiktok_content_detail: read('Get TikTok Content Detail'),
  search_tiktok: read('Search TikTok Creators'),
  search_tiktok_content: read('Search TikTok Content'),
  list_tiktok_niches: read('List TikTok Niches'),
  submit_tiktok_creators: submit('Submit TikTok Creators for Indexing'),

  // youtube
  get_youtube_profile: read('Get YouTube Profile'),
  get_youtube_contact: read('Get YouTube Contact Emails'),
  get_youtube_performance: read('Get YouTube Performance'),
  get_youtube_performance_history: read('Get YouTube Performance History'),
  get_youtube_audience: read('Get YouTube Audience Demographics'),
  get_youtube_content_detail: read('Get YouTube Content Detail'),
  get_youtube_sponsorship: read('Get YouTube Sponsorships'),
  get_youtube_subtitles_meta: read('Get YouTube Subtitle Metadata'),
  get_youtube_subtitles_download: read('Download YouTube Subtitles'),
  search_youtube: read('Search YouTube Creators'),
  search_youtube_content: read('Search YouTube Content'),
  list_youtube_niches: read('List YouTube Niches'),
  list_youtube_topics: read('List YouTube Topics'),
  submit_youtube_creators: submit('Submit YouTube Creators for Indexing'),

  // cross-platform search
  search_creators_nls: read('Natural-Language Creator Search'),

  // sponsors / brands
  get_sponsor_information: read('Get Brand/Sponsor Information'),
  get_sponsor_creators: read('Get Creators Sponsored by a Brand'),
  get_sponsor_performance: read('Get Sponsor Performance'),
  get_sponsor_audience: read('Get Sponsor Audience Demographics'),
  get_sponsor_summary: read('Get Sponsor Cross-Platform Summary'),
  list_sponsors: read('List Indexed Brands'),
  search_sponsors: read('Search Brands/Sponsors'),
  submit_sponsor: submit('Submit Brand/Sponsor for Indexing'),
};
