/**
 * Update LiveKit SIP trunk to accept calls from SignalWire
 */

import { SipClient } from 'livekit-server-sdk'
import dotenv from 'dotenv'

dotenv.config()

const livekitUrl = process.env.LIVEKIT_URL
const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET

async function updateTrunk() {
  console.log('\nUpdating LiveKit SIP trunk to accept SignalWire calls...\n')

  const sipClient = new SipClient(livekitUrl, apiKey, apiSecret)

  const trunkId = 'ST_U2b9K7oAqVmF'

  // SignalWire SIP server addresses
  // These are the IP ranges that SignalWire uses for SIP traffic
  const signalwireAddresses = [
    '206.147.72.0/24',    // SignalWire primary range
    '147.135.0.0/16',     // SignalWire backup range
  ]

  const updates = {
    allowedAddresses: signalwireAddresses,  // Correct field name
    allowedNumbers: ['+16282954811'], // Your SignalWire number
    name: 'SignalWire Inbound Trunk',
  }

  try {
    console.log('Adding inbound addresses:', signalwireAddresses)

    const result = await sipClient.updateSipInboundTrunk(trunkId, updates)
    console.log('\n✅ Trunk updated!')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.body) {
      console.error('Details:', error.body)
    }
  }
}

updateTrunk()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
