/**
 * Update LiveKit trunk to accept all US/Canada numbers using +1 wildcard
 */

import { SipClient } from 'livekit-server-sdk'
import dotenv from 'dotenv'

dotenv.config()

const livekitUrl = process.env.LIVEKIT_URL
const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET

async function updateTrunk() {
  console.log('\nUpdating LiveKit SIP trunk to accept all US/Canada numbers...\n')

  const sipClient = new SipClient(livekitUrl, apiKey, apiSecret)

  const trunkId = 'ST_eDVUAafvDeF6'

  // Don't set allowedNumbers at all - omitting it allows ALL numbers
  const updates = {
    allowedAddresses: ['0.0.0.0/0'], // Allow from any IP (SignalWire can use different IPs)
    // allowedNumbers not set = accept ALL numbers
    name: 'SignalWire Inbound (All Numbers)',
  }

  try {
    console.log('Removing allowedNumbers restriction...')
    console.log('This will allow ALL phone numbers to be accepted')

    const result = await sipClient.updateSipInboundTrunk(trunkId, updates)
    console.log('\n✅ Trunk updated!')
    console.log('Trunk ID:', result.sipTrunkId)
    console.log('Name:', result.name)
    console.log('Allowed addresses:', result.allowedAddresses)
    console.log('Allowed numbers:', result.allowedNumbers)
    console.log('\n✅ All user-added US/Canada numbers will now work automatically!')
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
