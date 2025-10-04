/**
 * Get LiveKit SIP call details
 */

import { SipClient } from 'livekit-server-sdk'
import dotenv from 'dotenv'

dotenv.config()

const livekitUrl = process.env.LIVEKIT_URL
const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET

async function getCallDetails() {
  console.log('\nFetching LiveKit SIP call details...\n')

  const sipClient = new SipClient(livekitUrl, apiKey, apiSecret)

  const callId = 'SCL_m7vQ864PDnQC'

  try {
    // Try to get SIP call info
    const callInfo = await sipClient.getSipCallInfo(callId)
    console.log('Call Details:')
    console.log(JSON.stringify(callInfo, null, 2))
  } catch (error) {
    console.error('❌ Error:', error.message)

    // Try listing recent calls instead
    console.log('\nTrying to list recent SIP calls...')
    try {
      const calls = await sipClient.listSipInboundTrunk()
      console.log('Recent calls:')
      console.log(JSON.stringify(calls, null, 2))
    } catch (e) {
      console.error('Could not list calls:', e.message)
    }
  }
}

getCallDetails()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
