import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MagpipeClient } from "../client.js";
import { formatToolResponse, formatError } from "../types.js";

export function registerCallTools(server: McpServer, client: MagpipeClient) {
  server.tool(
    "list_calls",
    "List call records with optional filters for direction, status, date range, and agent",
    {
      limit: z.number().optional().describe("Max results (default 50)"),
      offset: z.number().optional().describe("Pagination offset"),
      direction: z.string().optional().describe("Filter: inbound or outbound"),
      status: z.string().optional().describe("Filter: completed, in-progress, failed, etc."),
      agent_id: z.string().optional().describe("Filter by agent UUID"),
      from_date: z.string().optional().describe("Start date (ISO 8601)"),
      to_date: z.string().optional().describe("End date (ISO 8601)"),
      phone_number: z.string().optional().describe("Filter by caller/callee number"),
    },
    async (args) => {
      try {
        return formatToolResponse(await client.call("list-calls", args));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "get_call",
    "Get full call details including transcript, summary, recording URL, and metadata",
    {
      call_id: z.string().describe("Call record UUID"),
    },
    async ({ call_id }) => {
      try {
        return formatToolResponse(await client.call("get-call", { call_id }));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "initiate_call",
    "Place an outbound call. The agent will call the specified phone number.",
    {
      phone_number: z.string().describe("Destination phone number (E.164 format)"),
      caller_id: z
        .string()
        .describe("Caller ID — must be one of your provisioned service numbers"),
      purpose: z.string().optional().describe("Purpose / context for the call"),
      goal: z.string().optional().describe("Goal for the agent during the call"),
      template_id: z.string().optional().describe("Call template UUID"),
    },
    async (args) => {
      try {
        return formatToolResponse(await client.call("initiate-bridged-call", args));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "terminate_call",
    "End an active call by call ID or room name",
    {
      call_id: z.string().describe("Call UUID or LiveKit room name"),
    },
    async ({ call_id }) => {
      try {
        return formatToolResponse(await client.call("terminate-call", { call_id }));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "get_recording",
    "Get a signed URL to download a call recording",
    {
      call_id: z.string().describe("Call record UUID"),
    },
    async ({ call_id }) => {
      try {
        return formatToolResponse(
          await client.call("get-signed-recording-url", { call_id })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );
}
