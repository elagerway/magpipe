/**
 * Update LiveKit trunk to allow all IP addresses
 */

import { SipClient } from 'livekit-server-sdk'
import dotenv from 'dotenv'

dotenv.config()

const livekitUrl = process.env.LIVEKIT_URL
const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET

async function updateTrunk() {
  console.log('\nUpdating LiveKit SIP trunk to allow all IPs...\n')

  const sipClient = new SipClient(livekitUrl, apiKey, apiSecret)

  const trunkId = 'ST_aztE6XiPMH5K'

  // Allow all IPs - rely on phone number restriction only
  const updates = {
    allowedAddresses: ['0.0.0.0/0'], // Allow from anywhere
    allowedNumbers: ['+16282954811'],
    name: 'SignalWire Inbound (All IPs)',
  }

  try {
    console.log('Removing IP restrictions (allowing all IPs)...')

    const result = await sipClient.updateSipInboundTrunk(trunkId, updates)
    console.log('\n✅ Trunk updated!')
    console.log('Allowed addresses:', result.allowedAddresses)
    console.log('Allowed numbers:', result.allowedNumbers)
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
