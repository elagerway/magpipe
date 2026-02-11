/**
 * Org Analytics Edge Function
 * Returns organization-wide metrics, time series data for all team members
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get user from auth token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const userId = user.id

    // Get user's organization and all team member IDs
    const { data: userData } = await supabase
      .from('users')
      .select('current_organization_id')
      .eq('id', userId)
      .single()

    let userIds: string[] = [userId]

    if (userData?.current_organization_id) {
      // Get all users in the organization
      const { data: orgUsers } = await supabase
        .from('users')
        .select('id')
        .eq('current_organization_id', userData.current_organization_id)

      if (orgUsers && orgUsers.length > 0) {
        userIds = orgUsers.map(u => u.id)
      }
    }

    // Parse date range from query params
    const url = new URL(req.url)
    const startDateParam = url.searchParams.get('start_date')
    const endDateParam = url.searchParams.get('end_date')

    const startDate = startDateParam ? new Date(startDateParam) : null
    const endDate = endDateParam ? new Date(endDateParam) : null

    // Check if this is an export request (has date params)
    const isExport = startDate || endDate

    // Get all analytics data in parallel
    const [
      callMetrics,
      messageMetrics,
      creditsMetrics,
      timeSeries,
      transactions,
      callRecords,
      allSessions
    ] = await Promise.all([
      getCallMetrics(supabase, userIds, startDate, endDate),
      getMessageMetrics(supabase, userIds, startDate, endDate),
      getCreditsMetrics(supabase, userIds),
      getTimeSeries(supabase, userIds, startDate, endDate),
      getTransactions(supabase, userIds, startDate, endDate),
      getCallRecords(supabase, userIds, startDate, endDate),
      isExport ? getAllSessions(supabase, userIds, startDate, endDate) : Promise.resolve([])
    ])

    return new Response(JSON.stringify({
      calls: callMetrics,
      messages: messageMetrics,
      credits: creditsMetrics,
      timeSeries,
      transactions,
      callRecords,
      allSessions
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error in org-analytics:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function getCallMetrics(supabase: ReturnType<typeof createClient>, userIds: string[], startDate: Date | null, endDate: Date | null) {
  // Build base query with optional date filters
  const buildQuery = (query: any) => {
    let q = query.in('user_id', userIds)
    if (startDate) q = q.gte('started_at', startDate.toISOString())
    if (endDate) q = q.lte('started_at', endDate.toISOString())
    return q
  }

  // Total calls
  const { count: totalCalls } = await buildQuery(
    supabase.from('call_records').select('*', { count: 'exact', head: true })
  )

  // Call success rate (not failed)
  const { count: successfulCalls } = await buildQuery(
    supabase.from('call_records').select('*', { count: 'exact', head: true })
  ).neq('disposition', 'failed')

  // Inbound vs outbound
  const { count: inboundCalls } = await buildQuery(
    supabase.from('call_records').select('*', { count: 'exact', head: true })
  ).eq('direction', 'inbound')

  const { count: outboundCalls } = await buildQuery(
    supabase.from('call_records').select('*', { count: 'exact', head: true })
  ).eq('direction', 'outbound')

  // Get calls with duration for average and total calculation
  const { data: callsWithDuration } = await buildQuery(
    supabase.from('call_records').select('duration_seconds')
  ).not('duration_seconds', 'is', null).gt('duration_seconds', 0)

  const avgDuration = callsWithDuration && callsWithDuration.length > 0
    ? callsWithDuration.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / callsWithDuration.length
    : 0

  const totalMinutes = callsWithDuration
    ? Math.round(callsWithDuration.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / 60)
    : 0

  // Calls this month (only if no date filter)
  let callsThisMonth = 0
  let minutesThisMonth = 0
  if (!startDate && !endDate) {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('call_records')
      .select('*', { count: 'exact', head: true })
      .in('user_id', userIds)
      .gte('started_at', startOfMonth.toISOString())
    callsThisMonth = count || 0

    const { data: monthCalls } = await supabase
      .from('call_records')
      .select('duration_seconds')
      .in('user_id', userIds)
      .gte('started_at', startOfMonth.toISOString())
      .not('duration_seconds', 'is', null)
    minutesThisMonth = monthCalls
      ? Math.round(monthCalls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / 60)
      : 0
  }

  return {
    total: totalCalls || 0,
    successRate: totalCalls ? Math.round((successfulCalls || 0) / totalCalls * 100) : 0,
    avgDuration: Math.round(avgDuration),
    totalMinutes,
    inbound: inboundCalls || 0,
    outbound: outboundCalls || 0,
    thisMonth: callsThisMonth,
    minutesThisMonth
  }
}

async function getMessageMetrics(supabase: ReturnType<typeof createClient>, userIds: string[], startDate: Date | null, endDate: Date | null) {
  // Build base query with optional date filters
  const buildQuery = (query: any) => {
    let q = query.in('user_id', userIds)
    if (startDate) q = q.gte('sent_at', startDate.toISOString())
    if (endDate) q = q.lte('sent_at', endDate.toISOString())
    return q
  }

  // Total messages
  const { count: totalMessages } = await buildQuery(
    supabase.from('sms_messages').select('*', { count: 'exact', head: true })
  )

  // Delivery rate
  const { count: deliveredMessages } = await buildQuery(
    supabase.from('sms_messages').select('*', { count: 'exact', head: true })
  ).in('status', ['sent', 'delivered'])

  // Inbound vs outbound
  const { count: inboundMessages } = await buildQuery(
    supabase.from('sms_messages').select('*', { count: 'exact', head: true })
  ).eq('direction', 'inbound')

  const { count: outboundMessages } = await buildQuery(
    supabase.from('sms_messages').select('*', { count: 'exact', head: true })
  ).eq('direction', 'outbound')

  // Messages this month (only if no date filter)
  let messagesThisMonth = 0
  if (!startDate && !endDate) {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('sms_messages')
      .select('*', { count: 'exact', head: true })
      .in('user_id', userIds)
      .gte('sent_at', startOfMonth.toISOString())
    messagesThisMonth = count || 0
  }

  return {
    total: totalMessages || 0,
    deliveryRate: totalMessages ? Math.round((deliveredMessages || 0) / totalMessages * 100) : 0,
    inbound: inboundMessages || 0,
    outbound: outboundMessages || 0,
    thisMonth: messagesThisMonth
  }
}

async function getCreditsMetrics(supabase: ReturnType<typeof createClient>, userIds: string[]) {
  // Get all users' credits data and sum them
  const { data: usersData } = await supabase
    .from('users')
    .select('credits_balance, credits_used_this_period')
    .in('id', userIds)

  const balance = (usersData || []).reduce((sum, u) => sum + (parseFloat(u.credits_balance) || 0), 0)
  const spentThisPeriod = (usersData || []).reduce((sum, u) => sum + (parseFloat(u.credits_used_this_period) || 0), 0)

  // Get credit transactions for all users in org
  const { data: transactions } = await supabase
    .from('credit_transactions')
    .select('amount, created_at, description')
    .in('user_id', userIds)
    .order('created_at', { ascending: false })
    .limit(10)

  const totalAdded = (transactions || [])
    .filter(t => parseFloat(t.amount) > 0)
    .reduce((sum, t) => sum + parseFloat(t.amount), 0)

  const totalSpent = (transactions || [])
    .filter(t => parseFloat(t.amount) < 0)
    .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0)

  return {
    balance: balance.toFixed(2),
    spentThisPeriod: spentThisPeriod.toFixed(2),
    totalAdded: totalAdded.toFixed(2),
    totalSpent: totalSpent.toFixed(2),
    recentTransactions: transactions || []
  }
}

async function getTimeSeries(supabase: ReturnType<typeof createClient>, userIds: string[], startDate: Date | null, endDate: Date | null) {
  // Default to last 30 days if no date range specified
  const defaultStart = new Date()
  defaultStart.setDate(defaultStart.getDate() - 30)

  const queryStart = startDate || defaultStart
  const queryEnd = endDate || new Date()

  // Calls per day
  let callsQuery = supabase
    .from('call_records')
    .select('started_at')
    .in('user_id', userIds)
    .gte('started_at', queryStart.toISOString())

  if (endDate) {
    callsQuery = callsQuery.lte('started_at', queryEnd.toISOString())
  }

  const { data: calls } = await callsQuery

  // Group by date
  const callsByDate = new Map<string, number>()
  for (const call of calls || []) {
    const date = call.started_at.split('T')[0]
    callsByDate.set(date, (callsByDate.get(date) || 0) + 1)
  }
  const callsPerDay = Array.from(callsByDate.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Messages per day
  let messagesQuery = supabase
    .from('sms_messages')
    .select('sent_at')
    .in('user_id', userIds)
    .gte('sent_at', queryStart.toISOString())

  if (endDate) {
    messagesQuery = messagesQuery.lte('sent_at', queryEnd.toISOString())
  }

  const { data: messages } = await messagesQuery

  const messagesByDate = new Map<string, number>()
  for (const msg of messages || []) {
    const date = msg.sent_at.split('T')[0]
    messagesByDate.set(date, (messagesByDate.get(date) || 0) + 1)
  }
  const messagesPerDay = Array.from(messagesByDate.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    calls: callsPerDay,
    messages: messagesPerDay
  }
}

async function getTransactions(supabase: ReturnType<typeof createClient>, userIds: string[], startDate: Date | null, endDate: Date | null) {
  let query = supabase
    .from('credit_transactions')
    .select('amount, created_at, description')
    .in('user_id', userIds)
    .order('created_at', { ascending: false })

  if (startDate) {
    query = query.gte('created_at', startDate.toISOString())
  }
  if (endDate) {
    query = query.lte('created_at', endDate.toISOString())
  }

  // Limit to 1000 for exports, 10 for regular view
  query = query.limit(startDate || endDate ? 1000 : 10)

  const { data } = await query
  return data || []
}

async function getAllSessions(supabase: ReturnType<typeof createClient>, userIds: string[], startDate: Date | null, endDate: Date | null) {
  // Fetch all session types in parallel
  const [callSessions, smsSessions, chatSessions] = await Promise.all([
    getCallSessions(supabase, userIds, startDate, endDate),
    getSmsSessions(supabase, userIds, startDate, endDate),
    getChatSessions(supabase, userIds, startDate, endDate)
  ])

  // Combine and sort by start time descending
  const allSessions = [...callSessions, ...smsSessions, ...chatSessions]
  allSessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())

  return allSessions
}

async function getCallSessions(supabase: ReturnType<typeof createClient>, userIds: string[], startDate: Date | null, endDate: Date | null) {
  let query = supabase
    .from('call_records')
    .select(`
      id,
      started_at,
      ended_at,
      caller_number,
      duration_seconds,
      livekit_room_id,
      in_voicemail,
      call_successful,
      call_summary,
      extracted_data,
      disconnection_reason,
      recording_url,
      user_sentiment,
      agent_id
    `)
    .in('user_id', userIds)
    .order('started_at', { ascending: false })

  if (startDate) query = query.gte('started_at', startDate.toISOString())
  if (endDate) query = query.lte('started_at', endDate.toISOString())
  query = query.limit(1000)

  const { data: records } = await query
  if (!records || records.length === 0) return []

  // Get agent names
  const agentIds = [...new Set(records.map(r => r.agent_id).filter(Boolean))]
  let agentMap: Record<string, { name: string, id: string }> = {}
  if (agentIds.length > 0) {
    const { data: agents } = await supabase.from('agent_configs').select('id, name').in('id', agentIds)
    if (agents) agentMap = Object.fromEntries(agents.map(a => [a.id, { name: a.name, id: a.id }]))
  }

  // Get costs from credit_transactions (reference_id links to call_records.id)
  // Note: Don't use .in() with hundreds of IDs - it causes query size errors
  const { data: transactions } = await supabase
    .from('credit_transactions')
    .select('reference_id, amount, metadata')
    .in('user_id', userIds)
    .eq('reference_type', 'call')

  const costMap: Record<string, number> = {}
  if (transactions) {
    transactions.forEach(t => {
      if (t.reference_id) {
        // Sum costs if there are multiple transactions for the same call
        costMap[t.reference_id] = (costMap[t.reference_id] || 0) + Math.abs(parseFloat(t.amount) || 0)
      }
    })
  }

  return records.map(r => {
    const extracted = r.extracted_data || {}
    const cost = costMap[r.id] || 0
    return {
      sessionType: 'Phone',
      fromNumber: r.caller_number || '',
      startTime: r.started_at,
      agentName: agentMap[r.agent_id]?.name || 'Unknown',
      agentId: r.agent_id || '',
      durationMinutes: r.duration_seconds ? (r.duration_seconds / 60).toFixed(2) : 'Nil',
      sessionId: r.livekit_room_id || r.id,
      callToVmail: r.in_voicemail === true ? 'TRUE' : r.in_voicemail === false ? 'FALSE' : 'Nil',
      callSuccessful: r.call_successful === true ? 'TRUE' : r.call_successful === false ? 'FALSE' : 'Nil',
      summary: r.call_summary || '',
      extractedCustomerName: extracted.caller_name || extracted.customer_name || 'Nil',
      extractedCustomerAddress: extracted.address || extracted.customer_address || 'Nil',
      extractedCustomerCallReason: extracted.call_reason || extracted.reason || 'Nil',
      extractedCustomerEmail: extracted.email || extracted.customer_email || 'Nil',
      disconnectionReason: r.disconnection_reason || 'Nil',
      endTime: r.ended_at || 'Nil',
      recordingsUrl: r.recording_url || '',
      sentiment: r.user_sentiment || 'Neutral',
      uniqueId: r.id,
      cost: cost.toFixed(4)
    }
  })
}

async function getSmsSessions(supabase: ReturnType<typeof createClient>, userIds: string[], startDate: Date | null, endDate: Date | null) {
  // Group SMS by contact to get conversation sessions
  let query = supabase
    .from('sms_messages')
    .select(`
      id,
      sent_at,
      sender_number,
      recipient_number,
      content,
      direction,
      sentiment,
      agent_id
    `)
    .in('user_id', userIds)
    .order('sent_at', { ascending: false })

  if (startDate) query = query.gte('sent_at', startDate.toISOString())
  if (endDate) query = query.lte('sent_at', endDate.toISOString())
  query = query.limit(1000)

  const { data: messages } = await query
  if (!messages || messages.length === 0) return []

  // Get agent names
  const agentIds = [...new Set(messages.map(m => m.agent_id).filter(Boolean))]
  let agentMap: Record<string, { name: string, id: string }> = {}
  if (agentIds.length > 0) {
    const { data: agents } = await supabase.from('agent_configs').select('id, name').in('id', agentIds)
    if (agents) agentMap = Object.fromEntries(agents.map(a => [a.id, { name: a.name, id: a.id }]))
  }

  // For now, each message is a separate session (could be grouped by conversation later)
  return messages.map(m => ({
    sessionType: 'SMS',
    fromNumber: m.direction === 'inbound' ? m.sender_number : m.recipient_number,
    startTime: m.sent_at,
    agentName: agentMap[m.agent_id]?.name || 'Unknown',
    agentId: m.agent_id || '',
    durationMinutes: 'Nil',
    sessionId: `sms_${m.id.substring(0, 24)}`,
    callToVmail: 'Nil',
    callSuccessful: 'Nil',
    summary: m.content || '',
    extractedCustomerName: 'Nil',
    extractedCustomerAddress: 'Nil',
    extractedCustomerCallReason: 'Nil',
    extractedCustomerEmail: 'Nil',
    disconnectionReason: 'Nil',
    endTime: 'Nil',
    recordingsUrl: '',
    sentiment: m.sentiment || 'Neutral',
    uniqueId: m.id
  }))
}

async function getChatSessions(supabase: ReturnType<typeof createClient>, userIds: string[], startDate: Date | null, endDate: Date | null) {
  let query = supabase
    .from('chat_sessions')
    .select(`
      id,
      created_at,
      visitor_id,
      visitor_name,
      visitor_email,
      status,
      last_message_at,
      agent_id
    `)
    .in('user_id', userIds)
    .order('created_at', { ascending: false })

  if (startDate) query = query.gte('created_at', startDate.toISOString())
  if (endDate) query = query.lte('created_at', endDate.toISOString())
  query = query.limit(1000)

  const { data: sessions } = await query
  if (!sessions || sessions.length === 0) return []

  // Get agent names
  const agentIds = [...new Set(sessions.map(s => s.agent_id).filter(Boolean))]
  let agentMap: Record<string, { name: string, id: string }> = {}
  if (agentIds.length > 0) {
    const { data: agents } = await supabase.from('agent_configs').select('id, name').in('id', agentIds)
    if (agents) agentMap = Object.fromEntries(agents.map(a => [a.id, { name: a.name, id: a.id }]))
  }

  return sessions.map(s => ({
    sessionType: 'Web Chat',
    fromNumber: s.visitor_id || '',
    startTime: s.created_at,
    agentName: agentMap[s.agent_id]?.name || 'Unknown',
    agentId: s.agent_id || '',
    durationMinutes: 'Nil',
    sessionId: `chat_${s.id.substring(0, 24)}`,
    callToVmail: 'Nil',
    callSuccessful: 'Nil',
    summary: '',
    extractedCustomerName: s.visitor_name || 'Nil',
    extractedCustomerAddress: 'Nil',
    extractedCustomerCallReason: 'Nil',
    extractedCustomerEmail: s.visitor_email || 'Nil',
    disconnectionReason: 'Nil',
    endTime: s.last_message_at || 'Nil',
    recordingsUrl: '',
    sentiment: 'Neutral',
    uniqueId: s.id
  }))
}

async function getCallRecords(supabase: ReturnType<typeof createClient>, userIds: string[], startDate: Date | null, endDate: Date | null) {
  // Fetch calls, SMS, and chat sessions in parallel
  const [callRecords, smsRecords, chatRecords] = await Promise.all([
    getCallRecordsOnly(supabase, userIds, startDate, endDate),
    getSmsRecords(supabase, userIds, startDate, endDate),
    getChatRecordsForTable(supabase, userIds, startDate, endDate)
  ])

  // Merge and sort by time descending
  const allRecords = [...callRecords, ...smsRecords, ...chatRecords]
  allRecords.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

  return allRecords
}

async function getCallRecordsOnly(supabase: ReturnType<typeof createClient>, userIds: string[], startDate: Date | null, endDate: Date | null) {
  let query = supabase
    .from('call_records')
    .select(`
      id,
      started_at,
      caller_number,
      contact_phone,
      service_number,
      direction,
      duration_seconds,
      livekit_room_id,
      disposition,
      status,
      user_sentiment,
      call_type,
      agent_id
    `)
    .in('user_id', userIds)
    .order('started_at', { ascending: false })

  if (startDate) {
    query = query.gte('started_at', startDate.toISOString())
  }
  if (endDate) {
    query = query.lte('started_at', endDate.toISOString())
  }

  query = query.limit(startDate || endDate ? 1000 : 500)

  const { data: records, error } = await query

  if (error) {
    console.error('Error fetching call records:', error)
    return []
  }

  if (!records || records.length === 0) {
    return []
  }

  // Get unique agent IDs and fetch agent names separately
  const agentIds = [...new Set(records.map(r => r.agent_id).filter(Boolean))]
  let agentMap: Record<string, string> = {}

  if (agentIds.length > 0) {
    const { data: agents } = await supabase
      .from('agent_configs')
      .select('id, name')
      .in('id', agentIds)

    if (agents) {
      agentMap = Object.fromEntries(agents.map(a => [a.id, a.name]))
    }
  }

  // Get costs from credit_transactions
  const { data: transactions } = await supabase
    .from('credit_transactions')
    .select('reference_id, amount')
    .in('user_id', userIds)
    .eq('reference_type', 'call')

  const costMap: Record<string, number> = {}
  if (transactions) {
    transactions.forEach(t => {
      if (t.reference_id) {
        costMap[t.reference_id] = (costMap[t.reference_id] || 0) + Math.abs(parseFloat(t.amount) || 0)
      }
    })
  }

  return records.map(record => {
    const isInbound = record.direction === 'inbound'
    const fromNum = isInbound ? record.caller_number : record.service_number
    const toNum = isInbound ? record.service_number : (record.contact_phone || record.caller_number)
    const cost = costMap[record.id] || 0

    return {
      id: record.id,
      time: record.started_at,
      from: fromNum || 'Unknown',
      to: toNum || 'Unknown',
      direction: record.direction,
      assistant: agentMap[record.agent_id] || 'Unknown',
      duration: record.duration_seconds ? (record.duration_seconds / 60).toFixed(2) : '0.00',
      sessionId: record.livekit_room_id || record.id,
      end: record.disposition || 'Unknown',
      status: record.status || 'Unknown',
      sentiment: record.user_sentiment || 'Neutral',
      cost: cost.toFixed(4),
      type: record.call_type || 'Phone'
    }
  })
}

async function getSmsRecords(supabase: ReturnType<typeof createClient>, userIds: string[], startDate: Date | null, endDate: Date | null) {
  let query = supabase
    .from('sms_messages')
    .select('id, sent_at, sender_number, recipient_number, direction, status, sentiment, agent_id')
    .in('user_id', userIds)
    .order('sent_at', { ascending: false })

  if (startDate) query = query.gte('sent_at', startDate.toISOString())
  if (endDate) query = query.lte('sent_at', endDate.toISOString())
  query = query.limit(startDate || endDate ? 1000 : 500)

  const { data: messages, error } = await query
  if (error || !messages || messages.length === 0) return []

  const agentIds = [...new Set(messages.map(m => m.agent_id).filter(Boolean))]
  let agentMap: Record<string, string> = {}
  if (agentIds.length > 0) {
    const { data: agents } = await supabase.from('agent_configs').select('id, name').in('id', agentIds)
    if (agents) agentMap = Object.fromEntries(agents.map(a => [a.id, a.name]))
  }

  return messages.map(m => {
    const isInbound = m.direction === 'inbound'
    return {
      id: m.id,
      time: m.sent_at,
      from: isInbound ? (m.sender_number || 'Unknown') : (m.recipient_number || 'Unknown'),
      to: isInbound ? (m.recipient_number || 'Unknown') : (m.sender_number || 'Unknown'),
      direction: m.direction || 'outbound',
      assistant: agentMap[m.agent_id] || 'Unknown',
      duration: '-',
      sessionId: m.id,
      end: m.status || 'sent',
      status: m.status || 'sent',
      sentiment: m.sentiment || 'Neutral',
      cost: '0.0000',
      type: 'SMS'
    }
  })
}

async function getChatRecordsForTable(supabase: ReturnType<typeof createClient>, userIds: string[], startDate: Date | null, endDate: Date | null) {
  let query = supabase
    .from('chat_sessions')
    .select('id, created_at, visitor_name, visitor_id, status, last_message_at, agent_id')
    .in('user_id', userIds)
    .order('created_at', { ascending: false })

  if (startDate) query = query.gte('created_at', startDate.toISOString())
  if (endDate) query = query.lte('created_at', endDate.toISOString())
  query = query.limit(startDate || endDate ? 1000 : 500)

  const { data: sessions, error } = await query
  if (error || !sessions || sessions.length === 0) return []

  const agentIds = [...new Set(sessions.map(s => s.agent_id).filter(Boolean))]
  let agentMap: Record<string, string> = {}
  if (agentIds.length > 0) {
    const { data: agents } = await supabase.from('agent_configs').select('id, name').in('id', agentIds)
    if (agents) agentMap = Object.fromEntries(agents.map(a => [a.id, a.name]))
  }

  return sessions.map(s => {
    // Compute duration from created_at to last_message_at
    let duration = '-'
    if (s.last_message_at && s.created_at) {
      const secs = (new Date(s.last_message_at).getTime() - new Date(s.created_at).getTime()) / 1000
      if (secs > 0) duration = (secs / 60).toFixed(2)
    }

    return {
      id: s.id,
      time: s.created_at,
      from: s.visitor_name || s.visitor_id || 'Visitor',
      to: agentMap[s.agent_id] || 'Unknown',
      direction: 'inbound',
      assistant: agentMap[s.agent_id] || 'Unknown',
      duration,
      sessionId: s.id,
      end: s.status || 'Unknown',
      status: s.status || 'Unknown',
      sentiment: 'Neutral',
      cost: '0.0000',
      type: 'Web Chat'
    }
  })
}
