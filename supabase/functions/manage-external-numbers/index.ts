/**
 * Manage External SIP Numbers
 *
 * Adds, removes, and updates phone numbers associated with external SIP trunks
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SipClient } from 'npm:livekit-server-sdk@2.14.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AddNumberRequest {
  action: 'add'
  trunk_id: string
  phone_number: string
  friendly_name?: string
  country_code?: string
}

interface RemoveNumberRequest {
  action: 'remove'
  number_id: string
}

interface UpdateNumberRequest {
  action: 'update'
  number_id: string
  friendly_name?: string
  is_active?: boolean
}

interface ListNumbersRequest {
  action: 'list'
  trunk_id: string
}

type NumberRequest = AddNumberRequest | RemoveNumberRequest | UpdateNumberRequest | ListNumbersRequest

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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

    const body: NumberRequest = await req.json()
    const { action } = body

    switch (action) {
      case 'add':
        return await handleAdd(supabase, sipClient, user.id, body as AddNumberRequest)

      case 'remove':
        return await handleRemove(supabase, sipClient, user.id, body as RemoveNumberRequest)

      case 'update':
        return await handleUpdate(supabase, user.id, body as UpdateNumberRequest)

      case 'list':
        return await handleList(supabase, user.id, body as ListNumbersRequest)

      default:
        throw new Error(`Unknown action: ${action}`)
    }
  } catch (error) {
    console.error('Error in manage-external-numbers:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function handleAdd(
  supabase: any,
  sipClient: SipClient,
  userId: string,
  request: AddNumberRequest
) {
  const { trunk_id, phone_number, friendly_name, country_code } = request

  // Validate E.164 format
  if (!phone_number.match(/^\+[1-9]\d{1,14}$/)) {
    throw new Error('Phone number must be in E.164 format (e.g., +237xxxxxxxxx)')
  }

  // Verify trunk ownership
  const { data: trunk, error: trunkError } = await supabase
    .from('external_sip_trunks')
    .select('*')
    .eq('id', trunk_id)
    .eq('user_id', userId)
    .single()

  if (trunkError || !trunk) {
    throw new Error('Trunk not found or access denied')
  }

  // Check if number already exists (globally unique)
  const { data: existingNumber } = await supabase
    .from('external_sip_numbers')
    .select('id')
    .eq('phone_number', phone_number)
    .single()

  if (existingNumber) {
    throw new Error('This phone number is already registered')
  }

  console.log(`Adding number ${phone_number} to trunk ${trunk_id}`)

  // Insert number into database first
  const { data: newNumber, error: insertError } = await supabase
    .from('external_sip_numbers')
    .insert({
      user_id: userId,
      trunk_id,
      phone_number,
      friendly_name: friendly_name || null,
      country_code: country_code || null,
      is_active: true,
    })
    .select()
    .single()

  if (insertError) {
    throw new Error(`Failed to add number: ${insertError.message}`)
  }

  // Get all active numbers for this trunk
  const { data: allNumbers } = await supabase
    .from('external_sip_numbers')
    .select('phone_number')
    .eq('trunk_id', trunk_id)
    .eq('is_active', true)

  const numbersList = allNumbers?.map((n: any) => n.phone_number) || []

  // Check if we need to create the LiveKit trunk (first number being added)
  if (!trunk.livekit_inbound_trunk_id) {
    console.log('Creating LiveKit trunk for first number...')

    // Build trunk options based on auth type
    const trunkName = `Maggie-${userId.substring(0, 8)}-${trunk.name}`
    const trunkOptions: any = {
      metadata: JSON.stringify({ user_id: userId, trunk_name: trunk.name }),
    }

    if (trunk.auth_type === 'ip' && trunk.allowed_source_ips) {
      trunkOptions.allowedAddresses = trunk.allowed_source_ips
    } else if (trunk.auth_type === 'registration') {
      trunkOptions.authUsername = trunk.auth_username
      trunkOptions.authPassword = trunk.auth_password_encrypted // Note: Should be decrypted if encrypted
    }

    let livekitTrunk
    let dispatchRule

    try {
      // Create LiveKit inbound trunk with the number(s)
      livekitTrunk = await sipClient.createSipInboundTrunk(trunkName, numbersList, trunkOptions)
      console.log('LiveKit inbound trunk created:', livekitTrunk.sipTrunkId)
    } catch (lkError) {
      console.error('LiveKit trunk creation error:', lkError)
      // Don't fail - number is in DB, we can retry later
      return new Response(
        JSON.stringify({
          success: true,
          number: newNumber,
          warning: `Number added but LiveKit trunk creation failed: ${lkError.message}. Please contact support.`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    try {
      // Create dispatch rule for this trunk
      // CRITICAL: Must include roomConfig.agents with agentName matching the registered agent
      // Without this, LiveKit creates the room but doesn't dispatch the agent to join
      const rule = {
        type: 'individual' as const,
        roomPrefix: 'call-'  // Use same prefix as SignalWire so agent picks up
      }
      const dispatchOptions = {
        name: `External-${trunk.name}`,
        trunkIds: [livekitTrunk.sipTrunkId],
        inboundNumbers: ['+1'],  // Accept all numbers
        roomConfig: {
          agents: [{ agentName: 'SW Telephony Agent' }]  // CRITICAL: Must match agent registration
        }
      }
      dispatchRule = await sipClient.createSipDispatchRule(rule, dispatchOptions)
      console.log('LiveKit dispatch rule created:', dispatchRule.sipDispatchRuleId)
    } catch (drError) {
      console.error('Dispatch rule creation error:', drError)
      // Clean up trunk
      try {
        await sipClient.deleteSipTrunk(livekitTrunk.sipTrunkId)
      } catch {}
      return new Response(
        JSON.stringify({
          success: true,
          number: newNumber,
          warning: `Number added but LiveKit dispatch rule creation failed: ${drError.message}. Please contact support.`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update trunk record with LiveKit IDs and set status to active
    const { error: updateError } = await supabase
      .from('external_sip_trunks')
      .update({
        livekit_inbound_trunk_id: livekitTrunk.sipTrunkId,
        livekit_dispatch_rule_id: dispatchRule.sipDispatchRuleId,
        status: 'active',
      })
      .eq('id', trunk_id)

    if (updateError) {
      console.error('Failed to update trunk record:', updateError)
      // LiveKit resources are created, log the IDs for manual recovery
      console.log('Manual recovery info:', {
        trunk_id,
        livekit_inbound_trunk_id: livekitTrunk.sipTrunkId,
        livekit_dispatch_rule_id: dispatchRule.sipDispatchRuleId
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        number: newNumber,
        trunk_activated: true,
        note: 'Number added and SIP trunk activated. Configure your SIP provider to route this number to LiveKit.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Trunk already exists - need to delete and recreate with updated numbers
  // LiveKit SDK doesn't support updating trunk numbers in place
  console.log('LiveKit trunk exists, recreating with updated numbers:', numbersList)

  try {
    // Delete old dispatch rule first (it references the trunk)
    if (trunk.livekit_dispatch_rule_id) {
      try {
        await sipClient.deleteSipDispatchRule(trunk.livekit_dispatch_rule_id)
        console.log('Deleted old dispatch rule:', trunk.livekit_dispatch_rule_id)
      } catch (drError) {
        console.error('Error deleting old dispatch rule:', drError)
        // Continue - may already be deleted
      }
    }

    // Delete old trunk
    await sipClient.deleteSipTrunk(trunk.livekit_inbound_trunk_id)
    console.log('Deleted old LiveKit trunk:', trunk.livekit_inbound_trunk_id)

    // Recreate trunk with all numbers
    const trunkName = `Maggie-${userId.substring(0, 8)}-${trunk.name}`
    const trunkOptions: any = {
      metadata: JSON.stringify({ user_id: userId, trunk_name: trunk.name }),
    }

    if (trunk.auth_type === 'ip' && trunk.allowed_source_ips) {
      trunkOptions.allowedAddresses = trunk.allowed_source_ips
    } else if (trunk.auth_type === 'registration') {
      trunkOptions.authUsername = trunk.auth_username
      trunkOptions.authPassword = trunk.auth_password_encrypted
    }

    const newLivekitTrunk = await sipClient.createSipInboundTrunk(trunkName, numbersList, trunkOptions)
    console.log('Created new LiveKit trunk with all numbers:', newLivekitTrunk.sipTrunkId)

    // Recreate dispatch rule
    const rule = {
      type: 'individual' as const,
      roomPrefix: 'call-'
    }
    const dispatchOptions = {
      name: `External-${trunk.name}`,
      trunkIds: [newLivekitTrunk.sipTrunkId],
      inboundNumbers: ['+1'],
      roomConfig: {
        agents: [{ agentName: 'SW Telephony Agent' }]
      }
    }
    const newDispatchRule = await sipClient.createSipDispatchRule(rule, dispatchOptions)
    console.log('Created new dispatch rule:', newDispatchRule.sipDispatchRuleId)

    // Update trunk record with new LiveKit IDs
    await supabase
      .from('external_sip_trunks')
      .update({
        livekit_inbound_trunk_id: newLivekitTrunk.sipTrunkId,
        livekit_dispatch_rule_id: newDispatchRule.sipDispatchRuleId,
      })
      .eq('id', trunk_id)

    return new Response(
      JSON.stringify({
        success: true,
        number: newNumber,
        note: 'Number added and LiveKit trunk updated with all numbers.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (lkError) {
    console.error('Error updating LiveKit trunk:', lkError)
    return new Response(
      JSON.stringify({
        success: true,
        number: newNumber,
        warning: `Number added to database but LiveKit trunk update failed: ${lkError.message}. You may need to delete and recreate the trunk.`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleRemove(
  supabase: any,
  sipClient: SipClient,
  userId: string,
  request: RemoveNumberRequest
) {
  const { number_id } = request

  // Verify ownership and get number details with full trunk info
  const { data: number, error: fetchError } = await supabase
    .from('external_sip_numbers')
    .select('*, external_sip_trunks!inner(*)')
    .eq('id', number_id)
    .eq('user_id', userId)
    .single()

  if (fetchError || !number) {
    throw new Error('Number not found or access denied')
  }

  const trunk = number.external_sip_trunks
  const trunkId = number.trunk_id

  // Delete from database first
  const { error: deleteError } = await supabase
    .from('external_sip_numbers')
    .delete()
    .eq('id', number_id)

  if (deleteError) {
    throw new Error(`Failed to remove number: ${deleteError.message}`)
  }

  console.log(`Removed number ${number.phone_number} from trunk ${trunkId}`)

  // Get remaining active numbers for this trunk
  const { data: remainingNumbers } = await supabase
    .from('external_sip_numbers')
    .select('phone_number')
    .eq('trunk_id', trunkId)
    .eq('is_active', true)

  const numbersList = remainingNumbers?.map((n: any) => n.phone_number) || []
  console.log('Remaining numbers after removal:', numbersList)

  // Update LiveKit trunk with remaining numbers
  if (trunk.livekit_inbound_trunk_id) {
    try {
      // Delete old dispatch rule first
      if (trunk.livekit_dispatch_rule_id) {
        try {
          await sipClient.deleteSipDispatchRule(trunk.livekit_dispatch_rule_id)
          console.log('Deleted old dispatch rule:', trunk.livekit_dispatch_rule_id)
        } catch (drError) {
          console.error('Error deleting old dispatch rule:', drError)
        }
      }

      // Delete old trunk
      await sipClient.deleteSipTrunk(trunk.livekit_inbound_trunk_id)
      console.log('Deleted old LiveKit trunk:', trunk.livekit_inbound_trunk_id)

      if (numbersList.length > 0) {
        // Recreate trunk with remaining numbers
        const trunkName = `Maggie-${userId.substring(0, 8)}-${trunk.name}`
        const trunkOptions: any = {
          metadata: JSON.stringify({ user_id: userId, trunk_name: trunk.name }),
        }

        if (trunk.auth_type === 'ip' && trunk.allowed_source_ips) {
          trunkOptions.allowedAddresses = trunk.allowed_source_ips
        } else if (trunk.auth_type === 'registration') {
          trunkOptions.authUsername = trunk.auth_username
          trunkOptions.authPassword = trunk.auth_password_encrypted
        }

        const newLivekitTrunk = await sipClient.createSipInboundTrunk(trunkName, numbersList, trunkOptions)
        console.log('Created new LiveKit trunk with remaining numbers:', newLivekitTrunk.sipTrunkId)

        // Recreate dispatch rule
        const rule = {
          type: 'individual' as const,
          roomPrefix: 'call-'
        }
        const dispatchOptions = {
          name: `External-${trunk.name}`,
          trunkIds: [newLivekitTrunk.sipTrunkId],
          inboundNumbers: ['+1'],
          roomConfig: {
            agents: [{ agentName: 'SW Telephony Agent' }]
          }
        }
        const newDispatchRule = await sipClient.createSipDispatchRule(rule, dispatchOptions)
        console.log('Created new dispatch rule:', newDispatchRule.sipDispatchRuleId)

        // Update trunk record with new LiveKit IDs
        await supabase
          .from('external_sip_trunks')
          .update({
            livekit_inbound_trunk_id: newLivekitTrunk.sipTrunkId,
            livekit_dispatch_rule_id: newDispatchRule.sipDispatchRuleId,
          })
          .eq('id', trunkId)
      } else {
        // No numbers left - clear LiveKit IDs and set status to pending
        await supabase
          .from('external_sip_trunks')
          .update({
            livekit_inbound_trunk_id: null,
            livekit_dispatch_rule_id: null,
            status: 'pending',
          })
          .eq('id', trunkId)
        console.log('No numbers left - trunk deactivated')
      }
    } catch (lkError) {
      console.error('Error updating LiveKit trunk:', lkError)
      // Continue - number is already deleted from DB
    }
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleUpdate(
  supabase: any,
  userId: string,
  request: UpdateNumberRequest
) {
  const { number_id, friendly_name, is_active } = request

  // Verify ownership
  const { data: number, error: fetchError } = await supabase
    .from('external_sip_numbers')
    .select('*')
    .eq('id', number_id)
    .eq('user_id', userId)
    .single()

  if (fetchError || !number) {
    throw new Error('Number not found or access denied')
  }

  // Build update object
  const updates: any = {}
  if (friendly_name !== undefined) updates.friendly_name = friendly_name
  if (is_active !== undefined) updates.is_active = is_active

  if (Object.keys(updates).length === 0) {
    throw new Error('No updates provided')
  }

  const { data: updatedNumber, error: updateError } = await supabase
    .from('external_sip_numbers')
    .update(updates)
    .eq('id', number_id)
    .select()
    .single()

  if (updateError) {
    throw new Error(`Failed to update number: ${updateError.message}`)
  }

  return new Response(
    JSON.stringify({ success: true, number: updatedNumber }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleList(
  supabase: any,
  userId: string,
  request: ListNumbersRequest
) {
  const { trunk_id } = request

  // Verify trunk ownership
  const { data: trunk, error: trunkError } = await supabase
    .from('external_sip_trunks')
    .select('id')
    .eq('id', trunk_id)
    .eq('user_id', userId)
    .single()

  if (trunkError || !trunk) {
    throw new Error('Trunk not found or access denied')
  }

  const { data: numbers, error } = await supabase
    .from('external_sip_numbers')
    .select('*')
    .eq('trunk_id', trunk_id)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to list numbers: ${error.message}`)
  }

  return new Response(
    JSON.stringify({ success: true, numbers: numbers || [] }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
