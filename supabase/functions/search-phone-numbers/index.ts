import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

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

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // Authenticate user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const user = await resolveUser(req, supabaseClient)
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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
    const normalizedQuery = searchQuery.toLowerCase()

    // Helper function to search SignalWire
    const searchSignalWire = async (areaCode: string, country: string = 'US') => {
      const searchParams = new URLSearchParams()
      searchParams.append('AreaCode', areaCode)
      searchParams.append('PageSize', '20')

      const url = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/AvailablePhoneNumbers/${country}/Local.json?${searchParams.toString()}`

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

    // Helper function to search by country
    const searchByCountry = async (country: string) => {
      // For Canada, search ALL Canadian area codes
      const canadianAreaCodes = [
        '204', '226', '236', '249', '250', '289', '306', '343', '365', '367',
        '403', '416', '418', '431', '437', '438', '450', '506', '514', '519',
        '548', '579', '581', '587', '604', '613', '639', '647', '672', '705',
        '709', '742', '753', '778', '780', '782', '807', '819', '825', '867',
        '873', '902', '905'
      ]
      const usCountryCode = country === 'CA' ? 'US' : 'US' // SignalWire only has US endpoint

      let allNumbers: any[] = []

      if (country === 'CA') {
        // Search Canadian area codes
        console.log('Searching all Canadian area codes for SMS-capable numbers')
        for (const areaCode of canadianAreaCodes) {
          const searchParams = new URLSearchParams()
          searchParams.append('AreaCode', areaCode)
          searchParams.append('PageSize', '20')

          const url = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/AvailablePhoneNumbers/${usCountryCode}/Local.json?${searchParams.toString()}`

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`),
            },
          })

          if (response.ok) {
            const result = await response.json()
            const numbers = result.available_phone_numbers || []
            // Filter to only SMS-capable numbers immediately
            const smsNumbers = numbers.filter((num: any) => num.capabilities?.SMS === true)
            allNumbers.push(...smsNumbers)
            console.log(`Area code ${areaCode}: ${smsNumbers.length} SMS-capable numbers found`)
            if (allNumbers.length >= 50) break
          }
        }
      } else {
        // For US, get general available numbers
        const searchParams = new URLSearchParams()
        searchParams.append('PageSize', '50')

        const url = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/AvailablePhoneNumbers/US/Local.json?${searchParams.toString()}`

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`),
          },
        })

        if (response.ok) {
          const result = await response.json()
          const numbers = result.available_phone_numbers || []
          allNumbers = numbers.filter((num: any) => num.capabilities?.SMS === true)
        }
      }

      console.log('Total SMS-capable numbers found:', allNumbers.length)
      return allNumbers
    }

    let allNumbers: any[] = []

    // Check if searching by country
    if (normalizedQuery === 'canada' || normalizedQuery === 'ca') {
      console.log('Searching for SMS-capable numbers in Canada')
      allNumbers = await searchByCountry('CA')
    } else if (normalizedQuery === 'usa' || normalizedQuery === 'us' || normalizedQuery === 'united states') {
      console.log('Searching for SMS-capable numbers in USA')
      allNumbers = await searchByCountry('US')
    } else if (isNumeric) {
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
      // Map common city names to their primary area codes
      const cityAreaCodes: Record<string, string[]> = {
        'san francisco': ['415', '628'],
        'sf': ['415', '628'],
        'los angeles': ['213', '323', '310'],
        'la': ['213', '323', '310'],
        'new york': ['212', '646', '917'],
        'nyc': ['212', '646', '917'],
        'vancouver': ['604', '236', '778'],
      }

      let areaCodesToSearch: string[] = []

      // Try to match common city names
      for (const [city, codes] of Object.entries(cityAreaCodes)) {
        if (normalizedQuery.includes(city)) {
          areaCodesToSearch = codes
          break
        }
      }

      // If no match, try using InRegion parameter (state abbreviation)
      if (areaCodesToSearch.length === 0) {
        // Extract potential state code (last 2 letters if present)
        const stateMatch = searchQuery.match(/\b([A-Z]{2})\b/i)
        if (stateMatch) {
          const searchParams = new URLSearchParams()
          searchParams.append('InRegion', stateMatch[1].toUpperCase())
          searchParams.append('PageSize', '20')

          const url = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/AvailablePhoneNumbers/US/Local.json?${searchParams.toString()}`

          console.log('Searching by state:', url)

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`),
            },
          })

          if (response.ok) {
            const result = await response.json()
            allNumbers = result.available_phone_numbers || []
          }
        }
      } else {
        // Search by area codes we found for this city
        console.log('Searching city area codes:', areaCodesToSearch)
        for (const code of areaCodesToSearch) {
          const numbers = await searchSignalWire(code)
          allNumbers.push(...numbers)
          if (allNumbers.length >= 20) break
        }
      }
    }

    // Transform SignalWire response to our format
    const numbers = allNumbers.map((num: any) => ({
      phone_number: num.phone_number,
      locality: num.locality || 'Unknown',
      region: num.region || 'Unknown',
      capabilities: {
        voice: num.capabilities?.voice === true || num.capabilities?.Voice === true,
        sms: num.capabilities?.sms === true || num.capabilities?.SMS === true,
        mms: num.capabilities?.mms === true || num.capabilities?.MMS === true,
      },
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