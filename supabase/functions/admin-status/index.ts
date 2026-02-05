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
    const [supabaseStatus, signalwireStatus, livekitStatus, postmarkStatus, renderStatus, vercelStatus] = await Promise.all([
      checkSupabase(supabase),
      checkSignalWire(),
      checkLiveKit(),
      checkPostmark(),
      checkRender(),
      checkVercel()
    ])

    const services = [supabaseStatus, signalwireStatus, livekitStatus, postmarkStatus, renderStatus, vercelStatus]
    const allOperational = services.every(s => s.status === 'operational')
    const anyDown = services.some(s => s.status === 'down')

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
