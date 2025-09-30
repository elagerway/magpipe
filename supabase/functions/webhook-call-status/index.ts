import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const formData = await req.formData()
    const callSid = formData.get('CallSid') as string
    const callStatus = formData.get('CallStatus') as string
    const callDuration = formData.get('CallDuration') as string

    console.log('Call status update:', { callSid, callStatus, callDuration })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Update call record in database
    const updateData: any = {
      status: callStatus.toLowerCase(),
    }

    if (callStatus === 'completed' && callDuration) {
      updateData.duration_seconds = parseInt(callDuration)
      updateData.ended_at = new Date().toISOString()
    } else if (callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer') {
      updateData.ended_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('call_records')
      .update(updateData)
      .eq('call_sid', callSid)

    if (error) {
      console.error('Error updating call status:', error)
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Error in webhook-call-status:', error)
    return new Response('OK', { status: 200 })
  }
})