/**
 * Restore the working LiveKit SIP configuration
 * Based on successful call SCL_m7vQ864PDnQC
 */

import { SipClient } from 'livekit-server-sdk'
import dotenv from 'dotenv'

dotenv.config()

const livekitUrl = process.env.LIVEKIT_URL
const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET

async function restoreConfig() {
  console.log('\nRestoring working LiveKit SIP configuration...\n')

  const sipClient = new SipClient(livekitUrl, apiKey, apiSecret)

  // Delete current broken trunk
  try {
    console.log('Deleting current trunk ST_aztE6XiPMH5K...')
    await sipClient.deleteSipTrunk('ST_aztE6XiPMH5K')
    console.log('✅ Deleted')
  } catch (e) {
    console.log('Note:', e.message)
  }

  // Delete current broken dispatch rule
  try {
    console.log('Deleting current dispatch rule SDR_x2vZZAQ8ZqhQ...')
    await sipClient.deleteSipDispatchRule('SDR_x2vZZAQ8ZqhQ')
    console.log('✅ Deleted')
  } catch (e) {
    console.log('Note:', e.message)
  }

  // Create trunk matching the working configuration
  console.log('\nCreating trunk with working config...')

  const trunk = await sipClient.createSipInboundTrunk(
    'SignalWire Inbound',
    ['+16282954811'],
    {
      allowedAddresses: ['0.0.0.0/0'], // Allow all IPs
      metadata: '',
    }
  )

  console.log('✅ Trunk created:', trunk.sipTrunkId)

  // Create dispatch rule - use Direct dispatch like the working call
  // The working call had room name "_+16045628647_XMfbTBt7X2bg" which suggests
  // a specific dispatch pattern
  console.log('\nCreating dispatch rule...')

  const rule = await sipClient.createSipDispatchRule(
    {
      type: 'individual',
      roomPrefix: '',  // Empty prefix to match working call pattern
      pin: '',
    },
    {
      trunkIds: [trunk.sipTrunkId],
      name: 'SW-calls',
      hidePhoneNumber: false,
      roomConfig: {
        agents: [{
          agentName: 'SW Telephony Agent',
          metadata: ''
        }]
      }
    }
  )

  console.log('✅ Dispatch rule created:', rule.sipDispatchRuleId)
  console.log('\n🎉 Configuration restored!')
  console.log('Trunk ID:', trunk.sipTrunkId)
  console.log('Dispatch Rule ID:', rule.sipDispatchRuleId)
}

restoreConfig()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
