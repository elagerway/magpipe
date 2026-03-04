import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MagpipeClient } from "../client.js";
import { formatToolResponse, formatError } from "../types.js";

export function registerNumberTools(server: McpServer, client: MagpipeClient) {
  server.tool(
    "list_phone_numbers",
    "List your provisioned phone numbers with agent assignments",
    {
      limit: z.number().optional().describe("Max results (default 50)"),
      offset: z.number().optional().describe("Pagination offset"),
      agent_id: z.string().optional().describe("Filter by assigned agent UUID"),
      is_active: z.boolean().optional().describe("Filter by active status"),
    },
    async (args) => {
      try {
        return formatToolResponse(await client.call("list-phone-numbers", args));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "search_phone_numbers",
    "Search available phone numbers to purchase by area code, city, or type",
    {
      areaCode: z.string().optional().describe("Area code to search (e.g. 604)"),
      city: z.string().optional().describe("City name"),
      state: z.string().optional().describe("State/province code (e.g. BC, CA)"),
      country: z.string().optional().describe("Country code (default US)"),
      numberType: z
        .string()
        .optional()
        .describe("Number type: local or tollFree"),
    },
    async (args) => {
      try {
        return formatToolResponse(await client.call("search-phone-numbers", args));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "provision_phone_number",
    "Purchase and provision a phone number found via search_phone_numbers",
    {
      phone_number: z
        .string()
        .describe("Phone number to provision (E.164 format from search results)"),
    },
    async ({ phone_number }) => {
      try {
        return formatToolResponse(
          await client.call("provision-phone-number", { phone_number })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "release_phone_number",
    "Release (cancel) a provisioned phone number",
    {
      phone_number: z.string().optional().describe("Phone number (E.164)"),
      number_id: z.string().optional().describe("Phone number record UUID"),
    },
    async (args) => {
      try {
        return formatToolResponse(await client.call("release-phone-number", args));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "lookup_phone_number",
    "Look up carrier/linetype info for a phone number (wireless, landline, voip)",
    {
      phone_number: z.string().describe("Phone number to look up (E.164 format)"),
    },
    async ({ phone_number }) => {
      try {
        return formatToolResponse(
          await client.call("lookup-phone-number", { phone_number })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );
}
