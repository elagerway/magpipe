/**
 * Update LiveKit SIP dispatch rule to add inbound numbers
 */

import { SipClient } from 'livekit-server-sdk'
import dotenv from 'dotenv'

dotenv.config()

const livekitUrl = process.env.LIVEKIT_URL
const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET

async function updateDispatchRule() {
  console.log('\nUpdating LiveKit SIP dispatch rule...\n')

  const sipClient = new SipClient(livekitUrl, apiKey, apiSecret)

  const dispatchRuleId = 'SDR_oMTrnZT3bZVE'

  // Update to match all +1 numbers with complete rule object
  const updates = {
    dispatchRuleIndividual: {
      roomPrefix: 'call-',
      pin: ''
    },
    trunkIds: ['ST_eDVUAafvDeF6'],
    hidePhoneNumber: false,
    name: 'SW-calls',
    inboundNumbers: ['+1'], // Match all US/Canada numbers
  }

  try {
    console.log('Updating dispatch rule:', dispatchRuleId)
    console.log('Setting inboundNumbers to:', updates.inboundNumbers)

    const result = await sipClient.updateSipDispatchRule(dispatchRuleId, updates)
    console.log('\n✅ Dispatch rule updated!')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.body) {
      console.error('Details:', error.body)
    }
  }
}

updateDispatchRule()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
