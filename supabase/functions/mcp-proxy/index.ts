import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

interface McpProxyRequest {
  server_type: 'custom' | 'catalog'
  server_id: string
  method: 'tools/list' | 'tools/call'
  params?: {
    name?: string
    arguments?: Record<string, unknown>
  }
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

interface McpResponse {
  jsonrpc: string
  id: number
  result?: {
    tools?: McpTool[]
    content?: unknown[]
  }
  error?: {
    code: number
    message: string
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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

    const body: McpProxyRequest = await req.json()
    const { server_type, server_id, method, params } = body

    if (!server_type || !server_id || !method) {
      return new Response(JSON.stringify({ error: 'Missing required fields: server_type, server_id, method' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up server configuration
    let serverUrl: string
    let apiKey: string | null = null
    let authType: string = 'none'
    let authHeaderName: string = 'Authorization'

    if (server_type === 'custom') {
      // Look up custom server
      const { data: server, error: serverError } = await supabase
        .from('user_mcp_servers')
        .select('*')
        .eq('id', server_id)
        .eq('user_id', user.id)
        .single()

      if (serverError || !server) {
        return new Response(JSON.stringify({ error: 'Server not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      serverUrl = server.server_url
      authType = server.auth_type || 'none'
      apiKey = server.api_key_encrypted // TODO: Decrypt with Vault

    } else if (server_type === 'catalog') {
      // Look up catalog connection
      const { data: connection, error: connError } = await supabase
        .from('user_mcp_connections')
        .select(`
          *,
          catalog:mcp_server_catalog(*)
        `)
        .eq('id', server_id)
        .eq('user_id', user.id)
        .single()

      if (connError || !connection || !connection.catalog) {
        return new Response(JSON.stringify({ error: 'Connection not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      serverUrl = connection.catalog.server_url
      authType = connection.catalog.auth_type || 'none'
      authHeaderName = connection.catalog.auth_header_name || 'Authorization'
      apiKey = connection.api_key_encrypted // TODO: Decrypt with Vault

    } else {
      return new Response(JSON.stringify({ error: 'Invalid server_type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate server URL
    if (!isUrlAllowed(serverUrl)) {
      return new Response(JSON.stringify({ error: 'Server URL not allowed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build request headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (apiKey && authType !== 'none') {
      if (authType === 'bearer') {
        headers[authHeaderName] = `Bearer ${apiKey}`
      } else if (authType === 'api_key') {
        headers[authHeaderName] = apiKey
      }
    }

    // Build MCP request body
    const mcpRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      ...(params && { params }),
    }

    console.log(`MCP Proxy: ${method} to ${serverUrl}`)

    // Make request to MCP server with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

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
        console.error(`MCP server error: ${response.status} - ${errorText}`)

        // Update server status to error
        if (server_type === 'custom') {
          await supabase
            .from('user_mcp_servers')
            .update({ status: 'error', last_error: `HTTP ${response.status}: ${errorText}` })
            .eq('id', server_id)
        } else {
          await supabase
            .from('user_mcp_connections')
            .update({ status: 'error', last_error: `HTTP ${response.status}: ${errorText}` })
            .eq('id', server_id)
        }

        return new Response(JSON.stringify({
          error: 'MCP server error',
          details: errorText,
          status: response.status
        }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const mcpResponse: McpResponse = await response.json()

      // Check for MCP-level error
      if (mcpResponse.error) {
        return new Response(JSON.stringify({
          error: 'MCP error',
          code: mcpResponse.error.code,
          message: mcpResponse.error.message
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // If this was a tools/list call, cache the tools
      if (method === 'tools/list' && mcpResponse.result?.tools) {
        const tools = mcpResponse.result.tools
        const now = new Date().toISOString()

        if (server_type === 'custom') {
          await supabase
            .from('user_mcp_servers')
            .update({
              tools_cache: tools,
              tools_cached_at: now,
              status: 'active',
              last_connected_at: now,
              last_error: null
            })
            .eq('id', server_id)
        } else {
          await supabase
            .from('user_mcp_connections')
            .update({
              tools_cache: tools,
              tools_cached_at: now,
              status: 'connected',
              last_connected_at: now,
              last_error: null
            })
            .eq('id', server_id)
        }
      }

      // Update last_connected_at on successful call
      if (method === 'tools/call') {
        const now = new Date().toISOString()
        if (server_type === 'custom') {
          await supabase
            .from('user_mcp_servers')
            .update({ last_connected_at: now, status: 'active', last_error: null })
            .eq('id', server_id)
        } else {
          await supabase
            .from('user_mcp_connections')
            .update({ last_connected_at: now, status: 'connected', last_error: null })
            .eq('id', server_id)
        }
      }

      return new Response(JSON.stringify(mcpResponse.result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })

    } catch (fetchError) {
      clearTimeout(timeoutId)

      const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown error'
      console.error(`MCP fetch error: ${errorMessage}`)

      // Update server status to error
      if (server_type === 'custom') {
        await supabase
          .from('user_mcp_servers')
          .update({ status: 'error', last_error: errorMessage })
          .eq('id', server_id)
      } else {
        await supabase
          .from('user_mcp_connections')
          .update({ status: 'error', last_error: errorMessage })
          .eq('id', server_id)
      }

      return new Response(JSON.stringify({
        error: 'Failed to connect to MCP server',
        details: errorMessage
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

  } catch (error) {
    console.error('MCP Proxy error:', error)
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
