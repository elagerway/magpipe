/**
 * Bridge Outbound Call - Initiates an inbound call to WebRTC endpoint and bridges to PSTN
 * This allows us to control recording and get call SID
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const { toNumber, fromNumber, userId, contactId } = await req.json();

    console.log('Bridge outbound call request:', { toNumber, fromNumber, userId, contactId });

    if (!toNumber || !fromNumber || !userId) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's SIP endpoint details
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('sip_username, sip_endpoint_id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error('User lookup error:', userError);
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!;
    const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!;
    const signalwireSpace = Deno.env.get('SIGNALWIRE_SPACE')!;

    // SIP URI for the WebRTC endpoint
    const sipUri = `sip:${user.sip_username}@${signalwireSpace}.sip.signalwire.com`;

    // Create cXML that will:
    // 1. Call the WebRTC endpoint (user's browser)
    // 2. Bridge to PSTN number with recording
    const cxml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${fromNumber}" record="record-from-answer" recordingStatusCallback="${supabaseUrl}/functions/v1/sip-recording-callback">
    <Sip>${sipUri}</Sip>
    <Number>${toNumber}</Number>
  </Dial>
</Response>`;

    console.log('Generated cXML:', cxml);

    // Initiate the call via SignalWire REST API
    const callResponse = await fetch(
      `https://${signalwireSpace}.signalwire.com/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireApiToken}`),
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: sipUri,
          Twiml: cxml,
        }),
      }
    );

    if (!callResponse.ok) {
      const errorText = await callResponse.text();
      console.error('SignalWire API error:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to initiate call', details: errorText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const callData = await callResponse.json();
    console.log('Call initiated:', callData);

    // Create call record in database
    const { data: callRecord, error: callRecordError } = await supabase
      .from('call_records')
      .insert({
        user_id: userId,
        contact_id: contactId,
        to_number: toNumber,
        from_number: fromNumber,
        direction: 'outbound',
        status: 'initiated',
        call_sid: callData.sid,
      })
      .select()
      .single();

    if (callRecordError) {
      console.error('Error creating call record:', callRecordError);
    }

    return new Response(JSON.stringify({
      success: true,
      callSid: callData.sid,
      callRecordId: callRecord?.id,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in bridge-outbound-call:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
