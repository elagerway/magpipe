import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MagpipeClient } from "../client.js";
import { formatToolResponse, formatError } from "../types.js";

export function registerContactTools(server: McpServer, client: MagpipeClient) {
  server.tool(
    "list_contacts",
    "List contacts with search, tag filters, and sorting",
    {
      limit: z.number().optional().describe("Max results (default 50)"),
      offset: z.number().optional().describe("Pagination offset"),
      search: z.string().optional().describe("Search name, phone, email, company"),
      tags: z.array(z.string()).optional().describe("Filter by tags"),
      sort_by: z.string().optional().describe("Sort field (default created_at)"),
      sort_order: z.string().optional().describe("asc or desc"),
    },
    async (args) => {
      try {
        return formatToolResponse(await client.call("list-contacts", args));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "get_contact",
    "Get a single contact by ID",
    {
      contact_id: z.string().describe("Contact UUID"),
    },
    async ({ contact_id }) => {
      try {
        return formatToolResponse(await client.call("get-contact", { contact_id }));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "create_contact",
    "Create a new contact",
    {
      name: z.string().optional().describe("Contact name"),
      phone_number: z.string().optional().describe("Phone number (E.164)"),
      email: z.string().optional().describe("Email address"),
      company: z.string().optional().describe("Company name"),
      notes: z.string().optional().describe("Notes about the contact"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
    },
    async (args) => {
      try {
        return formatToolResponse(await client.call("create-contact", args));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "update_contact",
    "Update an existing contact",
    {
      contact_id: z.string().describe("Contact UUID to update"),
      name: z.string().optional().describe("Contact name"),
      phone_number: z.string().optional().describe("Phone number"),
      email: z.string().optional().describe("Email address"),
      company: z.string().optional().describe("Company name"),
      notes: z.string().optional().describe("Notes"),
      tags: z.array(z.string()).optional().describe("Tags"),
    },
    async (args) => {
      try {
        return formatToolResponse(await client.call("update-contact", args));
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "delete_contact",
    "Delete a contact",
    {
      contact_id: z.string().describe("Contact UUID to delete"),
    },
    async ({ contact_id }) => {
      try {
        return formatToolResponse(
          await client.call("delete-contact", { contact_id })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );
}
