import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const { recordingUrl } = await req.json()

    if (!recordingUrl) {
      return new Response(JSON.stringify({ error: 'recordingUrl is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // For now, just return the URL as-is to test if function works
    return new Response(JSON.stringify({
      signedUrl: recordingUrl,
      message: 'Function is working, but not generating signed URL yet'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error',
        name: error.name || 'Error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
