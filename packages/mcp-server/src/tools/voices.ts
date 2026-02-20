import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MagpipeClient } from "../client.js";
import { formatToolResponse, formatError } from "../types.js";

export function registerVoiceTools(server: McpServer, client: MagpipeClient) {
  server.tool(
    "list_voices",
    "List available ElevenLabs voices (both stock and cloned)",
    {},
    async () => {
      try {
        return formatToolResponse(await client.call("list-voices"));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "delete_voice",
    "Delete a cloned voice",
    {
      voice_id: z.string().describe("Voice ID to delete"),
    },
    async ({ voice_id }) => {
      try {
        return formatToolResponse(
          await client.call("delete-voice", { voice_id })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );
}
