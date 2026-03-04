/**
 * Delete and recreate LiveKit SIP dispatch rule
 */

import { SipClient } from 'livekit-server-sdk'
import dotenv from 'dotenv'

dotenv.config()

const livekitUrl = process.env.LIVEKIT_URL
const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET

async function recreateDispatchRule() {
  console.log('\nRecreating LiveKit SIP dispatch rule...\n')

  const sipClient = new SipClient(livekitUrl, apiKey, apiSecret)

  const oldRuleId = 'SDR_54Qko9XVTP8Z'

  try {
    // Delete old rule
    console.log('Deleting old dispatch rule:', oldRuleId)
    await sipClient.deleteSipDispatchRule(oldRuleId)
    console.log('✅ Old rule deleted')
  } catch (error) {
    console.log('Note: Could not delete old rule:', error.message)
  }

  // Create new rule with correct settings
  const dispatchRule = {
    trunkIds: ['ST_zHW9LbppnrBR'],
    hidePhoneNumber: false,
    inboundNumbers: ['+1'], // Match all US/Canada numbers
    name: 'SW-calls',
    metadata: '',
    attributes: {},
    rule: {
      dispatchRuleIndividual: {
        roomPrefix: 'call-',
        pin: ''
      }
    },
    roomConfig: {
      agents: [
        {
          agentName: 'SW Telephony Agent',
          metadata: ''
        }
      ]
    }
  }

  try {
    console.log('\nCreating new dispatch rule...')
    console.log('inboundNumbers:', dispatchRule.inboundNumbers)

    const result = await sipClient.createSipDispatchRule(dispatchRule)
    console.log('\n✅ New dispatch rule created!')
    console.log('Rule ID:', result.sipDispatchRuleId)
    console.log('Inbound Numbers:', result.inboundNumbers)
  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.body) {
      console.error('Details:', error.body)
    }
  }
}

recreateDispatchRule()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
