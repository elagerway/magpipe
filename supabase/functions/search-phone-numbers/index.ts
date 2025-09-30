import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Regional area code mappings for fallbacks
const areaCodeRegions: Record<string, string[]> = {
  // British Columbia (Vancouver area)
  '604': ['236', '778', '672'],
  '236': ['604', '778', '672'],
  '778': ['604', '236', '672'],
  '672': ['604', '236', '778'],

  // California - San Francisco Bay Area
  '415': ['628', '510', '925'],
  '628': ['415', '510', '925'],
  '510': ['415', '628', '925'],
  '925': ['415', '628', '510'],

  // California - Los Angeles
  '213': ['323', '310', '424', '818'],
  '323': ['213', '310', '424', '818'],
  '310': ['213', '323', '424', '818'],
  '424': ['213', '323', '310', '818'],
  '818': ['213', '323', '310', '424'],

  // New York City
  '212': ['646', '917', '332', '718'],
  '646': ['212', '917', '332', '718'],
  '917': ['212', '646', '332', '718'],
  '332': ['212', '646', '917', '718'],
  '718': ['212', '646', '917', '332'],
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query } = await req.json()

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Search query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get SignalWire credentials
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')
    const signalwireToken = Deno.env.get('SIGNALWIRE_API_TOKEN')
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')

    if (!signalwireProjectId || !signalwireToken || !signalwireSpaceUrl) {
      return new Response(
        JSON.stringify({ error: 'SignalWire configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Determine if query is numeric (area code) or text (location)
    const isNumeric = /^\d+$/.test(query.trim())
    const searchQuery = query.trim()

    // Helper function to search SignalWire
    const searchSignalWire = async (areaCode: string) => {
      const searchParams = new URLSearchParams()
      searchParams.append('AreaCode', areaCode)
      searchParams.append('PageSize', '20')

      const url = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/AvailablePhoneNumbers/US/Local.json?${searchParams.toString()}`

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`),
        },
      })

      if (response.ok) {
        const result = await response.json()
        return result.available_phone_numbers || []
      }
      return []
    }

    let allNumbers: any[] = []

    if (isNumeric) {
      // Search by area code
      console.log('Searching for area code:', searchQuery)
      allNumbers = await searchSignalWire(searchQuery)

      // If no numbers found, try fallback area codes in the same region
      if (allNumbers.length === 0 && areaCodeRegions[searchQuery]) {
        console.log('No numbers found, trying regional fallbacks:', areaCodeRegions[searchQuery])

        for (const fallbackCode of areaCodeRegions[searchQuery]) {
          const fallbackNumbers = await searchSignalWire(fallbackCode)
          if (fallbackNumbers.length > 0) {
            allNumbers.push(...fallbackNumbers)
            // Limit total results
            if (allNumbers.length >= 20) break
          }
        }
      }
    } else {
      // Search by location (city/state)
      const searchParams = new URLSearchParams()
      searchParams.append('Contains', searchQuery)
      searchParams.append('PageSize', '20')

      const url = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/AvailablePhoneNumbers/US/Local.json?${searchParams.toString()}`

      console.log('Searching by location:', url)

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`),
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('SignalWire error:', errorText)
        return new Response(
          JSON.stringify({ error: 'Failed to search phone numbers' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const result = await response.json()
      allNumbers = result.available_phone_numbers || []
    }

    // Transform SignalWire response to our format
    const numbers = allNumbers.map((num: any) => ({
      phone_number: num.phone_number,
      locality: num.locality || 'Unknown',
      region: num.region || 'Unknown',
      capabilities: num.capabilities,
    }))

    return new Response(
      JSON.stringify({
        numbers,
        searchedQuery: searchQuery,
        usedFallback: isNumeric && numbers.length > 0 && allNumbers.length > 0
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in search-phone-numbers:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})