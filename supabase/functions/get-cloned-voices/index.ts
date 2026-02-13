import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // Use service role key to bypass RLS - this endpoint is public
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get all cloned voices from voices table (bypasses RLS with service role key)
    const { data, error } = await supabase
      .from('voices')
      .select('voice_id, voice_name, is_cloned')
      .eq('is_cloned', true)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching cloned voices:', error)
      throw error
    }

    return new Response(
      JSON.stringify({ voices: data || [] }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error in get-cloned-voices:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
