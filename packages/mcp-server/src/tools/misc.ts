import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MagpipeClient } from "../client.js";
import { formatToolResponse, formatError } from "../types.js";

export function registerMiscTools(server: McpServer, client: MagpipeClient) {
  server.tool(
    "list_models",
    "List available LLM models for agent configuration",
    {},
    async () => {
      try {
        return formatToolResponse(await client.call("list-models"));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "chat_with_agent",
    "Send a message to an agent's chat widget and get a full AI response with tool calling. Returns sessionId — pass it back to continue the conversation.",
    {
      agent_id: z.string().describe("Agent UUID"),
      message: z.string().describe("Message text"),
      session_id: z.string().optional().describe("Session ID from a previous response to continue the conversation"),
      visitor_name: z.string().optional().describe("Visitor name for personalization"),
      visitor_email: z.string().optional().describe("Visitor email"),
    },
    async (args) => {
      try {
        // Route through webhook-chat-message for full agent experience
        // (custom functions, session persistence, agent system prompt)
        const payload: Record<string, unknown> = {
          agentId: args.agent_id,
          message: args.message,
        };
        if (args.session_id) {
          payload.sessionId = args.session_id;
        } else {
          // Generate stable visitor ID from API key context
          payload.visitorId = `mcp-${args.agent_id}`;
        }
        if (args.visitor_name) payload.visitorName = args.visitor_name;
        if (args.visitor_email) payload.visitorEmail = args.visitor_email;

        return formatToolResponse(await client.call("webhook-chat-message", payload));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "list_chat_sessions",
    "List chat widget sessions",
    {
      widget_id: z.string().optional().describe("Filter by widget UUID"),
      limit: z.number().optional().describe("Max results"),
      offset: z.number().optional().describe("Pagination offset"),
    },
    async (args) => {
      try {
        return formatToolResponse(
          await client.call("list-chat-sessions", args)
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "list_custom_functions",
    "List custom functions (tools) available to agents",
    {
      agent_id: z.string().optional().describe("Filter by agent UUID"),
    },
    async (args) => {
      try {
        return formatToolResponse(
          await client.call("custom-functions", { action: "list", ...args })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "create_custom_function",
    "Create a custom function (tool) that agents can call during conversations",
    {
      name: z.string().describe("Function name"),
      description: z.string().describe("What the function does"),
      endpoint_url: z.string().describe("Webhook URL to call"),
      parameters: z
        .record(z.unknown())
        .optional()
        .describe("JSON Schema for function parameters"),
      agent_id: z.string().optional().describe("Assign to specific agent"),
    },
    async (args) => {
      try {
        return formatToolResponse(
          await client.call("custom-functions", { action: "create", ...args })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "manage_dynamic_variables",
    "Manage dynamic variables (data extraction) for an agent. Actions: list, create, update, delete.",
    {
      action: z
        .enum(["list", "create", "update", "delete"])
        .describe("Action to perform"),
      agent_id: z.string().describe("Agent UUID"),
      variable_id: z.string().optional().describe("Variable UUID (for update/delete)"),
      name: z.string().optional().describe("Variable name (for create/update)"),
      description: z
        .string()
        .optional()
        .describe("What data to extract (for create/update)"),
      var_type: z
        .string()
        .optional()
        .describe("Type: string, number, boolean, enum (for create)"),
      enum_options: z
        .array(z.string())
        .optional()
        .describe("Enum options (when var_type is enum)"),
    },
    async (args) => {
      try {
        return formatToolResponse(
          await client.call("manage-dynamic-variables", args)
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "list_scheduled_actions",
    "List scheduled actions (future calls, reminders, etc.)",
    {
      limit: z.number().optional().describe("Max results"),
      offset: z.number().optional().describe("Pagination offset"),
      status: z.string().optional().describe("Filter by status"),
    },
    async (args) => {
      try {
        return formatToolResponse(
          await client.call("process-scheduled-actions", {
            action: "list",
            ...args,
          })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );
}
