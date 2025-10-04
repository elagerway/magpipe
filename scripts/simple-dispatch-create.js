/**
 * Create LiveKit SIP dispatch rule with minimal config
 */

import { SipClient } from 'livekit-server-sdk'
import dotenv from 'dotenv'

dotenv.config()

const livekitUrl = process.env.LIVEKIT_URL
const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET

async function createDispatchRule() {
  console.log('\nCreating LiveKit SIP dispatch rule...\n')

  const sipClient = new SipClient(livekitUrl, apiKey, apiSecret)

  // Correct format for livekit-server-sdk
  // First parameter: rule definition
  const rule = {
    type: 'individual',
    roomPrefix: 'call-',
    pin: '',
  }

  // Second parameter: options
  const opts = {
    trunkIds: ['ST_U2b9K7oAqVmF'],
    name: 'Pat AI Calls',
    hidePhoneNumber: false,
    inboundNumbers: ['+1'], // Try passing here
    roomConfig: {
      agents: [{
        agentName: 'SW Telephony Agent',
        metadata: ''
      }]
    }
  }

  try {
    console.log('Creating dispatch rule for inbound numbers:', opts.inboundNumbers)

    const result = await sipClient.createSipDispatchRule(rule, opts)
    console.log('\n✅ Dispatch rule created!')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error('Full error:', error)
  }
}

createDispatchRule()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
