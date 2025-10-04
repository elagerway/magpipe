/**
 * Configure LiveKit SIP trunk dispatch rules
 */

import { SipClient } from 'livekit-server-sdk'
import dotenv from 'dotenv'

dotenv.config()

const livekitUrl = process.env.LIVEKIT_URL
const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET

async function configureSipTrunk() {
  console.log('\nConfiguring LiveKit SIP trunk...\n')

  const sipClient = new SipClient(livekitUrl, apiKey, apiSecret)

  // Create SIP dispatch rule - route to individual rooms based on SIP URI
  const dispatchRule = {
    trunkIds: ['ST_U2b9K7oAqVmF'],
    hidePhoneNumber: false,
    inboundNumbers: ['+1'], // Match all US numbers
    name: 'Route to Agent Workers',
    metadata: '',
    attributes: {},
    // Use dispatchRuleIndividual to create a room per call
    rule: {
      case: 'dispatchRuleIndividual',
      value: {
        roomPrefix: 'call-',
        pin: ''
      }
    }
  }

  try {
    console.log('Creating SIP dispatch rule...')
    const result = await sipClient.createSipDispatchRule(dispatchRule)
    console.log('✅ SIP dispatch rule created:', JSON.stringify(result, null, 2))
    console.log('\n✅ SIP trunk configured! Calls will create individual rooms.')
  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.body) {
      console.error('Details:', error.body)
    }
    
    // List existing rules
    try {
      console.log('\nListing existing dispatch rules...')
      const rules = await sipClient.listSipDispatchRule()
      console.log('Existing rules:', JSON.stringify(rules, null, 2))
    } catch (listError) {
      console.error('Could not list rules:', listError.message)
    }
  }
}

configureSipTrunk()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
