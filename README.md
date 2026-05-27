# creatordb-mcp-server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the [CreatorDB V3 API](https://apiv3.creatordb.app) to any MCP-compatible client (Claude Code, Claude Desktop, Cursor, etc.).

**42 tools across six surfaces:**

- **Creator-side data** — profile, performance, audience demographics, contact, content-detail, performance history for YouTube, Instagram, and TikTok
- **Creator search** — natural-language search across all three platforms, plus structured filter search per platform (country, language, follower thresholds, niches, hashtags, audience demographics, etc.)
- **Brand-side / sponsor intelligence** *(YouTube + Instagram only — TikTok brand data is not indexed)* — search CreatorDB's 10K+ indexed brands, pull a brand's full profile, list every creator a brand has sponsored, get aggregated audience demographics across a brand's sponsored creator pool, and cross-platform spend / CPM / CPE rollups. Most sponsor read endpoints cost 25 credits each — use deliberately.
- **Content search** — find individual videos, reels, images, shorts, or TikToks by content-level filters (publish time window, view/like thresholds, hashtags, sponsored-vs-organic, language, niche, etc.). Different from creator search — this returns posts, not channels.
- **Topic + niche taxonomies** — full catalogs (~470 YT topics, ~14K YT niches, ~10K each on IG/TT) for resolving the per-creator topic/niche IDs returned in profile responses.
- **Account** — credit usage broken down by endpoint and platform.

Every tool returns the underlying V3 JSON plus a `Credits used: N | Remaining: M` footer line, so the AI knows exactly what it's spending.

> **Working with Claude Code?** Open this README in Claude Code (or paste the URL into a Claude session) and say *"set up this MCP for me."* The steps below are written so an AI assistant can follow them top to bottom.

## Quick start

There are two ways to connect, depending on your client:

- **Local clients** (Claude Code, Claude Desktop, Cursor) run the server as a subprocess via `npx` — see [Install (local / stdio)](#install-local--stdio).
- **Web / mobile clients** (Claude web, Claude mobile) can't spawn subprocesses, so they connect to the hosted HTTP endpoint — see [Remote connector (Claude web / mobile)](#remote-connector-claude-web--mobile).

Both expose the same 42 tools. Both need a CreatorDB V3 API key.

1. **Prerequisites**
   - For the local route: Node.js 22 or newer (`node -v` to check)
   - A CreatorDB V3 API key — get one from <https://creatordb.app> account settings, or ask your team admin
2. **Pick a connection method** below
3. **Restart your MCP client** so it picks up the new tools
4. **Verify** by running `/mcp` in Claude Code — `creatordb` should appear with status `connected`

## Install (local / stdio)

For Claude Code, Claude Desktop, and Cursor. The server reads one environment variable: `CREATORDB_API_KEY` (your V3 key).

### Method A — `npx` from npm (recommended)

The package is published to npm as **`@creatordbai/mcp-server`**. No local clone, no SSH key, no GitHub access required:

**Claude Code:**
```bash
claude mcp add creatordb -s user \
  -e CREATORDB_API_KEY=sk-your-key-here \
  -- npx -y @creatordbai/mcp-server
```

**Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):
```json
{
  "mcpServers": {
    "creatordb": {
      "command": "npx",
      "args": ["-y", "@creatordbai/mcp-server"],
      "env": { "CREATORDB_API_KEY": "sk-your-key-here" }
    }
  }
}
```

If you have GitHub org access and want to track `main` instead of the npm release, swap the npm name for `git+ssh://git@github.com/CreatorDB/creatordb-mcp-server.git` — the repo's `prepare` script will build on install.

### Method B — clone and build locally

Good if you want to read/modify the source, or if `npx` from git doesn't work in your environment.

```bash
git clone https://github.com/CreatorDB/creatordb-mcp-server.git
cd creatordb-mcp-server
npm install
npm run build

# Then register with Claude Code:
claude mcp add creatordb -s user \
  -e CREATORDB_API_KEY=sk-your-key-here \
  -- node "$(pwd)/dist/index.js"
```

For Claude Desktop, use the same JSON as Method A but swap `command` + `args`:
```json
"command": "node",
"args": ["/absolute/path/to/creatordb-mcp-server/dist/index.js"],
```

### Method C — project-scoped via `.mcp.json` (best for teams)

Drop a `.mcp.json` into a CreatorDB project repo. Anyone who opens that repo in Claude Code gets prompted to enable the MCP — no per-person setup commands.

```json
{
  "mcpServers": {
    "creatordb": {
      "command": "npx",
      "args": ["-y", "git+ssh://git@github.com/CreatorDB/creatordb-mcp-server.git"],
      "env": { "CREATORDB_API_KEY": "${CREATORDB_API_KEY}" }
    }
  }
}
```

`${CREATORDB_API_KEY}` reads from the user's shell environment, so the key stays out of git. Each teammate sets it once in their `.zshrc`/`.bash_profile`:
```bash
export CREATORDB_API_KEY=sk-...
```

## Remote connector (Claude web / mobile)

Claude in the browser and the mobile apps can't spawn local subprocesses, so they connect to the **hosted HTTP endpoint** instead of running `npx`:

```
URL:  https://mcp.creatordb.app/mcp
Auth: Authorization: Bearer <your CreatorDB V3 API key>
```

In Claude web: **Settings → Connectors → Add custom connector**, paste the URL, and provide your V3 API key as a Bearer token. The same 42 tools appear.

Notes:
- The endpoint is stateless — your API key is read per-request from the `Authorization` header and never stored server-side.
- Hosted as a Firebase Cloud Function (gen 2) in `asia-northeast1`; source is in [`functions/`](./functions).
- A health check is available at <https://mcp.creatordb.app/health> (no auth, 0 credits) — returns `{"status":"ok",...}` if the service is up.
- Visiting <https://mcp.creatordb.app> in a browser shows a short landing page with these same instructions.

## Verify it works

After install, restart Claude Code (or your MCP client) and:

1. Run `/mcp` — you should see `creatordb` listed with status **connected**
2. Ask Claude something that uses the tools, e.g. *"use creatordb to look up the YouTube profile for MrBeast (channelId UCX6OQ3DkcsbYNE6H8uQQuVA)"*
3. The response should include creator data and a `Credits used: 2 | Remaining: …` footer

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `/mcp` shows `creatordb` as `failed` or `connecting` forever | API key missing or wrong | Re-add with `claude mcp remove creatordb && claude mcp add …` using the correct key |
| Tools work but every response ends `Credits used: undefined` | Stale tool schema from an older build of this server | Restart the MCP client — clients cache the schema at session start |
| `Error: VALIDATION_ERROR` on Instagram tools | Passing `userId` instead of `uniqueId` | IG endpoints take the handle as `uniqueId`. Older clients with stale schemas hit this most |
| `npx` install fails with `EACCES: permission denied` | npx cache permission issue | `rm -rf ~/.npm/_npx` and re-run |
| `Error: ENOENT` or `cannot find dist/index.js` | Method B didn't run `npm run build` | `cd` into the repo and run `npm install && npm run build` |
| Tool descriptions seem outdated vs this README | Schema cached from an old version | `claude mcp remove creatordb && claude mcp add …` to force a re-fetch |

> **Why restarts matter** — MCP clients fetch the tool list once at session start. Server updates (new tools, renamed params, fixed costs) only show up after the client reconnects. This is the single most common confusion.

> **Upgrading to a newer published version?** `npx` caches packages by exact version, so a configured client keeps running whatever version it first downloaded. To force-pull the latest, either pin to `@latest` in your config (`npx -y @creatordbai/mcp-server@latest` re-resolves each launch) or clear the npx cache once (`rm -rf ~/.npm/_npx`). Then restart the MCP client.

## Releasing (maintainers)

The `.github/workflows/release.yml` workflow publishes to npm whenever a `v*.*.*` tag is pushed.

```bash
# bump version, commit, tag, push
npm version patch              # or minor / major
git push && git push --tags
```

The workflow validates that the tag matches `package.json` `version`, runs `npm ci`, builds, and publishes via [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) with sigstore provenance attestation. No long-lived `NPM_TOKEN` is stored — the workflow exchanges a GitHub OIDC token for a short-lived npm publish token at runtime.

## Roadmap

- **Goal**: list in the [MCP registry](https://modelcontextprotocol.io) and Claude's MCP marketplace so the server shows up when users browse MCP servers from inside their client.
- Contributions, issues, and feedback welcome — see [Getting help](#getting-help) below.

## Tools

42 tools across six categories. Every tool returns a structured JSON payload plus a `Credits used: N | Remaining: M` footer line.

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

### Sponsors / brand data (8)

Brand-side intelligence: which brands sponsor creators, how much they spend, which creators they work with. Sponsor data covers **YouTube and Instagram only** — TikTok is not indexed for brands.

Brand-key: `brandId`, typically the brand's primary domain (e.g. `"acer.com"`, `"nike.com"`).

| Tool | Cost | Returns |
| --- | --- | --- |
| `search_sponsors` | 2 per page | Brand search by structured filters. Lean records (brandId, name, logo, industries, country). |
| `list_sponsors` | 1 per page | Paginated directory of all 10K+ indexed brands. |
| `get_sponsor_information` | 2 | Full brand profile: aliases, keyPeople, industries, location, website, socialMedia, competitors. |
| `get_sponsor_creators` | **25 per page** | Inverse of `get_*_sponsorship` — which creators has this brand sponsored. Returns followers, lastSponsoredDate, sponsoredCount, topics, niches per creator. |
| `get_sponsor_performance` | **25 per page** | Per-content sponsorship perf. Three stats scopes per creator (creatorTotal, allSponsored lifetime, this-brand-only). YT-only: estimatedCost, CPM. |
| `get_sponsor_audience` | **25** | Aggregated audience demographics across the brand's sponsored creator pool. IG block reserved but null today (backend YT-only). |
| `get_sponsor_summary` | **25** | Cross-platform rollup: totalSponsoredCreators/Content, per-platform creators + performance + growth30d. |
| `submit_sponsor` | 1 (0 if duplicate) | Submit a brand for indexing. Rate-limited 100/day per key. Returns submissionId + status. |

**Cost warning** — `get_sponsor_creators`, `get_sponsor_performance`, `get_sponsor_audience`, `get_sponsor_summary` each cost **25 credits** per call. Use `search_sponsors` / `list_sponsors` / `get_sponsor_information` for cheap exploration first.

### YouTube creator data (8 + 4 platform-specific)

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
| `search_youtube_content` | 2 per page | Search individual VIDEOS/SHORTS/STREAMS by content-level filters (different from `search_youtube`, which searches creators). Returns title, publishTime, views, isSponsored, partneredBrands, hashtags + nested creator block. Both content-level and creator-level filters supported. |
| `get_youtube_subtitles_meta` | 1 | Per-video subtitle track listing. Takes `videoId` (not channelId). |
| `get_youtube_subtitles_download` | 3 | Subtitle text for one video. Takes `videoId`, optional `language` (ISO 639-3). |

### Instagram creator data (8 + 1)

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
| `search_instagram_content` | 2 per page | Search individual IMAGES/REELS by content-level filters (different from `search_instagram`, which searches creators). NO views or lengthSec (IG data model). Returns description, publishTime, likes, isSponsored, partneredBrands, hashtags + nested creator block. |
| `list_instagram_niches` | 1 | The full IG NICHE taxonomy. **Instagram does NOT have a "topics" taxonomy.** No parameters. |

### TikTok creator data (7 + 1)

Creator-key: `uniqueId` (the handle, no `@`).

| Tool | Cost | Returns |
| --- | --- | --- |
| `get_tiktok_profile` | 2 | Identity, followers, country, language, hashtags, plus the creator's `niches`. |
| `get_tiktok_contact` | 15 | Email addresses. |
| `get_tiktok_performance` | 2 | Recent videos engagement (views, likes, comments, shares); consistency scores. |
| `get_tiktok_performance_history` | 3 | Daily snapshots over the past N days. Takes `pastDayRange`. |
| `get_tiktok_audience` | 10 | Age buckets, gender split, top countries. |
| `get_tiktok_content_detail` | 2 | Recent videos with audio metadata, duet/stitch/commerce flags, per-item engagement. |
| `search_tiktok_content` | 2 per page | Search individual VIDEOS by content-level filters (different from `search_tiktok`, which searches creators). NO isSponsored/partneredBrands (TT brand-attribution not implemented). Filter terminology uses `diggs` but response normalizes to `likes`. |
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
| Content-search endpoint | ✅ | ✅ | ✅ |
| Brand-side sponsor data | ✅ | ✅ | ❌ |

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
- `country` — ISO 3166-1 alpha-3 (e.g. `"USA"`, `"JPN"`). On IG this value is derived from a content classifier rather than a self-declared field, and can occasionally be wrong for creators with multi-country presence — cross-check against `audienceLocations` and the creator's bio if accuracy matters.

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
- **IG `country` is classifier-derived** — unlike YT/TT (which read from self-declared profile fields), Instagram `country` is inferred from content. Treat it as a best-effort signal, not ground truth. Cross-check against `audienceLocations` and bio language when accuracy matters.

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
    search.ts              # 4 tools (NLS + 3 platform creator searches)
    youtube.ts             # 12 tools (incl. search_youtube_content)
    instagram.ts           # 9 tools (incl. search_instagram_content)
    tiktok.ts              # 8 tools (incl. search_tiktok_content)
    sponsors.ts            # 8 tools (brand-side sponsor intelligence)
  util/
    api-client.ts          # fetch wrapper for REST + SSE
    response.ts            # MCP result formatter (credits, errors)
```

## Getting help

- **Bugs / feature requests / new endpoint coverage**: open an issue at <https://github.com/CreatorDB/creatordb-mcp-server/issues>
- **API key / data questions**: <hello@creatordb.app>
- **Just trying to install it on your machine?** See [SETUP.md](./SETUP.md) — a 5-minute guide aimed at end users rather than contributors.

## License

MIT
