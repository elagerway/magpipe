/**
 * MCP Client Service
 * Provides a unified interface for accessing MCP tools and executing them
 */

import { supabase } from '../lib/supabase.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Fetch all available tools for the current user
 * @returns {Promise<{tools: Array, integrations: {connected: string[], available: string[]}}>}
 */
export async function getTools() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/mcp-tools`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch tools');
  }

  return response.json();
}

/**
 * Convert MCP tools to OpenAI Realtime API format
 * Adds 'type: function' wrapper required by Realtime API
 * @param {Array} tools - MCP tool definitions
 * @returns {Array} - Tools in Realtime API format
 */
export function toRealtimeFormat(tools) {
  return tools.map(tool => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

/**
 * Convert MCP tools to OpenAI Chat Completions API format
 * @param {Array} tools - MCP tool definitions
 * @returns {Array} - Tools in Chat Completions format
 */
export function toChatCompletionsFormat(tools) {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

/**
 * Execute a tool via the MCP server
 * @param {string} toolName - Name of the tool to execute
 * @param {object} args - Tool arguments
 * @param {string} mode - 'preview' for confirmation or 'execute' for actual execution
 * @returns {Promise<{success: boolean, result?: any, message?: string, pending_action?: object}>}
 */
export async function executeTool(toolName, args, mode = 'preview') {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/mcp-execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      tool_name: toolName,
      arguments: args,
      mode,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'Tool execution failed');
  }

  return result;
}

/**
 * Execute a tool in preview mode (for confirmation)
 * @param {string} toolName - Name of the tool
 * @param {object} args - Tool arguments
 * @returns {Promise<object>} - Preview result with pending_action if confirmation needed
 */
export async function previewTool(toolName, args) {
  return executeTool(toolName, args, 'preview');
}

/**
 * Execute a tool (perform the actual action)
 * @param {string} toolName - Name of the tool
 * @param {object} args - Tool arguments
 * @returns {Promise<object>} - Execution result
 */
export async function runTool(toolName, args) {
  return executeTool(toolName, args, 'execute');
}

/**
 * Get available integrations with their status
 * @returns {Promise<{connected: string[], available: string[]}>}
 */
export async function getIntegrations() {
  const { integrations } = await getTools();
  return integrations;
}

/**
 * Check if a specific integration is connected
 * @param {string} providerSlug - Integration slug (e.g., 'slack', 'cal_com')
 * @returns {Promise<boolean>}
 */
export async function isIntegrationConnected(providerSlug) {
  const { integrations } = await getTools();
  return integrations.connected.includes(providerSlug);
}

// Export as default object for convenience
export default {
  getTools,
  toRealtimeFormat,
  toChatCompletionsFormat,
  executeTool,
  previewTool,
  runTool,
  getIntegrations,
  isIntegrationConnected,
};
