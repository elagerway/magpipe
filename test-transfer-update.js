// Quick test script to call the update-retell-transfer-tool function
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testUpdate() {
  console.log('Getting session...')
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()

  if (sessionError || !session) {
    console.error('No session:', sessionError)
    return
  }

  console.log('Calling update-retell-transfer-tool...')

  const response = await fetch(`${supabaseUrl}/functions/v1/update-retell-transfer-tool`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  })

  console.log('Status:', response.status)
  console.log('Status Text:', response.statusText)

  const text = await response.text()
  console.log('Response:', text)

  try {
    const json = JSON.parse(text)
    console.log('Parsed:', JSON.stringify(json, null, 2))
  } catch (e) {
    console.log('Could not parse as JSON')
  }
}

testUpdate()
