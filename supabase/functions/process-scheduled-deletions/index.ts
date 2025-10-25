import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get SignalWire credentials
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
    const signalwireToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!

    console.log('Processing scheduled deletions...')

    // Get all numbers scheduled for deletion that are past their scheduled date
    const now = new Date().toISOString()
    const { data: numbersToDelete, error: fetchError } = await supabase
      .from('numbers_to_delete')
      .select('*')
      .eq('deletion_status', 'pending')
      .lte('scheduled_deletion_date', now)

    if (fetchError) {
      console.error('Error fetching numbers:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch numbers', details: fetchError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!numbersToDelete || numbersToDelete.length === 0) {
      console.log('No numbers scheduled for deletion')
      return new Response(
        JSON.stringify({ message: 'No numbers scheduled for deletion', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${numbersToDelete.length} numbers to delete`)

    const results = []

    for (const number of numbersToDelete) {
      console.log(`Processing ${number.phone_number} (SID: ${number.phone_sid})`)

      // Mark as deleting
      await supabase
        .from('numbers_to_delete')
        .update({ deletion_status: 'deleting' })
        .eq('id', number.id)

      try {
        // Delete from SignalWire
        const deleteUrl = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/IncomingPhoneNumbers/${number.phone_sid}.json`

        const deleteResponse = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`),
          },
        })

        if (!deleteResponse.ok) {
          const errorText = await deleteResponse.text()
          console.error(`SignalWire deletion failed for ${number.phone_number}:`, errorText)

          // Mark as failed
          await supabase
            .from('numbers_to_delete')
            .update({
              deletion_status: 'failed',
              deletion_notes: `SignalWire error: ${errorText}`
            })
            .eq('id', number.id)

          results.push({
            phone_number: number.phone_number,
            success: false,
            error: errorText
          })
          continue
        }

        console.log(`Successfully deleted ${number.phone_number} from SignalWire`)

        // Mark as deleted
        await supabase
          .from('numbers_to_delete')
          .update({
            deletion_status: 'deleted',
            deleted_at: new Date().toISOString(),
            deletion_notes: 'Successfully deleted from provider'
          })
          .eq('id', number.id)

        // Remove from service_numbers table
        await supabase
          .from('service_numbers')
          .delete()
          .eq('phone_sid', number.phone_sid)

        results.push({
          phone_number: number.phone_number,
          success: true
        })

      } catch (error) {
        console.error(`Error deleting ${number.phone_number}:`, error)

        await supabase
          .from('numbers_to_delete')
          .update({
            deletion_status: 'failed',
            deletion_notes: `Error: ${error.message}`
          })
          .eq('id', number.id)

        results.push({
          phone_number: number.phone_number,
          success: false,
          error: error.message
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failedCount = results.filter(r => !r.success).length

    return new Response(
      JSON.stringify({
        message: 'Deletion processing complete',
        processed: numbersToDelete.length,
        succeeded: successCount,
        failed: failedCount,
        results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in process-scheduled-deletions:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
