import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function debug() {
  console.log('\n🔍 Debugging LiveKit Call Failure\n')

  // 1. Check service number
  const { data: serviceNumber } = await supabase
    .from('service_numbers')
    .select('*')
    .eq('phone_number', '+16282954811')
    .single()

  console.log('1. Service Number:', serviceNumber ? '✅ Found' : '❌ Not found')
  if (serviceNumber) {
    console.log('   - Active:', serviceNumber.is_active)
    console.log('   - User ID:', serviceNumber.user_id)
  }

  // 2. Check agent config
  if (serviceNumber?.user_id) {
    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', serviceNumber.user_id)
      .single()

    console.log('\n2. Agent Config:', agentConfig ? '✅ Found' : '❌ Not found')
    if (agentConfig) {
      console.log('   - Voice Stack:', agentConfig.active_voice_stack || 'livekit')
      console.log('   - Voice ID:', agentConfig.voice_id)
      console.log('   - Agent ID:', agentConfig.id)
    }
  }

  // 3. Check recent call records
  const { data: recentCalls } = await supabase
    .from('call_records')
    .select('*')
    .eq('service_number', '+16282954811')
    .order('created_at', { ascending: false })
    .limit(1)

  console.log('\n3. Recent Calls:', recentCalls?.length || 0)
  if (recentCalls?.[0]) {
    console.log('   - Status:', recentCalls[0].status)
    console.log('   - Direction:', recentCalls[0].direction)
    console.log('   - Started:', recentCalls[0].started_at)
  }

  // 4. Test LiveKit agent connectivity
  console.log('\n4. LiveKit Agent Status:')
  console.log('   - URL:', process.env.LIVEKIT_URL)
  console.log('   - Render service should be running on your-render-service-id')

  console.log('\n📝 Next Steps:')
  console.log('   1. Check Render dashboard for agent logs')
  console.log('   2. Verify LiveKit SIP trunk is configured')
  console.log('   3. Test room creation manually')
  console.log()
}

debug().catch(console.error)
