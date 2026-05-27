# CreatorDB MCP Server — Setup Guide for CreatorDB Engineers

A 5-minute setup for using CreatorDB's data inside Claude Code, Claude Desktop, or Cursor.

This MCP server exposes **42 tools** that let Claude search the CreatorDB index of YouTube, Instagram, and TikTok creators and pull profile, performance, audience demographics, content, contact, sponsorship, and brand-side data — all from inside an AI conversation. No SaaS UI, no curl, no manual API calls.

---

## Before you start

You need three things:

1. **Node.js 22 or newer** — `node -v` to check. Get it from <https://nodejs.org> if missing.
2. **An MCP-compatible client** — Claude Code, Claude Desktop, or Cursor.
3. **A CreatorDB V3 API key** — email <hello@creatordb.app> or grab one from your CreatorDB account settings. Keep it private; it's tied to your credit pool.

---

## Which client are you on?

- **Claude Code, Claude Desktop, Cursor** (desktop apps that run locally) → use the **local install** below.
- **Claude web (claude.ai) or Claude mobile** → these can't run a local process. Skip to [Claude web / mobile](#claude-web--mobile) at the bottom.

## Install (pick one method)

> **Recommended: Method 1** — it pulls the latest version on every launch and needs no manual cloning. Method 2 is for when you want to read/modify the source.

### Method 1 — `npx` from npm (zero setup)

This is the simplest path. The package is published publicly to npm as `@creatordbai/mcp-server` — no GitHub access required.

**Claude Code:**

```bash
claude mcp add creatordb -s user \
  -e CREATORDB_API_KEY=YOUR_CREATORDB_API_KEY \
  -- npx -y @creatordbai/mcp-server@latest
```

**Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS (or `%APPDATA%\Claude\claude_desktop_config.json` on Windows). If the file is empty or doesn't exist, create it with:

```json
{
  "mcpServers": {
    "creatordb": {
      "command": "npx",
      "args": ["-y", "@creatordbai/mcp-server@latest"],
      "env": { "CREATORDB_API_KEY": "YOUR_CREATORDB_API_KEY" }
    }
  }
}
```

If the file already has other MCP servers, just add the `creatordb` entry inside the existing `mcpServers` object.

**Cursor** — edit `~/.cursor/mcp.json` (or use the in-app MCP settings UI). Same JSON shape as Claude Desktop.

**Replace `YOUR_CREATORDB_API_KEY` with your actual CreatorDB API key** (a 32-character string from your CreatorDB account). Don't share the key, don't commit it, don't paste it into screenshots.

### Method 2 — clone and build locally

Use this if you want to read or modify the source.

```bash
git clone https://github.com/CreatorDB/creatordb-mcp-server.git
cd creatordb-mcp-server
npm install
npm run build

claude mcp add creatordb -s user \
  -e CREATORDB_API_KEY=YOUR_CREATORDB_API_KEY \
  -- node "$(pwd)/dist/index.js"
```

---

## Restart your MCP client

This is the single most important step and the one people forget.

- **Claude Code:** close the chat and open a new one (or quit the CLI and relaunch)
- **Claude Desktop:** quit fully (⌘Q on Mac) and reopen
- **Cursor:** reload window (⌘⇧P → "Developer: Reload Window")

Until you do this, your client is running with no knowledge of the new MCP server.

---

## Verify it works

In any Claude Code or Claude Desktop session, type `/mcp`. You should see:

```
creatordb · connected · 42 tools
```

If you see `failed` or `connecting…` stuck for more than 10 seconds, jump to Troubleshooting below.

Then ask Claude something concrete to test the data path:

> "Use creatordb to look up the YouTube profile for MrBeast (channelId UCX6OQ3DkcsbYNE6H8uQQuVA)."

You should get back display name, subscriber count, country, hashtags, related creators, video/shorts pricing — followed by a footer line like `Credits used: 2 | Remaining: 953,210`.

---

## What can you do with it?

42 tools across six categories. A non-exhaustive sampler:

### Find creators

- **Natural language across platforms**: *"Find US-based YouTube beauty creators with over 5M subscribers"* — `search_creators_nls` (the AI picks the right platform and converts your prompt into structured filters)
- **Structured filters per platform**: country, language, follower thresholds, niches, hashtags, audience demographics, sponsorship status — `search_youtube` / `search_instagram` / `search_tiktok`. Common YT field is `totalSubscribers`; IG/TT use `totalFollowers`. Each search costs 1 credit per 10 filters.

### Find individual posts (content search)

Different from creator search — this returns videos / reels / images / shorts / TikToks rather than channels. Useful for trend analysis, campaign-style sweeps, or sponsorship discovery at the content level.

- **YouTube videos / shorts / streams** — `search_youtube_content`. Filterable by `publishTime` (days ago), `views`, `likes`, `comments`, `engagement`, `lengthSec`, `isSponsored`, `partneredBrands`, `language`, `category`, and creator-level fields (country, niches, topics, etc.). Returns title, thumbnail, URL, hashtags, sponsorship flags, plus a nested creator block.
- **Instagram images / reels / slideshows** — `search_instagram_content`. No `views` or `lengthSec` (IG data model limit). Description filter searches caption AND reel title together. `isSponsored` filter respects the `partneredBrands` index.
- **TikTok videos** — `search_tiktok_content`. Filterable by `plays`, `diggs` (likes), `comments`, `shares`, `engagement`, `lengthSec`. **No `isSponsored` / `partneredBrands` filter** — TikTok brand-attribution isn't implemented yet on the V3 side.

Common pattern across all three: filter values for numeric ops must be numbers, not numeric strings; hashtag values on IG/TT need a `#` prefix. Each content-search call costs 2 credits per page.

### Pull data on a known creator

- Profile (handle, followers, country, languages, linked socials, hashtags, related creators, plus YT-only `videoPrice`/`shortsPrice` CPM bands) — `get_*_profile`
- Audience demographics (top 6 countries, gender split, average age, fixed 7-bucket age breakdown) — `get_*_audience` (10 credits)
- Engagement metrics + consistency scores (YT also exposes an all-time window of up to 800 videos in addition to the recent R20) — `get_*_performance`
- Daily metric snapshots over a `pastDayRange` (1–365 days) — `get_*_performance_history`
- Recent posts with per-item engagement (TT items include audio metadata; YT includes `isMemberOnly`; IG includes `mentionedCreators`) — `get_*_content_detail`
- Sponsored content grouped by indexed brand — `get_*_sponsorship` (YouTube + Instagram only; TikTok not supported). Empty list ≠ "no sponsors" — only the most recent ~20–30 posts are scanned against the indexed brand list
- Email contacts — `get_*_contact` (15 credits — use sparingly)

### Brand-side / sponsor intelligence

**YouTube + Instagram only** — TikTok brand data is not indexed in CreatorDB.

Brand-key is `brandId`, typically the brand's primary domain (e.g. `"acer.com"`, `"nike.com"`).

- **Search brands** — *"Which brands sponsor YouTube creators in the gaming vertical?"* — `search_sponsors` (2 credits per page). Filterable by industry, country, sponsoring platforms, total sponsored content, and YouTube spend estimates (7d/30d/90d).
- **Browse the brand catalog** — `list_sponsors` (1 credit per page) for paginating through all 10K+ indexed brands without filters.
- **Brand profile** — `get_sponsor_information` (2 credits). Aliases, logo, description, company size, key people, industries, location, website, social media, competitors.
- **Which creators has a brand sponsored?** — `get_sponsor_creators` (**25 credits per page**). Inverse of `get_*_sponsorship`. Returns per-creator followers, sponsoredCount, lastSponsoredDate, and the URLs of their sponsored posts.
- **How are those sponsored posts performing?** — `get_sponsor_performance` (**25 credits per page**). Per-creator stats in three scopes (lifetime, all-sponsored, this-brand-only) plus per-content engagement. YouTube-only fields: `estimatedCost`, `estimatedCreatorCPM`, `estimatedContentCPM`.
- **Audience demographics across the sponsored creator pool** — `get_sponsor_audience` (**25 credits**). Top 5 countries, gender split, age breakdown, aggregated across every creator this brand has worked with. YouTube data populated today; Instagram block reserved.
- **Cross-platform rollup** — `get_sponsor_summary` (**25 credits**). Per-platform creator counts, location/language breakdowns, spend estimates (7d/30d/90d), CPM30d, CPE30d, views/likes/comments aggregates, growth30d deltas. The fastest way to scope a competitor's influencer strategy.
- **Submit a brand for indexing** — `submit_sponsor` (1 credit on acceptance, 0 on duplicate). Rate-limited to 100/day per API key.

### Topic + niche taxonomies

CreatorDB classifies every creator into topics (coarse, YouTube-only) and niches (granular, per-platform). The per-creator IDs come back in `/profile` responses as opaque strings like `id_vlog_PeopleBlogs`. To resolve those to human names / channel counts, list the catalog:

- `list_youtube_topics` (1 credit) — ~470 topic entries. YouTube-only.
- `list_youtube_niches` / `list_instagram_niches` / `list_tiktok_niches` (1 credit each) — full niche catalog per platform (10K–14K entries each).

Each platform has its own independent niche namespace — `id_vlog_PeopleBlogs` (YT) and `id_love_All` (IG) live in different namespaces and aren't interchangeable.

### Account

- `get_api_usage` (free, 0 credits) — daily request counts and credit consumption broken down by endpoint and platform. Defaults to last 7 days.

### Cost quick-reference

Most tools cost 1–5 credits. The exceptions to know:

| Tool | Cost | Why expensive |
| --- | --- | --- |
| `get_*_contact` | 15 | Email lookup |
| `get_*_audience` | 10 | Demographics computation |
| `get_sponsor_creators` | 25/page | Cross-creator aggregation |
| `get_sponsor_performance` | 25/page | Per-content stats × per-creator stats |
| `get_sponsor_audience` | 25 | Pool-level demographics |
| `get_sponsor_summary` | 25 | Cross-platform rollup |

Use `search_sponsors` / `list_sponsors` / `get_sponsor_information` (1–2 credits each) for cheap brand exploration first; reserve the 25-credit tools for brands you've already shortlisted.

For the full 42-tool reference with response shapes and gotchas, see the main [README on GitHub](https://github.com/CreatorDB/creatordb-mcp-server#tools).

---

## Cross-platform gotchas worth knowing

The three platforms have meaningful differences that the AI sometimes doesn't catch on its own. If a tool call fails or returns unexpected results, check:

| Issue | Fix |
| --- | --- |
| YouTube: takes `channelId`, must be the UC… form (not `@handle`) | Resolve `@creator` to a UC ID first via search |
| Instagram: takes `uniqueId` (the handle), NOT `userId` | If you see `VALIDATION_ERROR` on IG, this is usually it |
| TikTok: takes `uniqueId` (the handle) | Same as IG |
| TikTok has no `/sponsorship` endpoint and no brand-side sponsor data | Won't find TT brand intelligence — by design, not a bug |
| YouTube uses `totalSubscribers`; IG/TT use `totalFollowers` | If a numeric filter returns nothing on IG/TT, check field name |
| Hashtag filter values on IG/TT need a `#` prefix | `"#beauty"` not `"beauty"` |
| Numeric filter values must be numbers, NOT numeric strings | `1000000` not `"1000000"` (returns VALIDATION_ERROR) |
| Empty `sponsorList` ≠ "no sponsors" | Only scans recent posts + indexed brands |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `/mcp` shows `creatordb` as `failed` | API key missing, wrong, or expired | Re-add the MCP entry with the correct key: `claude mcp remove creatordb && claude mcp add ...` |
| `/mcp` stuck on `connecting…` | npx is still downloading the package on first launch | Wait 30 seconds and re-run `/mcp`. First install can take a minute. |
| Tools work but every response ends `Credits used: undefined` | Stale tool schema cached by the client | Restart the MCP client (close + reopen chat in Claude Code, quit and relaunch Claude Desktop) |
| Errors mentioning `VALIDATION_ERROR` on Instagram tools | Older client schema using `userId` | Restart the client to refresh the schema |
| `EACCES: permission denied` from npx | Cache permission issue | `rm -rf ~/.npm/_npx` and restart the client |
| Network timeout fetching from npm | Behind a corporate proxy | Set `npm config set proxy http://your-proxy:port` |
| `Error: ENOENT` or `cannot find dist/index.js` (Method 2 only) | Forgot `npm run build` after cloning | `cd` into the repo and run `npm install && npm run build` |
| Behavior seems wrong but no error | Check `/mcp` to confirm `creatordb` is connected. If it shows fewer than 42 tools, you have an older cached version — see "Upgrading" below |

If none of these match, send <hello@creatordb.app> a screenshot of `/mcp` output plus the failing message.

---

## Upgrading to a newer version

If you used `@latest` in your config (recommended), nothing to do — every fresh MCP session pulls the current version automatically.

If you pinned to a specific version (or your install pre-dates the `@latest` convention), force a refresh:

```bash
# Wipe the npx cache so the next launch fetches current latest
rm -rf ~/.npm/_npx

# Then restart your MCP client
```

To verify which version is running, in any Claude session ask: *"What version of the creatordb MCP server is connected?"* — the answer comes from the MCP initialize handshake.

---

## API key safety

- **Never commit your API key.** Not to git, not to a shared doc, not to a screenshot.
- **The key lives in the MCP client's config file** (`claude_desktop_config.json`, `~/.cursor/mcp.json`, etc.) which is in a user-only directory. Same trust model as `~/.ssh/id_rsa`.
- **Don't paste your key into chat threads or PR descriptions.** If you accidentally do, rotate the key in your CreatorDB account immediately.
- **One key per person.** Don't share keys across teammates — your credit usage shows up under whoever owns the key.

---

## Claude web / mobile

Claude in the browser (claude.ai) and the mobile apps can't run a local `npx` process, so they connect to the **hosted endpoint** instead. No Node, no install — just add a custom connector:

```
URL:  https://mcp.creatordb.app/mcp
Auth: Authorization: Bearer <your CreatorDB V3 API key>
```

In Claude web: **Settings → Connectors → Add custom connector** → paste the URL → provide your V3 API key as the Bearer token. The same 42 tools appear, identical to the local install.

Notes:
- Your API key is read per-request and never stored on the server.
- Health check (no auth): <https://mcp.creatordb.app/health> — returns `{"status":"ok",...}` if the service is up.
- Same API-key safety rules apply (see above) — your usage is billed to whoever owns the key.

---

## Getting help

- **Issues with the MCP server itself** (bugs, missing tools, weird behavior): file an issue at <https://github.com/CreatorDB/creatordb-mcp-server/issues>, or email <hello@creatordb.app>
- **Questions about CreatorDB's data** (why does a creator look this way, why is country wrong, etc.): email <hello@creatordb.app>
- **Wanting a new tool that wraps an endpoint we don't expose**: open a GitHub issue with the V3 endpoint path + use case, or email <hello@creatordb.app> — happy to add

The MCP is intentionally a thin wrapper over the V3 API. If something the V3 API supports isn't in the MCP, it's a missing tool, not a missing feature — please ask and we'll add it.
