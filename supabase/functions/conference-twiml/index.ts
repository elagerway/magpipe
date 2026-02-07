/**
 * Conference TwiML - Returns TwiML to join a conference
 */

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const conferenceName = url.searchParams.get('name') || 'default_conference'
  const announce = url.searchParams.get('announce')

  console.log('📞 Conference TwiML requested:', { conferenceName, announce })

  // Optional announcement when joining (for transferee)
  const sayElement = announce
    ? `<Say voice="Polly.Joanna">Connecting you now.</Say>`
    : ''

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${sayElement}
  <Dial>
    <Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="false" waitUrl="">${conferenceName}</Conference>
  </Dial>
</Response>`

  console.log('Returning TwiML:', twiml)

  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
})
