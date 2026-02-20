import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MagpipeClient } from "../client.js";
import { formatToolResponse, formatError } from "../types.js";

export function registerKnowledgeTools(
  server: McpServer,
  client: MagpipeClient
) {
  server.tool(
    "list_knowledge_sources",
    "List knowledge base sources for an agent",
    {
      agent_id: z.string().describe("Agent UUID"),
    },
    async ({ agent_id }) => {
      try {
        return formatToolResponse(
          await client.call("knowledge-source-list", { agent_id })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "add_knowledge_source",
    "Add a URL-based knowledge source to an agent (will be crawled and indexed)",
    {
      agent_id: z.string().describe("Agent UUID"),
      url: z.string().optional().describe("Single URL to crawl"),
      urls: z.array(z.string()).optional().describe("Multiple URLs to crawl"),
    },
    async (args) => {
      try {
        return formatToolResponse(
          await client.call("knowledge-source-add", args)
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "add_knowledge_manual",
    "Add a manual text knowledge entry to an agent",
    {
      agent_id: z.string().describe("Agent UUID"),
      title: z.string().describe("Title for this knowledge entry"),
      content: z.string().describe("Text content to index"),
    },
    async (args) => {
      try {
        return formatToolResponse(
          await client.call("knowledge-source-manual", args)
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "delete_knowledge_source",
    "Delete a knowledge source and its indexed content",
    {
      source_id: z.string().describe("Knowledge source UUID"),
    },
    async ({ source_id }) => {
      try {
        return formatToolResponse(
          await client.call("knowledge-source-delete", { source_id })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "sync_knowledge_source",
    "Re-crawl and re-index a URL-based knowledge source",
    {
      source_id: z.string().describe("Knowledge source UUID"),
    },
    async ({ source_id }) => {
      try {
        return formatToolResponse(
          await client.call("knowledge-source-sync", { source_id })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );
}
