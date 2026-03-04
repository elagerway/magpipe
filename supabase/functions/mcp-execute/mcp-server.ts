import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { McpExecuteResponse } from './utils.ts'

/**
 * Handle MCP server tool execution
 * Tool names are in format "server_slug:tool_name"
 */
export async function handleMcpServerTool(
  supabase: any,
  userId: string,
  jwt: string,
  toolName: string,
  args: any
): Promise<McpExecuteResponse> {
  const [serverSlug, actualToolName] = toolName.split(':');

  if (!serverSlug || !actualToolName) {
    return {
      success: false,
      message: `Invalid tool name format: ${toolName}`,
    };
  }

  // First, look for a custom MCP server with matching slug (derived from name)
  const { data: customServers } = await supabase
    .from('user_mcp_servers')
    .select('id, name, server_url')
    .eq('user_id', userId)
    .eq('status', 'active');

  let serverId: string | null = null;
  let serverType: 'custom' | 'catalog' = 'custom';
  let serverName: string = '';

  // Check custom servers
  if (customServers) {
    for (const server of customServers) {
      const slug = server.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      if (slug === serverSlug) {
        serverId = server.id;
        serverName = server.name;
        serverType = 'custom';
        break;
      }
    }
  }

  // If not found in custom, check catalog connections
  if (!serverId) {
    const { data: catalogConnections } = await supabase
      .from('user_mcp_connections')
      .select(`
        id,
        catalog:mcp_server_catalog(slug, name)
      `)
      .eq('user_id', userId)
      .eq('status', 'connected');

    if (catalogConnections) {
      for (const conn of catalogConnections) {
        if (conn.catalog?.slug === serverSlug) {
          serverId = conn.id;
          serverName = conn.catalog.name;
          serverType = 'catalog';
          break;
        }
      }
    }
  }

  if (!serverId) {
    return {
      success: false,
      message: `MCP server "${serverSlug}" not found. Make sure it's connected in Settings → MCP Servers.`,
    };
  }

  // Call mcp-proxy to execute the tool
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/mcp-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        server_type: serverType,
        server_id: serverId,
        method: 'tools/call',
        params: {
          name: actualToolName,
          arguments: args,
        },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('MCP proxy error:', result);
      return {
        success: false,
        message: result.error || `Failed to execute tool on ${serverName}`,
      };
    }

    // MCP tools/call returns content array
    let resultMessage = '';
    if (result.content) {
      for (const item of result.content) {
        if (item.type === 'text') {
          resultMessage += item.text;
        } else if (item.type === 'resource') {
          resultMessage += `\n[Resource: ${item.resource?.uri}]`;
        }
      }
    }

    return {
      success: true,
      message: resultMessage || `Tool ${actualToolName} executed successfully`,
      result: result,
    };

  } catch (error) {
    console.error('MCP tool execution error:', error);
    return {
      success: false,
      message: `Failed to connect to ${serverName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
