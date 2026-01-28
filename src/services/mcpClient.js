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

// ============================================================================
// MCP Server Management
// ============================================================================

/**
 * Fetch the MCP server catalog
 * @returns {Promise<Array>} - List of catalog servers
 */
export async function getMcpCatalog() {
  const { data, error } = await supabase
    .from('mcp_server_catalog')
    .select('*')
    .eq('enabled', true)
    .order('featured', { ascending: false })
    .order('name');

  if (error) throw error;
  return data || [];
}

/**
 * Fetch user's connected MCP servers (both custom and catalog)
 * @returns {Promise<{custom: Array, catalog: Array}>}
 */
export async function getUserMcpServers() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error('Not authenticated');

  const [customResult, connectionsResult] = await Promise.all([
    supabase
      .from('user_mcp_servers')
      .select('*')
      .eq('user_id', session.user.id)
      .order('name'),
    supabase
      .from('user_mcp_connections')
      .select(`
        *,
        catalog:mcp_server_catalog(id, name, slug, description, icon_url, category, auth_type, verified)
      `)
      .eq('user_id', session.user.id),
  ]);

  return {
    custom: customResult.data || [],
    catalog: connectionsResult.data || [],
  };
}

/**
 * Validate a custom MCP server URL
 * @param {string} serverUrl - Server URL to validate
 * @param {string} authType - Auth type ('none', 'bearer', 'api_key')
 * @param {string} apiKey - API key if required
 * @returns {Promise<{valid: boolean, tools_count?: number, tools?: Array, error?: string}>}
 */
export async function validateMcpServer(serverUrl, authType = 'none', apiKey = null) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error('Not authenticated');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/mcp-server-validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: 'validate',
      server_url: serverUrl,
      auth_type: authType,
      api_key: apiKey || undefined,
    }),
  });

  return response.json();
}

/**
 * Add a custom MCP server
 * @param {object} options - Server options
 * @param {string} options.server_url - Server URL
 * @param {string} options.name - Display name
 * @param {string} options.description - Description
 * @param {string} options.auth_type - Auth type
 * @param {string} options.api_key - API key
 * @returns {Promise<{success: boolean, server?: object, error?: string}>}
 */
export async function addCustomMcpServer(options) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error('Not authenticated');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/mcp-server-validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: 'add',
      ...options,
    }),
  });

  return response.json();
}

/**
 * Connect to a catalog MCP server
 * @param {string} catalogServerId - Catalog server ID
 * @param {string} apiKey - API key if required
 * @returns {Promise<{success: boolean, connection?: object, error?: string}>}
 */
export async function connectCatalogServer(catalogServerId, apiKey = null) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error('Not authenticated');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/mcp-server-validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: 'connect_catalog',
      catalog_server_id: catalogServerId,
      api_key: apiKey || undefined,
    }),
  });

  return response.json();
}

/**
 * Disconnect from an MCP server
 * @param {string} serverId - Server or connection ID
 * @param {string} serverType - 'custom' or 'catalog'
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function disconnectMcpServer(serverId, serverType) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error('Not authenticated');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/mcp-server-validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: 'disconnect',
      server_id: serverId,
      server_type: serverType,
    }),
  });

  return response.json();
}

/**
 * Refresh tools cache for an MCP server
 * @param {string} serverId - Server or connection ID
 * @param {string} serverType - 'custom' or 'catalog'
 * @returns {Promise<{success: boolean, tools_count?: number, tools?: Array, error?: string}>}
 */
export async function refreshMcpServerTools(serverId, serverType) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error('Not authenticated');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/mcp-server-validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: 'refresh_tools',
      server_id: serverId,
      server_type: serverType,
    }),
  });

  return response.json();
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
  // MCP Server management
  getMcpCatalog,
  getUserMcpServers,
  validateMcpServer,
  addCustomMcpServer,
  connectCatalogServer,
  disconnectMcpServer,
  refreshMcpServerTools,
};
