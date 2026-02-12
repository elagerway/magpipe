/**
 * Admin Status Edge Function
 * Checks health of all critical services: Supabase, SignalWire, LiveKit, Postmark
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  requireAdmin,
  handleCors,
  errorResponse,
  successResponse
} from '../_shared/admin-auth.ts'

interface ServiceStatus {
  name: string
  status: 'operational' | 'degraded' | 'down'
  latency?: number
  message?: string
  statusUrl?: string
}

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

    try {
      await requireAdmin(supabase, token)
    } catch (error) {
      return errorResponse(error.message, 403)
    }

    // Check all services in parallel
    const services = await Promise.all([
      checkSupabase(supabase),
      checkSignalWire(),
      checkLiveKit(),
      checkPostmark(),
      checkRender(),
      checkVercel(),
      checkFirecrawl(),
      checkStripe(),
      checkOpenAI(),
      checkElevenLabs(),
      checkDeepgram(),
      checkHubSpot(supabase),
      checkSlack(supabase),
      checkCalCom(supabase),
    ])

    const allOperational = services.every(s => s.status === 'operational')
    const anyDown = services.some(s => s.status === 'down')

    // Check for vendor status transitions and send notifications
    await checkVendorStatusTransitions(supabase, services)

    return successResponse({
      overall: anyDown ? 'down' : (allOperational ? 'operational' : 'degraded'),
      services,
      checkedAt: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error in admin-status:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})

async function checkSupabase(supabase: ReturnType<typeof createClient>): Promise<ServiceStatus> {
  const start = Date.now()
  const statusUrl = 'https://status.supabase.com/'
  try {
    const { error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .limit(1)

    const latency = Date.now() - start

    if (error) {
      return { name: 'Supabase', status: 'down', latency, message: error.message, statusUrl }
    }

    return {
      name: 'Supabase',
      status: latency > 2000 ? 'degraded' : 'operational',
      latency,
      message: latency > 2000 ? 'High latency' : undefined,
      statusUrl
    }
  } catch (error) {
    return { name: 'Supabase', status: 'down', latency: Date.now() - start, message: error.message, statusUrl }
  }
}

async function checkSignalWire(): Promise<ServiceStatus> {
  const start = Date.now()
  const statusUrl = 'https://status.signalwire.com/'
  const projectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')
  const apiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')
  const spaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL') || 'erik.signalwire.com'

  if (!projectId || !apiToken) {
    return { name: 'SignalWire', status: 'down', message: 'Missing credentials', statusUrl }
  }

  try {
    const response = await fetch(`https://${spaceUrl}/api/relay/rest/phone_numbers?page_size=1`, {
      headers: {
        'Authorization': 'Basic ' + btoa(`${projectId}:${apiToken}`)
      },
      signal: AbortSignal.timeout(5000)
    })

    const latency = Date.now() - start

    if (!response.ok) {
      return { name: 'SignalWire', status: 'down', latency, message: `HTTP ${response.status}`, statusUrl }
    }

    return {
      name: 'SignalWire',
      status: latency > 3000 ? 'degraded' : 'operational',
      latency,
      message: latency > 3000 ? 'High latency' : undefined,
      statusUrl
    }
  } catch (error) {
    return { name: 'SignalWire', status: 'down', latency: Date.now() - start, message: error.message, statusUrl }
  }
}

async function checkLiveKit(): Promise<ServiceStatus> {
  const start = Date.now()
  const statusUrl = 'https://status.livekit.io/'
  const livekitUrl = Deno.env.get('LIVEKIT_URL')

  if (!livekitUrl) {
    return { name: 'LiveKit', status: 'down', message: 'Missing URL', statusUrl }
  }

  try {
    // LiveKit doesn't have a simple health endpoint, so we check if the WebSocket URL is reachable
    // by making an HTTP request to the base URL
    const httpUrl = livekitUrl.replace('wss://', 'https://').replace('ws://', 'http://')

    const response = await fetch(httpUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    })

    const latency = Date.now() - start

    // LiveKit returns various status codes, but if we get a response, it's up
    return {
      name: 'LiveKit',
      status: latency > 3000 ? 'degraded' : 'operational',
      latency,
      message: latency > 3000 ? 'High latency' : undefined,
      statusUrl
    }
  } catch (error) {
    // Connection errors mean it's down, but some errors (like 404) mean it's actually up
    const latency = Date.now() - start
    if (error.name === 'AbortError') {
      return { name: 'LiveKit', status: 'down', latency, message: 'Timeout', statusUrl }
    }
    // If we got any response (even an error), the server is reachable
    return { name: 'LiveKit', status: 'operational', latency, statusUrl }
  }
}

async function checkPostmark(): Promise<ServiceStatus> {
  const start = Date.now()
  const statusUrl = 'https://status.postmarkapp.com/'
  const serverToken = Deno.env.get('POSTMARK_API_KEY') || Deno.env.get('POSTMARK_SERVER_TOKEN')

  if (!serverToken) {
    return { name: 'Postmark', status: 'down', message: 'Missing token', statusUrl }
  }

  try {
    const response = await fetch('https://api.postmarkapp.com/server', {
      headers: {
        'Accept': 'application/json',
        'X-Postmark-Server-Token': serverToken
      },
      signal: AbortSignal.timeout(5000)
    })

    const latency = Date.now() - start

    if (!response.ok) {
      return { name: 'Postmark', status: 'down', latency, message: `HTTP ${response.status}`, statusUrl }
    }

    return {
      name: 'Postmark',
      status: latency > 2000 ? 'degraded' : 'operational',
      latency,
      message: latency > 2000 ? 'High latency' : undefined,
      statusUrl
    }
  } catch (error) {
    return { name: 'Postmark', status: 'down', latency: Date.now() - start, message: error.message, statusUrl }
  }
}

async function checkRender(): Promise<ServiceStatus> {
  const start = Date.now()
  const statusUrl = 'https://status.render.com/'

  try {
    // Check Render's status API
    const response = await fetch('https://status.render.com/api/v2/status.json', {
      signal: AbortSignal.timeout(5000)
    })

    const latency = Date.now() - start

    if (!response.ok) {
      return { name: 'Render', status: 'down', latency, message: `HTTP ${response.status}`, statusUrl }
    }

    const data = await response.json()
    const indicator = data.status?.indicator

    // Render status indicators: none, minor, major, critical
    let status: 'operational' | 'degraded' | 'down' = 'operational'
    if (indicator === 'critical' || indicator === 'major') {
      status = 'down'
    } else if (indicator === 'minor') {
      status = 'degraded'
    }

    return {
      name: 'Render',
      status,
      latency,
      message: indicator !== 'none' ? data.status?.description : undefined,
      statusUrl
    }
  } catch (error) {
    return { name: 'Render', status: 'down', latency: Date.now() - start, message: error.message, statusUrl }
  }
}

async function checkVercel(): Promise<ServiceStatus> {
  const start = Date.now()
  const statusUrl = 'https://www.vercel-status.com/'

  try {
    // Check Vercel's status API
    const response = await fetch('https://www.vercel-status.com/api/v2/status.json', {
      signal: AbortSignal.timeout(5000)
    })

    const latency = Date.now() - start

    if (!response.ok) {
      return { name: 'Vercel', status: 'down', latency, message: `HTTP ${response.status}`, statusUrl }
    }

    const data = await response.json()
    const indicator = data.status?.indicator

    // Vercel status indicators: none, minor, major, critical
    let status: 'operational' | 'degraded' | 'down' = 'operational'
    if (indicator === 'critical' || indicator === 'major') {
      status = 'down'
    } else if (indicator === 'minor') {
      status = 'degraded'
    }

    return {
      name: 'Vercel',
      status,
      latency,
      message: indicator !== 'none' ? data.status?.description : undefined,
      statusUrl
    }
  } catch (error) {
    return { name: 'Vercel', status: 'down', latency: Date.now() - start, message: error.message, statusUrl }
  }
}

async function checkFirecrawl(): Promise<ServiceStatus> {
  const start = Date.now()
  const statusUrl = 'https://firecrawl.dev/'
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY')

  if (!apiKey) {
    return { name: 'Firecrawl', status: 'down', message: 'Not configured', statusUrl }
  }

  try {
    // Use credit usage endpoint instead of wasting credits on test scrape
    const response = await fetch('https://api.firecrawl.dev/v2/team/credit-usage', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      signal: AbortSignal.timeout(10000)
    })

    const latency = Date.now() - start

    if (!response.ok) {
      if (response.status === 401) {
        return { name: 'Firecrawl', status: 'down', latency, message: 'Invalid API key', statusUrl }
      }
      return { name: 'Firecrawl', status: 'down', latency, message: `HTTP ${response.status}`, statusUrl }
    }

    const data = await response.json()
    const remaining = data.data?.remainingCredits ?? 0
    const total = data.data?.planCredits ?? 500

    // Determine status based on remaining credits
    if (remaining <= 0) {
      return {
        name: 'Firecrawl',
        status: 'down',
        latency,
        message: `0 credits - KB scraping disabled`,
        statusUrl
      }
    } else if (remaining < 50) {
      return {
        name: 'Firecrawl',
        status: 'degraded',
        latency,
        message: `${remaining} credits left`,
        statusUrl
      }
    } else {
      return {
        name: 'Firecrawl',
        status: 'operational',
        latency,
        message: `${remaining}/${total} credits`,
        statusUrl
      }
    }
  } catch (error) {
    return { name: 'Firecrawl', status: 'down', latency: Date.now() - start, message: error.message, statusUrl }
  }
}

async function checkStripe(): Promise<ServiceStatus> {
  const start = Date.now()
  const statusUrl = 'https://status.stripe.com/'
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY')

  if (!secretKey) {
    return { name: 'Stripe', status: 'down', message: 'Not configured', statusUrl }
  }

  try {
    const response = await fetch('https://api.stripe.com/v1/balance', {
      headers: {
        'Authorization': `Bearer ${secretKey}`
      },
      signal: AbortSignal.timeout(5000)
    })

    const latency = Date.now() - start

    if (!response.ok) {
      return { name: 'Stripe', status: 'down', latency, message: `HTTP ${response.status}`, statusUrl }
    }

    return {
      name: 'Stripe',
      status: latency > 2000 ? 'degraded' : 'operational',
      latency,
      message: latency > 2000 ? 'High latency' : undefined,
      statusUrl
    }
  } catch (error) {
    return { name: 'Stripe', status: 'down', latency: Date.now() - start, message: error.message, statusUrl }
  }
}

async function checkOpenAI(): Promise<ServiceStatus> {
  const start = Date.now()
  const statusUrl = 'https://status.openai.com/'
  const apiKey = Deno.env.get('OPENAI_API_KEY')

  if (!apiKey) {
    return { name: 'OpenAI', status: 'down', message: 'Not configured', statusUrl }
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      signal: AbortSignal.timeout(5000)
    })

    const latency = Date.now() - start

    if (!response.ok) {
      return { name: 'OpenAI', status: 'down', latency, message: `HTTP ${response.status}`, statusUrl }
    }

    return {
      name: 'OpenAI',
      status: latency > 3000 ? 'degraded' : 'operational',
      latency,
      message: latency > 3000 ? 'High latency' : undefined,
      statusUrl
    }
  } catch (error) {
    return { name: 'OpenAI', status: 'down', latency: Date.now() - start, message: error.message, statusUrl }
  }
}

async function checkElevenLabs(): Promise<ServiceStatus> {
  const start = Date.now()
  const statusUrl = 'https://status.elevenlabs.io/'
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY')

  if (!apiKey) {
    return { name: 'ElevenLabs', status: 'down', message: 'Not configured', statusUrl }
  }

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: {
        'xi-api-key': apiKey
      },
      signal: AbortSignal.timeout(5000)
    })

    const latency = Date.now() - start

    if (!response.ok) {
      return { name: 'ElevenLabs', status: 'down', latency, message: `HTTP ${response.status}`, statusUrl }
    }

    const data = await response.json()
    const used = data.subscription?.character_count ?? 0
    const limit = data.subscription?.character_limit ?? 0
    const remaining = limit - used
    const pctUsed = limit > 0 ? Math.round((used / limit) * 100) : 0

    if (remaining <= 0) {
      return { name: 'ElevenLabs', status: 'down', latency, message: `0 chars left`, statusUrl }
    } else if (pctUsed > 90) {
      return { name: 'ElevenLabs', status: 'degraded', latency, message: `${pctUsed}% used`, statusUrl }
    }

    return {
      name: 'ElevenLabs',
      status: latency > 3000 ? 'degraded' : 'operational',
      latency,
      message: `${pctUsed}% used`,
      statusUrl
    }
  } catch (error) {
    return { name: 'ElevenLabs', status: 'down', latency: Date.now() - start, message: error.message, statusUrl }
  }
}

async function checkDeepgram(): Promise<ServiceStatus> {
  const start = Date.now()
  const statusUrl = 'https://status.deepgram.com/'
  const apiKey = Deno.env.get('DEEPGRAM_API_KEY')

  if (!apiKey) {
    return { name: 'Deepgram', status: 'down', message: 'Not configured', statusUrl }
  }

  try {
    const response = await fetch('https://api.deepgram.com/v1/projects', {
      headers: {
        'Authorization': `Token ${apiKey}`
      },
      signal: AbortSignal.timeout(5000)
    })

    const latency = Date.now() - start

    if (!response.ok) {
      return { name: 'Deepgram', status: 'down', latency, message: `HTTP ${response.status}`, statusUrl }
    }

    return {
      name: 'Deepgram',
      status: latency > 3000 ? 'degraded' : 'operational',
      latency,
      message: latency > 3000 ? 'High latency' : undefined,
      statusUrl
    }
  } catch (error) {
    return { name: 'Deepgram', status: 'down', latency: Date.now() - start, message: error.message, statusUrl }
  }
}

async function checkHubSpot(supabase: ReturnType<typeof createClient>): Promise<ServiceStatus> {
  const start = Date.now()
  const statusUrl = 'https://status.hubspot.com/'

  try {
    // Check if any user has HubSpot connected
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('access_token')
      .eq('provider', 'hubspot')
      .not('access_token', 'is', null)
      .limit(1)
      .single()

    if (!integration) {
      return { name: 'HubSpot', status: 'operational', latency: Date.now() - start, message: 'Not connected', statusUrl }
    }

    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
      headers: {
        'Authorization': `Bearer ${integration.access_token}`
      },
      signal: AbortSignal.timeout(5000)
    })

    const latency = Date.now() - start

    if (response.status === 401) {
      return { name: 'HubSpot', status: 'degraded', latency, message: 'Token expired', statusUrl }
    }

    if (!response.ok) {
      return { name: 'HubSpot', status: 'down', latency, message: `HTTP ${response.status}`, statusUrl }
    }

    return {
      name: 'HubSpot',
      status: latency > 3000 ? 'degraded' : 'operational',
      latency,
      message: latency > 3000 ? 'High latency' : undefined,
      statusUrl
    }
  } catch (error) {
    return { name: 'HubSpot', status: 'down', latency: Date.now() - start, message: error.message, statusUrl }
  }
}

async function checkSlack(supabase: ReturnType<typeof createClient>): Promise<ServiceStatus> {
  const start = Date.now()
  const statusUrl = 'https://status.slack.com/'

  try {
    // Check if any user has Slack connected
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('access_token')
      .eq('provider', 'slack')
      .not('access_token', 'is', null)
      .limit(1)
      .single()

    if (!integration) {
      return { name: 'Slack', status: 'operational', latency: Date.now() - start, message: 'Not connected', statusUrl }
    }

    const response = await fetch('https://slack.com/api/auth.test', {
      headers: {
        'Authorization': `Bearer ${integration.access_token}`
      },
      signal: AbortSignal.timeout(5000)
    })

    const latency = Date.now() - start

    if (!response.ok) {
      return { name: 'Slack', status: 'down', latency, message: `HTTP ${response.status}`, statusUrl }
    }

    const data = await response.json()
    if (!data.ok) {
      return { name: 'Slack', status: 'degraded', latency, message: 'Token invalid', statusUrl }
    }

    return {
      name: 'Slack',
      status: latency > 3000 ? 'degraded' : 'operational',
      latency,
      message: latency > 3000 ? 'High latency' : undefined,
      statusUrl
    }
  } catch (error) {
    return { name: 'Slack', status: 'down', latency: Date.now() - start, message: error.message, statusUrl }
  }
}

async function checkCalCom(supabase: ReturnType<typeof createClient>): Promise<ServiceStatus> {
  const start = Date.now()
  const statusUrl = 'https://cal.com/'

  try {
    // Check if any user has Cal.com connected
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('access_token')
      .eq('provider', 'calcom')
      .not('access_token', 'is', null)
      .limit(1)
      .single()

    if (!integration) {
      return { name: 'Cal.com', status: 'operational', latency: Date.now() - start, message: 'Not connected', statusUrl }
    }

    const response = await fetch('https://api.cal.com/v2/me', {
      headers: {
        'Authorization': `Bearer ${integration.access_token}`
      },
      signal: AbortSignal.timeout(5000)
    })

    const latency = Date.now() - start

    if (response.status === 401) {
      return { name: 'Cal.com', status: 'degraded', latency, message: 'Token expired', statusUrl }
    }

    if (!response.ok) {
      return { name: 'Cal.com', status: 'down', latency, message: `HTTP ${response.status}`, statusUrl }
    }

    return {
      name: 'Cal.com',
      status: latency > 3000 ? 'degraded' : 'operational',
      latency,
      message: latency > 3000 ? 'High latency' : undefined,
      statusUrl
    }
  } catch (error) {
    return { name: 'Cal.com', status: 'down', latency: Date.now() - start, message: error.message, statusUrl }
  }
}


const NOTIF_CONFIG_ID = '00000000-0000-0000-0000-000000000100'

async function checkVendorStatusTransitions(supabase: ReturnType<typeof createClient>, services: ServiceStatus[]) {
  try {
    // Read cached vendor statuses
    const { data: config } = await supabase
      .from('admin_notification_config')
      .select('vendor_status_cache, vendor_status_sms, vendor_status_email, vendor_status_slack')
      .eq('id', NOTIF_CONFIG_ID)
      .single()

    if (!config) return

    const cache: Record<string, string> = config.vendor_status_cache || {}
    const anyEnabled = config.vendor_status_sms || config.vendor_status_email || config.vendor_status_slack

    // Build new status map and detect transitions
    const newCache: Record<string, string> = {}
    const transitions: string[] = []

    for (const svc of services) {
      newCache[svc.name] = svc.status
      const prev = cache[svc.name]
      if (prev && prev !== svc.status) {
        transitions.push(`${svc.name}: ${prev} → ${svc.status}`)
      }
    }

    // Update cache
    await supabase
      .from('admin_notification_config')
      .update({ vendor_status_cache: newCache, updated_at: new Date().toISOString() })
      .eq('id', NOTIF_CONFIG_ID)

    // Send notification if there are transitions and any channel is enabled
    if (transitions.length > 0 && anyEnabled) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

      await fetch(`${supabaseUrl}/functions/v1/admin-send-notification`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: 'vendor_status',
          title: 'Vendor Status Change',
          body: transitions.join('\n'),
        }),
      })
    }
  } catch (e) {
    console.error('Error checking vendor status transitions:', e)
  }
}
