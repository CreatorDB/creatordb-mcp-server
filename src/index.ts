#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerSearchTools } from './tools/search.js';
import { registerYoutubeTools } from './tools/youtube.js';
import { registerInstagramTools } from './tools/instagram.js';
import { registerTiktokTools } from './tools/tiktok.js';
import { registerSponsorTools } from './tools/sponsors.js';
import { registerAccountTools } from './tools/account.js';

const apiKey = process.env.CREATORDB_API_KEY;
if (!apiKey) {
  console.error('CREATORDB_API_KEY environment variable is required');
  process.exit(1);
}

const server = new McpServer({
  name: 'creatordb',
  version: '1.0.0',
});

// Register all tools
registerSearchTools(server, apiKey);
registerYoutubeTools(server, apiKey);
registerInstagramTools(server, apiKey);
registerTiktokTools(server, apiKey);
registerSponsorTools(server, apiKey);
registerAccountTools(server, apiKey);

// Connect via stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
