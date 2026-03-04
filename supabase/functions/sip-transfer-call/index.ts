/**
 * SIP Transfer Call - Transfer an active SIP call to another number
 *
 * For direct SIP calls, we need to find the active call from SignalWire
 * and use their REST API to transfer it.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const SIGNALWIRE_SPACE_URL = Deno.env.get('SIGNALWIRE_SPACE_URL') || 'erik.signalwire.com';
const SIGNALWIRE_PROJECT_ID = Deno.env.get('SIGNALWIRE_PROJECT_ID')!;
const SIGNALWIRE_API_TOKEN = Deno.env.get('SIGNALWIRE_API_TOKEN')!;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const { sip_username, target_number, current_to_number } = await req.json();

    console.log('📞 SIP Transfer Request:', { sip_username, target_number, current_to_number });

    if (!target_number) {
      return new Response(JSON.stringify({ error: 'target_number is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find active calls from this SIP endpoint
    const authHeader = 'Basic ' + btoa(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`);

    // Query SignalWire for active calls
    const callsUrl = `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls.json?Status=in-progress`;

    console.log('📞 Fetching active calls from SignalWire...');

    const callsResponse = await fetch(callsUrl, {
      headers: { 'Authorization': authHeader }
    });

    if (!callsResponse.ok) {
      const errorText = await callsResponse.text();
      console.error('Failed to fetch calls:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to fetch active calls' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callsData = await callsResponse.json();
    console.log('📞 Active calls:', JSON.stringify(callsData, null, 2));

    // Find the call from our SIP endpoint
    // Look for calls where the from contains our SIP username or the call originated from SIP
    let targetCall = null;

    if (callsData.calls && callsData.calls.length > 0) {
      for (const call of callsData.calls) {
        console.log('  Checking call:', call.sid, 'from:', call.from, 'to:', call.to, 'direction:', call.direction);

        // Match by current destination number if provided
        if (current_to_number) {
          const normalizedTo = call.to?.replace(/[^\d+]/g, '');
          const normalizedCurrent = current_to_number.replace(/[^\d+]/g, '');
          if (normalizedTo === normalizedCurrent || normalizedTo?.endsWith(normalizedCurrent.slice(-10))) {
            targetCall = call;
            console.log('  ✅ Matched by destination number');
            break;
          }
        }

        // Match by SIP username in the from field
        if (sip_username && call.from?.includes(sip_username)) {
          targetCall = call;
          console.log('  ✅ Matched by SIP username in from');
          break;
        }

        // For outbound SIP calls, the direction might be 'outbound-api' or similar
        if (call.direction === 'outbound-dial' || call.direction === 'outbound-api') {
          targetCall = call;
          console.log('  ✅ Matched by outbound direction');
          break;
        }
      }
    }

    if (!targetCall) {
      console.log('❌ No matching active call found');
      return new Response(JSON.stringify({
        error: 'No active call found to transfer',
        active_calls: callsData.calls?.length || 0
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('📞 Found call to transfer:', targetCall.sid);

    // Normalize target number to E.164
    let normalizedTarget = target_number.replace(/[^\d+]/g, '');
    if (!normalizedTarget.startsWith('+')) {
      if (normalizedTarget.length === 10) {
        normalizedTarget = '+1' + normalizedTarget;
      } else if (normalizedTarget.length === 11 && normalizedTarget.startsWith('1')) {
        normalizedTarget = '+' + normalizedTarget;
      }
    }

    // Try to find the call_record for this call so we can associate the recording
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Look for recent outbound call record without recording
    let callRecordId = '';
    const { data: callRecord } = await supabase
      .from('call_records')
      .select('id')
      .eq('direction', 'outbound')
      .is('recording_url', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (callRecord) {
      callRecordId = callRecord.id;
      console.log('📞 Found call record:', callRecordId);

      // Update call record with call_sid for recording callback matching
      await supabase
        .from('call_records')
        .update({ call_sid: targetCall.sid })
        .eq('id', callRecordId);
    }

    // Update the call to redirect to the transfer target
    // We use TwiML/cXML to dial the new number
    const transferCxmlUrl = `${supabaseUrl}/functions/v1/transfer-cxml?target=${encodeURIComponent(normalizedTarget)}&call_record_id=${callRecordId}`;

    console.log('📞 Redirecting call to:', transferCxmlUrl);

    const updateUrl = `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls/${targetCall.sid}.json`;

    const updateResponse = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `Url=${encodeURIComponent(transferCxmlUrl)}&Method=GET`
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('Failed to update call:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to transfer call', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const updateResult = await updateResponse.json();
    console.log('✅ Call transfer initiated:', updateResult);

    return new Response(JSON.stringify({
      success: true,
      call_sid: targetCall.sid,
      transferred_to: normalizedTarget
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in sip-transfer-call:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
