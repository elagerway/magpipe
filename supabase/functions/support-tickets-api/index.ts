import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireAdmin, corsHeaders, handleCors, errorResponse, successResponse } from '../_shared/admin-auth.ts'

const CONFIG_ID = '00000000-0000-0000-0000-000000000001'

function buildReplySubject(subject: string | null, ticketRef: string | null): string {
  let clean = (subject || '').replace(/\s*\[TKT-\d+\]\s*/g, '').trim()
  if (!clean.startsWith('Re:')) clean = `Re: ${clean}`
  if (ticketRef) clean = `${clean} [${ticketRef}]`
  return clean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Require admin auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)
    const token = authHeader.replace('Bearer ', '')
    const adminUser = await requireAdmin(supabase, token)

    const body = await req.json()
    const { action } = body

    switch (action) {
      case 'list':
        return await handleList(supabase, body)
      case 'thread':
        return await handleThread(supabase, body)
      case 'update_status':
        return await handleUpdateStatus(supabase, body)
      case 'update_ticket':
        return await handleUpdateTicket(supabase, body)
      case 'add_note':
        return await handleAddNote(supabase, body, adminUser)
      case 'get_notes':
        return await handleGetNotes(supabase, body)
      case 'list_assignees':
        return await handleListAssignees(supabase)
      case 'create_ticket':
        return await handleCreateTicket(supabase, body)
      case 'send_reply':
        return await handleSendReply(supabase, body)
      case 'approve_draft':
        return await handleApproveDraft(supabase, body)
      case 'reject_draft':
        return await handleRejectDraft(supabase, body)
      case 'create_github_issue':
        return await handleCreateGithubIssue(supabase, body)
      case 'disconnect_gmail':
        return await handleDisconnectGmail(supabase)
      case 'get_config':
        return await handleGetConfig(supabase)
      case 'update_config':
        return await handleUpdateConfig(supabase, body)
      default:
        return errorResponse(`Unknown action: ${action}`)
    }

  } catch (error: any) {
    console.error('Error in support-tickets-api:', error)
    if (error.message?.includes('Unauthorized') || error.message?.includes('Forbidden')) {
      return errorResponse(error.message, 403)
    }
    return errorResponse(error.message || 'Internal server error', 500)
  }
})


async function handleList(supabase: any, body: any) {
  const { status = 'open', page = 1, limit = 25, priority, assigned_to, has_github_issue } = body
  const offset = (page - 1) * limit

  // Pass 1: Get all matching thread_ids (lightweight) to deduplicate & paginate correctly
  let threadIdQuery = supabase
    .from('support_tickets')
    .select('thread_id, received_at')
    .order('received_at', { ascending: false })
    .limit(10000)

  if (status !== 'all') threadIdQuery = threadIdQuery.eq('status', status)
  if (priority) threadIdQuery = threadIdQuery.eq('priority', priority)
  if (assigned_to) threadIdQuery = threadIdQuery.eq('assigned_to', assigned_to)
  if (has_github_issue) threadIdQuery = threadIdQuery.not('github_issue_url', 'is', null)

  const { data: allRows, error: threadError } = await threadIdQuery
  if (threadError) return errorResponse('Failed to fetch threads: ' + threadError.message)

  // Deduplicate thread_ids preserving received_at order (most recent first)
  const seen = new Set<string>()
  const uniqueThreadIds: string[] = []
  for (const row of (allRows || [])) {
    const tid = row.thread_id || row.id
    if (!seen.has(tid)) {
      seen.add(tid)
      uniqueThreadIds.push(tid)
    }
  }

  const totalThreads = uniqueThreadIds.length
  const pageThreadIds = uniqueThreadIds.slice(offset, offset + limit)

  if (pageThreadIds.length === 0) {
    return successResponse({ tickets: [], total: totalThreads, page, limit })
  }

  // Pass 2: Get full data for this page's threads
  const { data: tickets, error } = await supabase
    .from('support_tickets')
    .select('id, thread_id, ticket_ref, subject, from_email, from_name, status, priority, assigned_to, tags, due_date, received_at, direction, ai_draft_status, github_issue_url')
    .in('thread_id', pageThreadIds)
    .order('received_at', { ascending: false })

  if (error) return errorResponse('Failed to fetch tickets: ' + error.message)

  // Collect unique assigned_to IDs to batch-fetch names
  const assigneeIds = new Set<string>()
  for (const t of (tickets || [])) {
    if (t.assigned_to) assigneeIds.add(t.assigned_to)
  }

  const assigneeMap: Record<string, string> = {}
  if (assigneeIds.size > 0) {
    const { data: assignees } = await supabase
      .from('users')
      .select('id, name, email')
      .in('id', Array.from(assigneeIds))
    for (const a of (assignees || [])) {
      assigneeMap[a.id] = a.name || a.email
    }
  }

  // Group by thread_id, pick the latest message per thread for the list
  const threadMap = new Map()
  for (const t of (tickets || [])) {
    const threadId = t.thread_id || t.id
    if (!threadMap.has(threadId)) {
      threadMap.set(threadId, {
        ...t,
        assigned_name: t.assigned_to ? (assigneeMap[t.assigned_to] || '') : '',
        message_count: 1,
        has_pending_draft: t.ai_draft_status === 'pending',
        ai_responded: t.ai_draft_status === 'sent',
      })
    } else {
      const existing = threadMap.get(threadId)
      existing.message_count++
      if (t.ai_draft_status === 'pending') existing.has_pending_draft = true
      if (t.ai_draft_status === 'sent') existing.ai_responded = true
      if (new Date(t.received_at) > new Date(existing.received_at)) {
        existing.subject = t.subject || existing.subject
        existing.from_email = t.from_email
        existing.from_name = t.from_name
        existing.received_at = t.received_at
        existing.direction = t.direction
      }
    }
  }

  // Sort by the order of pageThreadIds (preserves received_at DESC from pass 1)
  const sorted = pageThreadIds
    .map(tid => threadMap.get(tid))
    .filter(Boolean)

  return successResponse({
    tickets: sorted,
    total: totalThreads,
    page,
    limit,
  })
}


async function handleThread(supabase: any, body: any) {
  const { threadId } = body
  if (!threadId) return errorResponse('Missing threadId')

  const { data: messages, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('thread_id', threadId)
    .order('received_at', { ascending: true })

  if (error) return errorResponse('Failed to fetch thread: ' + error.message)

  // Also fetch notes for this thread
  const { data: notes } = await supabase
    .from('support_ticket_notes')
    .select('id, thread_id, content, created_at, author_id')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  // Resolve author names
  const authorIds = new Set<string>()
  for (const n of (notes || [])) {
    if (n.author_id) authorIds.add(n.author_id)
  }
  const authorMap: Record<string, string> = {}
  if (authorIds.size > 0) {
    const { data: authors } = await supabase
      .from('users')
      .select('id, name, email')
      .in('id', Array.from(authorIds))
    for (const a of (authors || [])) {
      authorMap[a.id] = a.name || a.email
    }
  }
  const enrichedNotes = (notes || []).map((n: any) => ({
    ...n,
    author_name: n.author_id ? (authorMap[n.author_id] || 'Unknown') : 'Unknown',
  }))

  return successResponse({ messages: messages || [], notes: enrichedNotes })
}


async function handleUpdateStatus(supabase: any, body: any) {
  const { threadId, status } = body
  if (!threadId || !status) return errorResponse('Missing threadId or status')

  const { error } = await supabase
    .from('support_tickets')
    .update({ status })
    .eq('thread_id', threadId)

  if (error) return errorResponse('Failed to update status: ' + error.message)

  return successResponse({ success: true })
}


async function handleUpdateTicket(supabase: any, body: any) {
  const { threadId, priority, assigned_to, tags, due_date } = body
  if (!threadId) return errorResponse('Missing threadId')

  const updates: Record<string, any> = {}
  if (priority !== undefined) updates.priority = priority
  if (assigned_to !== undefined) updates.assigned_to = assigned_to || null
  if (tags !== undefined) updates.tags = tags
  if (due_date !== undefined) updates.due_date = due_date || null

  if (Object.keys(updates).length === 0) return errorResponse('No fields to update')

  const { error } = await supabase
    .from('support_tickets')
    .update(updates)
    .eq('thread_id', threadId)

  if (error) return errorResponse('Failed to update ticket: ' + error.message)

  return successResponse({ success: true })
}


async function handleAddNote(supabase: any, body: any, adminUser: { id: string }) {
  const { threadId, content } = body
  if (!threadId || !content) return errorResponse('Missing threadId or content')

  const { error } = await supabase.from('support_ticket_notes').insert({
    thread_id: threadId,
    author_id: adminUser.id,
    content,
  })

  if (error) return errorResponse('Failed to add note: ' + error.message)

  return successResponse({ success: true })
}


async function handleGetNotes(supabase: any, body: any) {
  const { threadId } = body
  if (!threadId) return errorResponse('Missing threadId')

  const { data: notes, error } = await supabase
    .from('support_ticket_notes')
    .select('id, thread_id, content, created_at, author_id')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  if (error) return errorResponse('Failed to fetch notes: ' + error.message)

  // Resolve author names
  const authorIds = new Set<string>()
  for (const n of (notes || [])) {
    if (n.author_id) authorIds.add(n.author_id)
  }
  const authorMap: Record<string, string> = {}
  if (authorIds.size > 0) {
    const { data: authors } = await supabase
      .from('users')
      .select('id, name, email')
      .in('id', Array.from(authorIds))
    for (const a of (authors || [])) {
      authorMap[a.id] = a.name || a.email
    }
  }

  const enrichedNotes = (notes || []).map((n: any) => ({
    ...n,
    author_name: n.author_id ? (authorMap[n.author_id] || 'Unknown') : 'Unknown',
  }))

  return successResponse({ notes: enrichedNotes })
}


async function handleListAssignees(supabase: any) {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, email')
    .in('role', ['admin', 'support', 'god'])
    .eq('account_status', 'active')
    .order('name', { ascending: true })

  if (error) return errorResponse('Failed to fetch assignees: ' + error.message)

  return successResponse({
    assignees: (users || []).map((u: any) => ({
      id: u.id,
      name: u.name || u.email,
      email: u.email,
    })),
  })
}


async function handleCreateTicket(supabase: any, body: any) {
  const { subject, description, priority, tags, assigned_to, due_date, from_email, from_name, thread_id: clientThreadId, attachments } = body
  if (!subject) return errorResponse('Missing subject')

  const threadId = clientThreadId || `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  // Generate ticket reference number
  const { data: seqVal } = await supabase.rpc('nextval_ticket_ref')
  const ticketRef = seqVal ? `TKT-${String(seqVal).padStart(6, '0')}` : null

  const insertData: Record<string, any> = {
    thread_id: threadId,
    ticket_ref: ticketRef,
    subject,
    body_text: description || '',
    direction: 'inbound',
    status: 'open',
    priority: priority || 'medium',
    tags: tags || [],
    assigned_to: assigned_to || null,
    due_date: due_date || null,
    from_email: from_email || null,
    from_name: from_name || null,
    received_at: new Date().toISOString(),
  }
  if (attachments && Array.isArray(attachments) && attachments.length > 0) {
    insertData.attachments = attachments
  }

  const { error } = await supabase.from('support_tickets').insert(insertData)

  if (error) return errorResponse('Failed to create ticket: ' + error.message)

  // Send acknowledgment email to the user if created on their behalf
  if (from_email) {
    try {
      const senderName = from_name || 'there'
      const ackSubject = ticketRef ? `${subject} [${ticketRef}]` : subject
      const ackBody = `Hi ${senderName},

A support ticket has been created on your behalf.

${ticketRef ? `Ticket Reference: ${ticketRef}\n` : ''}Subject: ${subject}${description ? `\n\nDetails:\n${description}` : ''}

Our team will follow up with you shortly. If you have any additional details to share, simply reply to this email.

Best regards,
The Support Team`

      await sendPostmarkReply(from_email, ackSubject, ackBody)
    } catch (e) {
      console.error('Failed to send ticket acknowledgment email:', e)
      // Don't fail the ticket creation if email fails
    }
  }

  return successResponse({ success: true, threadId })
}


async function handleSendReply(supabase: any, body: any) {
  const { threadId, replyBody } = body
  if (!threadId || !replyBody) return errorResponse('Missing threadId or replyBody')

  // Get all thread messages for context
  const { data: threadMessages } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('thread_id', threadId)
    .order('received_at', { ascending: false })

  const latestMsg = threadMessages?.[0]
  if (!latestMsg) return errorResponse('Thread not found')

  // Look up ticket_ref for subject threading
  const { data: ticketRefRow } = await supabase
    .from('support_tickets')
    .select('ticket_ref')
    .eq('thread_id', threadId)
    .not('ticket_ref', 'is', null)
    .limit(1)
    .single()
  const ticketRef = ticketRefRow?.ticket_ref
  const replySubject = buildReplySubject(latestMsg.subject, ticketRef)

  // Determine recipient (reply to the last inbound message's sender)
  const inboundMsg = threadMessages?.find((m: any) => m.direction === 'inbound') || latestMsg
  const toEmail = inboundMsg.from_email

  // Check if this is a Gmail ticket (has gmail_message_id on any message in thread)
  const isGmailTicket = threadMessages?.some((m: any) => m.gmail_message_id && !m.gmail_message_id.startsWith('reply-') && !m.gmail_message_id.startsWith('approved-'))

  let sentMsgId: string | undefined

  if (isGmailTicket) {
    // Gmail ticket — send via Gmail API
    const accessToken = await getGmailAccessToken(supabase)
    if (!accessToken) return errorResponse('Gmail not connected or token expired')

    const { data: config } = await supabase
      .from('support_email_config')
      .select('gmail_address, send_as_email')
      .eq('id', CONFIG_ID)
      .single()

    if (!config?.gmail_address) return errorResponse('Gmail address not configured')
    const sendFrom = config.send_as_email || config.gmail_address

    const sentMsg = await sendGmailReply(
      accessToken,
      sendFrom,
      toEmail,
      replySubject,
      threadId,
      latestMsg.gmail_message_id,
      replyBody
    )
    sentMsgId = sentMsg?.id

    // Insert outbound record
    await supabase.from('support_tickets').insert({
      gmail_message_id: sentMsg?.id || `reply-${Date.now()}`,
      thread_id: threadId,
      from_email: sendFrom,
      from_name: '',
      to_email: toEmail,
      subject: replySubject,
      body_text: replyBody,
      direction: 'outbound',
      status: latestMsg.status || 'open',
      received_at: new Date().toISOString(),
    })
  } else {
    // Non-Gmail ticket (chat- or manual-) — send via Postmark
    await sendPostmarkReply(toEmail, replySubject, replyBody)
    sentMsgId = `postmark-${Date.now()}`

    // Insert outbound record
    await supabase.from('support_tickets').insert({
      thread_id: threadId,
      from_email: 'help@magpipe.ai',
      from_name: '',
      to_email: toEmail,
      subject: replySubject,
      body_text: replyBody,
      direction: 'outbound',
      status: latestMsg.status || 'open',
      received_at: new Date().toISOString(),
    })
  }

  // Post reply to chat widget if applicable
  await postReplyToChatWidget(supabase, latestMsg, toEmail, replyBody)

  return successResponse({ success: true, messageId: sentMsgId })
}


async function handleApproveDraft(supabase: any, body: any) {
  const { ticketId, editedBody } = body
  if (!ticketId) return errorResponse('Missing ticketId')

  // Get the ticket with the draft
  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('id', ticketId)
    .single()

  if (error || !ticket) return errorResponse('Ticket not found')
  if (ticket.ai_draft_status !== 'pending') return errorResponse('No pending draft on this ticket')

  const draftText = editedBody || ticket.ai_draft

  // Look up ticket_ref for subject threading
  const { data: draftRefRow } = await supabase
    .from('support_tickets')
    .select('ticket_ref')
    .eq('thread_id', ticket.thread_id)
    .not('ticket_ref', 'is', null)
    .limit(1)
    .single()
  const draftTicketRef = draftRefRow?.ticket_ref
  const replySubject = buildReplySubject(ticket.subject, draftTicketRef)

  // Check if this is a Gmail ticket
  const isGmailTicket = !!ticket.gmail_message_id && !ticket.gmail_message_id.startsWith('reply-') && !ticket.gmail_message_id.startsWith('approved-')

  if (isGmailTicket) {
    // Gmail ticket — send via Gmail API
    const accessToken = await getGmailAccessToken(supabase)
    if (!accessToken) return errorResponse('Gmail not connected')

    const { data: config } = await supabase
      .from('support_email_config')
      .select('gmail_address, send_as_email')
      .eq('id', CONFIG_ID)
      .single()

    if (!config?.gmail_address) return errorResponse('Gmail address not configured')
    const sendFrom = config.send_as_email || config.gmail_address

    const sentMsg = await sendGmailReply(
      accessToken,
      sendFrom,
      ticket.from_email,
      replySubject,
      ticket.thread_id,
      ticket.gmail_message_id,
      draftText
    )

    // Update draft status
    await supabase
      .from('support_tickets')
      .update({ ai_draft_status: 'sent', ai_draft: draftText })
      .eq('id', ticketId)

    // Insert outbound record
    await supabase.from('support_tickets').insert({
      gmail_message_id: sentMsg?.id || `approved-${Date.now()}`,
      thread_id: ticket.thread_id,
      from_email: sendFrom,
      to_email: ticket.from_email,
      subject: replySubject,
      body_text: draftText,
      direction: 'outbound',
      status: ticket.status,
      received_at: new Date().toISOString(),
    })
  } else {
    // Non-Gmail ticket — send via Postmark
    await sendPostmarkReply(ticket.from_email, replySubject, draftText)

    // Update draft status
    await supabase
      .from('support_tickets')
      .update({ ai_draft_status: 'sent', ai_draft: draftText })
      .eq('id', ticketId)

    // Insert outbound record
    await supabase.from('support_tickets').insert({
      thread_id: ticket.thread_id,
      from_email: 'help@magpipe.ai',
      to_email: ticket.from_email,
      subject: replySubject,
      body_text: draftText,
      direction: 'outbound',
      status: ticket.status,
      received_at: new Date().toISOString(),
    })
  }

  // Post reply to chat widget if applicable
  await postReplyToChatWidget(supabase, ticket, ticket.from_email, draftText)

  return successResponse({ success: true })
}


async function handleRejectDraft(supabase: any, body: any) {
  const { ticketId } = body
  if (!ticketId) return errorResponse('Missing ticketId')

  const { error } = await supabase
    .from('support_tickets')
    .update({ ai_draft_status: 'rejected' })
    .eq('id', ticketId)

  if (error) return errorResponse('Failed to reject draft: ' + error.message)

  return successResponse({ success: true })
}


async function handleDisconnectGmail(supabase: any) {
  // Find the google_email provider
  const { data: provider } = await supabase
    .from('integration_providers')
    .select('id')
    .eq('slug', 'google_email')
    .single()

  if (provider) {
    // Delete all user_integrations for this provider
    await supabase
      .from('user_integrations')
      .delete()
      .eq('provider_id', provider.id)
  }

  // Clear gmail config
  await supabase
    .from('support_email_config')
    .update({
      gmail_address: null,
      last_history_id: null,
      last_polled_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', CONFIG_ID)

  return successResponse({ success: true })
}


async function handleGetConfig(supabase: any) {
  // Run independent queries in parallel
  const [configResult, providerResult, agentsResult] = await Promise.all([
    supabase
      .from('support_email_config')
      .select('*')
      .eq('id', CONFIG_ID)
      .single(),
    supabase
      .from('integration_providers')
      .select('id')
      .eq('slug', 'google_email')
      .single(),
    supabase
      .from('agent_configs')
      .select('id, name, agent_name')
      .order('name', { ascending: true }),
  ])

  const config = configResult.data
  const provider = providerResult.data
  const agents = agentsResult.data

  // Check Gmail connection (depends on provider ID)
  let gmailConnected = false
  if (provider) {
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('status')
      .eq('provider_id', provider.id)
      .eq('status', 'connected')
      .limit(1)
      .single()

    gmailConnected = !!integration
  }

  return successResponse({
    config: config || {},
    gmailConnected,
    agents: agents || [],
  })
}


async function handleUpdateConfig(supabase: any, body: any) {
  const { sms_alert_enabled, sms_alert_phone, agent_mode, agent_system_prompt, support_agent_id, send_as_email, ticket_creation_enabled } = body

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  if (sms_alert_enabled !== undefined) updates.sms_alert_enabled = sms_alert_enabled
  if (sms_alert_phone !== undefined) updates.sms_alert_phone = sms_alert_phone
  if (agent_mode !== undefined) updates.agent_mode = agent_mode
  if (agent_system_prompt !== undefined) updates.agent_system_prompt = agent_system_prompt
  if (support_agent_id !== undefined) updates.support_agent_id = support_agent_id || null
  if (send_as_email !== undefined) updates.send_as_email = send_as_email || null
  if (ticket_creation_enabled !== undefined) updates.ticket_creation_enabled = ticket_creation_enabled

  const { error } = await supabase
    .from('support_email_config')
    .update(updates)
    .eq('id', CONFIG_ID)

  if (error) return errorResponse('Failed to update config: ' + error.message)

  return successResponse({ success: true })
}


async function handleCreateGithubIssue(supabase: any, body: any) {
  const { thread_id, title: customTitle, body: customBody } = body
  if (!thread_id) return errorResponse('Missing thread_id')

  // Check if issue already exists
  const { data: existing } = await supabase
    .from('support_tickets')
    .select('github_issue_url')
    .eq('thread_id', thread_id)
    .not('github_issue_url', 'is', null)
    .limit(1)
    .single()

  if (existing?.github_issue_url) {
    return errorResponse('GitHub issue already exists for this ticket')
  }

  // Get first inbound message for subject and ticket ref
  const { data: firstMsg } = await supabase
    .from('support_tickets')
    .select('subject, ticket_ref')
    .eq('thread_id', thread_id)
    .eq('direction', 'inbound')
    .order('received_at', { ascending: true })
    .limit(1)
    .single()

  if (!firstMsg) return errorResponse('No inbound message found for this thread')

  const subject = firstMsg.subject || '(no subject)'
  const ticketRef = firstMsg.ticket_ref || thread_id.substring(0, 8).toUpperCase()

  // Fetch all internal notes
  const { data: notes } = await supabase
    .from('support_ticket_notes')
    .select('id, content, created_at, author_id')
    .eq('thread_id', thread_id)
    .order('created_at', { ascending: true })

  // Resolve author names
  const authorIds = new Set<string>()
  for (const n of (notes || [])) {
    if (n.author_id) authorIds.add(n.author_id)
  }
  const authorMap: Record<string, string> = {}
  if (authorIds.size > 0) {
    const { data: authors } = await supabase
      .from('users')
      .select('id, name, email')
      .in('id', Array.from(authorIds))
    for (const a of (authors || [])) {
      authorMap[a.id] = a.name || a.email
    }
  }

  // Use client-provided title/body if edited, otherwise build from data
  let issueTitle: string
  let issueBody: string

  if (customTitle && customBody) {
    issueTitle = customTitle
    issueBody = customBody
  } else {
    issueTitle = `[${ticketRef}] ${subject}`

    const ticketLink = `https://magpipe.ai/admin?tab=support&thread=${thread_id}`
    issueBody = `**Support Ticket**: [#${ticketRef}](${ticketLink})\n\n---\n`

    if (notes && notes.length > 0) {
      issueBody += `\n## Internal Notes\n\n`
      for (const n of notes) {
        const authorName = n.author_id ? (authorMap[n.author_id] || 'Unknown') : 'Unknown'
        const date = new Date(n.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        issueBody += `**${authorName}** (${date}):\n${n.content}\n\n---\n\n`
      }
    } else {
      issueBody += `\n*No internal notes yet.*\n`
    }
  }

  // Create GitHub issue
  const githubPat = Deno.env.get('GITHUB_PAT')
  if (!githubPat) return errorResponse('GITHUB_PAT not configured')

  const ghResp = await fetch('https://api.github.com/repos/Snapsonic/magpipe/issues', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${githubPat}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      title: issueTitle,
      body: issueBody,
    }),
  })

  if (!ghResp.ok) {
    const errText = await ghResp.text()
    console.error('GitHub API error:', errText)
    return errorResponse('Failed to create GitHub issue: ' + ghResp.status)
  }

  const issue = await ghResp.json()

  // Store issue URL on all thread rows
  const { error: updateErr } = await supabase
    .from('support_tickets')
    .update({ github_issue_url: issue.html_url })
    .eq('thread_id', thread_id)

  if (updateErr) {
    console.error('Failed to save issue URL:', updateErr)
  }

  return successResponse({ issue_url: issue.html_url, issue_number: issue.number })
}


async function sendPostmarkReply(toEmail: string, subject: string, body: string) {
  const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')
  if (!postmarkApiKey) {
    console.error('POSTMARK_API_KEY not set, cannot send reply')
    throw new Error('Email service not configured')
  }

  const resp = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': postmarkApiKey,
    },
    body: JSON.stringify({
      From: 'help@magpipe.ai',
      To: toEmail,
      Subject: subject,
      TextBody: body,
      MessageStream: 'outbound',
    }),
  })

  if (!resp.ok) {
    const errResult = await resp.text()
    console.error('Postmark send error:', errResult)
    throw new Error('Failed to send email reply via Postmark')
  }

  console.log('Postmark reply sent to', toEmail)
}


async function postReplyToChatWidget(supabase: any, ticket: any, fromEmail: string, replyBody: string) {
  try {
    // First check chat_session_id on the ticket directly
    let sessionId = ticket.chat_session_id

    if (!sessionId) {
      // Search for an active chat session matching the visitor's email
      const { data: session } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('visitor_email', fromEmail)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      sessionId = session?.id
    }

    if (!sessionId) {
      console.log('No active chat session found for', fromEmail)
      return
    }

    // Post the reply as an agent message in the chat widget
    const { error } = await supabase.from('chat_messages').insert({
      session_id: sessionId,
      role: 'agent',
      content: `**Support reply re: ${ticket.subject}**\n\n${replyBody}`,
      is_ai_generated: false,
    })

    if (error) {
      console.error('Failed to post reply to chat widget:', error)
    } else {
      console.log('Reply posted to chat session:', sessionId)
    }
  } catch (err) {
    // Don't fail the reply if chat notification fails
    console.error('Chat widget notification error:', err)
  }
}


async function getGmailAccessToken(supabase: any): Promise<string | null> {
  const { data: provider } = await supabase
    .from('integration_providers')
    .select('id')
    .eq('slug', 'google_email')
    .single()

  if (!provider) return null

  const { data: integration } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('provider_id', provider.id)
    .eq('status', 'connected')
    .limit(1)
    .single()

  if (!integration) return null

  // Refresh if expired
  if (new Date(integration.token_expires_at) < new Date()) {
    return await refreshGoogleToken(supabase, integration)
  }

  return integration.access_token
}


async function refreshGoogleToken(supabase: any, integration: any): Promise<string | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: integration.refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    console.error('Token refresh failed:', await response.text())
    return null
  }

  const tokens = await response.json()
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000)

  await supabase
    .from('user_integrations')
    .update({
      access_token: tokens.access_token,
      token_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id)

  return tokens.access_token
}


async function sendGmailReply(
  accessToken: string,
  fromAddress: string,
  toAddress: string,
  subject: string,
  threadId: string,
  inReplyTo: string,
  body: string
) {
  const rawMessage = [
    `From: ${fromAddress}`,
    `To: ${toAddress}`,
    `Subject: ${subject}`,
    `In-Reply-To: ${inReplyTo}`,
    `References: ${inReplyTo}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ].join('\r\n')

  const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded, threadId }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Failed to send Gmail reply:', errorText)
    throw new Error('Failed to send Gmail reply: ' + errorText)
  }

  return await response.json()
}
