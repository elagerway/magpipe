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
        .describe("Filter by type: inbound_voice, outbound_voice, text, chat_widget, whatsapp, email"),
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
      greeting: z.string().optional().describe("Initial greeting when agent answers (omit for outbound agents)"),
      system_prompt: z.string().optional().describe("System prompt / persona instructions"),
      outbound_system_prompt: z.string().optional().describe("System prompt override for outbound calls"),
      voice_id: z.string().optional().describe("ElevenLabs voice ID"),
      llm_model: z.string().optional().describe("LLM model identifier"),
      language: z.string().optional().describe("Language code (e.g. en)"),
      agent_type: z.string().optional().describe("inbound_voice, outbound_voice, text, chat_widget, whatsapp, or email (default: inbound_voice)"),
      organization_name: z.string().optional().describe("Organization the agent represents"),
      owner_name: z.string().optional().describe("Owner / operator name"),
      agent_role: z.string().optional().describe("Role description"),
      transfer_phone_number: z.string().optional().describe("Phone number for call transfers"),
      is_active: z.boolean().optional().describe("Whether agent is active"),
      temperature: z.number().optional().describe("LLM temperature (0-2)"),
      max_tokens: z.number().optional().describe("Maximum tokens for LLM response"),
      max_call_duration: z.number().optional().describe("Max call duration in seconds (60-3600)"),
      end_call_phrases: z.array(z.string()).optional().describe("Phrases that trigger call termination"),
      recording_enabled: z.boolean().optional().describe("Whether to record calls (default true)"),
      memory_enabled: z.boolean().optional().describe("Enable caller memory across conversations"),
      semantic_memory_enabled: z.boolean().optional().describe("Enable semantic memory (AI embeddings across all contacts)"),
      noise_suppression: z.boolean().optional().describe("Enable background noise suppression"),
      translate_to: z.string().optional().describe("Translate agent responses to this language code"),
      pii_storage: z.boolean().optional().describe("Whether to store PII from conversations"),
      knowledge_source_ids: z.array(z.string()).optional().describe("Knowledge base source UUIDs to attach"),
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
      greeting: z.string().optional().describe("Initial greeting (omit for outbound agents)"),
      system_prompt: z.string().optional().describe("System prompt"),
      outbound_system_prompt: z.string().optional().describe("System prompt override for outbound calls"),
      voice_id: z.string().optional().describe("ElevenLabs voice ID"),
      llm_model: z.string().optional().describe("LLM model"),
      language: z.string().optional().describe("Language code"),
      agent_type: z.string().optional().describe("inbound_voice, outbound_voice, text, chat_widget, whatsapp, or email"),
      organization_name: z.string().optional().describe("Organization name"),
      owner_name: z.string().optional().describe("Owner name"),
      agent_role: z.string().optional().describe("Role description"),
      transfer_phone_number: z.string().optional().describe("Transfer number"),
      is_active: z.boolean().optional().describe("Active status"),
      temperature: z.number().optional().describe("LLM temperature"),
      max_tokens: z.number().optional().describe("Maximum tokens for LLM response"),
      max_call_duration: z.number().optional().describe("Max call duration in seconds (60-3600)"),
      end_call_phrases: z.array(z.string()).optional().describe("Phrases that trigger call termination"),
      recording_enabled: z.boolean().optional().describe("Whether to record calls handled by this agent (default true)"),
      memory_enabled: z.boolean().optional().describe("Enable caller memory across conversations"),
      semantic_memory_enabled: z.boolean().optional().describe("Enable semantic memory (AI embeddings across all contacts)"),
      memory_config: z
        .object({
          include_summaries: z.boolean().optional().describe("Include AI-generated relationship summaries (default true)"),
          max_history_calls: z.number().optional().describe("Number of recent calls to include in context (default 5)"),
          include_key_topics: z.boolean().optional().describe("Include key topics in context (default true)"),
          include_preferences: z.boolean().optional().describe("Include caller preferences in context (default true)"),
        })
        .optional()
        .describe("Caller memory configuration"),
      semantic_memory_config: z
        .object({
          max_results: z.number().optional().describe("Max memory results to retrieve (default 3)"),
          similarity_threshold: z.number().optional().describe("Similarity threshold 0-1 (default 0.75)"),
          include_other_callers: z.boolean().optional().describe("Include memories from other callers (default true)"),
        })
        .optional()
        .describe("Semantic memory configuration"),
      shared_memory_agent_ids: z.array(z.string()).optional().describe("Agent UUIDs to share caller memory with"),
      noise_suppression: z.boolean().optional().describe("Enable background noise suppression"),
      translate_to: z.string().optional().describe("Translate agent responses to this language code"),
      pii_storage: z.boolean().optional().describe("Whether to store PII from conversations"),
      knowledge_source_ids: z.array(z.string()).optional().describe("Knowledge base source UUIDs to attach"),
      dynamic_variables: z
        .array(
          z.object({
            name: z.string().describe("Variable name (e.g. caller_name)"),
            description: z.string().optional().describe("What to extract"),
            var_type: z.string().optional().describe("text, number, boolean, or enum (default text)"),
            enum_options: z.array(z.string()).optional().describe("Required when var_type is enum"),
          })
        )
        .optional()
        .describe("Dynamic variables for extracting structured data from conversations (replaces all existing)"),
      vad_silence_duration: z.number().optional().describe("Silence duration in ms before agent speaks (VAD)"),
      vad_speech_duration: z.number().optional().describe("Minimum speech duration in ms to trigger response (VAD)"),
      vad_activation_threshold: z.number().optional().describe("Voice activity detection sensitivity threshold"),
      agent_volume: z.number().optional().describe("Agent voice volume (0-2, default 1)"),
      ambient_sound: z.string().optional().describe("Background ambient sound identifier"),
      ambient_sound_volume: z.number().optional().describe("Ambient sound volume (0-1)"),
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
