#!/usr/bin/env node
// Predeploy guard for the hosted connector. The connector runs the published npm package pinned in
// functions/package-lock.json, not the source in this repo. If the repo version has moved on but the
// connector pin has not (the connector dependency PR is not merged yet, or the local checkout is
// behind), a deploy would silently ship the old version. Stop the deploy instead.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const lock = JSON.parse(readFileSync(join(root, 'functions', 'package-lock.json'), 'utf8'));
const pinned = lock.packages?.['node_modules/@creatordbai/mcp-server']?.version;

if (pinned !== repoVersion) {
  console.error(
    `\nDeploy stopped: the connector would run @creatordbai/mcp-server ${pinned ?? '(not found)'}, ` +
      `but this repo is at ${repoVersion}.\n` +
      'Merge the connector dependency PR for this version, run `git pull` and `npm ci` in functions/, then deploy again.\n',
  );
  process.exit(1);
}
console.log(`Connector version check passed: ${pinned}`);
