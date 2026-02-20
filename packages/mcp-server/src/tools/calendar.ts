import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MagpipeClient } from "../client.js";
import { formatToolResponse, formatError } from "../types.js";

export function registerCalendarTools(
  server: McpServer,
  client: MagpipeClient
) {
  server.tool(
    "get_calendar_slots",
    "Get available booking slots for a Cal.com event type",
    {
      event_type_id: z.number().describe("Cal.com event type ID"),
      start: z.string().describe("Range start (ISO 8601)"),
      end: z.string().describe("Range end (ISO 8601)"),
    },
    async (args) => {
      try {
        return formatToolResponse(
          await client.call("cal-com-get-slots", args)
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "create_booking",
    "Create a Cal.com booking",
    {
      event_type_id: z.number().describe("Cal.com event type ID"),
      start: z.string().describe("Booking start time (ISO 8601)"),
      name: z.string().describe("Attendee name"),
      email: z.string().describe("Attendee email"),
      phone: z.string().optional().describe("Attendee phone"),
      notes: z.string().optional().describe("Booking notes"),
    },
    async (args) => {
      try {
        return formatToolResponse(
          await client.call("cal-com-create-booking", args)
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "cancel_booking",
    "Cancel a Cal.com booking",
    {
      booking_id: z.number().describe("Booking ID to cancel"),
    },
    async ({ booking_id }) => {
      try {
        return formatToolResponse(
          await client.call("cal-com-cancel-booking", { booking_id })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );
}
