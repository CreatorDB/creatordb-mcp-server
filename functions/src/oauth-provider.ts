import type { Response } from 'express';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { seal, open } from './crypto.js';

const ACCESS_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 days
const AUTH_CODE_TTL_SEC = 5 * 60; // 5 minutes

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders the "paste your CreatorDB API key" interstitial. The hidden fields
 * carry the OAuth request parameters through to POST /authorize/submit, which
 * mints the authorization code and redirects back to the client.
 */
export function renderAuthorizePage(params: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  scope?: string;
  resource?: string;
}): string {
  const hidden = (name: string, value: string | undefined) =>
    value === undefined ? '' : `<input type="hidden" name="${name}" value="${escapeHtml(value)}" />`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connect CreatorDB</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #f7f7f8; color: #1a1a1a; display: flex; min-height: 100vh; margin: 0; align-items: center; justify-content: center; }
    .card { background: #fff; max-width: 420px; width: 100%; margin: 1rem; padding: 2rem; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { font-size: 1.25rem; margin: 0 0 0.25rem; }
    p { color: #555; font-size: 0.9rem; line-height: 1.5; }
    label { display: block; font-size: 0.85rem; font-weight: 600; margin: 1.25rem 0 0.4rem; }
    input[type=password] { width: 100%; box-sizing: border-box; padding: 0.6rem 0.7rem; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.95rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    button { margin-top: 1.25rem; width: 100%; padding: 0.65rem; background: #1a1a1a; color: #fff; border: none; border-radius: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #000; }
    .hint { font-size: 0.78rem; color: #888; margin-top: 1rem; }
    a { color: #0070f3; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Connect CreatorDB</h1>
    <p>Paste your CreatorDB V3 API key to authorize this connection. Your key is used only to authenticate your requests — it is never stored on our servers.</p>
    <form method="POST" action="/authorize/submit">
      ${hidden('client_id', params.clientId)}
      ${hidden('redirect_uri', params.redirectUri)}
      ${hidden('code_challenge', params.codeChallenge)}
      ${hidden('state', params.state)}
      ${hidden('scope', params.scope)}
      ${hidden('resource', params.resource)}
      <label for="api_key">CreatorDB API key</label>
      <input id="api_key" name="api_key" type="password" autocomplete="off" placeholder="your 32-character CreatorDB key" required />
      <button type="submit">Connect</button>
    </form>
    <p class="hint">Don't have a key? Get one at <a href="https://creatordb.app" target="_blank" rel="noopener">creatordb.app</a> or email hello@creatordb.app.</p>
    <p class="hint">By connecting, you agree to CreatorDB's <a href="https://app.creatordb.app/terms-of-service" target="_blank" rel="noopener">Terms of Service</a> and <a href="https://app.creatordb.app/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a>. Your API key is sent to mcp.creatordb.app only to authenticate your requests — it is encrypted into a session token and not stored.</p>
  </div>
</body>
</html>`;
}

/** Build the authorization code for a validated API key + OAuth request. */
export function mintAuthorizationCode(
  secret: string,
  data: { apiKey: string; codeChallenge: string; redirectUri: string; clientId: string },
): string {
  return seal(secret, {
    type: 'code',
    apiKey: data.apiKey,
    codeChallenge: data.codeChallenge,
    redirectUri: data.redirectUri,
    clientId: data.clientId,
    exp: Math.floor(Date.now() / 1000) + AUTH_CODE_TTL_SEC,
  });
}

export function createProvider(secret: string): OAuthServerProvider {
  const clientsStore: OAuthRegisteredClientsStore = {
    // Stateless: the client_id IS an encrypted blob of the registration data,
    // so getClient can reconstruct it on any instance without a database.
    async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
      try {
        const c = open<{ type: string; redirect_uris: string[] }>(secret, clientId);
        if (c.type !== 'client') return undefined;
        return {
          client_id: clientId,
          redirect_uris: c.redirect_uris,
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
        };
      } catch {
        return undefined;
      }
    },
    async registerClient(client): Promise<OAuthClientInformationFull> {
      const clientId = seal(secret, {
        type: 'client',
        redirect_uris: client.redirect_uris,
      });
      return {
        ...client,
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
      };
    },
  };

  return {
    clientsStore,

    async authorize(
      client: OAuthClientInformationFull,
      params: AuthorizationParams,
      res: Response,
    ): Promise<void> {
      res
        .status(200)
        .set('Content-Type', 'text/html; charset=utf-8')
        .send(
          renderAuthorizePage({
            clientId: client.client_id,
            redirectUri: params.redirectUri,
            codeChallenge: params.codeChallenge,
            state: params.state,
            scope: params.scopes?.join(' '),
            resource: params.resource?.href,
          }),
        );
    },

    async challengeForAuthorizationCode(
      _client: OAuthClientInformationFull,
      authorizationCode: string,
    ): Promise<string> {
      const code = open<{ type: string; codeChallenge: string }>(secret, authorizationCode);
      if (code.type !== 'code') throw new Error('invalid authorization code');
      return code.codeChallenge;
    },

    async exchangeAuthorizationCode(
      client: OAuthClientInformationFull,
      authorizationCode: string,
      _codeVerifier?: string,
      redirectUri?: string,
    ): Promise<OAuthTokens> {
      // PKCE is validated by the SDK token handler via challengeForAuthorizationCode.
      const code = open<{
        type: string;
        apiKey: string;
        redirectUri: string;
        clientId: string;
      }>(secret, authorizationCode);
      if (code.type !== 'code') throw new Error('invalid authorization code');
      if (code.clientId !== client.client_id) throw new Error('client mismatch');
      if (redirectUri !== undefined && redirectUri !== code.redirectUri) {
        throw new Error('redirect_uri mismatch');
      }
      const now = Math.floor(Date.now() / 1000);
      return {
        access_token: seal(secret, { type: 'access', apiKey: code.apiKey, exp: now + ACCESS_TOKEN_TTL_SEC }),
        token_type: 'bearer',
        expires_in: ACCESS_TOKEN_TTL_SEC,
        refresh_token: seal(secret, { type: 'refresh', apiKey: code.apiKey }),
        scope: '',
      };
    },

    async exchangeRefreshToken(
      _client: OAuthClientInformationFull,
      refreshToken: string,
    ): Promise<OAuthTokens> {
      const rt = open<{ type: string; apiKey: string }>(secret, refreshToken);
      if (rt.type !== 'refresh') throw new Error('invalid refresh token');
      const now = Math.floor(Date.now() / 1000);
      return {
        access_token: seal(secret, { type: 'access', apiKey: rt.apiKey, exp: now + ACCESS_TOKEN_TTL_SEC }),
        token_type: 'bearer',
        expires_in: ACCESS_TOKEN_TTL_SEC,
        refresh_token: seal(secret, { type: 'refresh', apiKey: rt.apiKey }),
        scope: '',
      };
    },

    async verifyAccessToken(token: string): Promise<AuthInfo> {
      // Primary path: an access token we minted (sealed blob).
      try {
        const t = open<{ type: string; apiKey: string; exp: number }>(secret, token);
        if (t.type === 'access') {
          return {
            token,
            clientId: 'creatordb-mcp',
            scopes: [],
            expiresAt: t.exp,
            extra: { apiKey: t.apiKey },
          };
        }
      } catch {
        // not one of our tokens — fall through
      }
      // Fallback: a raw CreatorDB V3 API key passed directly as the bearer.
      // Keeps programmatic / curl callers working without the OAuth dance.
      // V3 is the real gatekeeper — an invalid key fails at the API call.
      // expiresAt is synthetic (re-validated every request) to satisfy the
      // bearer-auth middleware, which rejects tokens with no expiry.
      return {
        token,
        clientId: 'raw-key',
        scopes: [],
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        extra: { apiKey: token },
      };
    },
  };
}
