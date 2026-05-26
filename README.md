# creatordb-mcp-server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the [CreatorDB V3 API](https://apiv3.creatordb.app) to any MCP-compatible client (Claude Code, Claude Desktop, Cursor, etc.).

Use it to search the CreatorDB index of YouTube, Instagram, and TikTok creators and pull profile, performance, audience demographics, content, contact, and sponsorship data from inside an AI conversation — no SaaS UI, no curl.

## Install

```bash
npm install
npm run build
```

Requires Node ≥ 22.

## Configure

The server reads one environment variable: `CREATORDB_API_KEY` (your V3 key).

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "creatordb": {
      "command": "node",
      "args": ["/absolute/path/to/creatordb-mcp-server/dist/index.js"],
      "env": {
        "CREATORDB_API_KEY": "sk-..."
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add creatordb -- node /absolute/path/to/creatordb-mcp-server/dist/index.js
# then set CREATORDB_API_KEY in the environment Claude Code inherits, or in the mcp config
```

### Cursor / generic stdio

Point any MCP-over-stdio client at `node dist/index.js` with `CREATORDB_API_KEY` exported.

> **Heads-up — MCP clients cache tool schemas at session start.** If you `npm run build` after a code change, restart the MCP client (or close + reopen the chat) so it re-reads the tool list. A stale schema is the #1 cause of "the new param doesn't work."

## Tools

31 tools across five categories. Every tool returns a structured JSON payload plus a `Credits used: N | Remaining: M` footer line.

### Account (1)

| Tool | Cost | Notes |
| --- | --- | --- |
| `get_api_usage` | 0 | Daily request counts and credit consumption by endpoint. Defaults to last 7 days; takes optional `start`/`end` Unix-ms timestamps. |

### Search (4)

| Tool | Cost | Notes |
| --- | --- | --- |
| `search_creators_nls` | dynamic (token-based) | Natural-language search across all three platforms. The AI picks the platform and converts the query into filters. |
| `search_youtube` | 1 per 10 filters | Structured filter search. Use `totalSubscribers` for count thresholds. |
| `search_instagram` | 1 per 10 filters | Structured filter search. Use `totalFollowers` for count thresholds. |
| `search_tiktok` | 1 per 10 filters | Structured filter search. Use `totalFollowers` for count thresholds. |

**Filter type gotcha:** numeric ops (`>`, `<`, `=` on subscriber/follower/rate fields) require a **number** value, not a numeric string. `"1000000"` → `VALIDATION_ERROR`; `1000000` → ok.

**Hashtag value gotcha:** stored hashtags on IG/TT carry the leading `#`, so filter values usually want `"#beauty"`, not `"beauty"`.

### YouTube creator data (8 + 3 platform-specific)

Creator-key: `channelId` (the UC… form — `@handle` / `/c/` / `/user/` URLs are not accepted; resolve first).

| Tool | Cost | Returns |
| --- | --- | --- |
| `get_youtube_profile` | 2 | Identity, subscribers, country, language, linked socials, channel categories, plus the creator's `topics` and `niches`. |
| `get_youtube_contact` | 15 | Email addresses. |
| `get_youtube_performance` | 2 | R20 (last 20 videos) + all-time (up to 800) engagement metrics; consistency scores. |
| `get_youtube_performance_history` | 3 | Daily snapshots over the past N days. Takes `pastDayRange` (string integer, 1–365). |
| `get_youtube_audience` | 10 | Age buckets, gender split, top countries. |
| `get_youtube_content_detail` | 3 | Recent videos + shorts with per-item engagement. |
| `get_youtube_sponsorship` | 5 | Sponsored content grouped by indexed brand (recent posts only — empty list ≠ "no sponsors"). |
| `list_youtube_topics` | 1 | The full YT TOPIC taxonomy (~470+ entries with channelCount). **YouTube-only — IG and TT do not have a topic taxonomy.** No parameters. |
| `list_youtube_niches` | 1 | The full YT NICHE taxonomy (~14K entries with channelCount). No parameters. |
| `get_youtube_subtitles_meta` | 1 | Per-video subtitle track listing. Takes `videoId` (not channelId). |
| `get_youtube_subtitles_download` | 3 | Subtitle text for one video. Takes `videoId`, optional `language` (ISO 639-3). |

### Instagram creator data (8)

Creator-key: `uniqueId` (the handle, no `@`).

| Tool | Cost | Returns |
| --- | --- | --- |
| `get_instagram_profile` | 2 | Identity, followers, country, language, isBusinessAccount, linked socials, hashtags, account categories, plus the creator's `niches`. |
| `get_instagram_contact` | 15 | Email addresses. |
| `get_instagram_performance` | 2 | First-page image + reels engagement; consistency scores. |
| `get_instagram_performance_history` | 3 | Daily snapshots over the past N days. Takes `pastDayRange`. |
| `get_instagram_audience` | 10 | Age buckets, gender split, top countries. |
| `get_instagram_content_detail` | 2 | Recent images + reels with per-item engagement. |
| `get_instagram_sponsorship` | 5 | Sponsored content grouped by indexed brand (recent posts only). |
| `list_instagram_niches` | 1 | The full IG NICHE taxonomy. **Instagram does NOT have a "topics" taxonomy.** No parameters. |

### TikTok creator data (7)

Creator-key: `uniqueId` (the handle, no `@`).

| Tool | Cost | Returns |
| --- | --- | --- |
| `get_tiktok_profile` | 2 | Identity, followers, country, language, hashtags, plus the creator's `niches`. |
| `get_tiktok_contact` | 15 | Email addresses. |
| `get_tiktok_performance` | 2 | Recent videos engagement (views, likes, comments, shares); consistency scores. |
| `get_tiktok_performance_history` | 3 | Daily snapshots over the past N days. Takes `pastDayRange`. |
| `get_tiktok_audience` | 10 | Age buckets, gender split, top countries. |
| `get_tiktok_content_detail` | 2 | Recent videos with audio metadata, duet/stitch/commerce flags, per-item engagement. |
| `list_tiktok_niches` | 1 | The full TT NICHE taxonomy. **TikTok does NOT have a topics taxonomy, and does NOT expose a per-brand sponsorship endpoint.** No parameters. |

## Cross-platform differences cheat-sheet

| Dimension | YouTube | Instagram | TikTok |
| --- | --- | --- | --- |
| Creator parameter | `channelId` (UC…) | `uniqueId` (handle) | `uniqueId` (handle) |
| Follower field | `totalSubscribers` | `totalFollowers` | `totalFollowers` |
| Has a topic taxonomy | ✅ `list_youtube_topics` | ❌ | ❌ |
| Has a niche taxonomy | ✅ `list_youtube_niches` | ✅ `list_instagram_niches` | ✅ `list_tiktok_niches` |
| Per-creator niches in `/profile` | ✅ | ✅ | ✅ |
| Per-creator topics in `/profile` | ✅ | ❌ | ❌ |
| Sponsorship per-brand endpoint | ✅ | ✅ | ❌ |
| Content types in `/content-detail` | videos + shorts | images + reels | videos |
| `/content-detail` cost | 3 | 2 | 2 |
| Performance windows | R20 + all-time (up to 800) | First-page | Recent |
| Engagement formula | (L+C+V) / subscribers | (L+C) / followers | (L+C+Shares) / followers |
| Subtitles endpoints | ✅ | ❌ | ❌ |

Niche IDs are **not interchangeable across platforms** — `id_vlog_PeopleBlogs` (YT) and `id_love_All` (IG) live in different namespaces. Niche/topic IDs follow the pattern `id_{slug}_{Category}`, so you can group by category by splitting on the last `_`.

## Response shape highlights

These are the fields that aren't obvious from the endpoint name but you'll reach for constantly. All confirmed against live responses.

### `/profile`

Shared across YT/IG/TT:
- `subscriberGrowth: { g7, g30, g90 }` — % change in subscribers/followers over the last 7/30/90 days. Free trend signal — no need to call `performance-history` if you only want the headline number.
- `hashtags: [{ name, contentCount }]` — hashtags the creator uses (note: `name` carries the `#` on IG/TT).
- `niches: ["id_vlog_PeopleBlogs", …]` — per-creator niche IDs. To resolve the human-readable name + category + channelCount, cross-reference `list_{platform}_niches`.
- `relatedCreators` — discovery vector. YT gives ~50–250 UC channelIds; IG gives ~50 handles. Cheap way to expand a seed list.
- `lastPublishTime` / `lastDbUpdateTime` — Unix-ms; pair them to know how stale the snapshot is vs how recently the creator posted.
- `country` — ISO 3166-1 alpha-3 (e.g. `"USA"`, `"JPN"`). On IG this is the field with the known Israeli-creator bias bug (sometimes returns JPN/THA/ITA for `country: ISR`).

YT-only:
- `topics: ["id_challenges_Comedy", …]` — coarse topic IDs (~470 universe). Resolve via `list_youtube_topics`.
- `videoPrice` + `shortsPrice`: `{ cpmLow, cpmRaw, cpmHigh, priceLow, priceRaw, priceHigh }` — sponsored video / shorts CPM and dollar rate bands. **YouTube-only**; IG/TT do not return pricing in `/profile`.
- `categoryBreakdown: [{ category, share }]` — share of recent content by YouTube native category.
- `hasMemberOnlyContents` — boolean.

IG-only:
- `isBusinessAccount`, `isPrivateAccount` — flags worth checking before promising audience data; private accounts can't be scraped.
- `otherLinks` — bio links array.

TT-only:
- `otherLinks` — bio link (TikTok allows one).

### `/audience`

Identical shape across platforms:
- `audienceLocations: [{ country, share }]` — top 6 countries with shares summing to roughly 1.0.
- `audienceGender: { maleRatio, femaleRatio }` — sums to ~1.0; binary split only.
- `audienceAvgAge` — integer.
- `audienceAgeBreakdown: [{ ageRange, share }]` — fixed buckets `13-17 | 18-24 | 25-34 | 35-44 | 45-54 | 55-64 | 65+`. Always 7 entries; placeholder rows are all-zero (see footgun list below).

### `/performance`

The R20-vs-all distinction is YT-only:
- YT returns four sibling objects: `videosPerformanceRecent`, `videosPerformanceAll`, `shortsPerformanceRecent`, `shortsPerformanceAll`. "Recent" = R20 (last 20). "All" = up to 800. Each has `likes/comments/views` (with `avg/median/min/max/percentile25/percentile75/iqr`) and an `engagement` block.
- IG returns `imagesPerformanceRecent` + `reelsPerformanceRecent`. No all-time window.
- TT returns `videosPerformanceRecent`. No all-time window.
- Every `engagement` block ends with `engagementConsistency: { cv, medianVsMean, topBottomRatio, consistencyScore, consistencyLevel }`. `consistencyScore` is 0–100; `consistencyLevel` is `"high"` (81–100), `"moderate"` (51–80), or `"low"` (0–50). Requires ≥6 content pieces, otherwise the consistency block is absent.
- `ranking` block carries `global`, `country`, `language` percentile ranks for `totalSubscribers`/`totalFollowers` and `avgEngagementRate` — useful for "is this creator above average for their country" without separate benchmarking.
- `recentVideosGrowth.g7/g30/g90` — engagement-rate delta over 7/30/90 days. Negative numbers mean engagement is declining.
- `contentCountByDays: { 7d, 30d, 90d }` — how many posts in each window (use to detect dormant creators).

### `/content-detail`

Per-item objects across platforms:
- `publishTime` (Unix-ms), `contentId`, `likes`, `comments`, `views` (YT/TT only — IG images have no view count), `engagementRate` (rounded to 4 decimals).
- `hashtags: ["#example", …]` — already includes `#` prefix.

Platform-specific extras:
- YT: `length` (seconds), `isMemberOnly`, content mix includes both videos and shorts.
- IG: `mentionedCreators` — `@`-mentions in caption.
- TT: `audioId`, `audioTitle`, `audioAuthor`, `audioAlbum`, `isDuetEnabled`, `isAd`, `length` (seconds), `shares`. The audio block is the cheapest way to find trending sounds.

**Freshness rule** — content published within the last 4 days is excluded from all metric calculations (all platforms). **Pinned-post rule** — on IG/TT, a pinned post older than 90 days is excluded if it would be the oldest item in the sample.

### `/sponsorship`

YT and IG only — TikTok does not have a per-brand sponsorship endpoint.
- `sponsorList: [{ brandName, brandId, brandIgIds, sponsoredVideos, sponsoredVideosPerformance }]`.
- `brandIgIds` — the brand's IG handles. Use this to follow a brand from a sponsored creator back to the brand's own profile.
- `sponsoredVideos` includes each sponsored content's full per-item engagement (same shape as `/content-detail`).
- **Important caveat** — only scans the most recent ~20–30 posts and only detects brands already indexed in CreatorDB. An empty `sponsorList` is **not** proof the creator has no sponsors; it's "we didn't find indexed sponsors in their recent posts."

### Search (`search_{platform}` and `search_creators_nls`)

Structured search response:
- `creatorList: [{ displayName, uniqueId, channelId (YT only), avatarUrl, totalSubscribers | totalFollowers }]` — minimal projection; hydrate with `get_*_profile` for full data.
- `totalResults` — total matching the filter set, not just the page.
- `hasNextPage` + `nextOffset` — pagination idiom. Pass `nextOffset` as the next request's `offset` to advance.

NLS response:
- Same `creatorList` shape as structured search, plus a `platform: "youtube" | "instagram" | "tiktok"` field telling you which platform the AI routed to.
- Streamed over SSE under the hood; the MCP layer collects the final `data:` event and returns it as one payload.
- Dynamic pricing — typically 1–10 credits depending on input + output token count.

### `/usage`

- `records: [{ date (YYYYMMDD), requestCount, totalQuotaUsed, endpoints: { …per-endpoint counts }, platforms: { …per-platform counts }, quotaByPlatform }]`.
- `totalQuotaUsed` can be fractional (e.g. 4.49 for an NLS call).
- `endpoints` keys are camelCase: `getYoutubeProfile`, `getInstagramAudience`, `searchYoutube`, `getNLS`, etc. Useful for building a spend dashboard.

## Common footguns

- **Placeholder demographics**: when CreatorDB doesn't have real audience data, `/audience` returns the all-zero shape (`audienceGender: { maleRatio: 0, femaleRatio: 0 }`, age buckets all 0.0). Treat any row where male+female=0 as missing, not as "no gender data."
- **Empty `sponsorList` ≠ no sponsors** (see above).
- **`relatedCreators` is unranked** — order is not significance. Don't slice the first N and call them "top related"; sample or rerank by your own metric.
- **Freshness lag** — `lastDbUpdateTime` is when CreatorDB last refreshed. If it's older than ~14 days, the profile may not reflect recent breakout content.
- **Niche channelCount drifts** — `list_*_niches` is updated daily; don't cache it longer than that or your "creators in X niche" count will lag reality.
- **IG country bias** — see [v3-deployed-quirks memory + project memory on Israeli creators]. If `country` looks wrong for an IG creator, the AI location classifier is the suspect; BQ `bdMisc.countryCode` often has the right answer but isn't read by V3.

## Filter reference (search tools)

Common fields across all three platforms:
- `displayName` — string, supports fuzzy
- `uniqueId` — string, exact
- `country` — string, ISO 3166-1 alpha-3 (e.g. `"USA"`, `"JPN"`, `"GBR"`)
- `mainLanguage` — string, ISO 639-3 (e.g. `"eng"`, `"jpn"`, `"zhs"`)
- `hashtags` — string (with `#` prefix on IG/TT)
- `niches` — string (use IDs from the platform's `list_*_niches`)
- `mainAudienceLocation` / `mainAudienceAge` / `mainAudienceGender` — string
- `hasSponsors` — boolean

Platform-specific:
- YouTube: `totalSubscribers` (number), `topics` (string from `list_youtube_topics`)
- Instagram / TikTok: `totalFollowers` (number)

Operators: `>`, `<`, `=` for numbers; `=`, `in` for strings; `=` for booleans. `in` takes an array of up to 100 values. `pageSize` max 100; `filters` max 10 per request.

## Response envelope

Every tool returns the underlying CreatorDB V3 envelope:

```json
{
  "data": { },
  "creditsUsed": 2,
  "creditsAvailable": 953270.5,
  "traceId": "abc-123",
  "timestamp": 1779722787120,
  "errorCode": "",
  "errorDescription": "",
  "success": true
}
```

On error, the envelope carries `errorCode`, `error`, `message`, and `details`. The MCP layer flattens that into a clean error message with a `TraceId:` line for support.

## Development

```bash
npm run dev   # tsc --watch
npm run build # tsc once
npm start     # node dist/index.js
```

Source layout:

```
src/
  index.ts                 # registers all tools, stdio transport
  tools/
    account.ts             # 1 tool
    search.ts              # 4 tools (NLS + 3 platform searches)
    youtube.ts             # 11 tools
    instagram.ts           # 8 tools
    tiktok.ts              # 7 tools
  util/
    api-client.ts          # fetch wrapper for REST + SSE
    response.ts            # MCP result formatter (credits, errors)
```

## License

MIT
