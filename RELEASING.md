# Releasing

Every item here exists because it was missed at least once. The recurring failure is
not a broken step — it is a **surface nobody remembered was a surface**. v1.4.3 was
merged and never tagged, so npm and the hosted connector served 1.4.2 for sixteen days,
including the tool annotations that shipped in it.

There are three independent things a release has to move, and they fail separately:

| | What it is | How it updates |
|---|---|---|
| **npm package** | what local/stdio users install | pushing a `v*.*.*` tag |
| **hosted connector** | what `mcp.creatordb.app` serves | a Firebase deploy, which installs the package **from npm** |
| **documentation** | what users read | edits in this repo **and** in the docs site |

Merging to `main` moves **none** of them.

---

## 1 · Before tagging

- [ ] `npm ci && npm run build` from a clean checkout of `main`
- [ ] `npm audit --omit=dev` reports 0 vulnerabilities
- [ ] Runtime smoke test: expected tool count, annotations attached, `resources/list`
      and `resources/read` both succeed
- [ ] Any claim the release changes — credit costs, daily limits, accepted identifiers —
      checked against the **deployed** API, not against documentation. Costs and limits
      have been wrong in tool descriptions three separate times.

### The five version surfaces

All must agree, and only the first is covered by the npm publish:

- [ ] `package.json`
- [ ] `server.json` — the MCP registry manifest. **Not part of the npm publish**, so it
      drifts silently. Its `description` must stay **≤ 100 characters** or the registry
      rejects the publish with a 422.
- [ ] `package-lock.json` root version
- [ ] `functions/package.json` — the connector's dependency pin
- [ ] `functions/package-lock.json` — **the one that bit us.** The pin can say `^1.5.0`
      while the lockfile still resolves the previous version, and a deploy then either
      fails `npm ci` or quietly serves the old build.

The `version-drift` workflow checks the first two against npm and the newest tag. It does
not see the connector lockfile — check that by hand.

## 2 · Publish the package

- [ ] `git tag -a vX.Y.Z` and push the tag. Publishing is **tag-triggered**; merging does
      nothing. Write the tag annotation as public changelog copy — it appears on the
      release page.
- [ ] Confirm the release workflow succeeded and `npm view @creatordbai/mcp-server version`
      matches the tag
- [ ] Confirm provenance and signatures are attached to the published version

## 3 · Deploy the connector

- [ ] Confirm `functions/package-lock.json` resolves the version you just published
- [ ] Deploy **scoped**: `firebase deploy --only functions:mcp,hosting:mcp`.
      Never a bare `--only functions` — other functions share the project.
- [ ] A predeploy hook compiles TypeScript. If that hook is ever removed, the deploy
      ships stale compiled output.

## 4 · Update the MCP registry

- [ ] Re-publish `server.json` so the registry entry reflects the new version. The listing
      does not follow npm on its own.

## 5 · Documentation — the step most likely to be skipped

In this repo:

- [ ] `README.md`, `SETUP.md`
- [ ] `docs/reconnecting.md` — contains a minimum-version reference
- [ ] `docs/tool-annotations.md`
- [ ] `public/index.html` — the connector landing page; states the tool count

In the docs site (`API-docs`):

- [ ] `mcp-server/changelog.mdx` — **the public changelog.** It sat at a single v1.0.0 entry
      while five releases shipped. If a release is worth publishing it is worth an entry.
- [ ] `mcp-server/setting-up-the-creatordb-mcp-connector.mdx` — states the tool count and a
      minimum package version
- [ ] `mcp-server/setting-up-creatordb-agentic-skills.mdx`

Tool counts and version numbers are repeated across several of these. Grep for the previous
count and the previous version rather than trusting memory.

## 6 · Verify against production

Not against `main` — against what users actually reach:

- [ ] `main` version == tag == `npm view … version` == `curl https://mcp.creatordb.app/health`
- [ ] `initialize` on the hosted endpoint advertises the expected capabilities
- [ ] `tools/list` returns the expected count with annotations attached
- [ ] `resources/read` returns each expected resource
- [ ] The `version-drift` workflow is green

## 7 · Tell users when a reconnect is required

MCP capabilities are negotiated during `initialize`. **A client that is already connected
will not see a newly added capability** — a new resource or prompt — until it reconnects.
Adding tools to an existing capability does not need one; adding a capability does.

- [ ] If a capability was added, say so in the changelog and link `docs/reconnecting.md`

## Rolling back

- npm versions cannot be unpublished after 72 hours, and a version number cannot be
  reused. **Roll forward with a patch release**, never sideways.
- The connector can be rolled back independently by pinning `functions/package.json` to the
  previous version and redeploying — useful when the package is fine but the deploy is not.

## What is automated

| Check | Covers | Gap |
|---|---|---|
| `release.yml` | npm publish + provenance on tag push | only fires on a tag |
| `version-drift.yml` | `package.json` / `server.json` / npm / newest tag | not the connector lockfile, not docs |
| `disclosure-check.yml` | PR title, body and commit messages | prose only, never code |
| `ci.yml` | build, `npm pack --dry-run` | no content-accuracy checks |

Nothing yet verifies that tool descriptions still match the deployed API. Until something
does, step 1's accuracy check is manual and is the step most worth being deliberate about.
