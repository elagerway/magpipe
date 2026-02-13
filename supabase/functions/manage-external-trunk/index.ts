/**
 * Manage External SIP Trunks
 *
 * Creates, updates, and deletes external SIP trunks for users
 * who want to bring their own SIP providers (e.g., Orange West Africa)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { SipClient } from 'npm:livekit-server-sdk@2.14.0'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

// LiveKit SIP domain for this project
const LIVEKIT_SIP_DOMAIN = '378ads1njtd.sip.livekit.cloud'

interface CreateTrunkRequest {
  action: 'create'
  name: string
  provider?: string
  auth_type: 'ip' | 'registration'
  allowed_source_ips?: string[]
  auth_username?: string
  auth_password?: string
  outbound_address?: string
  outbound_transport?: 'udp' | 'tcp' | 'tls'
  api_account_sid?: string
  api_auth_token?: string
}

interface UpdateTrunkRequest {
  action: 'update'
  trunk_id: string
  name?: string
  provider?: string
  auth_type?: 'ip' | 'registration'
  allowed_source_ips?: string[] | null
  auth_username?: string | null
  auth_password?: string | null
  outbound_address?: string | null
  outbound_transport?: 'udp' | 'tcp' | 'tls'
  is_active?: boolean
  api_account_sid?: string | null
  api_auth_token?: string | null
}

interface DeleteTrunkRequest {
  action: 'delete'
  trunk_id: string
}

interface GetSipInfoRequest {
  action: 'get_sip_info'
  trunk_id: string
}

interface ListTrunksRequest {
  action: 'list'
}

type TrunkRequest = CreateTrunkRequest | UpdateTrunkRequest | DeleteTrunkRequest | GetSipInfoRequest | ListTrunksRequest

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Initialize LiveKit client
    const livekitUrl = Deno.env.get('LIVEKIT_URL')!
    const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY')!
    const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET')!
    const sipClient = new SipClient(livekitUrl, livekitApiKey, livekitApiSecret)

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    const body: TrunkRequest = await req.json()
    const { action } = body

    switch (action) {
      case 'create':
        return await handleCreate(supabase, sipClient, user.id, body as CreateTrunkRequest)

      case 'update':
        return await handleUpdate(supabase, sipClient, user.id, body as UpdateTrunkRequest)

      case 'delete':
        return await handleDelete(supabase, sipClient, user.id, body as DeleteTrunkRequest)

      case 'get_sip_info':
        return await handleGetSipInfo(supabase, user.id, body as GetSipInfoRequest)

      case 'list':
        return await handleList(supabase, user.id)

      default:
        throw new Error(`Unknown action: ${action}`)
    }
  } catch (error) {
    console.error('Error in manage-external-trunk:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function handleCreate(
  supabase: any,
  sipClient: SipClient,
  userId: string,
  request: CreateTrunkRequest
) {
  const { name, provider, auth_type, allowed_source_ips, auth_username, auth_password, outbound_address, outbound_transport, api_account_sid, api_auth_token } = request

  // Validate auth type specific fields
  if (auth_type === 'ip' && (!allowed_source_ips || allowed_source_ips.length === 0)) {
    throw new Error('IP-based auth requires at least one allowed source IP')
  }

  if (auth_type === 'registration' && (!auth_username || !auth_password)) {
    throw new Error('Registration auth requires username and password')
  }

  console.log(`Creating external trunk configuration for user ${userId}: ${name}`)

  // NOTE: We don't create the LiveKit trunk yet - it will be created when the first
  // phone number is added via manage-external-numbers. This avoids conflicts with
  // LiveKit's rule that trunks without numbers match "any" number.

  // Store trunk configuration in database with pending status
  const trunkData = {
    user_id: userId,
    name,
    provider: provider || null,
    auth_type,
    allowed_source_ips: auth_type === 'ip' ? allowed_source_ips : null,
    auth_username: auth_type === 'registration' ? auth_username : null,
    auth_password_encrypted: auth_type === 'registration' ? auth_password : null, // TODO: Encrypt
    outbound_address: outbound_address || null,
    outbound_transport: outbound_transport || 'udp',
    api_account_sid: api_account_sid || null,
    api_auth_token_encrypted: api_auth_token || null, // TODO: Encrypt
    livekit_inbound_trunk_id: null, // Created when first number is added
    livekit_dispatch_rule_id: null, // Created when first number is added
    status: 'pending', // Will become 'active' when LiveKit trunk is created
    is_active: true,
  }

  const { data: trunk, error: insertError } = await supabase
    .from('external_sip_trunks')
    .insert(trunkData)
    .select()
    .single()

  if (insertError) {
    throw new Error(`Failed to save trunk: ${insertError.message}`)
  }

  return new Response(
    JSON.stringify({
      success: true,
      trunk,
      sip_info: {
        domain: LIVEKIT_SIP_DOMAIN,
        protocol: 'UDP, TCP, or TLS',
        port: '5060 (UDP/TCP) or 5061 (TLS)',
        note: 'Add phone numbers to activate this trunk. The LiveKit SIP trunk will be created when the first number is added.'
      }
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleUpdate(
  supabase: any,
  sipClient: SipClient,
  userId: string,
  request: UpdateTrunkRequest
) {
  const { trunk_id, name, provider, auth_type, allowed_source_ips, auth_username, auth_password, outbound_address, outbound_transport, is_active, api_account_sid, api_auth_token } = request

  // Verify ownership
  const { data: trunk, error: fetchError } = await supabase
    .from('external_sip_trunks')
    .select('*')
    .eq('id', trunk_id)
    .eq('user_id', userId)
    .single()

  if (fetchError || !trunk) {
    throw new Error('Trunk not found or access denied')
  }

  // Build update object
  const updates: any = {}
  if (name !== undefined) updates.name = name
  if (provider !== undefined) updates.provider = provider
  if (auth_type !== undefined) updates.auth_type = auth_type
  if (allowed_source_ips !== undefined) updates.allowed_source_ips = allowed_source_ips
  if (auth_username !== undefined) updates.auth_username = auth_username
  if (auth_password !== undefined) updates.auth_password_encrypted = auth_password // TODO: Encrypt
  if (outbound_address !== undefined) updates.outbound_address = outbound_address
  if (outbound_transport !== undefined) updates.outbound_transport = outbound_transport
  if (is_active !== undefined) updates.is_active = is_active
  if (api_account_sid !== undefined) updates.api_account_sid = api_account_sid
  if (api_auth_token !== undefined) updates.api_auth_token_encrypted = api_auth_token

  // Update LiveKit trunk if IP addresses changed
  if (allowed_source_ips && trunk.livekit_inbound_trunk_id) {
    try {
      // LiveKit SDK may have updateSipInboundTrunk method
      // For now, we may need to recreate - check SDK capabilities
      console.log('Updating LiveKit trunk allowed addresses')
      // Note: May need to implement trunk update differently based on SDK
    } catch (lkError) {
      console.error('LiveKit trunk update error:', lkError)
    }
  }

  const { data: updatedTrunk, error: updateError } = await supabase
    .from('external_sip_trunks')
    .update(updates)
    .eq('id', trunk_id)
    .select()
    .single()

  if (updateError) {
    throw new Error(`Failed to update trunk: ${updateError.message}`)
  }

  return new Response(
    JSON.stringify({ success: true, trunk: updatedTrunk }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleDelete(
  supabase: any,
  sipClient: SipClient,
  userId: string,
  request: DeleteTrunkRequest
) {
  const { trunk_id } = request

  // Verify ownership and get trunk details
  const { data: trunk, error: fetchError } = await supabase
    .from('external_sip_trunks')
    .select('*')
    .eq('id', trunk_id)
    .eq('user_id', userId)
    .single()

  if (fetchError || !trunk) {
    throw new Error('Trunk not found or access denied')
  }

  // Delete LiveKit resources
  if (trunk.livekit_dispatch_rule_id) {
    try {
      await sipClient.deleteSipDispatchRule(trunk.livekit_dispatch_rule_id)
      console.log('Deleted LiveKit dispatch rule:', trunk.livekit_dispatch_rule_id)
    } catch (lkError) {
      console.error('Error deleting dispatch rule:', lkError)
    }
  }

  if (trunk.livekit_inbound_trunk_id) {
    try {
      await sipClient.deleteSipTrunk(trunk.livekit_inbound_trunk_id)
      console.log('Deleted LiveKit trunk:', trunk.livekit_inbound_trunk_id)
    } catch (lkError) {
      console.error('Error deleting trunk:', lkError)
    }
  }

  // Delete from database (will cascade to external_sip_numbers)
  const { error: deleteError } = await supabase
    .from('external_sip_trunks')
    .delete()
    .eq('id', trunk_id)

  if (deleteError) {
    throw new Error(`Failed to delete trunk: ${deleteError.message}`)
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleGetSipInfo(
  supabase: any,
  userId: string,
  request: GetSipInfoRequest
) {
  const { trunk_id } = request

  // Verify ownership and get trunk details
  const { data: trunk, error: fetchError } = await supabase
    .from('external_sip_trunks')
    .select(`
      *,
      external_sip_numbers (phone_number, friendly_name, is_active)
    `)
    .eq('id', trunk_id)
    .eq('user_id', userId)
    .single()

  if (fetchError || !trunk) {
    throw new Error('Trunk not found or access denied')
  }

  // Build SIP connection info for user to configure their provider
  const numbers = trunk.external_sip_numbers || []
  const sipUris = numbers
    .filter((n: any) => n.is_active)
    .map((n: any) => `sip:${n.phone_number}@${LIVEKIT_SIP_DOMAIN}`)

  return new Response(
    JSON.stringify({
      success: true,
      trunk: {
        id: trunk.id,
        name: trunk.name,
        provider: trunk.provider,
        auth_type: trunk.auth_type,
        status: trunk.status,
        is_active: trunk.is_active,
      },
      sip_info: {
        domain: LIVEKIT_SIP_DOMAIN,
        protocol: 'UDP, TCP, or TLS (TLS recommended)',
        port_udp_tcp: 5060,
        port_tls: 5061,
        sip_uris: sipUris,
        numbers: numbers,
        auth_type: trunk.auth_type,
        auth_username: trunk.auth_type === 'registration' ? trunk.auth_username : null,
        allowed_ips: trunk.auth_type === 'ip' ? trunk.allowed_source_ips : null,
        instructions: trunk.auth_type === 'ip'
          ? 'Configure your SIP provider to send calls from the whitelisted IP addresses to the SIP URIs above.'
          : 'Configure your SIP provider with the username/password and send calls to the SIP URIs above.'
      }
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleList(supabase: any, userId: string) {
  const { data: trunks, error } = await supabase
    .from('external_sip_trunks')
    .select(`
      *,
      external_sip_numbers (id, phone_number, friendly_name, is_active)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to list trunks: ${error.message}`)
  }

  return new Response(
    JSON.stringify({ success: true, trunks: trunks || [] }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
