import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MagpipeClient } from "../client.js";
import { formatToolResponse, formatError } from "../types.js";

export function registerApiKeyTools(server: McpServer, client: MagpipeClient) {
  server.tool(
    "manage_api_keys",
    "Manage API keys: generate, list, revoke, or update webhook URL. Set 'action' to one of: generate, list, revoke, update.",
    {
      action: z
        .enum(["generate", "list", "revoke", "update"])
        .describe("Action to perform"),
      name: z
        .string()
        .optional()
        .describe("Key name (required for generate)"),
      key_id: z
        .string()
        .optional()
        .describe("Key UUID (required for revoke/update)"),
      webhook_url: z
        .string()
        .optional()
        .describe("Webhook URL (for generate or update)"),
    },
    async (args) => {
      try {
        return formatToolResponse(await client.call("manage-api-keys", args));
      } catch (e) {
        return formatError(e);
      }
    }
  );
}
