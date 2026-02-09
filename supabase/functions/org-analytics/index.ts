/**
 * Org Analytics Edge Function
 * Returns organization/user-scoped metrics, time series data
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

    // Get all analytics data in parallel
    const [
      callMetrics,
      messageMetrics,
      creditsMetrics,
      timeSeries
    ] = await Promise.all([
      getCallMetrics(supabase, userId),
      getMessageMetrics(supabase, userId),
      getCreditsMetrics(supabase, userId),
      getTimeSeries(supabase, userId)
    ])

    return new Response(JSON.stringify({
      calls: callMetrics,
      messages: messageMetrics,
      credits: creditsMetrics,
      timeSeries
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

async function getCallMetrics(supabase: ReturnType<typeof createClient>, userId: string) {
  // Total calls
  const { count: totalCalls } = await supabase
    .from('call_records')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  // Call success rate (not failed)
  const { count: successfulCalls } = await supabase
    .from('call_records')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .neq('disposition', 'failed')

  // Inbound vs outbound
  const { count: inboundCalls } = await supabase
    .from('call_records')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('direction', 'inbound')

  const { count: outboundCalls } = await supabase
    .from('call_records')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('direction', 'outbound')

  // Get calls with duration for average calculation
  const { data: callsWithDuration } = await supabase
    .from('call_records')
    .select('duration')
    .eq('user_id', userId)
    .not('duration', 'is', null)
    .gt('duration', 0)

  const avgDuration = callsWithDuration && callsWithDuration.length > 0
    ? callsWithDuration.reduce((sum, c) => sum + (c.duration || 0), 0) / callsWithDuration.length
    : 0

  // Calls this month
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const { count: callsThisMonth } = await supabase
    .from('call_records')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('started_at', startOfMonth.toISOString())

  // Total duration this month
  const { data: monthCalls } = await supabase
    .from('call_records')
    .select('duration')
    .eq('user_id', userId)
    .gte('started_at', startOfMonth.toISOString())
    .not('duration', 'is', null)

  const totalMinutesThisMonth = monthCalls
    ? Math.round(monthCalls.reduce((sum, c) => sum + (c.duration || 0), 0) / 60)
    : 0

  return {
    total: totalCalls || 0,
    successRate: totalCalls ? Math.round((successfulCalls || 0) / totalCalls * 100) : 0,
    avgDuration: Math.round(avgDuration),
    inbound: inboundCalls || 0,
    outbound: outboundCalls || 0,
    thisMonth: callsThisMonth || 0,
    minutesThisMonth: totalMinutesThisMonth
  }
}

async function getMessageMetrics(supabase: ReturnType<typeof createClient>, userId: string) {
  // Total messages
  const { count: totalMessages } = await supabase
    .from('sms_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  // Delivery rate
  const { count: deliveredMessages } = await supabase
    .from('sms_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['sent', 'delivered'])

  // Inbound vs outbound
  const { count: inboundMessages } = await supabase
    .from('sms_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('direction', 'inbound')

  const { count: outboundMessages } = await supabase
    .from('sms_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('direction', 'outbound')

  // Messages this month
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const { count: messagesThisMonth } = await supabase
    .from('sms_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('sent_at', startOfMonth.toISOString())

  return {
    total: totalMessages || 0,
    deliveryRate: totalMessages ? Math.round((deliveredMessages || 0) / totalMessages * 100) : 0,
    inbound: inboundMessages || 0,
    outbound: outboundMessages || 0,
    thisMonth: messagesThisMonth || 0
  }
}

async function getCreditsMetrics(supabase: ReturnType<typeof createClient>, userId: string) {
  // Get user's credits data
  const { data: userData } = await supabase
    .from('users')
    .select('credits_balance, credits_used_this_period')
    .eq('id', userId)
    .single()

  const balance = parseFloat(userData?.credits_balance) || 0
  const spentThisPeriod = parseFloat(userData?.credits_used_this_period) || 0

  // Get credit transactions for this user
  const { data: transactions } = await supabase
    .from('credit_transactions')
    .select('amount, created_at, description')
    .eq('user_id', userId)
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

async function getTimeSeries(supabase: ReturnType<typeof createClient>, userId: string) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Calls per day (last 30 days)
  const { data: calls } = await supabase
    .from('call_records')
    .select('started_at')
    .eq('user_id', userId)
    .gte('started_at', thirtyDaysAgo.toISOString())

  // Group by date
  const callsByDate = new Map<string, number>()
  for (const call of calls || []) {
    const date = call.started_at.split('T')[0]
    callsByDate.set(date, (callsByDate.get(date) || 0) + 1)
  }
  const callsPerDay = Array.from(callsByDate.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Messages per day (last 30 days)
  const { data: messages } = await supabase
    .from('sms_messages')
    .select('sent_at')
    .eq('user_id', userId)
    .gte('sent_at', thirtyDaysAgo.toISOString())

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
