import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const { serviceNumberId, requestedName } = await req.json()

    if (!serviceNumberId || !requestedName) {
      return new Response(JSON.stringify({ error: 'serviceNumberId and requestedName are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Validate CNAM name length (15 chars max for Verizon compatibility)
    const trimmedName = requestedName.trim()
    if (trimmedName.length > 15) {
      return new Response(JSON.stringify({ error: 'CNAM name must be 15 characters or less' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (trimmedName.length < 2) {
      return new Response(JSON.stringify({ error: 'CNAM name must be at least 2 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')!
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!

    // Authenticate user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Verify the service number belongs to this user and is active
    const { data: serviceNumber, error: numError } = await supabase
      .from('service_numbers')
      .select('id, phone_number, is_active, cnam_name')
      .eq('id', serviceNumberId)
      .eq('user_id', user.id)
      .single()

    if (numError || !serviceNumber) {
      return new Response(JSON.stringify({ error: 'Service number not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!serviceNumber.is_active) {
      return new Response(JSON.stringify({ error: 'Service number is not active' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check for existing pending/submitted/processing request for this number
    const { data: existingRequest } = await supabase
      .from('cnam_requests')
      .select('id, status')
      .eq('service_number_id', serviceNumberId)
      .in('status', ['pending', 'submitted', 'processing'])
      .limit(1)
      .maybeSingle()

    if (existingRequest) {
      return new Response(JSON.stringify({ error: 'A CNAM request is already in progress for this number' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create the CNAM request record
    const { data: cnamRequest, error: insertError } = await supabase
      .from('cnam_requests')
      .insert({
        service_number_id: serviceNumberId,
        phone_number: serviceNumber.phone_number,
        user_id: user.id,
        requested_name: trimmedName,
        status: 'submitted',
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting CNAM request:', insertError)
      throw new Error('Failed to create CNAM request')
    }

    const requestIdShort = cnamRequest.id.substring(0, 8)

    // Build the email to SignalWire support
    const subject = `CNAM Registration Request [CNAM-${requestIdShort}]`
    const htmlBody = `
      <p>Hello SignalWire Support,</p>
      <p>We would like to register a CNAM (Caller ID Name) for one of our phone numbers.</p>
      <table style="border-collapse: collapse; margin: 1rem 0;">
        <tr>
          <td style="padding: 0.5rem 1rem; font-weight: bold; border: 1px solid #ddd;">SignalWire Project ID</td>
          <td style="padding: 0.5rem 1rem; border: 1px solid #ddd;">${signalwireProjectId}</td>
        </tr>
        <tr>
          <td style="padding: 0.5rem 1rem; font-weight: bold; border: 1px solid #ddd;">Phone Number</td>
          <td style="padding: 0.5rem 1rem; border: 1px solid #ddd;">${serviceNumber.phone_number}</td>
        </tr>
        <tr>
          <td style="padding: 0.5rem 1rem; font-weight: bold; border: 1px solid #ddd;">Requested CNAM</td>
          <td style="padding: 0.5rem 1rem; border: 1px solid #ddd;">${trimmedName}</td>
        </tr>
      </table>
      <p>Please let us know if you need any additional information to process this request.</p>
      <p>Thank you,<br>Snapsonic Support</p>
    `
    const textBody = `Hello SignalWire Support,

We would like to register a CNAM (Caller ID Name) for one of our phone numbers.

SignalWire Project ID: ${signalwireProjectId}
Phone Number: ${serviceNumber.phone_number}
Requested CNAM: ${trimmedName}

Please let us know if you need any additional information to process this request.

Thank you,
Snapsonic Support`

    // Send via Postmark
    const emailResponse = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': postmarkApiKey
      },
      body: JSON.stringify({
        From: 'support@snapsonic.com',
        To: 'Support@signalwire.com',
        ReplyTo: 'support@snapsonic.com',
        Subject: subject,
        HtmlBody: htmlBody,
        TextBody: textBody,
        MessageStream: 'outbound'
      })
    })

    const emailResult = await emailResponse.json()

    if (!emailResponse.ok) {
      console.error('Postmark error:', emailResult)
      // Update request status to indicate email failure
      await supabase
        .from('cnam_requests')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', cnamRequest.id)
      throw new Error(`Failed to send CNAM request email: ${emailResult.Message || 'Unknown error'}`)
    }

    // Store the Postmark MessageID for reply threading and log the sent email
    await supabase
      .from('cnam_requests')
      .update({
        postmark_message_id: emailResult.MessageID,
        email_thread: [{
          direction: 'outbound',
          from: 'support@snapsonic.com',
          to: 'Support@signalwire.com',
          subject: subject,
          body: textBody,
          timestamp: new Date().toISOString()
        }],
        updated_at: new Date().toISOString()
      })
      .eq('id', cnamRequest.id)

    console.log(`CNAM request submitted: ${cnamRequest.id} for ${serviceNumber.phone_number} → "${trimmedName}"`)

    return new Response(JSON.stringify({
      success: true,
      requestId: cnamRequest.id,
      status: 'submitted',
      postmarkMessageId: emailResult.MessageID
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error('Error in submit-cnam-request:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
