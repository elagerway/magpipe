import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

// Blocked URL patterns (internal/private IPs)
const BLOCKED_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
  /^https?:\/\/\[::1\]/,
  /^https?:\/\/0\.0\.0\.0/,
  /\.local$/,
  /\.internal$/,
]

function isUrlAllowed(url: string): boolean {
  try {
    const parsed = new URL(url)
    // Only allow HTTPS
    if (parsed.protocol !== 'https:') return false
    // Block internal/private IPs
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(url)) return false
    }
    return true
  } catch {
    return false
  }
}

interface ValidateRequest {
  action: 'validate' | 'add' | 'connect_catalog' | 'disconnect' | 'refresh_tools'
  // For validate/add
  server_url?: string
  name?: string
  description?: string
  auth_type?: 'none' | 'api_key' | 'bearer'
  api_key?: string
  // For connect_catalog
  catalog_server_id?: string
  // For disconnect/refresh
  server_id?: string
  server_type?: 'custom' | 'catalog'
}

interface McpTool {
  name: string
  description?: string
  inputSchema?: {
    type: string
    properties?: Record<string, unknown>
    required?: string[]
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get user from token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body: ValidateRequest = await req.json()
    const { action } = body

    if (!action) {
      return new Response(JSON.stringify({ error: 'Missing action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle different actions
    switch (action) {
      case 'validate':
        return handleValidate(body)
      case 'add':
        return handleAdd(supabase, user.id, body)
      case 'connect_catalog':
        return handleConnectCatalog(supabase, user.id, body)
      case 'disconnect':
        return handleDisconnect(supabase, user.id, body)
      case 'refresh_tools':
        return handleRefreshTools(supabase, user.id, body)
      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

  } catch (error) {
    console.error('MCP Server Validate error:', error)
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

/**
 * Validate a server URL and test connection
 */
async function handleValidate(body: ValidateRequest): Promise<Response> {
  const { server_url, auth_type, api_key } = body

  if (!server_url) {
    return new Response(JSON.stringify({ error: 'Missing server_url' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Validate URL format and security
  if (!isUrlAllowed(server_url)) {
    return new Response(JSON.stringify({
      error: 'Invalid server URL',
      details: 'URL must be HTTPS and cannot point to internal/private addresses'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Test connection by calling tools/list
  try {
    const tools = await fetchToolsList(server_url, auth_type, api_key)

    return new Response(JSON.stringify({
      valid: true,
      tools_count: tools.length,
      tools: tools
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({
      valid: false,
      error: 'Failed to connect to MCP server',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}

/**
 * Add a custom MCP server
 */
async function handleAdd(
  supabase: any,
  userId: string,
  body: ValidateRequest
): Promise<Response> {
  const { server_url, name, description, auth_type, api_key } = body

  if (!server_url || !name) {
    return new Response(JSON.stringify({ error: 'Missing server_url or name' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Validate URL
  if (!isUrlAllowed(server_url)) {
    return new Response(JSON.stringify({
      error: 'Invalid server URL',
      details: 'URL must be HTTPS and cannot point to internal/private addresses'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Test connection and get tools
  let tools: McpTool[] = []
  try {
    tools = await fetchToolsList(server_url, auth_type, api_key)
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to connect to MCP server',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Check if server already exists for this user
  const { data: existing } = await supabase
    .from('user_mcp_servers')
    .select('id')
    .eq('user_id', userId)
    .eq('server_url', server_url)
    .single()

  if (existing) {
    return new Response(JSON.stringify({
      error: 'Server already added',
      server_id: existing.id
    }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Insert new server record
  const now = new Date().toISOString()
  const { data: server, error: insertError } = await supabase
    .from('user_mcp_servers')
    .insert({
      user_id: userId,
      name,
      description: description || null,
      server_url,
      auth_type: auth_type || 'none',
      api_key_encrypted: api_key || null, // TODO: Encrypt with Vault
      status: 'active',
      tools_cache: tools,
      tools_cached_at: now,
      last_connected_at: now,
    })
    .select()
    .single()

  if (insertError) {
    console.error('Insert error:', insertError)
    return new Response(JSON.stringify({
      error: 'Failed to add server',
      details: insertError.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({
    success: true,
    server: {
      id: server.id,
      name: server.name,
      server_url: server.server_url,
      status: server.status,
      tools_count: tools.length,
      tools: tools
    }
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * Connect to a catalog MCP server
 */
async function handleConnectCatalog(
  supabase: any,
  userId: string,
  body: ValidateRequest
): Promise<Response> {
  const { catalog_server_id, api_key } = body

  if (!catalog_server_id) {
    return new Response(JSON.stringify({ error: 'Missing catalog_server_id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Get catalog server details
  const { data: catalogServer, error: catalogError } = await supabase
    .from('mcp_server_catalog')
    .select('*')
    .eq('id', catalog_server_id)
    .eq('enabled', true)
    .single()

  if (catalogError || !catalogServer) {
    return new Response(JSON.stringify({ error: 'Catalog server not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Check if user already connected
  const { data: existing } = await supabase
    .from('user_mcp_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('catalog_server_id', catalog_server_id)
    .single()

  if (existing) {
    return new Response(JSON.stringify({
      error: 'Already connected to this server',
      connection_id: existing.id
    }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Check if auth is required but not provided
  if (catalogServer.auth_type !== 'none' && !api_key) {
    return new Response(JSON.stringify({
      error: 'API key required',
      auth_type: catalogServer.auth_type
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Test connection and get tools
  let tools: McpTool[] = []
  try {
    tools = await fetchToolsList(
      catalogServer.server_url,
      catalogServer.auth_type,
      api_key,
      catalogServer.auth_header_name
    )
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to connect to MCP server',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Create connection record
  const now = new Date().toISOString()
  const { data: connection, error: insertError } = await supabase
    .from('user_mcp_connections')
    .insert({
      user_id: userId,
      catalog_server_id,
      api_key_encrypted: api_key || null, // TODO: Encrypt with Vault
      status: 'connected',
      tools_cache: tools,
      tools_cached_at: now,
      last_connected_at: now,
    })
    .select(`
      *,
      catalog:mcp_server_catalog(name, slug, description, icon_url, category)
    `)
    .single()

  if (insertError) {
    console.error('Insert error:', insertError)
    return new Response(JSON.stringify({
      error: 'Failed to create connection',
      details: insertError.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({
    success: true,
    connection: {
      id: connection.id,
      catalog: connection.catalog,
      status: connection.status,
      tools_count: tools.length,
      tools: tools
    }
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * Disconnect from an MCP server
 */
async function handleDisconnect(
  supabase: any,
  userId: string,
  body: ValidateRequest
): Promise<Response> {
  const { server_id, server_type } = body

  if (!server_id || !server_type) {
    return new Response(JSON.stringify({ error: 'Missing server_id or server_type' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const table = server_type === 'custom' ? 'user_mcp_servers' : 'user_mcp_connections'

  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', server_id)
    .eq('user_id', userId)

  if (error) {
    return new Response(JSON.stringify({
      error: 'Failed to disconnect',
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * Refresh tools cache for an MCP server
 */
async function handleRefreshTools(
  supabase: any,
  userId: string,
  body: ValidateRequest
): Promise<Response> {
  const { server_id, server_type } = body

  if (!server_id || !server_type) {
    return new Response(JSON.stringify({ error: 'Missing server_id or server_type' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let serverUrl: string
  let authType: string = 'none'
  let apiKey: string | null = null
  let authHeaderName: string = 'Authorization'

  if (server_type === 'custom') {
    const { data: server, error } = await supabase
      .from('user_mcp_servers')
      .select('*')
      .eq('id', server_id)
      .eq('user_id', userId)
      .single()

    if (error || !server) {
      return new Response(JSON.stringify({ error: 'Server not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    serverUrl = server.server_url
    authType = server.auth_type || 'none'
    apiKey = server.api_key_encrypted // TODO: Decrypt with Vault
  } else {
    const { data: connection, error } = await supabase
      .from('user_mcp_connections')
      .select(`
        *,
        catalog:mcp_server_catalog(*)
      `)
      .eq('id', server_id)
      .eq('user_id', userId)
      .single()

    if (error || !connection || !connection.catalog) {
      return new Response(JSON.stringify({ error: 'Connection not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    serverUrl = connection.catalog.server_url
    authType = connection.catalog.auth_type || 'none'
    authHeaderName = connection.catalog.auth_header_name || 'Authorization'
    apiKey = connection.api_key_encrypted // TODO: Decrypt with Vault
  }

  // Fetch fresh tools
  let tools: McpTool[] = []
  try {
    tools = await fetchToolsList(serverUrl, authType, apiKey, authHeaderName)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Update status to error
    const table = server_type === 'custom' ? 'user_mcp_servers' : 'user_mcp_connections'
    await supabase
      .from(table)
      .update({ status: 'error', last_error: errorMessage })
      .eq('id', server_id)

    return new Response(JSON.stringify({
      error: 'Failed to refresh tools',
      details: errorMessage
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Update tools cache
  const now = new Date().toISOString()
  const table = server_type === 'custom' ? 'user_mcp_servers' : 'user_mcp_connections'
  const statusField = server_type === 'custom' ? 'active' : 'connected'

  await supabase
    .from(table)
    .update({
      tools_cache: tools,
      tools_cached_at: now,
      last_connected_at: now,
      status: statusField,
      last_error: null
    })
    .eq('id', server_id)

  return new Response(JSON.stringify({
    success: true,
    tools_count: tools.length,
    tools: tools
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * Fetch tools list from MCP server
 */
async function fetchToolsList(
  serverUrl: string,
  authType?: string,
  apiKey?: string | null,
  authHeaderName: string = 'Authorization'
): Promise<McpTool[]> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (apiKey && authType && authType !== 'none') {
    if (authType === 'bearer') {
      headers[authHeaderName] = `Bearer ${apiKey}`
    } else if (authType === 'api_key') {
      headers[authHeaderName] = apiKey
    }
  }

  const mcpRequest = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/list',
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000) // 15s timeout for validation

  try {
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(mcpRequest),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    const mcpResponse = await response.json()

    if (mcpResponse.error) {
      throw new Error(mcpResponse.error.message || 'MCP error')
    }

    return mcpResponse.result?.tools || []
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}
