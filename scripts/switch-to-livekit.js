/**
 * Switch a user from Retell to LiveKit voice stack
 * Usage: node scripts/switch-to-livekit.js <user_email>
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function switchToLiveKit(userEmail) {
  console.log(`\nSwitching ${userEmail} to LiveKit stack...\n`)

  // 1. Get user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', userEmail)
    .single()

  if (userError || !user) {
    console.error('❌ User not found:', userError?.message)
    return
  }

  console.log(`✅ Found user: ${user.email} (${user.id})`)

  // 2. Get current agent config
  const { data: config, error: configError } = await supabase
    .from('agent_configs')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (configError || !config) {
    console.error('❌ Agent config not found:', configError?.message)
    return
  }

  console.log(`   Current stack: ${config.active_voice_stack || 'retell'}`)
  console.log(`   Retell agent: ${config.retell_agent_id}`)

  // 3. Update to LiveKit
  const { error: updateError } = await supabase
    .from('agent_configs')
    .update({
      active_voice_stack: 'livekit',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)

  if (updateError) {
    console.error('❌ Failed to update:', updateError.message)
    return
  }

  console.log(`\n✅ Successfully switched to LiveKit stack!`)
  console.log(`\nNext steps:`)
  console.log(`1. Verify LiveKit agent is running on Render`)
  console.log(`2. Make a test call to your Pat number`)
  console.log(`3. Check Render logs for agent activity`)
  console.log(`4. Test custom voice support\n`)
}

// Get user email from command line
const userEmail = process.argv[2]

if (!userEmail) {
  console.error('Usage: node scripts/switch-to-livekit.js <user_email>')
  process.exit(1)
}

switchToLiveKit(userEmail)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
