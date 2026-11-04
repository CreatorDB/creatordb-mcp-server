/**
 * How this server identifies itself to the CreatorDB API, and the update notice for local installs.
 *
 * Every API request carries a User-Agent of the form
 *   creatordb-mcp/<package version> (<transport>; client=<name>/<version>)
 * where transport is `stdio` (the npm package run locally), `hosted` (the remote connector) or
 * `embedded` (another application calling registerAllTools in-process), and `client=` names the MCP
 * client from its initialize request. `client=` is left out when the client did not identify itself.
 */
import { SERVER_VERSION } from '../instructions.js';

export type Transport = 'stdio' | 'hosted' | 'embedded';

export interface ClientInfo {
  name?: string;
  version?: string;
}

const TOKEN_MAX = 64;

/** Keeps a header token to visible ASCII without spaces, separators or quotes, and caps its length. */
export function sanitizeToken(value: string, max = TOKEN_MAX): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._~+-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
}

export function buildUserAgent(transport: Transport, client?: ClientInfo, version: string = SERVER_VERSION): string {
  const name = client?.name ? sanitizeToken(client.name) : '';
  if (!name) return `creatordb-mcp/${version} (${transport})`;
  const clientVersion = client?.version ? sanitizeToken(client.version, 32) : '';
  return `creatordb-mcp/${version} (${transport}; client=${name}${clientVersion ? `/${clientVersion}` : ''})`;
}

/**
 * The key and identity used for API calls. Tools receive this from registerAllTools; a plain key
 * string is still accepted and identifies as `embedded` with no client.
 */
export interface ApiCaller {
  apiKey: string;
  userAgent(): string;
}

export type ApiAuth = string | ApiCaller;

export function authHeaders(auth: ApiAuth): Record<string, string> {
  if (typeof auth === 'string') {
    return { 'api-key': auth, 'User-Agent': buildUserAgent('embedded') };
  }
  return { 'api-key': auth.apiKey, 'User-Agent': auth.userAgent() };
}

// ── Update notice (stdio only) ────────────────────────────────────────────────

export const PACKAGE_NAME = '@creatordbai/mcp-server';
export const UPDATE_CHECK_OPT_OUT = 'CREATORDB_MCP_NO_UPDATE_CHECK';
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
const CHECK_TIMEOUT_MS = 3000;

/** True when `latest` is a higher release than `current`. Pre-release suffixes are ignored. */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

export function updateNotice(latest: string): string {
  return `A newer CreatorDB MCP (${latest}) is available. Restart your client with ${PACKAGE_NAME}@latest to get it.`;
}

type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * Looks up the latest published version once. Resolves to the notice text when the running version
 * is older, otherwise to null. Never throws: offline, slow or unexpected responses resolve to null.
 */
export async function checkForUpdate(
  current: string = SERVER_VERSION,
  options: { env?: NodeJS.ProcessEnv; fetcher?: Fetcher; timeoutMs?: number } = {},
): Promise<string | null> {
  const env = options.env ?? process.env;
  const optOut = env[UPDATE_CHECK_OPT_OUT];
  if (optOut && optOut !== '0' && optOut.toLowerCase() !== 'false') return null;
  const fetcher = options.fetcher ?? (fetch as unknown as Fetcher);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? CHECK_TIMEOUT_MS);
  try {
    const res = await fetcher(REGISTRY_URL, { signal: controller.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown };
    if (typeof body?.version !== 'string') return null;
    return isNewerVersion(body.version, current) ? updateNotice(body.version) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hands out a notice at most once. `pending` is consulted without waiting: if the check has not
 * finished when a tool result is returned, the notice goes on the first result after it finishes.
 */
export function oneTimeNotice(pending: Promise<string | null>): () => string | null {
  let value: string | null = null;
  let settled = false;
  let used = false;
  pending.then(
    (v) => {
      value = v;
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  return () => {
    if (used || !settled) return null;
    used = true;
    return value;
  };
}
