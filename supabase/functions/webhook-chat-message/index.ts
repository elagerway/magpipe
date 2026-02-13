/**
 * Chat Widget Webhook Handler
 * Handles incoming messages from the embeddable chat widget
 * - Validates widget_key
 * - Creates/retrieves chat sessions
 * - Stores messages
 * - Generates AI responses using OpenAI
 * - Supports function calling with MCP server tools (e.g., HubSpot)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, any>
}

interface McpServerTool {
  name: string
  description?: string
  inputSchema?: {
    type: string
    properties?: Record<string, unknown>
    required?: string[]
  }
}

/**
 * Fetch available MCP tools for a user
 * Returns tools from connected MCP servers (e.g., HubSpot)
 */
async function fetchUserMcpTools(supabase: any, userId: string): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = []

  try {
    // Get custom MCP servers
    const { data: customServers } = await supabase
      .from('user_mcp_servers')
      .select('id, name, server_url, tools_cache')
      .eq('user_id', userId)
      .eq('status', 'active')

    if (customServers) {
      for (const server of customServers) {
        const cachedTools = (server.tools_cache || []) as McpServerTool[]
        const serverSlug = server.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')

        for (const tool of cachedTools) {
          tools.push({
            name: `${serverSlug}:${tool.name}`,
            description: tool.description || `Tool from ${server.name}`,
            parameters: tool.inputSchema || { type: 'object', properties: {} },
          })
        }
      }
    }

    // Get catalog MCP connections (e.g., HubSpot)
    const { data: catalogConnections } = await supabase
      .from('user_mcp_connections')
      .select(`
        id,
        tools_cache,
        catalog:mcp_server_catalog(name, slug)
      `)
      .eq('user_id', userId)
      .eq('status', 'connected')

    if (catalogConnections) {
      for (const conn of catalogConnections) {
        if (!conn.catalog) continue

        const cachedTools = (conn.tools_cache || []) as McpServerTool[]
        const catalogSlug = conn.catalog.slug

        for (const tool of cachedTools) {
          tools.push({
            name: `${catalogSlug}:${tool.name}`,
            description: tool.description || `Tool from ${conn.catalog.name}`,
            parameters: tool.inputSchema || { type: 'object', properties: {} },
          })
        }
      }
    }
  } catch (error) {
    console.error('Error fetching MCP tools:', error)
  }

  return tools
}

/**
 * Execute a native integration tool via mcp-execute
 */
async function executeNativeTool(
  supabase: any,
  userId: string,
  toolName: string,
  args: Record<string, any>
): Promise<{ success: boolean; result?: string; error?: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/mcp-execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'x-user-id': userId,
      },
      body: JSON.stringify({
        tool_name: toolName,
        arguments: args,
        mode: 'execute',
      }),
    })

    const result = await response.json()

    if (!response.ok || !result.success) {
      return { success: false, error: result.message || result.error || 'Tool execution failed' }
    }

    return { success: true, result: result.message || JSON.stringify(result.result) }
  } catch (error) {
    console.error('Native tool execution error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Execute an MCP tool via mcp-proxy
 */
async function executeMcpTool(
  supabase: any,
  userId: string,
  toolName: string,
  args: Record<string, any>
): Promise<{ success: boolean; result?: string; error?: string }> {
  const [serverSlug, actualToolName] = toolName.split(':')

  if (!serverSlug || !actualToolName) {
    return { success: false, error: `Invalid tool name format: ${toolName}` }
  }

  // Find the MCP server
  let serverId: string | null = null
  let serverType: 'custom' | 'catalog' = 'custom'

  // Check custom servers
  const { data: customServers } = await supabase
    .from('user_mcp_servers')
    .select('id, name')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (customServers) {
    for (const server of customServers) {
      const slug = server.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')
      if (slug === serverSlug) {
        serverId = server.id
        serverType = 'custom'
        break
      }
    }
  }

  // Check catalog connections
  if (!serverId) {
    const { data: catalogConnections } = await supabase
      .from('user_mcp_connections')
      .select(`id, catalog:mcp_server_catalog(slug)`)
      .eq('user_id', userId)
      .eq('status', 'connected')

    if (catalogConnections) {
      for (const conn of catalogConnections) {
        if (conn.catalog?.slug === serverSlug) {
          serverId = conn.id
          serverType = 'catalog'
          break
        }
      }
    }
  }

  if (!serverId) {
    return { success: false, error: `MCP server "${serverSlug}" not found or not connected` }
  }

  // Call mcp-proxy to execute the tool
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/mcp-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'x-user-id': userId,  // Pass user ID for context
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
    })

    const result = await response.json()

    if (!response.ok) {
      return { success: false, error: result.error || 'Failed to execute tool' }
    }

    // Extract text from MCP response content
    let resultText = ''
    if (result.content) {
      for (const item of result.content) {
        if (item.type === 'text') {
          resultText += item.text
        }
      }
    }

    return { success: true, result: resultText || JSON.stringify(result) }
  } catch (error) {
    console.error('MCP tool execution error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const { widgetKey, visitorId, message, visitorName, visitorEmail, pageUrl, browserInfo, requestGreeting } = await req.json()

    // Allow greeting requests without a message
    if (!widgetKey || !visitorId || (!message && !requestGreeting)) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: widgetKey, visitorId, message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Validate widget key and get widget config
    const { data: widget, error: widgetError } = await supabase
      .from('chat_widgets')
      .select('*, agent_configs(*)')
      .eq('widget_key', widgetKey)
      .eq('is_active', true)
      .single()

    if (widgetError || !widget) {
      console.error('Widget not found or inactive:', widgetKey, widgetError)
      return new Response(
        JSON.stringify({ error: 'Widget not found or inactive' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate domain if allowed_domains is set
    if (widget.allowed_domains && widget.allowed_domains.length > 0 && pageUrl) {
      try {
        const url = new URL(pageUrl)
        const domain = url.hostname
        if (!widget.allowed_domains.some((d: string) => domain === d || domain.endsWith(`.${d}`))) {
          console.error('Domain not allowed:', domain, 'Allowed:', widget.allowed_domains)
          return new Response(
            JSON.stringify({ error: 'Domain not allowed' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      } catch (e) {
        console.error('Invalid pageUrl:', pageUrl)
      }
    }

    // Get or create chat session
    let session = null
    const { data: existingSession } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('widget_id', widget.id)
      .eq('visitor_id', visitorId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    let isNewSession = false
    if (existingSession) {
      session = existingSession
      // Update visitor info if provided
      if (visitorName || visitorEmail) {
        await supabase
          .from('chat_sessions')
          .update({
            visitor_name: visitorName || session.visitor_name,
            visitor_email: visitorEmail || session.visitor_email,
          })
          .eq('id', session.id)
        // Update local session object
        session.visitor_name = visitorName || session.visitor_name
        session.visitor_email = visitorEmail || session.visitor_email
      }
    } else {
      // Create new session
      const { data: newSession, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert({
          widget_id: widget.id,
          user_id: widget.user_id,
          agent_id: widget.agent_id,
          visitor_id: visitorId,
          visitor_name: visitorName || null,
          visitor_email: visitorEmail || null,
          page_url: pageUrl || null,
          browser_info: browserInfo || {},
        })
        .select()
        .single()

      if (sessionError) {
        console.error('Failed to create session:', sessionError)
        return new Response(
          JSON.stringify({ error: 'Failed to create chat session' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      session = newSession
      isNewSession = true
    }

    // Auto-sync to HubSpot if connected and we have visitor email
    if (session.visitor_email && isNewSession) {
      try {
        // Check if user has HubSpot connected
        const { data: hubspotIntegration } = await supabase
          .from('user_integrations')
          .select(`
            id,
            access_token,
            integration_providers!inner(slug)
          `)
          .eq('user_id', widget.user_id)
          .eq('integration_providers.slug', 'hubspot')
          .eq('status', 'connected')
          .single()

        if (hubspotIntegration) {
          console.log('Auto-syncing visitor to HubSpot:', session.visitor_email)

          // Search for existing contact first
          const searchResult = await executeNativeTool(
            supabase,
            widget.user_id,
            'hubspot_search_contacts',
            { query: session.visitor_email }
          )

          console.log('HubSpot search result:', searchResult)

          // If no contact found, create one
          if (searchResult.success) {
            const resultText = searchResult.result || ''
            const noContactFound = resultText.includes('No contacts found') ||
                                   resultText.includes('Found 0 contacts')

            if (noContactFound) {
              console.log('No existing contact, creating new one')
              // Parse name into first/last
              const nameParts = (session.visitor_name || '').trim().split(' ')
              const firstName = nameParts[0] || ''
              const lastName = nameParts.slice(1).join(' ') || ''

              const createResult = await executeNativeTool(
                supabase,
                widget.user_id,
                'hubspot_create_contact',
                {
                  email: session.visitor_email,
                  firstname: firstName,
                  lastname: lastName,
                }
              )
              console.log('HubSpot create result:', createResult)
            } else {
              console.log('Contact already exists in HubSpot')
            }
          }
        }
      } catch (hubspotError) {
        // Don't fail the chat if HubSpot sync fails
        console.error('HubSpot auto-sync error:', hubspotError)
      }
    }

    // For greeting requests, skip storing a visitor message
    let visitorMessage = null
    if (!requestGreeting && message) {
      const { data: storedMessage, error: visitorMsgError } = await supabase
        .from('chat_messages')
        .insert({
          session_id: session.id,
          role: 'visitor',
          content: message,
          is_ai_generated: false,
        })
        .select()
        .single()

      if (visitorMsgError) {
        console.error('Failed to store visitor message:', visitorMsgError)
        return new Response(
          JSON.stringify({ error: 'Failed to store message' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      visitorMessage = storedMessage
    }

    // Check if AI is paused (human handoff active) - skip for greeting requests
    if (!requestGreeting && session.ai_paused_until) {
      const pausedUntil = new Date(session.ai_paused_until)
      const now = new Date()
      if (pausedUntil > now) {
        console.log('AI paused for this session until:', pausedUntil)
        return new Response(
          JSON.stringify({
            success: true,
            sessionId: session.id,
            messageId: visitorMessage?.id || null,
            aiPaused: true,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Get agent config
    const agentConfig = widget.agent_configs
    if (!agentConfig || agentConfig.is_active === false) {
      console.log('No active agent configured for widget')
      return new Response(
        JSON.stringify({
          success: true,
          sessionId: session.id,
          messageId: visitorMessage?.id || null,
          aiResponse: null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get conversation history for context
    const { data: history } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .limit(10)

    // Build chat context with visitor personalization
    // Put visitor name at the START so it takes precedence over agent's default greetings
    const visitorPrefix = session.visitor_name
      ? `IMPORTANT: You are chatting with ${session.visitor_name}. Use their name in your greeting and responses (e.g., "Hi ${session.visitor_name}!" not just "Hi there!").\n\n`
      : ''

    const CHAT_CONTEXT_SUFFIX = `

IMPORTANT CONTEXT:
- You are responding via WEBSITE CHAT (not SMS or phone call)
- Keep responses helpful and conversational (2-4 sentences typically)
- You can use markdown formatting (bold, lists, links)
- Be friendly and professional
- If they need to call, provide the business phone number
- This is a real-time chat - respond promptly and concisely`

    // Agent display name (widget override or agent config name)
    const agentDisplayName = widget.agent_name || agentConfig.name || 'Assistant'

    // Agent identity context
    const AGENT_IDENTITY = `
YOUR NAME: ${agentDisplayName}
- When greeting users or introducing yourself, use the name "${agentDisplayName}"
- Example greeting: "Hi! I'm ${agentDisplayName}. How can I help you today?"
`

    // MAGPIPE Support Agent knowledge base
    const SUPPORT_AGENT_KNOWLEDGE = widget.is_support_agent ? `

YOU ARE A MAGPIPE SUPPORT AGENT named ${agentDisplayName}.

GREETING RULES:
- When greeting users, introduce yourself as ${agentDisplayName}, the MAGPIPE support assistant
- Example: "Hi! I'm ${agentDisplayName}, your MAGPIPE support assistant. How can I help you today?"
- Always be welcoming and let them know you can help with any questions about the platform

RESPONSE FORMAT RULES (CRITICAL - ALWAYS FOLLOW):
When giving step-by-step instructions, format EXACTLY like this example:

To do X:

1. **First step here**

2. **Second step here**

3. **Third step here**

RULES:
- Put a BLANK LINE between each numbered step (this is critical for readability)
- Use **bold** for clickable items (buttons, menu names, tabs)
- Keep each step to ONE action only
- Max 5-6 steps per answer
- For simple questions, answer in 1-2 sentences without steps

NAVIGATION (sidebar menu items):
- **Agent** - Configure AI agent (prompt, voice, deploy)
- **Inbox** - View calls, SMS, chat conversations
- **Phone Numbers** - Buy and manage numbers
- **Knowledge** - Add documents/URLs for AI
- **Apps** - Connect integrations and MCP servers
- **Settings** - Account and team settings

HOW TO ADD AN MCP SERVER (like Notion, Slack, etc.):

1. **Click "Apps"** in the sidebar

2. **Scroll down to "MCP Servers"** section

3. **Find the server you want** (e.g., Notion) and **click "Add"**

4. **Enter any required API keys** when prompted

5. **Click "Save"**

AVAILABLE MCP SERVERS (38 total):
Notion, Slack, GitHub, Google Calendar, Google Drive, Brave Search, Salesforce, Stripe, Shopify, Linear, Jira, Asana, Trello, Airtable, Monday.com, PostgreSQL, MongoDB, SQLite, Figma, Confluence, Zendesk, SendGrid, Mailchimp, and more.

NATIVE INTEGRATIONS (on Apps page):
- **HubSpot** - CRM sync, contact creation, activity logging
- **Slack** - Notifications for calls and messages
- **Cal.com** - Appointment scheduling

HOW TO CONNECT HUBSPOT:

1. **Click "Apps"** in the sidebar

2. **Find HubSpot** in the Native Integrations section

3. **Click "Connect"**

4. **Authorize** with your HubSpot account

HOW TO CREATE A CHAT WIDGET:

1. **Click "Agent"** in the sidebar

2. **Click the "Deploy" tab**

3. **Scroll to "Web Chat Widget"**

4. **Click "Create Widget"**

5. **Copy the embed code** to your website

MAKING OUTBOUND CALLS:
1. Click "Inbox" in the sidebar
2. Click the phone/dialpad icon
3. Enter the phone number
4. Toggle "Use Agent" if you want AI to handle the call
5. Click "Call"

TROUBLESHOOTING:
- Agent not answering calls: Go to Agent → Deploy tab, ensure a phone number is assigned
- MCP server not working: Check API key is correct on the Apps page
- Chat widget not appearing: Verify the embed code is on your page and domain is allowed
` : ''

    const systemPrompt = agentConfig.system_prompt
      ? `${visitorPrefix}${agentConfig.system_prompt}${AGENT_IDENTITY}${SUPPORT_AGENT_KNOWLEDGE}${CHAT_CONTEXT_SUFFIX}`
      : `${visitorPrefix}You are a helpful AI assistant responding via website chat. Be friendly, professional, and concise. Keep responses to 2-4 sentences unless more detail is needed.${AGENT_IDENTITY}${SUPPORT_AGENT_KNOWLEDGE}${CHAT_CONTEXT_SUFFIX}`

    // Map conversation history to OpenAI format
    const conversationHistory = (history || [])
      .filter(m => m.content !== message) // Exclude current message
      .map(m => ({
        role: m.role === 'visitor' ? 'user' : 'assistant',
        content: m.content
      }))

    // Check if user has HubSpot connected (native integration)
    const { data: hubspotIntegration } = await supabase
      .from('user_integrations')
      .select(`
        id,
        access_token,
        integration_providers!inner(slug)
      `)
      .eq('user_id', widget.user_id)
      .eq('integration_providers.slug', 'hubspot')
      .eq('status', 'connected')
      .single()

    const hasHubspot = !!hubspotIntegration

    // Fetch available MCP tools for this user
    const mcpTools = await fetchUserMcpTools(supabase, widget.user_id)
    console.log(`Found ${mcpTools.length} MCP tools for user, HubSpot connected: ${hasHubspot}`)

    // Add HubSpot tools if connected (native integration)
    const allTools: ToolDefinition[] = [...mcpTools]
    if (hasHubspot) {
      allTools.push({
        name: 'hubspot_create_contact',
        description: 'Create or update a contact in HubSpot CRM',
        parameters: {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'Contact email address (required)' },
            firstname: { type: 'string', description: 'First name' },
            lastname: { type: 'string', description: 'Last name' },
            phone: { type: 'string', description: 'Phone number' },
          },
          required: ['email'],
        },
      })
    }

    // Add support ticket tool if enabled globally in support config
    const { data: supportCfg } = await supabase
      .from('support_email_config')
      .select('ticket_creation_enabled')
      .limit(1)
      .single()
    const hasSupportTickets = supportCfg?.ticket_creation_enabled !== false
    if (hasSupportTickets) {
      allTools.push({
        name: 'create_support_ticket',
        description: 'Create a support ticket on behalf of the visitor when they have an issue, request, or need that should be tracked and followed up on',
        parameters: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: 'Brief subject line for the ticket' },
            description: { type: 'string', description: 'Detailed description of the issue or request' },
            user_email: { type: 'string', description: 'Visitor email address for follow-up notifications' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Ticket priority level' },
          },
          required: ['subject', 'description', 'user_email'],
        },
      })
    }

    // Build OpenAI tools array
    const openaiTools = allTools.length > 0 ? allTools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }
    })) : undefined

    // If HubSpot is connected, add context to system prompt about using it
    let toolsContext = ''
    if (hasHubspot) {
      const hasVisitorName = !!session.visitor_name
      const hasVisitorEmail = !!session.visitor_email

      if (hasVisitorName && hasVisitorEmail) {
        // Portal user - we already have their info, don't ask for it
        toolsContext = `

HUBSPOT INTEGRATION:
You have access to HubSpot CRM. The visitor's contact information is already known:
- Name: ${session.visitor_name}
- Email: ${session.visitor_email}
DO NOT ask the visitor for their name or email - you already have it.
When appropriate (e.g., during or after a meaningful conversation), create their contact in HubSpot using the hubspot_create_contact tool.`
      } else {
        // External visitor - may need to collect info
        toolsContext = `

HUBSPOT INTEGRATION:
You have access to HubSpot CRM. When the visitor provides their contact information (name, email), you should:
- Create or update their contact in HubSpot using the hubspot_create_contact tool
- The visitor's name is: ${session.visitor_name || 'Not provided yet'}
- The visitor's email is: ${session.visitor_email || 'Not provided yet'}
- Use HubSpot proactively when you have enough information to create a lead (at minimum, an email address)`
      }
    }

    // Add support tickets context if enabled
    if (hasSupportTickets) {
      const knownEmail = session.visitor_email || ''
      toolsContext += `

SUPPORT TICKETS:
You can create support tickets for visitors when they describe issues, problems, feature requests, or anything that needs follow-up.
- Use the create_support_ticket tool when a visitor has a clear issue or request
- Ask for their email if you don't already have it${knownEmail ? ` (visitor's email is: ${knownEmail})` : ''}
- Set appropriate priority: low (general questions), medium (issues affecting work), high (blocking issues), urgent (critical/outage)
- After creating a ticket, confirm to the visitor that their ticket has been created and they'll receive email updates`
    }

    // Generate AI response with function calling support
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!

    // For greeting requests, ask the AI to generate a welcome message
    const userContent = requestGreeting
      ? `Generate a warm greeting to start the conversation. IMPORTANT: Introduce yourself by your name (${agentDisplayName}). Keep it brief (1-2 sentences). Example: "Hi! I'm ${agentDisplayName}. How can I help you today?"`
      : message

    const messages: any[] = [
      { role: 'system', content: systemPrompt + toolsContext },
      ...conversationHistory,
      { role: 'user', content: userContent }
    ]

    // Function calling loop - handle up to 3 tool calls
    let aiReply = ''
    let toolCallCount = 0
    const maxToolCalls = 3

    while (toolCallCount < maxToolCalls) {
      const requestBody: any = {
        model: 'gpt-4o-mini',
        max_tokens: 300,
        messages: messages,
      }

      // Only include tools if we have them
      if (openaiTools && openaiTools.length > 0) {
        requestBody.tools = openaiTools
        requestBody.tool_choice = 'auto'
      }

      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text()
        console.error('OpenAI API error:', errorText)
        return new Response(
          JSON.stringify({
            success: true,
            sessionId: session.id,
            messageId: visitorMessage.id,
            aiResponse: null,
            error: 'AI temporarily unavailable',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const openaiResult = await openaiResponse.json()
      const assistantMessage = openaiResult.choices[0].message

      // Check if the model wants to call tools
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        console.log(`AI wants to call ${assistantMessage.tool_calls.length} tool(s)`)

        // Add assistant message with tool calls to history
        messages.push(assistantMessage)

        // Execute each tool call
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name
          const toolArgs = JSON.parse(toolCall.function.arguments || '{}')

          console.log(`Executing tool: ${toolName}`, toolArgs)

          // Check if this is a native integration tool, support ticket, or MCP tool
          let toolResult
          if (toolName.startsWith('hubspot_')) {
            toolResult = await executeNativeTool(supabase, widget.user_id, toolName, toolArgs)
          } else if (toolName === 'create_support_ticket') {
            // Handle support ticket creation directly
            try {
              const threadId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
              // Generate ticket reference number
              const { data: seqVal } = await supabase.rpc('nextval_ticket_ref')
              const ticketRef = seqVal ? `TKT-${String(seqVal).padStart(6, '0')}` : null
              const { error: ticketError } = await supabase.from('support_tickets').insert({
                thread_id: threadId,
                ticket_ref: ticketRef,
                subject: toolArgs.subject,
                body_text: toolArgs.description || '',
                from_email: toolArgs.user_email,
                from_name: session.visitor_name || '',
                chat_session_id: session.id,
                direction: 'inbound',
                status: 'open',
                priority: toolArgs.priority || 'medium',
                received_at: new Date().toISOString(),
              })

              if (ticketError) {
                console.error('Failed to create support ticket:', ticketError)
                toolResult = { success: false, error: 'Failed to create support ticket: ' + ticketError.message }
              } else {
                console.log('Support ticket created:', threadId)
                toolResult = { success: true, result: `Support ticket created successfully (Reference: ${ticketRef || threadId}). The visitor will receive email updates when the team replies.` }
              }
            } catch (ticketErr) {
              console.error('Support ticket creation error:', ticketErr)
              toolResult = { success: false, error: ticketErr instanceof Error ? ticketErr.message : 'Unknown error' }
            }
          } else {
            toolResult = await executeMcpTool(supabase, widget.user_id, toolName, toolArgs)
          }

          // Add tool result to messages
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult.success
              ? toolResult.result || 'Tool executed successfully'
              : `Error: ${toolResult.error}`,
          })

          // Log tool execution
          await supabase.from('integration_tool_logs').insert({
            user_id: widget.user_id,
            tool_name: toolName,
            tool_source: `mcp:${toolName.split(':')[0]}`,
            input: toolArgs,
            output: toolResult,
            success: toolResult.success,
            error_message: toolResult.success ? null : toolResult.error,
            context: { session_id: session.id, widget_id: widget.id },
          }).catch((err: Error) => console.error('Failed to log tool execution:', err))
        }

        toolCallCount++
        // Continue the loop to let the model respond after tool execution
        continue
      }

      // No more tool calls - we have the final response
      aiReply = assistantMessage.content || ''
      break
    }

    // If we hit max tool calls without a response, generate one
    if (!aiReply && toolCallCount >= maxToolCalls) {
      aiReply = "I've processed your request. Is there anything else I can help you with?"
    }

    // Store AI response
    const { data: aiMessage, error: aiMsgError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: session.id,
        role: 'agent',
        content: aiReply,
        is_ai_generated: true,
      })
      .select()
      .single()

    if (aiMsgError) {
      console.error('Failed to store AI response:', aiMsgError)
    }

    // Send push notification for new chat messages (fire and forget)
    // Only for actual visitor messages, not greeting requests
    if (message && !requestGreeting) {
      const notificationData = {
        userId: widget.user_id,
        type: 'new_chat',
        title: 'Website Chat',
        body: `${session.visitor_name || 'Visitor'}: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`,
        data: {
          url: `/inbox?chat=${session.id}`,
          content: message,
          sessionId: session.id,
          timestamp: new Date().toISOString(),
        }
      }

      fetch(`${supabaseUrl}/functions/v1/send-notification-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
        body: JSON.stringify(notificationData)
      }).catch(err => console.error('Failed to send push notification for chat:', err))
    }

    // Log chat exchange to HubSpot as a note (if connected and we have visitor email)
    if (session.visitor_email && message && !requestGreeting) {
      try {
        // Check if user has HubSpot connected
        const { data: hubspotIntegration } = await supabase
          .from('user_integrations')
          .select(`
            id,
            access_token,
            integration_providers!inner(slug)
          `)
          .eq('user_id', widget.user_id)
          .eq('integration_providers.slug', 'hubspot')
          .eq('status', 'connected')
          .single()

        if (hubspotIntegration) {
          // Format the chat exchange for HubSpot note
          const visitorName = session.visitor_name || 'Website Visitor'
          const widgetName = widget.name || 'Chat Widget'
          const noteContent = `**Chat via ${widgetName}**

**${visitorName}:** ${message}

**AI Agent:** ${aiReply}

---
Session ID: ${session.id}
Page: ${session.page_url || 'Unknown'}`

          const noteResult = await executeNativeTool(
            supabase,
            widget.user_id,
            'hubspot_create_note',
            {
              email: session.visitor_email,
              subject: `Chat Conversation - ${widgetName}`,
              content: noteContent,
            }
          )

          if (noteResult.success) {
            console.log('Logged chat to HubSpot:', noteResult.result)
          } else {
            console.warn('Failed to log chat to HubSpot:', noteResult.message)
          }
        }
      } catch (hubspotError) {
        // Don't fail the chat if HubSpot logging fails
        console.error('HubSpot note logging error:', hubspotError)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sessionId: session.id,
        messageId: visitorMessage?.id || null,
        aiResponse: aiReply,
        aiMessageId: aiMessage?.id,
        isGreeting: requestGreeting || false,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in webhook-chat-message:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack')
    console.error('Error message:', error instanceof Error ? error.message : String(error))
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
