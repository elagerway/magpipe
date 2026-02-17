/**
 * Transfer cXML - Returns cXML to dial the transfer target with recording
 */

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const target = url.searchParams.get('target');
  const callRecordId = url.searchParams.get('call_record_id') || '';

  console.log('📞 Transfer cXML requested for:', target, 'call_record_id:', callRecordId);

  if (!target) {
    return new Response('<Response><Say>Transfer target not specified</Say><Hangup/></Response>', {
      status: 400,
      headers: { 'Content-Type': 'application/xml' },
    });
  }

  // Build recording callback URL
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const recordingCallbackUrl = `${supabaseUrl}/functions/v1/sip-recording-callback`;

  // Return cXML that dials the transfer target with recording
  const cxml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Please hold while we transfer your call.</Say>
  <Dial record="record-from-answer" recordingStatusCallback="${recordingCallbackUrl}" recordingStatusCallbackMethod="POST">
    <Number>${target}</Number>
  </Dial>
</Response>`;

  console.log('📞 Returning transfer cXML with recording');

  return new Response(cxml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml' },
  });
});
