import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MagpipeClient } from "../client.js";
import { formatToolResponse, formatError } from "../types.js";

export function registerTestTools(server: McpServer, client: MagpipeClient) {
  server.tool(
    "list_test_suites",
    "List all test suites",
    {},
    async () => {
      try {
        return formatToolResponse(
          await client.call("test-cases", { action: "list_suites" })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "create_test_suite",
    "Create a new test suite to group related test cases",
    {
      name: z.string().describe("Display name for the test suite"),
      description: z.string().optional().describe("Optional description of what this suite tests"),
    },
    async (args) => {
      try {
        return formatToolResponse(
          await client.call("test-cases", { action: "create_suite", ...args })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "list_test_cases",
    "List all test cases in a test suite",
    {
      suite_id: z.string().describe("Test suite UUID"),
    },
    async ({ suite_id }) => {
      try {
        return formatToolResponse(
          await client.call("test-cases", { action: "list_cases", suite_id })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "create_test_case",
    "Create a test case inside a suite. Supports inbound/outbound call types, silent or scripted caller modes, and assertions for phrases, functions, and call duration.",
    {
      suite_id: z.string().describe("Test suite UUID"),
      name: z.string().describe("Display name for the test case"),
      description: z.string().optional().describe("What this test case validates"),
      type: z
        .enum(["inbound_call", "outbound_call"])
        .optional()
        .describe("Call direction to test (default: inbound_call)"),
      agent_id: z.string().optional().describe("Agent UUID to run the test against"),
      caller_mode: z
        .enum(["silent", "scripted"])
        .optional()
        .describe("silent: test caller stays quiet; scripted: caller speaks from a script (default: silent)"),
      caller_script: z
        .array(z.string())
        .optional()
        .describe("Phrases the test caller speaks, one per turn (used when caller_mode is scripted)"),
      expected_phrases: z
        .array(z.string())
        .optional()
        .describe("Phrases that must appear in the transcript for the test to pass"),
      prohibited_phrases: z
        .array(z.string())
        .optional()
        .describe("Phrases that must NOT appear in the transcript"),
      expected_functions: z
        .array(z.string())
        .optional()
        .describe("Custom function names that must be called during the conversation"),
      min_duration_seconds: z
        .number()
        .optional()
        .describe("Minimum acceptable call duration in seconds"),
      max_duration_seconds: z
        .number()
        .optional()
        .describe("Maximum acceptable call duration in seconds"),
    },
    async (args) => {
      try {
        return formatToolResponse(
          await client.call("test-cases", { action: "create_case", ...args })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "run_test_case",
    "Fire a test run for a test case. Returns a run_id you can use to poll for results.",
    {
      test_case_id: z.string().describe("Test case UUID to run"),
    },
    async ({ test_case_id }) => {
      try {
        return formatToolResponse(
          await client.call("run-test", { test_case_id })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "list_test_runs",
    "List recent test runs for a test case, including status, assertions, and AI analysis",
    {
      test_case_id: z.string().describe("Test case UUID"),
    },
    async ({ test_case_id }) => {
      try {
        return formatToolResponse(
          await client.call("test-runs", { test_case_id })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );

  server.tool(
    "get_test_run",
    "Get full details of a single test run including all assertions and AI analysis",
    {
      run_id: z.string().describe("Test run UUID"),
    },
    async ({ run_id }) => {
      try {
        return formatToolResponse(
          await client.call("test-runs", { id: run_id })
        );
      } catch (e) {
        return formatError(e);
      }
    }
  );
}
