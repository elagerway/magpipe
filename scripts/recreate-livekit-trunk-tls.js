/**
 * Recreate LiveKit SIP trunk with TLS support
 */

import { SipClient } from 'livekit-server-sdk'
import dotenv from 'dotenv'

dotenv.config()

const livekitUrl = process.env.LIVEKIT_URL
const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET

async function recreateTrunk() {
  console.log('\nRecreating LiveKit SIP trunk with TLS support...\n')

  const sipClient = new SipClient(livekitUrl, apiKey, apiSecret)

  // Delete old trunk
  try {
    console.log('Deleting old trunk ST_U2b9K7oAqVmF...')
    await sipClient.deleteSipTrunk('ST_U2b9K7oAqVmF')
    console.log('✅ Old trunk deleted')
  } catch (error) {
    console.log('Note: Could not delete old trunk:', error.message)
  }

  // Delete old dispatch rule
  try {
    console.log('Deleting old dispatch rule SDR_JrFDqXhoTt3R...')
    await sipClient.deleteSipDispatchRule('SDR_JrFDqXhoTt3R')
    console.log('✅ Old dispatch rule deleted')
  } catch (error) {
    console.log('Note: Could not delete old rule:', error.message)
  }

  // Create new inbound trunk with proper settings
  const signalwireAddresses = [
    '206.147.72.0/24',
    '147.135.0.0/16',
  ]

  try {
    console.log('\nCreating new inbound trunk...')

    const trunk = await sipClient.createSipInboundTrunk(
      'SignalWire Inbound (TLS)',
      ['+16282954811'],
      {
        allowedAddresses: signalwireAddresses,
        allowedNumbers: ['+16282954811'],
        krispEnabled: false,
      }
    )

    console.log('\n✅ Trunk created!')
    console.log('Trunk ID:', trunk.sipTrunkId)
    console.log('Allowed addresses:', trunk.allowedAddresses)
    console.log('Allowed numbers:', trunk.allowedNumbers)

    // Create dispatch rule
    console.log('\nCreating dispatch rule...')

    const rule = await sipClient.createSipDispatchRule(
      {
        type: 'individual',
        roomPrefix: 'call-',
        pin: '',
      },
      {
        trunkIds: [trunk.sipTrunkId],
        name: 'Maggie AI Calls',
        hidePhoneNumber: false,
        roomConfig: {
          agents: [{
            agentName: 'SW Telephony Agent',
            metadata: ''
          }]
        }
      }
    )

    console.log('\n✅ Dispatch rule created!')
    console.log('Rule ID:', rule.sipDispatchRuleId)
    console.log('\n🎉 LiveKit SIP trunk fully configured!')
    console.log('SIP domain: plug-bq7kgzpt.sip.livekit.cloud')

  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.body) {
      console.error('Details:', error.body)
    }
  }
}

recreateTrunk()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
