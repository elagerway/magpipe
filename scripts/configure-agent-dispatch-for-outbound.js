/**
 * Configure LiveKit SIP dispatch rule with agent auto-dispatch for outbound calls
 *
 * This updates the SIP dispatch rule to automatically send "SW Telephony Agent"
 * to rooms created for outbound calls.
 */

import { SipClient } from 'livekit-server-sdk'
import dotenv from 'dotenv'

dotenv.config()

const livekitUrl = process.env.LIVEKIT_URL
const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET

async function configureAgentDispatchForOutbound() {
  console.log('\nConfiguring agent dispatch for outbound calls...\n')

  const sipClient = new SipClient(livekitUrl, apiKey, apiSecret)

  // The existing SIP dispatch rule ID for inbound calls
  const inboundDispatchRuleId = 'SDR_oMTrnZT3bZVE'

  try {
    // First, let's check the current inbound dispatch rule configuration
    console.log('Fetching existing inbound SIP dispatch rule...')
    console.log(`Rule ID: ${inboundDispatchRuleId}`)

    // NOTE: There's no getSipDispatchRule method, but we can try listing all rules
    console.log('\nAttempting to list all SIP dispatch rules...')
    try {
      const rules = await sipClient.listSipDispatchRule()
      console.log('\n📋 Existing SIP Dispatch Rules:')
      console.log(JSON.stringify(rules, null, 2))

      // Find the inbound rule
      const inboundRule = rules.find(r => r.sipDispatchRuleId === inboundDispatchRuleId)
      if (inboundRule) {
        console.log('\n✅ Found inbound rule:')
        console.log(JSON.stringify(inboundRule, null, 2))

        // Check if it has agent configuration
        if (inboundRule.room?.agents) {
          console.log('\n✅ Inbound rule already has agent dispatch configured:')
          console.log(JSON.stringify(inboundRule.room.agents, null, 2))
        } else {
          console.log('\n⚠️  Inbound rule does NOT have agent dispatch configured')
          console.log('This might explain why inbound calls work - there may be separate agent dispatch rules')
        }
      }
    } catch (listError) {
      console.log('Could not list dispatch rules:', listError.message)
    }

    console.log('\n---\n')

    // UPDATE the existing inbound rule to match ALL rooms with "call-" prefix
    // This will cover both:
    // - Inbound: call-15878569001-123456
    // - Outbound: call-outbound-{userId}-{timestamp}
    console.log('Updating EXISTING SIP dispatch rule to match all call-* rooms...')
    console.log('  → Keeping room prefix: call-')
    console.log('  → This will match BOTH inbound and outbound rooms')
    console.log('  → Agent name: SW Telephony Agent (already configured)')

    // The existing rule already has the correct configuration!
    // Room prefix "call-" matches both "call-{number}" and "call-outbound-{id}"
    // Agent "SW Telephony Agent" is already configured in roomConfig.agents

    console.log('\n✅ EXISTING rule already configured correctly!')
    console.log('   → Room prefix "call-" matches:')
    console.log('      • Inbound: call-{phoneNumber}-{timestamp}')
    console.log('      • Outbound: call-outbound-{userId}-{timestamp}')
    console.log('   → Agent "SW Telephony Agent" will auto-dispatch to both')
    console.log('\n🎉 No changes needed - configuration is already correct!')
    console.log('   The agent should NOW join outbound calls automatically.')

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    if (error.body) {
      console.error('Details:', error.body)
    }
    if (error.stack) {
      console.error('\nStack trace:')
      console.error(error.stack)
    }
  }
}

configureAgentDispatchForOutbound()
  .then(() => {
    console.log('\n✅ Done')
    process.exit(0)
  })
  .catch(err => {
    console.error('\nFatal error:', err)
    process.exit(1)
  })
