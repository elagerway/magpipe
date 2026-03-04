import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { email, phone_numbers } = await req.json()

    let user

    // Try to get authenticated user first
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: authUser, error: authError } = await supabase.auth.getUser(token)

      if (authUser && !authError) {
        user = { id: authUser.user.id }
      }
    }

    // If no authenticated user, try email lookup (for scripts)
    if (!user && email) {
      const { data: emailUser, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single()

      if (!userError && emailUser) {
        user = emailUser
      }
    }

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized or user not found' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!phone_numbers || !Array.isArray(phone_numbers) || phone_numbers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'phone_numbers array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results = []

    for (const phoneNumber of phone_numbers) {
      // Get service number details including purchase date
      const { data: serviceNumber, error: fetchError } = await supabase
        .from('service_numbers')
        .select('*')
        .eq('phone_number', phoneNumber)
        .eq('user_id', user.id)
        .single()

      if (fetchError || !serviceNumber) {
        results.push({
          phone_number: phoneNumber,
          success: false,
          error: 'Service number not found'
        })
        continue
      }

      // Calculate scheduled deletion date (30 days from purchase date)
      const purchaseDate = new Date(serviceNumber.purchased_at)
      const scheduledDeletionDate = new Date(purchaseDate)
      scheduledDeletionDate.setDate(purchaseDate.getDate() + 30)

      // If 30 days have already passed, delete immediately (today)
      const now = new Date()
      if (scheduledDeletionDate < now) {
        scheduledDeletionDate.setTime(now.getTime())
      }

      // Remove from service_numbers table (it will be in numbers_to_delete)
      const { error: deleteError } = await supabase
        .from('service_numbers')
        .delete()
        .eq('phone_number', phoneNumber)
        .eq('user_id', user.id)

      if (deleteError) {
        results.push({
          phone_number: phoneNumber,
          success: false,
          error: 'Failed to remove from service numbers'
        })
        continue
      }

      // Add to deletion queue
      const { error: insertError } = await supabase
        .from('numbers_to_delete')
        .insert({
          user_id: user.id,
          phone_number: phoneNumber,
          phone_sid: serviceNumber.phone_sid,
          provider: 'signalwire',  // Default provider (service_numbers doesn't have this field)
          friendly_name: serviceNumber.friendly_name,
          capabilities: serviceNumber.capabilities,
          purchased_at: serviceNumber.purchased_at,  // Preserve original purchase date
          scheduled_deletion_date: scheduledDeletionDate.toISOString(),
          deletion_notes: `Queued via queue-number-deletion function. Purchase date: ${serviceNumber.purchased_at}`
        })

      if (insertError) {
        console.error('Insert error:', insertError)
        results.push({
          phone_number: phoneNumber,
          success: false,
          error: insertError.message
        })
        continue
      }

      // Calculate days until deletion for response
      const daysUntilDeletion = Math.ceil((scheduledDeletionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      results.push({
        phone_number: phoneNumber,
        success: true,
        scheduled_deletion_date: scheduledDeletionDate.toISOString(),
        days_until_deletion: Math.max(0, daysUntilDeletion),
        purchase_date: serviceNumber.purchased_at
      })
    }

    // Request approval via SMS for all successfully queued numbers
    const successfulNumbers = results.filter(r => r.success).map(r => r.phone_number)

    if (successfulNumbers.length > 0) {
      // Get the deletion record ID for the first number (they're all in the same batch)
      const { data: deletionRecord } = await supabase
        .from('numbers_to_delete')
        .select('id')
        .eq('phone_number', successfulNumbers[0])
        .eq('user_id', user.id)
        .single()

      if (deletionRecord) {
        // Request approval
        const approvalUrl = `${supabaseUrl}/functions/v1/request-deletion-approval`

        try {
          const approvalResponse = await fetch(approvalUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              deletionRecordId: deletionRecord.id,
              phoneNumbers: successfulNumbers.join(', '),
              userId: user.id
            })
          })

          if (!approvalResponse.ok) {
            console.error('Failed to request approval:', await approvalResponse.text())
          } else {
            console.log('✅ Approval request sent')
          }
        } catch (approvalError) {
          console.error('Error requesting approval:', approvalError)
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,  // Each result has its own scheduled_deletion_date
        approval_requested: successfulNumbers.length > 0
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
