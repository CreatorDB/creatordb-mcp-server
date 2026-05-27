/**
 * Firebase Cloud Function (gen 2) HTTP entry for the CreatorDB MCP server.
 *
 * Serves the same 42 tools as the stdio npm package, over HTTP, so the server
 * can be added as a remote connector in Claude web / Claude mobile / any MCP
 * client that doesn't run local subprocesses.
 *
 * Auth: OAuth 2.1 (required by Claude web custom connectors). We act as our own
 * authorization server via the MCP SDK's mcpAuthRouter. The "login" step is a
 * bring-your-own-key page — the user pastes their CreatorDB V3 API key, which we
 * seal into a stateless encrypted token (see crypto.ts + oauth-provider.ts).
 * Programmatic callers can also skip OAuth and pass a raw API key directly as a
 * Bearer token; verifyAccessToken falls back to treating it as the key.
 */

import express from 'express';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { registerAllTools } from '@creatordbai/mcp-server/register-tools';
import { createProvider, mintAuthorizationCode } from './oauth-provider.js';

const SERVER_NAME = 'creatordb';
const SERVER_VERSION = '1.3.0';

const ISSUER = 'https://mcp.creatordb.app';
const RESOURCE = 'https://mcp.creatordb.app/mcp';

const oauthSecret = defineSecret('OAUTH_TOKEN_SECRET');

function buildApp(secret: string) {
  const provider = createProvider(secret);
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ── OAuth 2.1 authorization server endpoints ───────────────────────────────
  // Provides: /authorize, /token, /register,
  // /.well-known/oauth-authorization-server, /.well-known/oauth-protected-resource/mcp
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: new URL(ISSUER),
      baseUrl: new URL(ISSUER),
      resourceServerUrl: new URL(RESOURCE),
      scopesSupported: [],
      resourceName: 'CreatorDB MCP',
    }),
  );

  // ── Bring-your-own-key form submission ─────────────────────────────────────
  // The /authorize page (rendered by the provider) POSTs here. We mint an
  // authorization code bound to the pasted API key + PKCE challenge, then
  // redirect back to the MCP client's redirect_uri.
  app.post('/authorize/submit', (req, res) => {
    const { api_key, client_id, redirect_uri, code_challenge, state } = req.body ?? {};
    if (!api_key || !client_id || !redirect_uri || !code_challenge) {
      res.status(400).send('Missing required fields. Please start the connection flow again.');
      return;
    }
    const code = mintAuthorizationCode(secret, {
      apiKey: String(api_key).trim(),
      codeChallenge: String(code_challenge),
      redirectUri: String(redirect_uri),
      clientId: String(client_id),
    });
    const target = new URL(String(redirect_uri));
    target.searchParams.set('code', code);
    if (state) target.searchParams.set('state', String(state));
    res.redirect(302, target.href);
  });

  // ── Health check (no auth, 0 credits) ──────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', server: SERVER_NAME, version: SERVER_VERSION });
  });

  // ── Landing page ───────────────────────────────────────────────────────────
  app.get('/', (_req, res) => {
    res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .send(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>CreatorDB MCP</title></head>` +
          `<body style="font-family:system-ui;max-width:640px;margin:4rem auto;padding:0 1rem;line-height:1.6">` +
          `<h1>CreatorDB MCP Server</h1>` +
          `<p>Remote MCP endpoint for Claude web/mobile and other MCP clients.</p>` +
          `<p>Add as a custom connector with URL <code>${RESOURCE}</code>. ` +
          `On connect you'll be asked to paste your CreatorDB V3 API key.</p>` +
          `<p>Docs: <a href="https://github.com/CreatorDB/creatordb-mcp-server">github.com/CreatorDB/creatordb-mcp-server</a></p>` +
          `</body></html>`,
      );
  });

  // ── The MCP endpoint (protected) ───────────────────────────────────────────
  // Allow a raw API key via X-Creatordb-Api-Key by promoting it to a Bearer
  // header before the auth middleware runs (back-compat with programmatic use).
  app.use('/mcp', (req, _res, next) => {
    if (!req.headers.authorization) {
      const rawKey = req.header('x-creatordb-api-key');
      if (rawKey) req.headers.authorization = `Bearer ${rawKey}`;
    }
    next();
  });

  const bearer = requireBearerAuth({
    verifier: provider,
    resourceMetadataUrl: `${ISSUER}/.well-known/oauth-protected-resource/mcp`,
  });

  app.all('/mcp', bearer, async (req, res) => {
    const auth = (req as unknown as { auth?: { extra?: Record<string, unknown> } }).auth;
    const apiKey = (auth?.extra?.apiKey as string | undefined) ?? '';
    if (!apiKey) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'No CreatorDB API key resolved from credentials.' },
        id: null,
      });
      return;
    }

    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
    registerAllTools(server, apiKey);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger.error('MCP transport error', { error: err instanceof Error ? err.message : err });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal MCP transport error' },
          id: null,
        });
      }
    } finally {
      void transport.close().catch(() => {});
    }
  });

  return app;
}

let cachedApp: ReturnType<typeof buildApp> | null = null;

export const mcp = onRequest(
  {
    region: 'asia-northeast1',
    cors: true,
    timeoutSeconds: 60,
    memory: '512MiB',
    maxInstances: 100,
    invoker: 'public',
    secrets: [oauthSecret],
  },
  (req, res) => {
    // Build the Express app once per warm instance. The secret is only
    // resolvable at runtime, so this can't move to module scope.
    if (!cachedApp) cachedApp = buildApp(oauthSecret.value());
    return cachedApp(req, res);
  },
);
