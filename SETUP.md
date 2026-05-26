# CreatorDB MCP Server — Setup Guide for CreatorDB Engineers

A 5-minute setup for using CreatorDB's data inside Claude Code, Claude Desktop, or Cursor.

This MCP server exposes **42 tools** that let Claude search the CreatorDB index of YouTube, Instagram, and TikTok creators and pull profile, performance, audience demographics, content, contact, sponsorship, and brand-side data — all from inside an AI conversation. No SaaS UI, no curl, no manual API calls.

---

## Before you start

You need three things:

1. **Node.js 22 or newer** — `node -v` to check. Get it from <https://nodejs.org> if missing.
2. **An MCP-compatible client** — Claude Code, Claude Desktop, or Cursor.
3. **A CreatorDB V3 API key** — ask Dominic or grab one from your CreatorDB account settings. Keep it private; it's tied to your credit pool.

---

## Install (pick one method)

> **Recommended: Method 1** — it pulls the latest version on every launch and needs no manual cloning. Method 2 is for when you want to read/modify the source.

### Method 1 — `npx` from npm (zero setup)

This is the simplest path. The package is published publicly to npm as `@creatordbai/mcp-server` — no GitHub access required.

**Claude Code:**

```bash
claude mcp add creatordb -s user \
  -e CREATORDB_API_KEY=sk-your-key-here \
  -- npx -y @creatordbai/mcp-server@latest
```

**Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS (or `%APPDATA%\Claude\claude_desktop_config.json` on Windows). If the file is empty or doesn't exist, create it with:

```json
{
  "mcpServers": {
    "creatordb": {
      "command": "npx",
      "args": ["-y", "@creatordbai/mcp-server@latest"],
      "env": { "CREATORDB_API_KEY": "sk-your-key-here" }
    }
  }
}
```

If the file already has other MCP servers, just add the `creatordb` entry inside the existing `mcpServers` object.

**Cursor** — edit `~/.cursor/mcp.json` (or use the in-app MCP settings UI). Same JSON shape as Claude Desktop.

**Replace `sk-your-key-here` with your actual CreatorDB API key.** Don't share the key, don't commit it, don't paste it into screenshots.

### Method 2 — clone and build locally

Use this if you want to read or modify the source. Requires GitHub read access to `CreatorDB/creatordb-mcp-server` (private repo).

```bash
git clone https://github.com/CreatorDB/creatordb-mcp-server.git
cd creatordb-mcp-server
npm install
npm run build

claude mcp add creatordb -s user \
  -e CREATORDB_API_KEY=sk-your-key-here \
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

### Search and discover

- **Natural language**: *"Find US-based YouTube beauty creators with over 5M subscribers"* — uses `search_creators_nls`
- **Structured filters**: country = JPN AND totalFollowers > 5M, sorted by followers — uses `search_youtube` / `search_instagram` / `search_tiktok`
- **Search individual posts** (not creators): *"Find Instagram reels mentioning #vegan in the last 7 days"* — uses `search_*_content`

### Pull data on a known creator

- Profile, follower count, languages, linked socials, hashtags, related creators — `get_*_profile`
- Audience demographics (top countries, age buckets, gender split) — `get_*_audience`
- Engagement metrics + consistency scores — `get_*_performance`
- Daily snapshots over time — `get_*_performance_history`
- Recent posts with per-item engagement — `get_*_content_detail`
- Sponsored content + indexed brands (YT/IG only — TT not supported) — `get_*_sponsorship`
- Email contacts — `get_*_contact` (15 credits — use sparingly)

### Brand-side intelligence (YouTube + Instagram only — no TikTok brand data)

- *"Which brands has Nike sponsored on YouTube?"* — `search_sponsors`
- *"Which YT creators has Acer worked with?"* — `get_sponsor_creators`
- Aggregated audience across a brand's sponsored creator pool — `get_sponsor_audience`
- Cross-platform sponsorship rollup with spend estimates — `get_sponsor_summary`

### Account

- Your daily API credit usage broken down by endpoint — `get_api_usage` (free, 0 credits)

### Quick reference: the expensive tools

Most tools cost 1–5 credits. **Four sponsor endpoints cost 25 credits each** — use them deliberately, not for exploration:

- `get_sponsor_creators`
- `get_sponsor_performance`
- `get_sponsor_audience`
- `get_sponsor_summary`

Plus contacts cost 15 credits per creator. Audience demographics for a single creator costs 10.

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

If none of these match, send Dominic a screenshot of `/mcp` output plus the failing message.

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

## Getting help

- **Issues with the MCP server itself** (bugs, missing tools, weird behavior): file an issue at <https://github.com/CreatorDB/creatordb-mcp-server/issues>, or ping Dominic
- **Questions about CreatorDB's data** (why does a creator look this way, why is country wrong, etc.): same — ping Dominic
- **Wanting a new tool that wraps an endpoint we don't expose**: send the V3 endpoint path + use case; happy to add

The MCP is intentionally a thin wrapper over the V3 API. If something the V3 API supports isn't in the MCP, it's a missing tool, not a missing feature — please ask and we'll add it.
