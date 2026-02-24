import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MagpipeClient } from "../client.js";
import { formatToolResponse, formatError } from "../types.js";

export function registerAgentTools(server: McpServer, client: MagpipeClient) {
  server.tool(
    "list_agents",
    "List all AI agents in your account with optional filters",
    {
      limit: z.number().optional().describe("Max results (default 50)"),
      offset: z.number().optional().describe("Pagination offset"),
      is_active: z.boolean().optional().describe("Filter by active status"),
      agent_type: z
        .string()
        .optional()
        .describe("Filter by type: inbound, outbound, hybrid"),
    },
    async ({ limit, offset, is_active, agent_type }) => {
      try {
        return formatToolResponse(
          await client.call("list-agents", { limit, offset, is_active, agent_type })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "get_agent",
    "Get full agent details: config (voice, language, model, prompt, temperature, memory settings), assigned phone numbers, custom functions, knowledge sources, and dynamic variables",
    {
      agent_id: z.string().describe("Agent UUID"),
    },
    async ({ agent_id }) => {
      try {
        return formatToolResponse(await client.call("get-agent", { agent_id }));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "create_agent",
    "Create a new AI agent with the given configuration",
    {
      name: z.string().describe("Agent name"),
      greeting: z.string().optional().describe("Initial greeting when agent answers"),
      system_prompt: z.string().optional().describe("System prompt / persona instructions"),
      voice_id: z.string().optional().describe("ElevenLabs voice ID"),
      llm_model: z.string().optional().describe("LLM model identifier"),
      language: z.string().optional().describe("Language code (e.g. en)"),
      agent_type: z.string().optional().describe("inbound, outbound, or hybrid"),
      organization_name: z.string().optional().describe("Organization the agent represents"),
      owner_name: z.string().optional().describe("Owner / operator name"),
      agent_role: z.string().optional().describe("Role description"),
      transfer_phone_number: z.string().optional().describe("Phone number for call transfers"),
      is_active: z.boolean().optional().describe("Whether agent is active"),
      temperature: z.number().optional().describe("LLM temperature (0-2)"),
    },
    async (args) => {
      try {
        return formatToolResponse(await client.call("create-agent", args));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "update_agent",
    "Update an existing agent's configuration",
    {
      agent_id: z.string().describe("Agent UUID to update"),
      name: z.string().optional().describe("Agent name"),
      greeting: z.string().optional().describe("Initial greeting"),
      system_prompt: z.string().optional().describe("System prompt"),
      voice_id: z.string().optional().describe("ElevenLabs voice ID"),
      llm_model: z.string().optional().describe("LLM model"),
      language: z.string().optional().describe("Language code"),
      agent_type: z.string().optional().describe("inbound, outbound, or hybrid"),
      organization_name: z.string().optional().describe("Organization name"),
      owner_name: z.string().optional().describe("Owner name"),
      agent_role: z.string().optional().describe("Role description"),
      transfer_phone_number: z.string().optional().describe("Transfer number"),
      is_active: z.boolean().optional().describe("Active status"),
      temperature: z.number().optional().describe("LLM temperature"),
      semantic_memory_config: z
        .object({
          max_results: z.number().optional().describe("Max memory results to retrieve (default 3)"),
          similarity_threshold: z.number().optional().describe("Similarity threshold 0-1 (default 0.75)"),
          include_other_callers: z.boolean().optional().describe("Include memories from other callers (default true)"),
        })
        .optional()
        .describe("Semantic memory configuration"),
    },
    async (args) => {
      try {
        return formatToolResponse(await client.call("update-agent", args));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "delete_agent",
    "Permanently delete an agent",
    {
      agent_id: z.string().describe("Agent UUID to delete"),
    },
    async ({ agent_id }) => {
      try {
        return formatToolResponse(await client.call("delete-agent", { agent_id }));
      } catch (e) {
        return formatError(e);
      }
    }
  );
}
