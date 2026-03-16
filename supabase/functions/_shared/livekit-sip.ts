/**
 * LiveKit SIP trunk management helper.
 *
 * Automatically adds/removes phone numbers from the LiveKit SIP inbound trunk
 * so new numbers are immediately routable without manual CLI work.
 *
 * Uses updateSipInboundTrunkFields with ListUpdate for atomic add/remove
 * without needing to list the trunk first.
 *
 * Requires env vars: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_SIP_TRUNK_ID
 */

import { SipClient } from 'npm:livekit-server-sdk'

function getSipClient(): SipClient | null {
  const url = Deno.env.get('LIVEKIT_URL')
  const apiKey = Deno.env.get('LIVEKIT_API_KEY')
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')

  if (!url || !apiKey || !apiSecret) {
    console.error('LiveKit SIP: Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET')
    return null
  }

  // SipClient wants an HTTP URL, not WSS
  const httpUrl = url.replace('wss://', 'https://').replace('ws://', 'http://')
  return new SipClient(httpUrl, apiKey, apiSecret)
}

/**
 * Add a phone number to the LiveKit SIP inbound trunk.
 * Called after provisioning a number from SignalWire.
 */
export async function addNumberToSipTrunk(phoneNumber: string): Promise<boolean> {
  try {
    const sipClient = getSipClient()
    if (!sipClient) return false

    const trunkId = Deno.env.get('LIVEKIT_SIP_TRUNK_ID')
    if (!trunkId) {
      console.error('LiveKit SIP: LIVEKIT_SIP_TRUNK_ID not configured')
      return false
    }

    console.log('LiveKit SIP: Adding number to trunk:', phoneNumber)

    // Use updateSipInboundTrunkFields with ListUpdate.add for atomic append
    // This avoids needing to list the trunk first and handles deduplication
    await sipClient.updateSipInboundTrunkFields(trunkId, {
      numbers: { add: [phoneNumber] },
    })

    console.log('✅ LiveKit SIP: Number added to trunk:', phoneNumber)
    return true
  } catch (error) {
    console.error('⚠️ LiveKit SIP: Failed to add number to trunk:', error)
    return false
  }
}

/**
 * Remove a phone number from the LiveKit SIP inbound trunk.
 * Called when releasing a number.
 */
export async function removeNumberFromSipTrunk(phoneNumber: string): Promise<boolean> {
  try {
    const sipClient = getSipClient()
    if (!sipClient) return false

    const trunkId = Deno.env.get('LIVEKIT_SIP_TRUNK_ID')
    if (!trunkId) {
      console.error('LiveKit SIP: LIVEKIT_SIP_TRUNK_ID not configured')
      return false
    }

    console.log('LiveKit SIP: Removing number from trunk:', phoneNumber)

    // Use updateSipInboundTrunkFields with ListUpdate.remove for atomic removal
    await sipClient.updateSipInboundTrunkFields(trunkId, {
      numbers: { remove: [phoneNumber] },
    })

    console.log('✅ LiveKit SIP: Number removed from trunk:', phoneNumber)
    return true
  } catch (error) {
    console.error('⚠️ LiveKit SIP: Failed to remove number from trunk:', error)
    return false
  }
}
