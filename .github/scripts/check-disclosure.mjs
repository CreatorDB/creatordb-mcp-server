#!/usr/bin/env node
/**
 * Disclosure check for pull-request prose.
 *
 * This repository is public. PR titles, bodies and commit messages are
 * permanent public artifacts, and titles feed the generated release notes.
 * Code legitimately needs infrastructure identifiers — .firebaserc must name
 * the Firebase project to deploy at all — but narrative prose does not.
 *
 * So this checks only the prose surfaces and deliberately never scans code.
 * Anything it flags belongs in a PR comment instead, which reads as
 * discussion rather than release material.
 *
 * Inputs (env): PR_TITLE, PR_BODY, COMMIT_MESSAGES.
 * Exit 1 on error-level findings; warnings do not fail the run.
 *
 * Run locally:
 *   PR_TITLE="..." PR_BODY="..." COMMIT_MESSAGES="..." node .github/scripts/check-disclosure.mjs
 */
import { readFileSync } from 'node:fs';

const title = process.env.PR_TITLE ?? '';
const body = process.env.PR_BODY ?? '';
const commits = process.env.COMMIT_MESSAGES ?? '';
const prose = [title, body, commits].join('\n');

const ci = !!process.env.GITHUB_ACTIONS;
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// ── credential shapes: never acceptable anywhere ──────────────────────────────
const CREDENTIALS = [
  ['CreatorDB API key', /cdb-[a-z0-9]+-[A-Za-z0-9]{16}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{20}/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{20}/],
  ['npm token', /npm_[A-Za-z0-9]{20}/],
  ['private key block', /BEGIN [A-Z ]*PRIVATE KEY/],
];
for (const [label, re] of CREDENTIALS) {
  if (re.test(prose)) {
    err(`Possible credential in PR prose (${label}). Remove it, and rotate the value if it is real.`);
  }
}

// ── infrastructure project ids, derived from .firebaserc rather than hardcoded
// so this stays correct as projects are added or renamed ──────────────────────
function projectIdsFromFirebaserc() {
  const ids = new Set();
  let cfg;
  try {
    cfg = JSON.parse(readFileSync('.firebaserc', 'utf8'));
  } catch {
    return ids;
  }
  const walk = (node) => {
    if (node && typeof node === 'object') {
      for (const v of Object.values(node)) {
        if (typeof v === 'string' && /^[a-z0-9][a-z0-9-]{5,39}$/.test(v)) ids.add(v);
        else walk(v);
      }
    }
  };
  walk(cfg);
  return ids;
}
for (const id of projectIdsFromFirebaserc()) {
  if (prose.includes(id)) {
    err(
      `Infrastructure project id "${id}" appears in the PR title, body or a commit message. ` +
        `Code may reference it; public release prose should not. Move that detail to a PR comment.`,
    );
  }
}

// ── internal tracker keys in the TITLE (titles become release notes) ─────────
const trackerKey = /\b(MCP|API|ESP|CDB1|SD|AI)-\d+\b/;
if (trackerKey.test(title)) {
  err(
    'The PR title contains an internal tracker key, which appears verbatim in the public ' +
      'release notes. Keep the key in the linked ticket instead.',
  );
}

// ── internal vocabulary: worth flagging, not worth blocking ─────────────────
for (const term of ['api-product-manager', 'jira-helper', 'data-collector', 'scraper-investigator']) {
  if (prose.includes(term)) {
    warn(`"${term}" is an internal role name and reads as internal process in a public artifact.`);
  }
}
for (const phrase of ['Per Dominic', 'my purview', 'this batch']) {
  if (prose.includes(phrase)) {
    warn(`"${phrase}" addresses a colleague rather than a reader of the release notes.`);
  }
}

// ── report ───────────────────────────────────────────────────────────────────
for (const w of warnings) console.log(ci ? `::warning::${w}` : `WARN  ${w}`);
for (const e of errors) console.log(ci ? `::error::${e}` : `ERROR ${e}`);

if (errors.length) {
  const note =
    'Checked the PR title, body and every commit message in this PR. Code and configuration are not scanned.';
  console.log(ci ? `::notice::${note}` : note);
  process.exit(1);
}
console.log(`PR prose is clean${warnings.length ? ` (${warnings.length} warning(s))` : ''}.`);
