#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MagpipeClient } from "./client.js";
import { registerAllTools } from "./tools/index.js";

const apiKey = process.env.MAGPIPE_API_KEY;
if (!apiKey) {
  console.error(
    "MAGPIPE_API_KEY is required. Generate one at https://magpipe.ai/settings (API tab)."
  );
  process.exit(1);
}

if (!apiKey.startsWith("mgp_")) {
  console.error(
    "Invalid API key format. Keys start with mgp_. Generate one at https://magpipe.ai/settings."
  );
  process.exit(1);
}

const client = new MagpipeClient(apiKey, process.env.MAGPIPE_API_URL);

const server = new McpServer({
  name: "magpipe",
  version: "0.1.0",
});

registerAllTools(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
