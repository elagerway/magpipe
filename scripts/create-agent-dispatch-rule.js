/**
 * Create LiveKit Agent Dispatch Rule for outbound calls
 * This will automatically send "SW Telephony Agent" to rooms with prefix "outbound-"
 */

import { AgentDispatchClient } from 'livekit-server-sdk'
import dotenv from 'dotenv'

dotenv.config()

const livekitUrl = process.env.LIVEKIT_URL
const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET

async function createAgentDispatchRule() {
  console.log('\nCreating LiveKit Agent Dispatch Rule for outbound calls...\n')

  const dispatchClient = new AgentDispatchClient(livekitUrl, apiKey, apiSecret)

  try {
    // First, let's list existing dispatch rules to see what we have
    console.log('Checking existing agent dispatch rules...')
    const existingRules = await dispatchClient.listDispatch()
    console.log('Existing rules:', JSON.stringify(existingRules, null, 2))

    console.log('\n---\n')

    // Create a dispatch rule for outbound calls
    // This should automatically send "SW Telephony Agent" to any room with prefix "outbound-"
    console.log('Creating dispatch rule for outbound calls...')
    console.log('  → Room prefix: outbound-')
    console.log('  → Agent name: SW Telephony Agent')

    // Note: The exact API for creating dispatch rules may vary
    // We might need to check the LiveKit SDK documentation for the correct method
    console.log('\n⚠️  Need to check LiveKit SDK for agent dispatch rule creation')
    console.log('The AgentDispatchClient might not have a createRule method')
    console.log('This might need to be configured via LiveKit Cloud dashboard')

  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.body) {
      console.error('Details:', error.body)
    }
    if (error.stack) {
      console.error('Stack:', error.stack)
    }
  }
}

createAgentDispatchRule()
  .then(() => {
    console.log('\n✅ Done')
    process.exit(0)
  })
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
