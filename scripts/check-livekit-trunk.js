/**
 * Check LiveKit SIP trunk configuration
 */

import { SipClient } from 'livekit-server-sdk'
import dotenv from 'dotenv'

dotenv.config()

const livekitUrl = process.env.LIVEKIT_URL
const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET

async function checkTrunk() {
  console.log('\nChecking LiveKit SIP trunk configuration...\n')

  const sipClient = new SipClient(livekitUrl, apiKey, apiSecret)

  try {
    // List all trunks
    const trunks = await sipClient.listSipTrunk()
    console.log('SIP Trunks:')
    console.log(JSON.stringify(trunks, null, 2))

    // List all dispatch rules
    const rules = await sipClient.listSipDispatchRule()
    console.log('\nDispatch Rules:')
    console.log(JSON.stringify(rules, null, 2))
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

checkTrunk()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
