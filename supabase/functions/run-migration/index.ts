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

    // Run the migration
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE agent_configs
        ADD COLUMN IF NOT EXISTS prompt TEXT,
        ADD COLUMN IF NOT EXISTS retell_agent_id TEXT,
        ADD COLUMN IF NOT EXISTS agent_name TEXT,
        ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en-US';
      `
    })

    if (error) {
      console.error('Migration error:', error)

      // Try direct SQL execution
      const { error: directError } = await supabase.from('_migrations').insert({
        name: '012_add_prompt_to_agent_configs',
        executed_at: new Date().toISOString()
      })

      return new Response(
        JSON.stringify({
          error: 'Migration failed',
          details: error.message,
          note: 'Please run this SQL in Supabase SQL Editor: ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS prompt TEXT, ADD COLUMN IF NOT EXISTS retell_agent_id TEXT, ADD COLUMN IF NOT EXISTS agent_name TEXT, ADD COLUMN IF NOT EXISTS language TEXT DEFAULT \'en-US\';'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Migration completed successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in run-migration:', error)
    return new Response(
      JSON.stringify({
        error: error.message,
        note: 'Please run this SQL manually in Supabase SQL Editor: ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS prompt TEXT, ADD COLUMN IF NOT EXISTS retell_agent_id TEXT, ADD COLUMN IF NOT EXISTS agent_name TEXT, ADD COLUMN IF NOT EXISTS language TEXT DEFAULT \'en-US\';'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})