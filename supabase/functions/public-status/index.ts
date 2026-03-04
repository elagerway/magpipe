/**
 * Public Status Edge Function
 * Returns service health grouped by user-facing categories.
 * No authentication required. Results cached for 30s.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

type Status = 'operational' | 'degraded' | 'down'

interface ServiceResult {
  status: Status
  latency: number
  detail?: string
}

interface CategoryResult {
  name: string
  status: Status
  latency: number
  detail?: string
}

// In-memory cache
let cachedResponse: string | null = null
let cacheTimestamp = 0
const CACHE_TTL = 30_000 // 30 seconds

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  const url = new URL(req.url)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  // History mode: return 90-day aggregated uptime data
  if (url.searchParams.get('history') === 'true') {
    try {
      const viewerTz = url.searchParams.get('tz') || 'UTC'
      const { data, error } = await supabase.rpc('get_status_history', { viewer_tz: viewerTz })
      if (error) throw error
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } catch (error) {
      console.error('Error fetching history:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch history' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  try {
    const now = Date.now()

    // Return cached response if fresh
    if (cachedResponse && (now - cacheTimestamp) < CACHE_TTL) {
      return new Response(cachedResponse, {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Run all checks in parallel
    const [
      supabaseResult,
      apisResult,
      vercelResult,
      livekitResult,
      elevenLabsResult,
      deepgramResult,
      signalWireResult,
      postmarkResult,
      openaiResult,
      stripeResult,
      firecrawlResult,
      hubspotResult,
      slackResult,
      calcomResult,
    ] = await Promise.all([
      checkSupabase(supabase),
      checkAPIs(),
      checkVercel(),
      checkLiveKit(),
      checkElevenLabs(),
      checkDeepgram(),
      checkSignalWire(),
      checkPostmark(),
      checkOpenAI(),
      checkStripe(),
      checkFirecrawl(),
      checkHubSpot(supabase),
      checkSlack(supabase),
      checkCalCom(supabase),
    ])

    // Build categories
    const categories: CategoryResult[] = [
      { name: 'Platform', ...supabaseResult },
      { name: 'APIs', ...apisResult },
      { name: 'Web App', ...vercelResult },
      { name: 'Voice AI', ...worstOf([livekitResult, elevenLabsResult, deepgramResult]) },
      { name: 'Telephony', ...signalWireResult },
      { name: 'SMS', ...signalWireResult },
      { name: 'Email', ...postmarkResult },
      { name: 'AI Engine', ...openaiResult },
      { name: 'Payments', ...stripeResult },
      { name: 'Knowledge Base', ...firecrawlResult },
      { name: 'HubSpot', ...hubspotResult },
      { name: 'Slack', ...slackResult },
      { name: 'Calendar', ...calcomResult },
    ]

    const allOperational = categories.every(c => c.status === 'operational')
    const anyDown = categories.some(c => c.status === 'down')

    const body = JSON.stringify({
      overall: anyDown ? 'down' : (allOperational ? 'operational' : 'degraded'),
      categories,
      checked_at: new Date().toISOString(),
    })

    // Log results to status_log (fire-and-forget)
    const checkedAt = new Date().toISOString()
    const rows = categories.map(c => ({
      checked_at: checkedAt,
      category: c.name,
      status: c.status,
      latency: c.latency,
      detail: c.detail || null,
    }))
    supabase.from('status_log').insert(rows).then(({ error }) => {
      if (error) console.error('Failed to log status:', error)
    })

    // Cache the response
    cachedResponse = body
    cacheTimestamp = Date.now()

    return new Response(body, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in public-status:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// --- Category aggregation ---

const STATUS_WEIGHT: Record<Status, number> = { operational: 0, degraded: 1, down: 2 }

function worstOf(results: ServiceResult[]): ServiceResult {
  let worst: Status = 'operational'
  let maxLatency = 0
  const details: string[] = []
  for (const r of results) {
    if (STATUS_WEIGHT[r.status] > STATUS_WEIGHT[worst]) worst = r.status
    if (r.latency > maxLatency) maxLatency = r.latency
    if (r.detail && r.status !== 'operational') details.push(r.detail)
  }
  return { status: worst, latency: maxLatency, detail: details.length ? details.join('; ') : undefined }
}

// --- Error message helper ---

function friendlyError(e: unknown): string {
  const msg = (e as Error)?.message || 'Unknown error'
  if (msg.includes('timed out') || msg.includes('AbortError') || msg.includes('signal')) return 'Request timeout'
  if (msg.includes('NetworkError') || msg.includes('fetch failed')) return 'Service unreachable'
  if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) return 'Connection refused'
  return msg
}

// --- Statuspage.io incident helper ---

async function fetchIncidents(baseUrl: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${baseUrl}/api/v2/incidents/unresolved.json`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return undefined
    const data = await res.json()
    const incidents = data.incidents as Array<{ name: string; status: string; components?: Array<{ name: string }> }>
    if (!incidents?.length) return undefined
    // Return incident names with affected components
    return incidents.map(i => {
      const comps = i.components?.map(c => c.name).join(', ')
      return comps ? `${i.name} (${comps})` : i.name
    }).join('; ')
  } catch {
    return undefined
  }
}

// --- Individual health checks ---

async function checkSupabase(supabase: ReturnType<typeof createClient>): Promise<ServiceResult> {
  const start = Date.now()
  try {
    const { error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .limit(1)
    const latency = Date.now() - start
    if (error) return { status: 'down', latency, detail: error.message }
    if (latency > 2000) return { status: 'degraded', latency, detail: 'High latency' }
    return { status: 'operational', latency }
  } catch (e) {
    return { status: 'down', latency: Date.now() - start, detail: friendlyError(e) }
  }
}

async function checkAPIs(): Promise<ServiceResult> {
  const start = Date.now()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: { 'apikey': supabaseKey },
      signal: AbortSignal.timeout(5000),
    })
    const latency = Date.now() - start
    if (!response.ok) return { status: 'down', latency, detail: `HTTP ${response.status}` }
    if (latency > 2000) return { status: 'degraded', latency, detail: 'High latency' }
    return { status: 'operational', latency }
  } catch (e) {
    return { status: 'down', latency: Date.now() - start, detail: friendlyError(e) }
  }
}

async function checkVercel(): Promise<ServiceResult> {
  const start = Date.now()
  try {
    const [statusRes, incidents] = await Promise.all([
      fetch('https://www.vercel-status.com/api/v2/status.json', { signal: AbortSignal.timeout(5000) }),
      fetchIncidents('https://www.vercel-status.com'),
    ])
    const latency = Date.now() - start
    if (!statusRes.ok) return { status: 'down', latency, detail: incidents || `HTTP ${statusRes.status}` }
    const data = await statusRes.json()
    const indicator = data.status?.indicator
    if (indicator === 'critical') return { status: 'down', latency, detail: incidents || data.status?.description }
    if (indicator === 'major' || indicator === 'minor') return { status: 'degraded', latency, detail: incidents || data.status?.description }
    return { status: 'operational', latency }
  } catch (e) {
    return { status: 'down', latency: Date.now() - start, detail: friendlyError(e) }
  }
}

async function checkLiveKit(): Promise<ServiceResult> {
  const start = Date.now()
  const livekitUrl = Deno.env.get('LIVEKIT_URL')
  if (!livekitUrl) return { status: 'down', latency: 0, detail: 'Not configured' }
  try {
    const httpUrl = livekitUrl.replace('wss://', 'https://').replace('ws://', 'http://')
    const [, incidents] = await Promise.all([
      fetch(httpUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) }),
      fetchIncidents('https://status.livekit.io'),
    ])
    const latency = Date.now() - start
    if (incidents) return { status: 'degraded', latency, detail: incidents }
    if (latency > 3000) return { status: 'degraded', latency, detail: 'High latency' }
    return { status: 'operational', latency }
  } catch (error) {
    const latency = Date.now() - start
    if (error.name === 'AbortError') return { status: 'down', latency, detail: 'Timeout' }
    return { status: 'operational', latency }
  }
}

async function checkElevenLabs(): Promise<ServiceResult> {
  const start = Date.now()
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY')
  if (!apiKey) return { status: 'down', latency: 0, detail: 'Not configured' }
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(5000),
    })
    const latency = Date.now() - start
    if (!response.ok) return { status: 'down', latency, detail: `HTTP ${response.status}` }
    const data = await response.json()
    const used = data.subscription?.character_count ?? 0
    const limit = data.subscription?.character_limit ?? 0
    const remaining = limit - used
    const pctUsed = limit > 0 ? Math.round((used / limit) * 100) : 0
    if (remaining <= 0) return { status: 'down', latency, detail: '0 voice characters remaining' }
    if (pctUsed > 90) return { status: 'degraded', latency, detail: `${pctUsed}% voice quota used` }
    if (latency > 3000) return { status: 'degraded', latency, detail: 'High latency' }
    return { status: 'operational', latency, detail: `${pctUsed}% voice quota used` }
  } catch (e) {
    return { status: 'down', latency: Date.now() - start, detail: friendlyError(e) }
  }
}

async function checkDeepgram(): Promise<ServiceResult> {
  const start = Date.now()
  const apiKey = Deno.env.get('DEEPGRAM_API_KEY')
  if (!apiKey) return { status: 'down', latency: 0, detail: 'Not configured' }
  try {
    const [response, incidents] = await Promise.all([
      fetch('https://api.deepgram.com/v1/projects', {
        headers: { 'Authorization': `Token ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      }),
      fetchIncidents('https://status.deepgram.com'),
    ])
    const latency = Date.now() - start
    if (!response.ok) return { status: 'down', latency, detail: incidents || `HTTP ${response.status}` }
    if (incidents) return { status: 'degraded', latency, detail: incidents }
    if (latency > 3000) return { status: 'degraded', latency, detail: 'High latency' }
    return { status: 'operational', latency }
  } catch (e) {
    return { status: 'down', latency: Date.now() - start, detail: friendlyError(e) }
  }
}

async function checkSignalWire(): Promise<ServiceResult> {
  const start = Date.now()
  const projectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')
  const apiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')
  const spaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL') || 'erik.signalwire.com'
  if (!projectId || !apiToken) return { status: 'down', latency: 0, detail: 'Not configured' }
  try {
    const response = await fetch(`https://${spaceUrl}/api/relay/rest/phone_numbers?page_size=1`, {
      headers: { 'Authorization': 'Basic ' + btoa(`${projectId}:${apiToken}`) },
      signal: AbortSignal.timeout(5000),
    })
    const latency = Date.now() - start
    if (!response.ok) return { status: 'down', latency, detail: `HTTP ${response.status}` }
    if (latency > 3000) return { status: 'degraded', latency, detail: 'High latency' }
    return { status: 'operational', latency }
  } catch (e) {
    return { status: 'down', latency: Date.now() - start, detail: friendlyError(e) }
  }
}

async function checkPostmark(): Promise<ServiceResult> {
  const start = Date.now()
  const serverToken = Deno.env.get('POSTMARK_API_KEY') || Deno.env.get('POSTMARK_SERVER_TOKEN')
  if (!serverToken) return { status: 'down', latency: 0, detail: 'Not configured' }
  try {
    const response = await fetch('https://api.postmarkapp.com/server', {
      headers: { 'Accept': 'application/json', 'X-Postmark-Server-Token': serverToken },
      signal: AbortSignal.timeout(5000),
    })
    const latency = Date.now() - start
    if (!response.ok) return { status: 'down', latency, detail: `HTTP ${response.status}` }
    if (latency > 2000) return { status: 'degraded', latency, detail: 'High latency' }
    return { status: 'operational', latency }
  } catch (e) {
    return { status: 'down', latency: Date.now() - start, detail: friendlyError(e) }
  }
}

async function checkOpenAI(): Promise<ServiceResult> {
  const start = Date.now()
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) return { status: 'down', latency: 0, detail: 'Not configured' }
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    const latency = Date.now() - start
    if (!response.ok) return { status: 'down', latency, detail: `HTTP ${response.status}` }
    if (latency > 3000) return { status: 'degraded', latency, detail: 'High latency' }
    return { status: 'operational', latency }
  } catch (e) {
    return { status: 'down', latency: Date.now() - start, detail: friendlyError(e) }
  }
}

async function checkStripe(): Promise<ServiceResult> {
  const start = Date.now()
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!secretKey) return { status: 'down', latency: 0, detail: 'Not configured' }
  try {
    const response = await fetch('https://api.stripe.com/v1/balance', {
      headers: { 'Authorization': `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(5000),
    })
    const latency = Date.now() - start
    if (!response.ok) return { status: 'down', latency, detail: `HTTP ${response.status}` }
    if (latency > 2000) return { status: 'degraded', latency, detail: 'High latency' }
    return { status: 'operational', latency }
  } catch (e) {
    return { status: 'down', latency: Date.now() - start, detail: friendlyError(e) }
  }
}

async function checkFirecrawl(): Promise<ServiceResult> {
  const start = Date.now()
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY')
  if (!apiKey) return { status: 'down', latency: 0, detail: 'Not configured' }
  try {
    const response = await fetch('https://api.firecrawl.dev/v2/team/credit-usage', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    })
    const latency = Date.now() - start
    if (!response.ok) return { status: 'down', latency, detail: `HTTP ${response.status}` }
    const data = await response.json()
    const remaining = data.data?.remainingCredits ?? 0
    const total = data.data?.planCredits ?? 500
    if (remaining <= 0) return { status: 'down', latency, detail: '0 credits — scraping disabled' }
    if (remaining < 50) return { status: 'degraded', latency, detail: `${remaining} credits remaining` }
    return { status: 'operational', latency, detail: `${remaining}/${total} credits` }
  } catch (e) {
    return { status: 'down', latency: Date.now() - start, detail: friendlyError(e) }
  }
}

async function checkHubSpot(supabase: ReturnType<typeof createClient>): Promise<ServiceResult> {
  const start = Date.now()
  try {
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('access_token')
      .eq('provider', 'hubspot')
      .not('access_token', 'is', null)
      .limit(1)
      .single()
    if (!integration) return { status: 'operational', latency: Date.now() - start, detail: 'Not connected' }
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
      headers: { 'Authorization': `Bearer ${integration.access_token}` },
      signal: AbortSignal.timeout(5000),
    })
    const latency = Date.now() - start
    if (response.status === 401) return { status: 'degraded', latency, detail: 'Token expired' }
    if (!response.ok) return { status: 'down', latency, detail: `HTTP ${response.status}` }
    if (latency > 3000) return { status: 'degraded', latency, detail: 'High latency' }
    return { status: 'operational', latency }
  } catch (e) {
    return { status: 'down', latency: Date.now() - start, detail: friendlyError(e) }
  }
}

async function checkSlack(supabase: ReturnType<typeof createClient>): Promise<ServiceResult> {
  const start = Date.now()
  try {
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('access_token')
      .eq('provider', 'slack')
      .not('access_token', 'is', null)
      .limit(1)
      .single()
    if (!integration) return { status: 'operational', latency: Date.now() - start, detail: 'Not connected' }
    const response = await fetch('https://slack.com/api/auth.test', {
      headers: { 'Authorization': `Bearer ${integration.access_token}` },
      signal: AbortSignal.timeout(5000),
    })
    const latency = Date.now() - start
    if (!response.ok) return { status: 'down', latency, detail: `HTTP ${response.status}` }
    const data = await response.json()
    if (!data.ok) return { status: 'degraded', latency, detail: 'Token invalid' }
    if (latency > 3000) return { status: 'degraded', latency, detail: 'High latency' }
    return { status: 'operational', latency }
  } catch (e) {
    return { status: 'down', latency: Date.now() - start, detail: friendlyError(e) }
  }
}

async function checkCalCom(supabase: ReturnType<typeof createClient>): Promise<ServiceResult> {
  const start = Date.now()
  try {
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('access_token')
      .eq('provider', 'calcom')
      .not('access_token', 'is', null)
      .limit(1)
      .single()
    if (!integration) return { status: 'operational', latency: Date.now() - start, detail: 'Not connected' }
    const response = await fetch('https://api.cal.com/v2/me', {
      headers: { 'Authorization': `Bearer ${integration.access_token}` },
      signal: AbortSignal.timeout(5000),
    })
    const latency = Date.now() - start
    if (response.status === 401) return { status: 'degraded', latency, detail: 'Token expired' }
    if (!response.ok) return { status: 'down', latency, detail: `HTTP ${response.status}` }
    if (latency > 3000) return { status: 'degraded', latency, detail: 'High latency' }
    return { status: 'operational', latency }
  } catch (e) {
    return { status: 'down', latency: Date.now() - start, detail: friendlyError(e) }
  }
}
