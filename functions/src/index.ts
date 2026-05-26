/**
 * Firebase Cloud Function (gen 2) HTTP entry for the CreatorDB MCP server.
 *
 * Exposes the same 42 tools as the stdio package, but over HTTP via the MCP
 * StreamableHTTPServerTransport so it can be added as a custom connector in
 * Claude web, Claude mobile, and any other MCP client that doesn't run local
 * subprocesses.
 *
 * Auth model: per-request. Each request must carry the caller's CreatorDB V3
 * API key in `Authorization: Bearer <key>`. The function builds a fresh MCP
 * server bound to that key, services the JSON-RPC request, and discards the
 * server. Stateless — no session cookies, no key caching server-side.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerAllTools } from '@creatordbai/mcp-server/register-tools';

const SERVER_NAME = 'creatordb';
const SERVER_VERSION = '1.2.1';

function extractApiKey(req: { get: (h: string) => string | undefined }): string | null {
  const auth = req.get('authorization') || req.get('Authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();

  // Some MCP clients pass the key in a custom header — accept that as a fallback.
  const customHeader = req.get('x-creatordb-api-key');
  if (customHeader) return customHeader.trim();

  return null;
}

export const mcp = onRequest(
  {
    region: 'asia-northeast1',
    cors: true, // Claude web origins; tighten to https://claude.ai once verified
    timeoutSeconds: 60,
    memory: '512MiB',
    maxInstances: 100,
    invoker: 'public', // Public HTTPS endpoint — auth happens via the Bearer header
  },
  async (req, res) => {
    // Health check — useful for "is the endpoint reachable" probes without
    // burning auth or credits.
    if (req.method === 'GET' && req.path === '/health') {
      res.status(200).json({ status: 'ok', server: SERVER_NAME, version: SERVER_VERSION });
      return;
    }

    // Extract the caller's V3 API key from the Authorization header.
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message:
            'Missing CreatorDB API key. Send the key in Authorization: Bearer <key> ' +
            'or X-Creatordb-Api-Key headers.',
        },
        id: null,
      });
      return;
    }

    // Build a fresh MCP server bound to this caller's key.
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
    registerAllTools(server, apiKey);

    // Stateless transport: no sessionIdGenerator, return JSON instead of SSE
    // unless the response actually needs to stream. Every request is independent.
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
          error: {
            code: -32603,
            message: 'Internal MCP transport error',
          },
          id: null,
        });
      }
    } finally {
      // Don't await close — Firebase will GC the function instance regardless,
      // and closing can hang if the transport is mid-write.
      void transport.close().catch(() => {});
    }
  },
);
