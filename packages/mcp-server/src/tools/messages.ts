import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MagpipeClient } from "../client.js";
import { formatToolResponse, formatError } from "../types.js";

export function registerMessageTools(server: McpServer, client: MagpipeClient) {
  server.tool(
    "list_messages",
    "List SMS messages with optional filters for thread, direction, and date range",
    {
      limit: z.number().optional().describe("Max results (default 50)"),
      offset: z.number().optional().describe("Pagination offset"),
      thread_id: z.string().optional().describe("Filter by conversation thread UUID"),
      direction: z.string().optional().describe("Filter: inbound or outbound"),
      phone_number: z.string().optional().describe("Filter by phone number"),
      from_date: z.string().optional().describe("Start date (ISO 8601)"),
      to_date: z.string().optional().describe("End date (ISO 8601)"),
    },
    async (args) => {
      try {
        return formatToolResponse(await client.call("list-messages", args));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "get_message",
    "Get a single SMS message by ID",
    {
      message_id: z.string().describe("Message UUID"),
    },
    async ({ message_id }) => {
      try {
        return formatToolResponse(await client.call("get-message", { message_id }));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "send_sms",
    "Send an SMS message from one of your service numbers to a contact",
    {
      serviceNumber: z
        .string()
        .describe("Your service number to send from (E.164)"),
      contactPhone: z.string().describe("Recipient phone number (E.164)"),
      message: z.string().describe("Message body"),
    },
    async (args) => {
      try {
        return formatToolResponse(await client.call("send-user-sms", args));
      } catch (e) {
        return formatError(e);
      }
    }
  );
}
