/**
 * Admin Analytics Edge Function
 * Returns platform-wide metrics, time series data, and leaderboards
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  requireAdmin,
  logAdminAction,
  handleCors,
  errorResponse,
  successResponse
} from '../_shared/admin-auth.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verify admin access
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Unauthorized', 401)
    }
    const token = authHeader.replace('Bearer ', '')

    let adminUser
    try {
      adminUser = await requireAdmin(supabase, token)
    } catch (error) {
      return errorResponse(error.message, 403)
    }

    // Get all analytics data in parallel
    const [
      userMetrics,
      callMetrics,
      messageMetrics,
      creditsMetrics,
      timeSeries,
      leaderboards,
      recentSignups,
      activityLocations
    ] = await Promise.all([
      getUserMetrics(supabase),
      getCallMetrics(supabase),
      getMessageMetrics(supabase),
      getCreditsMetrics(supabase),
      getTimeSeries(supabase),
      getLeaderboards(supabase),
      getRecentSignups(supabase),
      getActivityLocations(supabase)
    ])

    // Log admin action
    await logAdminAction(supabase, {
      adminUserId: adminUser.id,
      action: 'view_analytics',
      details: {}
    })

    return successResponse({
      users: userMetrics,
      calls: callMetrics,
      messages: messageMetrics,
      credits: creditsMetrics,
      timeSeries,
      leaderboards,
      recentSignups,
      activityLocations
    })
  } catch (error) {
    console.error('Error in admin-analytics:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})

async function getUserMetrics(supabase: ReturnType<typeof createClient>) {
  // Total users
  const { count: totalUsers } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })

  // Calculate date thresholds
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const oneWeekAgo = sevenDaysAgo
  const oneMonthAgo = thirtyDaysAgo

  // Get distinct active users from calls in last 7 days
  const { data: recentCalls7d } = await supabase
    .from('call_records')
    .select('user_id')
    .gte('started_at', sevenDaysAgo)

  const { data: recentMessages7d } = await supabase
    .from('sms_messages')
    .select('user_id')
    .gte('sent_at', sevenDaysAgo)

  // Get distinct active users from calls in last 30 days
  const { data: recentCalls30d } = await supabase
    .from('call_records')
    .select('user_id')
    .gte('started_at', thirtyDaysAgo)

  const { data: recentMessages30d } = await supabase
    .from('sms_messages')
    .select('user_id')
    .gte('sent_at', thirtyDaysAgo)

  // Calculate unique active users
  const active7dSet = new Set([
    ...(recentCalls7d || []).map(r => r.user_id),
    ...(recentMessages7d || []).map(r => r.user_id)
  ])
  const active30dSet = new Set([
    ...(recentCalls30d || []).map(r => r.user_id),
    ...(recentMessages30d || []).map(r => r.user_id)
  ])

  // New signups this week
  const { count: newWeek } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', oneWeekAgo)

  // New signups this month
  const { count: newMonth } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', oneMonthAgo)

  // Total phone numbers
  const { count: phoneNumbers } = await supabase
    .from('service_numbers')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  return {
    total: totalUsers || 0,
    active7d: active7dSet.size,
    active30d: active30dSet.size,
    newWeek: newWeek || 0,
    newMonth: newMonth || 0,
    phoneNumbers: phoneNumbers || 0
  }
}

async function getCallMetrics(supabase: ReturnType<typeof createClient>) {
  // Total calls
  const { count: totalCalls } = await supabase
    .from('call_records')
    .select('*', { count: 'exact', head: true })

  // Call success rate (not failed)
  const { count: successfulCalls } = await supabase
    .from('call_records')
    .select('*', { count: 'exact', head: true })
    .neq('disposition', 'failed')

  // Inbound vs outbound
  const { count: inboundCalls } = await supabase
    .from('call_records')
    .select('*', { count: 'exact', head: true })
    .eq('direction', 'inbound')

  const { count: outboundCalls } = await supabase
    .from('call_records')
    .select('*', { count: 'exact', head: true })
    .eq('direction', 'outbound')

  // Get calls with duration for average calculation
  const { data: callsWithDuration } = await supabase
    .from('call_records')
    .select('duration')
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
    .gte('started_at', startOfMonth.toISOString())

  return {
    total: totalCalls || 0,
    successRate: totalCalls ? Math.round((successfulCalls || 0) / totalCalls * 100) : 0,
    avgDuration: Math.round(avgDuration),
    inbound: inboundCalls || 0,
    outbound: outboundCalls || 0,
    thisMonth: callsThisMonth || 0
  }
}

async function getMessageMetrics(supabase: ReturnType<typeof createClient>) {
  // Total messages
  const { count: totalMessages } = await supabase
    .from('sms_messages')
    .select('*', { count: 'exact', head: true })

  // Delivery rate
  const { count: deliveredMessages } = await supabase
    .from('sms_messages')
    .select('*', { count: 'exact', head: true })
    .in('status', ['sent', 'delivered'])

  // Inbound vs outbound
  const { count: inboundMessages } = await supabase
    .from('sms_messages')
    .select('*', { count: 'exact', head: true })
    .eq('direction', 'inbound')

  const { count: outboundMessages } = await supabase
    .from('sms_messages')
    .select('*', { count: 'exact', head: true })
    .eq('direction', 'outbound')

  // Messages this month
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const { count: messagesThisMonth } = await supabase
    .from('sms_messages')
    .select('*', { count: 'exact', head: true })
    .gte('sent_at', startOfMonth.toISOString())

  return {
    total: totalMessages || 0,
    deliveryRate: totalMessages ? Math.round((deliveredMessages || 0) / totalMessages * 100) : 0,
    inbound: inboundMessages || 0,
    outbound: outboundMessages || 0,
    thisMonth: messagesThisMonth || 0
  }
}

async function getCreditsMetrics(supabase: ReturnType<typeof createClient>) {
  // Get all users with credits data
  const { data: usersData } = await supabase
    .from('users')
    .select('credits_balance, credits_used_this_period')

  const users = usersData || []
  const totalBalance = users.reduce((sum, u) => sum + (parseFloat(u.credits_balance) || 0), 0)
  const totalSpentPeriod = users.reduce((sum, u) => sum + (parseFloat(u.credits_used_this_period) || 0), 0)
  const usersWithCredits = users.filter(u => parseFloat(u.credits_balance) > 0).length
  const avgBalance = users.length > 0 ? totalBalance / users.length : 0

  // Get credit transactions
  const { data: addTransactions } = await supabase
    .from('credit_transactions')
    .select('amount')
    .gt('amount', 0)

  const { data: spendTransactions } = await supabase
    .from('credit_transactions')
    .select('amount')
    .lt('amount', 0)

  const totalAdded = (addTransactions || []).reduce((sum, t) => sum + parseFloat(t.amount), 0)
  const totalSpent = (spendTransactions || []).reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0)

  return {
    totalBalance: totalBalance.toFixed(2),
    totalSpentPeriod: totalSpentPeriod.toFixed(2),
    totalAdded: totalAdded.toFixed(2),
    totalSpent: totalSpent.toFixed(2),
    avgBalance: avgBalance.toFixed(2),
    usersWithCredits
  }
}

async function getTimeSeries(supabase: ReturnType<typeof createClient>) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Calls per day (last 30 days)
  const { data: calls } = await supabase
    .from('call_records')
    .select('started_at')
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
    .gte('sent_at', thirtyDaysAgo.toISOString())

  const messagesByDate = new Map<string, number>()
  for (const msg of messages || []) {
    const date = msg.sent_at.split('T')[0]
    messagesByDate.set(date, (messagesByDate.get(date) || 0) + 1)
  }
  const messagesPerDay = Array.from(messagesByDate.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Signups per day (last 30 days)
  const { data: signups } = await supabase
    .from('users')
    .select('created_at')
    .gte('created_at', thirtyDaysAgo.toISOString())

  const signupsByDate = new Map<string, number>()
  for (const user of signups || []) {
    const date = user.created_at.split('T')[0]
    signupsByDate.set(date, (signupsByDate.get(date) || 0) + 1)
  }
  const signupsPerDay = Array.from(signupsByDate.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    calls: callsPerDay,
    messages: messagesPerDay,
    signups: signupsPerDay
  }
}

async function getLeaderboards(supabase: ReturnType<typeof createClient>) {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  // Get call counts per user this month
  const { data: callsData } = await supabase
    .from('call_records')
    .select('user_id, duration')
    .gte('started_at', startOfMonth.toISOString())

  // Aggregate calls by user
  const callsByUser = new Map<string, { count: number, totalMinutes: number }>()
  for (const call of callsData || []) {
    const existing = callsByUser.get(call.user_id) || { count: 0, totalMinutes: 0 }
    callsByUser.set(call.user_id, {
      count: existing.count + 1,
      totalMinutes: existing.totalMinutes + (call.duration || 0)
    })
  }

  // Get messages per user this month
  const { data: messagesData } = await supabase
    .from('sms_messages')
    .select('user_id')
    .gte('sent_at', startOfMonth.toISOString())

  const messagesByUser = new Map<string, number>()
  for (const msg of messagesData || []) {
    messagesByUser.set(msg.user_id, (messagesByUser.get(msg.user_id) || 0) + 1)
  }

  // Get user details
  const userIds = new Set([
    ...Array.from(callsByUser.keys()),
    ...Array.from(messagesByUser.keys())
  ])

  const { data: usersData } = await supabase
    .from('users')
    .select('id, email, name, credits_used_this_period')
    .in('id', Array.from(userIds))

  const usersMap = new Map((usersData || []).map(u => [u.id, u]))

  // Build leaderboards
  const topCallers = Array.from(callsByUser.entries())
    .map(([userId, data]) => {
      const user = usersMap.get(userId)
      return {
        id: userId,
        email: user?.email || 'Unknown',
        name: user?.name || null,
        call_count: data.count,
        total_minutes: data.totalMinutes
      }
    })
    .sort((a, b) => b.call_count - a.call_count)
    .slice(0, 10)

  const topMessagers = Array.from(messagesByUser.entries())
    .map(([userId, count]) => {
      const user = usersMap.get(userId)
      return {
        id: userId,
        email: user?.email || 'Unknown',
        name: user?.name || null,
        message_count: count
      }
    })
    .sort((a, b) => b.message_count - a.message_count)
    .slice(0, 10)

  // Top spenders
  const topSpenders = (usersData || [])
    .filter(u => parseFloat(u.credits_used_this_period) > 0)
    .map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      credits_spent: parseFloat(u.credits_used_this_period) || 0
    }))
    .sort((a, b) => b.credits_spent - a.credits_spent)
    .slice(0, 10)

  return {
    topCallers,
    topMessagers,
    topSpenders
  }
}

async function getRecentSignups(supabase: ReturnType<typeof createClient>) {
  const { data: signups } = await supabase
    .from('users')
    .select('id, email, name, created_at, signup_ip, signup_country, signup_city, phone_verified, account_status')
    .order('created_at', { ascending: false })
    .limit(50)

  return (signups || []).map(user => ({
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.created_at,
    ip: user.signup_ip,
    country: user.signup_country,
    city: user.signup_city,
    phoneVerified: user.phone_verified,
    status: user.account_status
  }))
}

async function getActivityLocations(supabase: ReturnType<typeof createClient>) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const since = thirtyDaysAgo.toISOString()

  // Get users with location data
  const { data: usersWithLocation } = await supabase
    .from('users')
    .select('id, email, name, signup_city, signup_country')
    .not('signup_city', 'is', null)

  if (!usersWithLocation || usersWithLocation.length === 0) {
    return { signups: [], calls: [], messages: [], chats: [] }
  }

  const userMap = new Map(usersWithLocation.map(u => [u.id, u]))
  const userIds = usersWithLocation.map(u => u.id)

  // Get calls per user (last 30 days)
  const { data: callData } = await supabase
    .from('call_records')
    .select('user_id')
    .in('user_id', userIds)
    .gte('started_at', since)

  // Get messages per user (last 30 days)
  const { data: msgData } = await supabase
    .from('sms_messages')
    .select('user_id')
    .in('user_id', userIds)
    .gte('sent_at', since)

  // Get chat sessions per user (last 30 days)
  const { data: chatData } = await supabase
    .from('chat_sessions')
    .select('user_id')
    .in('user_id', userIds)
    .gte('created_at', since)

  // Aggregate by city
  function aggregateByCity(records: { user_id: string }[] | null) {
    const cityMap = new Map<string, { city: string, country: string, count: number, users: string[] }>()
    for (const r of records || []) {
      const user = userMap.get(r.user_id)
      if (!user?.signup_city) continue
      const key = `${user.signup_city}, ${user.signup_country}`
      if (!cityMap.has(key)) {
        cityMap.set(key, { city: user.signup_city, country: user.signup_country, count: 0, users: [] })
      }
      const entry = cityMap.get(key)!
      entry.count++
      const name = user.name || user.email.split('@')[0]
      if (!entry.users.includes(name)) entry.users.push(name)
    }
    return Array.from(cityMap.values())
  }

  // Signups with location (all time)
  const signups = usersWithLocation.map(u => ({
    city: u.signup_city,
    country: u.signup_country,
    name: u.name || u.email.split('@')[0]
  }))

  // Aggregate signups by city
  const signupsByCity = new Map<string, { city: string, country: string, count: number, users: string[] }>()
  for (const s of signups) {
    const key = `${s.city}, ${s.country}`
    if (!signupsByCity.has(key)) {
      signupsByCity.set(key, { city: s.city, country: s.country, count: 0, users: [] })
    }
    const entry = signupsByCity.get(key)!
    entry.count++
    entry.users.push(s.name)
  }

  return {
    signups: Array.from(signupsByCity.values()),
    calls: aggregateByCity(callData),
    messages: aggregateByCity(msgData),
    chats: aggregateByCity(chatData)
  }
}
