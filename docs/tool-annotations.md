# CreatorDB MCP — Tool Behavior Annotations

For the **Anthropic Connectors Directory** submission (and general MCP hygiene). Anthropic
requires every tool to carry accurate behavior hints; a wrong `readOnlyHint` or a missing
one is a common rejection reason.

## Summary

- **45 tools total. 41 are read-only. 4 write.** None are destructive.
- **Rule for the 41 read tools:** `readOnlyHint: true`, `openWorldHint: true`
  (they query live external social data — 30M+ creators, updated near-daily).
  Exception: `get_api_usage` reads only the caller's own account → `openWorldHint: false`.
- **The 4 write tools** (`submit_*`) create **additive indexing requests** — they enqueue a
  creator/brand for CreatorDB to index. They never modify or delete existing data, so:
  `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`
  (re-submitting the same handle is de-duplicated), `openWorldHint: true`.

The 4 write tools, called out explicitly for the reviewer:
`submit_instagram_creators`, `submit_tiktok_creators`, `submit_youtube_creators`, `submit_sponsor`.

## Full annotation map (drop into each `server.tool(...)` call)

```json
{
  "get_api_usage":                  { "title": "Get API Usage & Remaining Credits",   "readOnlyHint": true,  "openWorldHint": false },

  "get_instagram_profile":          { "title": "Get Instagram Profile",               "readOnlyHint": true,  "openWorldHint": true },
  "get_instagram_contact":          { "title": "Get Instagram Contact Emails",         "readOnlyHint": true,  "openWorldHint": true },
  "get_instagram_performance":      { "title": "Get Instagram Performance",            "readOnlyHint": true,  "openWorldHint": true },
  "get_instagram_performance_history": { "title": "Get Instagram Performance History", "readOnlyHint": true,  "openWorldHint": true },
  "get_instagram_audience":         { "title": "Get Instagram Audience Demographics",  "readOnlyHint": true,  "openWorldHint": true },
  "get_instagram_content_detail":   { "title": "Get Instagram Content Detail",         "readOnlyHint": true,  "openWorldHint": true },
  "get_instagram_sponsorship":      { "title": "Get Instagram Sponsorships",           "readOnlyHint": true,  "openWorldHint": true },
  "search_instagram":               { "title": "Search Instagram Creators",            "readOnlyHint": true,  "openWorldHint": true },
  "search_instagram_content":       { "title": "Search Instagram Content",             "readOnlyHint": true,  "openWorldHint": true },
  "list_instagram_niches":          { "title": "List Instagram Niches",                "readOnlyHint": true,  "openWorldHint": true },

  "get_tiktok_profile":             { "title": "Get TikTok Profile",                   "readOnlyHint": true,  "openWorldHint": true },
  "get_tiktok_contact":             { "title": "Get TikTok Contact Emails",            "readOnlyHint": true,  "openWorldHint": true },
  "get_tiktok_performance":         { "title": "Get TikTok Performance",               "readOnlyHint": true,  "openWorldHint": true },
  "get_tiktok_performance_history": { "title": "Get TikTok Performance History",       "readOnlyHint": true,  "openWorldHint": true },
  "get_tiktok_audience":            { "title": "Get TikTok Audience Demographics",     "readOnlyHint": true,  "openWorldHint": true },
  "get_tiktok_content_detail":      { "title": "Get TikTok Content Detail",            "readOnlyHint": true,  "openWorldHint": true },
  "search_tiktok":                  { "title": "Search TikTok Creators",               "readOnlyHint": true,  "openWorldHint": true },
  "search_tiktok_content":          { "title": "Search TikTok Content",                "readOnlyHint": true,  "openWorldHint": true },
  "list_tiktok_niches":             { "title": "List TikTok Niches",                   "readOnlyHint": true,  "openWorldHint": true },

  "get_youtube_profile":            { "title": "Get YouTube Profile",                  "readOnlyHint": true,  "openWorldHint": true },
  "get_youtube_contact":            { "title": "Get YouTube Contact Emails",           "readOnlyHint": true,  "openWorldHint": true },
  "get_youtube_performance":        { "title": "Get YouTube Performance",              "readOnlyHint": true,  "openWorldHint": true },
  "get_youtube_performance_history":{ "title": "Get YouTube Performance History",      "readOnlyHint": true,  "openWorldHint": true },
  "get_youtube_audience":           { "title": "Get YouTube Audience Demographics",    "readOnlyHint": true,  "openWorldHint": true },
  "get_youtube_content_detail":     { "title": "Get YouTube Content Detail",           "readOnlyHint": true,  "openWorldHint": true },
  "get_youtube_sponsorship":        { "title": "Get YouTube Sponsorships",             "readOnlyHint": true,  "openWorldHint": true },
  "get_youtube_subtitles_meta":     { "title": "Get YouTube Subtitle Metadata",        "readOnlyHint": true,  "openWorldHint": true },
  "get_youtube_subtitles_download": { "title": "Download YouTube Subtitles",           "readOnlyHint": true,  "openWorldHint": true },
  "search_youtube":                 { "title": "Search YouTube Creators",              "readOnlyHint": true,  "openWorldHint": true },
  "search_youtube_content":         { "title": "Search YouTube Content",               "readOnlyHint": true,  "openWorldHint": true },
  "list_youtube_niches":            { "title": "List YouTube Niches",                  "readOnlyHint": true,  "openWorldHint": true },
  "list_youtube_topics":            { "title": "List YouTube Topics",                  "readOnlyHint": true,  "openWorldHint": true },

  "search_creators_nls":            { "title": "Natural-Language Creator Search",      "readOnlyHint": true,  "openWorldHint": true },

  "get_sponsor_information":        { "title": "Get Brand/Sponsor Information",        "readOnlyHint": true,  "openWorldHint": true },
  "get_sponsor_creators":          { "title": "Get Creators Sponsored by a Brand",    "readOnlyHint": true,  "openWorldHint": true },
  "get_sponsor_performance":       { "title": "Get Sponsor Performance",              "readOnlyHint": true,  "openWorldHint": true },
  "get_sponsor_audience":          { "title": "Get Sponsor Audience Demographics",    "readOnlyHint": true,  "openWorldHint": true },
  "get_sponsor_summary":           { "title": "Get Sponsor Cross-Platform Summary",   "readOnlyHint": true,  "openWorldHint": true },
  "list_sponsors":                 { "title": "List Indexed Brands",                  "readOnlyHint": true,  "openWorldHint": true },
  "search_sponsors":               { "title": "Search Brands/Sponsors",               "readOnlyHint": true,  "openWorldHint": true },

  "submit_instagram_creators":     { "title": "Submit Instagram Creators for Indexing", "readOnlyHint": false, "destructiveHint": false, "idempotentHint": true, "openWorldHint": true },
  "submit_tiktok_creators":        { "title": "Submit TikTok Creators for Indexing",    "readOnlyHint": false, "destructiveHint": false, "idempotentHint": true, "openWorldHint": true },
  "submit_youtube_creators":       { "title": "Submit YouTube Creators for Indexing",   "readOnlyHint": false, "destructiveHint": false, "idempotentHint": true, "openWorldHint": true },
  "submit_sponsor":                { "title": "Submit Brand/Sponsor for Indexing",      "readOnlyHint": false, "destructiveHint": false, "idempotentHint": true, "openWorldHint": true }
}
```

## How to apply in code

The MCP SDK's `server.tool()` accepts an `annotations` object as the 4th argument
(between the params schema and the handler):

```ts
server.tool(
  'get_instagram_profile',
  'Get an Instagram creator\'s profile: ... Costs 2 credits.',
  { ...uniqueIdParam, ...profileFields },
  { title: 'Get Instagram Profile', readOnlyHint: true, openWorldHint: true }, // ← add this
  async ({ uniqueId, fields }) => { /* ... */ },
);
```

Apply to all 45 registrations in `src/tools/*.ts`. This ships in both surfaces (the stdio npm
package and the remote `mcp.creatordb.app` connector, which reuses `registerAllTools`).

## Anthropic Connectors Directory — submission checklist

| Requirement | Status |
|---|---|
| Transport = Streamable HTTP (SSE no longer accepted) | ✅ `StreamableHTTPServerTransport` at `mcp.creatordb.app/mcp` |
| OAuth 2.1 | ✅ live (`/.well-known/oauth-authorization-server`) |
| Public Privacy Policy | ✅ `app.creatordb.app/privacy-policy` (linked on landing page) |
| Public Terms of Service | ✅ `app.creatordb.app/terms-of-service` |
| Per-tool read-only / destructive annotations | ⬜ **this doc — needs wiring into `server.tool()` calls** |
| Ownership verification (own the API/domain/resources) | ✅ we own creatordb.app + the API |

**One to-do:** wire the annotations above into the 45 `server.tool()` calls, redeploy, then submit.
