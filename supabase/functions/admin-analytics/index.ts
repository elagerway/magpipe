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

    // Check if this is a KPI-specific request
    const url = new URL(req.url)
    const requestType = url.searchParams.get('type')

    if (requestType === 'kpi') {
      const since = url.searchParams.get('since') || null  // ISO date string filter
      const kpiMetrics = await getKpiMetrics(supabase, since)

      await logAdminAction(supabase, {
        adminUserId: adminUser.id,
        action: 'view_kpi',
        details: {}
      })

      return successResponse(kpiMetrics)
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
    .limit(100)

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
    .select('id, email, name, signup_city, signup_country, signup_lat, signup_lng')
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

  // Collect all unique cities that need geocoding
  const cityKeys = new Set<string>()
  for (const u of usersWithLocation) {
    if (u.signup_city) cityKeys.add(`${u.signup_city}|${u.signup_country}`)
  }

  // Build coords map: use stored lat/lng if available, otherwise geocode
  const coordsMap = new Map<string, { lat: number, lng: number }>()
  const toGeocode: { city: string, country: string, key: string }[] = []

  for (const key of cityKeys) {
    const [city, country] = key.split('|')
    // Check if any user for this city already has coordinates
    const userWithCoords = usersWithLocation.find(
      u => u.signup_city === city && u.signup_country === country && u.signup_lat && u.signup_lng
    )
    if (userWithCoords) {
      coordsMap.set(key, { lat: userWithCoords.signup_lat, lng: userWithCoords.signup_lng })
    } else {
      toGeocode.push({ city, country, key })
    }
  }

  // Geocode missing cities using OpenStreetMap Nominatim (free, no key needed)
  for (const item of toGeocode) {
    try {
      const query = encodeURIComponent(`${item.city}, ${item.country}`)
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
        {
          headers: { 'User-Agent': 'Magpipe-Admin/1.0' },
          signal: AbortSignal.timeout(3000)
        }
      )
      if (resp.ok) {
        const results = await resp.json()
        if (results.length > 0) {
          const lat = parseFloat(results[0].lat)
          const lng = parseFloat(results[0].lon)
          coordsMap.set(item.key, { lat, lng })

          // Store coordinates back to users table for future lookups
          await supabase
            .from('users')
            .update({ signup_lat: lat, signup_lng: lng })
            .eq('signup_city', item.city)
            .eq('signup_country', item.country)
            .is('signup_lat', null)
        }
      }
    } catch {
      // Skip failed geocodes
    }
  }

  // Aggregate by city with coordinates
  function aggregateByCity(records: { user_id: string }[] | null) {
    const cityMap = new Map<string, { city: string, country: string, lat: number, lng: number, count: number, users: string[] }>()
    for (const r of records || []) {
      const user = userMap.get(r.user_id)
      if (!user?.signup_city) continue
      const key = `${user.signup_city}|${user.signup_country}`
      const coords = coordsMap.get(key)
      if (!coords) continue
      if (!cityMap.has(key)) {
        cityMap.set(key, { city: user.signup_city, country: user.signup_country, lat: coords.lat, lng: coords.lng, count: 0, users: [] })
      }
      const entry = cityMap.get(key)!
      entry.count++
      const name = user.name || user.email.split('@')[0]
      if (!entry.users.includes(name)) entry.users.push(name)
    }
    return Array.from(cityMap.values())
  }

  // Aggregate signups by city
  const signupsByCity = new Map<string, { city: string, country: string, lat: number, lng: number, count: number, users: string[] }>()
  for (const u of usersWithLocation) {
    if (!u.signup_city) continue
    const key = `${u.signup_city}|${u.signup_country}`
    const coords = coordsMap.get(key)
    if (!coords) continue
    if (!signupsByCity.has(key)) {
      signupsByCity.set(key, { city: u.signup_city, country: u.signup_country, lat: coords.lat, lng: coords.lng, count: 0, users: [] })
    }
    const entry = signupsByCity.get(key)!
    entry.count++
    entry.users.push(u.name || u.email.split('@')[0])
  }

  return {
    signups: Array.from(signupsByCity.values()),
    calls: aggregateByCity(callData),
    messages: aggregateByCity(msgData),
    chats: aggregateByCity(chatData)
  }
}

// Vendor costs (what we pay) - mirrors constants in deduct-credits
// Updated 2026-02-09 from actual vendor rate cards
const VENDOR_COSTS = {
  tts: { elevenlabs: 0.22, openai: 0.015 },
  stt: { deepgram: 0.0043 },
  telephony: { signalwire: 0.007, sipBridge: 0 },
  livekit: 0.014,
  llm: {
    'gpt-4o': 0.002, 'gpt-4o-mini': 0.0001,
    'gpt-4.1': 0.0015, 'gpt-4.1-mini': 0.0003,
    'gpt-5': 0.0017, 'gpt-5-mini': 0.0003, 'gpt-5-nano': 0.0001,
    'claude-3.5-sonnet': 0.003, 'claude-3-haiku': 0.0002,
    'default': 0.0001,
  },
  sms: { outbound: 0.008, inbound: 0.005 },
}

// Retail rates (what we charge users) - mirrors constants in deduct-credits
const RETAIL_RATES = {
  voice: 0.15,  // Single blended per-minute rate (covers TTS, STT, LLM, telephony, LiveKit)
  sms: 0.013,
}

async function getKpiMetrics(supabase: ReturnType<typeof createClient>, since: string | null) {
  // Get deduction transactions with their metadata
  let deductionQuery = supabase
    .from('credit_transactions')
    .select('amount, metadata, created_at')
    .eq('transaction_type', 'deduction')
  if (since) deductionQuery = deductionQuery.gte('created_at', since)
  const { data: deductions } = await deductionQuery

  // Get SMS messages with direction for inbound/outbound breakdown
  let smsQuery = supabase
    .from('sms_messages')
    .select('direction, sent_at')
  if (since) smsQuery = smsQuery.gte('sent_at', since)
  const { data: smsMessages } = await smsQuery

  const allDeductions = deductions || []
  const allSms = smsMessages || []

  // Aggregate totals
  let totalRevenue = 0
  let totalVoiceMinutes = 0
  let totalCalls = 0
  let voiceRevenueByProvider: Record<string, { minutes: number, revenue: number }> = {}
  let llmRevenueByModel: Record<string, { minutes: number, revenue: number }> = {}
  let smsRevenue = 0
  let smsCount = 0

  // Monthly aggregation (last 6 months)
  const monthlyData = new Map<string, { revenue: number, cost: number }>()

  for (const tx of allDeductions) {
    const amount = Math.abs(parseFloat(tx.amount))
    const meta = tx.metadata || {}

    // Skip monthly fees - they're tracked separately in MRR section
    if (meta.type === 'monthly_fee') continue

    totalRevenue += amount

    // Monthly bucket
    const month = tx.created_at?.split('T')[0]?.substring(0, 7) || 'unknown'
    if (!monthlyData.has(month)) monthlyData.set(month, { revenue: 0, cost: 0 })
    monthlyData.get(month)!.revenue += amount

    if (meta.type === 'voice') {
      const minutes = meta.minutes || 0
      totalVoiceMinutes += minutes
      totalCalls++

      // Voice provider breakdown
      const voiceId = meta.voiceId || ''
      const provider = voiceId.startsWith('openai-') ? 'openai' : 'elevenlabs'
      if (!voiceRevenueByProvider[provider]) voiceRevenueByProvider[provider] = { minutes: 0, revenue: 0 }
      voiceRevenueByProvider[provider].minutes += minutes
      voiceRevenueByProvider[provider].revenue += meta.voiceCost || 0

      // LLM breakdown
      const model = meta.aiModel || 'default'
      if (!llmRevenueByModel[model]) llmRevenueByModel[model] = { minutes: 0, revenue: 0 }
      llmRevenueByModel[model].minutes += minutes
      llmRevenueByModel[model].revenue += meta.llmCost || 0

    } else if (meta.type === 'sms') {
      smsRevenue += amount
      smsCount += meta.messageCount || 1
    }
  }

  // Count SMS by direction
  let smsOutbound = 0
  let smsInbound = 0
  for (const msg of allSms) {
    if (msg.direction === 'outbound') smsOutbound++
    else smsInbound++
  }

  // Calculate vendor costs
  let totalVendorCost = 0

  // Voice vendor costs
  const voiceCostBreakdown: Array<{
    component: string, vendorCost: number, retailRevenue: number, margin: number, unit: string, quantity: number
  }> = []

  // TTS costs
  for (const [provider, data] of Object.entries(voiceRevenueByProvider)) {
    const vendorRate = VENDOR_COSTS.tts[provider as keyof typeof VENDOR_COSTS.tts] || 0.003
    const vendorCost = data.minutes * vendorRate
    totalVendorCost += vendorCost
    voiceCostBreakdown.push({
      component: `TTS (${provider === 'elevenlabs' ? 'ElevenLabs' : 'OpenAI'})`,
      vendorCost,
      retailRevenue: data.revenue,
      margin: data.revenue > 0 ? ((data.revenue - vendorCost) / data.revenue) * 100 : 0,
      unit: 'min',
      quantity: data.minutes
    })
  }

  // STT cost (Deepgram - all voice minutes)
  const sttCost = totalVoiceMinutes * VENDOR_COSTS.stt.deepgram
  totalVendorCost += sttCost
  voiceCostBreakdown.push({
    component: 'STT (Deepgram)',
    vendorCost: sttCost,
    retailRevenue: 0, // bundled
    margin: -100,
    unit: 'min',
    quantity: totalVoiceMinutes
  })

  // Telephony cost (SignalWire per minute)
  const telephonyCost = totalVoiceMinutes * VENDOR_COSTS.telephony.signalwire
  totalVendorCost += telephonyCost
  // Telephony retail revenue
  let telephonyRetail = 0
  for (const tx of allDeductions) {
    if (tx.metadata?.type === 'voice') {
      telephonyRetail += tx.metadata.telephonyCost || 0
    }
  }
  voiceCostBreakdown.push({
    component: 'Telephony (SignalWire)',
    vendorCost: telephonyCost,
    retailRevenue: telephonyRetail,
    margin: telephonyRetail > 0 ? ((telephonyRetail - telephonyCost) / telephonyRetail) * 100 : 0,
    unit: 'min',
    quantity: totalVoiceMinutes
  })

  // SIP bridge cost (per call)
  const sipBridgeCost = totalCalls * VENDOR_COSTS.telephony.sipBridge
  totalVendorCost += sipBridgeCost
  voiceCostBreakdown.push({
    component: 'SIP Bridge',
    vendorCost: sipBridgeCost,
    retailRevenue: 0, // bundled
    margin: -100,
    unit: 'call',
    quantity: totalCalls
  })

  // LiveKit cost
  const livekitCost = totalVoiceMinutes * VENDOR_COSTS.livekit
  totalVendorCost += livekitCost
  voiceCostBreakdown.push({
    component: 'LiveKit',
    vendorCost: livekitCost,
    retailRevenue: 0, // bundled
    margin: -100,
    unit: 'min',
    quantity: totalVoiceMinutes
  })

  // LLM costs
  for (const [model, data] of Object.entries(llmRevenueByModel)) {
    const vendorRate = VENDOR_COSTS.llm[model as keyof typeof VENDOR_COSTS.llm] || VENDOR_COSTS.llm.default
    const vendorCost = data.minutes * vendorRate
    totalVendorCost += vendorCost
    voiceCostBreakdown.push({
      component: `LLM (${model})`,
      vendorCost,
      retailRevenue: data.revenue,
      margin: data.revenue > 0 ? ((data.revenue - vendorCost) / data.revenue) * 100 : 0,
      unit: 'min',
      quantity: data.minutes
    })
  }

  // SMS costs
  const smsOutboundCost = smsOutbound * VENDOR_COSTS.sms.outbound
  const smsInboundCost = smsInbound * VENDOR_COSTS.sms.inbound
  const totalSmsCost = smsOutboundCost + smsInboundCost
  totalVendorCost += totalSmsCost

  const smsOutboundRevenue = smsOutbound * RETAIL_RATES.sms
  const smsInboundRevenue = smsInbound * RETAIL_RATES.sms
  const smsCostBreakdown = [
    {
      component: 'SMS Outbound',
      vendorCost: smsOutboundCost,
      retailRevenue: smsOutboundRevenue,
      margin: smsOutboundRevenue > 0 ? ((smsOutboundRevenue - smsOutboundCost) / smsOutboundRevenue) * 100 : 0,
      unit: 'msg',
      quantity: smsOutbound
    },
    {
      component: 'SMS Inbound',
      vendorCost: smsInboundCost,
      retailRevenue: smsInboundRevenue,
      margin: smsInboundRevenue > 0 ? ((smsInboundRevenue - smsInboundCost) / smsInboundRevenue) * 100 : 0,
      unit: 'msg',
      quantity: smsInbound
    }
  ]

  // Calculate monthly costs
  // Re-process deductions to compute vendor costs per month
  for (const tx of allDeductions) {
    const meta2 = tx.metadata || {}
    if (meta2.type === 'monthly_fee') continue  // Skip - tracked in MRR

    const month = tx.created_at?.split('T')[0]?.substring(0, 7) || 'unknown'
    const entry = monthlyData.get(month)
    if (!entry) continue

    if (meta2.type === 'voice') {
      const minutes = meta2.minutes || 0
      const voiceId = meta2.voiceId || ''
      const provider = voiceId.startsWith('openai-') ? 'openai' : 'elevenlabs'
      const ttsRate = VENDOR_COSTS.tts[provider as keyof typeof VENDOR_COSTS.tts] || 0.003
      const model = meta2.aiModel || 'default'
      const llmRate = VENDOR_COSTS.llm[model as keyof typeof VENDOR_COSTS.llm] || VENDOR_COSTS.llm.default

      entry.cost += minutes * (ttsRate + VENDOR_COSTS.stt.deepgram + VENDOR_COSTS.telephony.signalwire + VENDOR_COSTS.livekit + llmRate)
      entry.cost += VENDOR_COSTS.telephony.sipBridge // per call
    } else if (meta2.type === 'sms') {
      // Approximate: assume outbound for cost calculation
      entry.cost += (meta2.messageCount || 1) * VENDOR_COSTS.sms.outbound
    }
  }

  // Get last 6 months sorted
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const sixMonthsAgoStr = sixMonthsAgo.toISOString().substring(0, 7)

  const monthlyTrend = Array.from(monthlyData.entries())
    .filter(([month]) => month >= sixMonthsAgoStr)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      revenue: Math.round(data.revenue * 100) / 100,
      cost: Math.round(data.cost * 100) / 100,
      profit: Math.round((data.revenue - data.cost) * 100) / 100
    }))

  // MRR: Monthly Recurring Revenue from phone number fees etc.
  // Get monthly billing log data
  let mrrQuery = supabase
    .from('monthly_billing_log')
    .select('fee_type, amount, created_at')
  if (since) mrrQuery = mrrQuery.gte('created_at', since)
  const { data: billingLogs } = await mrrQuery

  let totalMrr = 0
  const mrrByType: Record<string, { count: number, revenue: number }> = {}
  for (const log of billingLogs || []) {
    const amount = parseFloat(log.amount)
    totalMrr += amount
    if (!mrrByType[log.fee_type]) mrrByType[log.fee_type] = { count: 0, revenue: 0 }
    mrrByType[log.fee_type].count++
    mrrByType[log.fee_type].revenue += amount

    // Add to monthly data for chart
    const month = log.created_at?.split('T')[0]?.substring(0, 7) || 'unknown'
    if (!monthlyData.has(month)) monthlyData.set(month, { revenue: 0, cost: 0 })
    monthlyData.get(month)!.revenue += amount
  }

  // Get active phone numbers count for projected MRR
  const { count: activeNumbers } = await supabase
    .from('service_numbers')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  const projectedMonthlyMrr = (activeNumbers || 0) * 2.00  // $2/mo per number

  // Combine usage revenue + MRR for overall P&L
  const totalCombinedRevenue = totalRevenue + totalMrr
  const grossProfit = totalRevenue - totalVendorCost  // usage-only P&L
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
  const overallProfit = totalCombinedRevenue - totalVendorCost  // includes MRR
  const overallMargin = totalCombinedRevenue > 0 ? (overallProfit / totalCombinedRevenue) * 100 : 0

  return {
    summary: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalVendorCost: Math.round(totalVendorCost * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossMargin: Math.round(grossMargin * 10) / 10,
    },
    perCall: {
      totalCalls,
      totalMinutes: Math.round(totalVoiceMinutes * 100) / 100,
      avgRevenuePerMin: totalVoiceMinutes > 0 ? Math.round(((totalRevenue - smsRevenue) / totalVoiceMinutes) * 10000) / 10000 : 0,
      avgCostPerMin: totalVoiceMinutes > 0 ? Math.round(((totalVendorCost - totalSmsCost) / totalVoiceMinutes) * 10000) / 10000 : 0,
    },
    mrr: {
      totalCollected: Math.round(totalMrr * 100) / 100,
      projectedMonthly: Math.round(projectedMonthlyMrr * 100) / 100,
      activeNumbers: activeNumbers || 0,
      breakdown: Object.entries(mrrByType).map(([type, data]) => ({
        type: type.replace(/_/g, ' '),
        count: data.count,
        revenue: Math.round(data.revenue * 100) / 100,
      })),
    },
    overall: {
      totalRevenue: Math.round(totalCombinedRevenue * 100) / 100,
      usageRevenue: Math.round(totalRevenue * 100) / 100,
      mrrRevenue: Math.round(totalMrr * 100) / 100,
      totalVendorCost: Math.round(totalVendorCost * 100) / 100,
      profit: Math.round(overallProfit * 100) / 100,
      margin: Math.round(overallMargin * 10) / 10,
    },
    voiceBreakdown: voiceCostBreakdown,
    smsBreakdown: smsCostBreakdown,
    monthlyTrend,
    rateCard: {
      voice: {
        retailRate: RETAIL_RATES.voice,
        vendorComponents: [
          { component: 'ElevenLabs TTS', rate: VENDOR_COSTS.tts.elevenlabs, unit: '/min' },
          { component: 'OpenAI TTS', rate: VENDOR_COSTS.tts.openai, unit: '/min' },
          { component: 'Deepgram STT', rate: VENDOR_COSTS.stt.deepgram, unit: '/min' },
          { component: 'SignalWire Telephony', rate: VENDOR_COSTS.telephony.signalwire, unit: '/min' },
          { component: 'LiveKit', rate: VENDOR_COSTS.livekit, unit: '/min' },
          { component: 'GPT-4o', rate: VENDOR_COSTS.llm['gpt-4o'], unit: '/min' },
          { component: 'GPT-4o-mini', rate: VENDOR_COSTS.llm['gpt-4o-mini'], unit: '/min' },
          { component: 'GPT-4.1', rate: VENDOR_COSTS.llm['gpt-4.1'], unit: '/min' },
          { component: 'GPT-4.1-mini', rate: VENDOR_COSTS.llm['gpt-4.1-mini'], unit: '/min' },
          { component: 'GPT-5', rate: VENDOR_COSTS.llm['gpt-5'], unit: '/min' },
          { component: 'GPT-5-mini', rate: VENDOR_COSTS.llm['gpt-5-mini'], unit: '/min' },
          { component: 'GPT-5-nano', rate: VENDOR_COSTS.llm['gpt-5-nano'], unit: '/min' },
        ],
      },
      sms: {
        retailRate: RETAIL_RATES.sms,
        vendorComponents: [
          { component: 'SMS Outbound', rate: VENDOR_COSTS.sms.outbound, unit: '/msg' },
          { component: 'SMS Inbound', rate: VENDOR_COSTS.sms.inbound, unit: '/msg' },
        ],
      },
    },
  }
}
