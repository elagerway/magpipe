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

// Canadian province to area codes mapping
const provinceAreaCodes: Record<string, string[]> = {
  'AB': ['403', '587', '825', '780'],
  'BC': ['604', '236', '778', '672', '250'],
  'MB': ['204', '431'],
  'NB': ['506'],
  'NL': ['709'],
  'NS': ['902', '782'],
  'NT': ['867'],
  'NU': ['867'],
  'ON': ['416', '647', '437', '226', '519', '548', '613', '343', '705', '249', '807', '289', '905', '365', '742'],
  'PE': ['902'],
  'QC': ['514', '438', '450', '579', '819', '873', '418', '581', '367'],
  'SK': ['306', '639'],
  'YT': ['867'],
}

// City to state/province mapping for city-based search
// SignalWire only supports InRegion (state abbreviation), NOT InLocality
const cityToRegion: Record<string, { region: string, areaCodes?: string[], country: string }> = {
  // Canada
  'vancouver': { region: 'BC', areaCodes: ['604', '236', '778'], country: 'CA' },
  'toronto': { region: 'ON', areaCodes: ['416', '647', '437'], country: 'CA' },
  'montreal': { region: 'QC', areaCodes: ['514', '438'], country: 'CA' },
  'calgary': { region: 'AB', areaCodes: ['403', '587'], country: 'CA' },
  'edmonton': { region: 'AB', areaCodes: ['780', '587'], country: 'CA' },
  'ottawa': { region: 'ON', areaCodes: ['613', '343'], country: 'CA' },
  'winnipeg': { region: 'MB', areaCodes: ['204', '431'], country: 'CA' },
  'victoria': { region: 'BC', areaCodes: ['250', '778'], country: 'CA' },
  'halifax': { region: 'NS', areaCodes: ['902', '782'], country: 'CA' },
  'quebec city': { region: 'QC', areaCodes: ['418', '581'], country: 'CA' },
  'surrey': { region: 'BC', areaCodes: ['604', '778'], country: 'CA' },
  'burnaby': { region: 'BC', areaCodes: ['604', '778'], country: 'CA' },
  'mississauga': { region: 'ON', areaCodes: ['905', '289'], country: 'CA' },
  'brampton': { region: 'ON', areaCodes: ['905', '289'], country: 'CA' },
  'hamilton': { region: 'ON', areaCodes: ['905', '289'], country: 'CA' },
  'london': { region: 'ON', areaCodes: ['519', '226'], country: 'CA' },
  'kitchener': { region: 'ON', areaCodes: ['519', '226'], country: 'CA' },
  'saskatoon': { region: 'SK', areaCodes: ['306', '639'], country: 'CA' },
  'regina': { region: 'SK', areaCodes: ['306', '639'], country: 'CA' },
  // US
  'new york': { region: 'NY', areaCodes: ['212', '646', '917'], country: 'US' },
  'nyc': { region: 'NY', areaCodes: ['212', '646', '917'], country: 'US' },
  'los angeles': { region: 'CA', areaCodes: ['213', '323', '310'], country: 'US' },
  'la': { region: 'CA', areaCodes: ['213', '323', '310'], country: 'US' },
  'san francisco': { region: 'CA', areaCodes: ['415', '628'], country: 'US' },
  'sf': { region: 'CA', areaCodes: ['415', '628'], country: 'US' },
  'chicago': { region: 'IL', areaCodes: ['312', '773'], country: 'US' },
  'houston': { region: 'TX', areaCodes: ['713', '832', '281'], country: 'US' },
  'dallas': { region: 'TX', areaCodes: ['214', '972'], country: 'US' },
  'austin': { region: 'TX', areaCodes: ['512', '737'], country: 'US' },
  'san antonio': { region: 'TX', areaCodes: ['210'], country: 'US' },
  'phoenix': { region: 'AZ', areaCodes: ['602', '480'], country: 'US' },
  'philadelphia': { region: 'PA', areaCodes: ['215', '267'], country: 'US' },
  'san diego': { region: 'CA', areaCodes: ['619', '858'], country: 'US' },
  'san jose': { region: 'CA', areaCodes: ['408', '669'], country: 'US' },
  'seattle': { region: 'WA', areaCodes: ['206', '253'], country: 'US' },
  'denver': { region: 'CO', areaCodes: ['303', '720'], country: 'US' },
  'boston': { region: 'MA', areaCodes: ['617', '857'], country: 'US' },
  'miami': { region: 'FL', areaCodes: ['305', '786'], country: 'US' },
  'atlanta': { region: 'GA', areaCodes: ['404', '470'], country: 'US' },
  'portland': { region: 'OR', areaCodes: ['503', '971'], country: 'US' },
  'las vegas': { region: 'NV', areaCodes: ['702', '725'], country: 'US' },
  'detroit': { region: 'MI', areaCodes: ['313', '248'], country: 'US' },
  'minneapolis': { region: 'MN', areaCodes: ['612', '763'], country: 'US' },
  'tampa': { region: 'FL', areaCodes: ['813', '656'], country: 'US' },
  'orlando': { region: 'FL', areaCodes: ['407', '689'], country: 'US' },
  'nashville': { region: 'TN', areaCodes: ['615', '629'], country: 'US' },
  'charlotte': { region: 'NC', areaCodes: ['704', '980'], country: 'US' },
  'washington': { region: 'DC', areaCodes: ['202'], country: 'US' },
  'dc': { region: 'DC', areaCodes: ['202'], country: 'US' },
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

    const body = await req.json()

    // Support both legacy { query } and new structured params
    const { query, areaCode, country, numberType, state, city } = body
    const isStructured = !!(areaCode || state || city || country || numberType)

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

    const authHeader = 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`)
    const isTollFree = numberType === 'tollFree'
    const searchCountry = country || 'US'

    // Helper: build and execute a SignalWire search
    const searchSignalWire = async (params: Record<string, string>, tollFree = false) => {
      const searchParams = new URLSearchParams(params)
      const type = tollFree ? 'TollFree' : 'Local'
      const url = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/AvailablePhoneNumbers/US/${type}.json?${searchParams.toString()}`

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': authHeader },
      })

      if (response.ok) {
        const result = await response.json()
        return result.available_phone_numbers || []
      }
      return []
    }

    let allNumbers: any[] = []
    let usedFallback = false

    // ── Structured search (new UI) ──────────────────────────────
    if (isStructured) {
      if (areaCode) {
        // Area code search (AreaCode param works for both Local and TollFree endpoints)
        console.log(`Searching ${isTollFree ? 'toll-free' : 'local'} numbers for area code: ${areaCode}`)

        allNumbers = await searchSignalWire({ AreaCode: areaCode, PageSize: '20' }, isTollFree)

        // Try fallback area codes if no results (local only — toll-free prefixes don't have regional fallbacks)
        if (!isTollFree && allNumbers.length === 0 && areaCodeRegions[areaCode]) {
          console.log('No numbers found, trying regional fallbacks:', areaCodeRegions[areaCode])
          for (const fallbackCode of areaCodeRegions[areaCode]) {
            const fallbackNumbers = await searchSignalWire({ AreaCode: fallbackCode, PageSize: '20' })
            allNumbers.push(...fallbackNumbers)
            if (allNumbers.length >= 20) break
          }
          if (allNumbers.length > 0) usedFallback = true
        }
      } else if (state) {
        // State/province search (from API key users who pass state directly)
        console.log(`Searching ${isTollFree ? 'toll-free' : 'local'} numbers in state/province: ${state}, country: ${searchCountry}`)

        if (searchCountry === 'CA') {
          const areaCodes = provinceAreaCodes[state] || []
          for (const code of areaCodes) {
            const numbers = await searchSignalWire({ AreaCode: code, PageSize: '20' })
            allNumbers.push(...numbers)
            if (allNumbers.length >= 20) break
          }
        } else {
          allNumbers = isTollFree
            ? await searchSignalWire({ InRegion: state, PageSize: '20' }, true)
            : await searchSignalWire({ InRegion: state, PageSize: '20' })
        }
      } else if (city) {
        // City search — resolve city to region/area codes
        const normalizedCity = city.trim().toLowerCase()
        const cityInfo = cityToRegion[normalizedCity]
        console.log(`Searching numbers for city: ${city}`, cityInfo ? `→ ${cityInfo.region}` : '(no mapping)')

        if (cityInfo) {
          if (cityInfo.areaCodes) {
            // Search by the city's known area codes for more targeted results
            for (const code of cityInfo.areaCodes) {
              const numbers = await searchSignalWire({ AreaCode: code, PageSize: '20' }, isTollFree)
              allNumbers.push(...numbers)
              if (allNumbers.length >= 20) break
            }
          } else {
            // Fallback to InRegion for US cities without specific area codes
            allNumbers = isTollFree
              ? await searchSignalWire({ InRegion: cityInfo.region, PageSize: '20' }, true)
              : await searchSignalWire({ InRegion: cityInfo.region, PageSize: '20' })
          }
        } else {
          // Unknown city — try as a US state abbreviation (e.g. user typed "TX")
          const stateMatch = normalizedCity.match(/^([a-z]{2})$/i)
          if (stateMatch) {
            allNumbers = isTollFree
              ? await searchSignalWire({ InRegion: stateMatch[1].toUpperCase(), PageSize: '20' }, true)
              : await searchSignalWire({ InRegion: stateMatch[1].toUpperCase(), PageSize: '20' })
          }
          // If still no results, return empty — we can't guess the region
        }
      } else if (searchCountry) {
        // Country-only search (just selected a country, no other filters)
        console.log(`Searching numbers in country: ${searchCountry}`)
        if (searchCountry === 'CA') {
          // Search a few major Canadian area codes
          const majorCodes = ['604', '416', '514', '403', '613']
          for (const code of majorCodes) {
            const numbers = await searchSignalWire({ AreaCode: code, PageSize: '10' })
            allNumbers.push(...numbers)
            if (allNumbers.length >= 20) break
          }
        } else {
          allNumbers = isTollFree
            ? await searchSignalWire({ PageSize: '20' }, true)
            : await searchSignalWire({ PageSize: '20' })
        }
      }

    // ── Legacy search (backward compatibility) ──────────────────
    } else if (query) {
      const searchQuery = query.trim()
      const normalizedQuery = searchQuery.toLowerCase()
      const isNumeric = /^\d+$/.test(searchQuery)

      if (normalizedQuery === 'canada' || normalizedQuery === 'ca') {
        const canadianAreaCodes = [
          '204', '226', '236', '249', '250', '289', '306', '343', '365', '367',
          '403', '416', '418', '431', '437', '438', '450', '506', '514', '519',
          '548', '579', '581', '587', '604', '613', '639', '647', '672', '705',
          '709', '742', '753', '778', '780', '782', '807', '819', '825', '867',
          '873', '902', '905'
        ]
        for (const code of canadianAreaCodes) {
          const numbers = await searchSignalWire({ AreaCode: code, PageSize: '20' })
          const smsNumbers = numbers.filter((num: any) => num.capabilities?.SMS === true)
          allNumbers.push(...smsNumbers)
          if (allNumbers.length >= 50) break
        }
      } else if (normalizedQuery === 'usa' || normalizedQuery === 'us' || normalizedQuery === 'united states') {
        const numbers = await searchSignalWire({ PageSize: '50' })
        allNumbers = numbers.filter((num: any) => num.capabilities?.SMS === true)
      } else if (isNumeric) {
        allNumbers = await searchSignalWire({ AreaCode: searchQuery, PageSize: '20' })
        if (allNumbers.length === 0 && areaCodeRegions[searchQuery]) {
          for (const fallbackCode of areaCodeRegions[searchQuery]) {
            const fallbackNumbers = await searchSignalWire({ AreaCode: fallbackCode, PageSize: '20' })
            allNumbers.push(...fallbackNumbers)
            if (allNumbers.length >= 20) break
          }
          if (allNumbers.length > 0) usedFallback = true
        }
      } else {
        // Location search
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
        for (const [cityKey, codes] of Object.entries(cityAreaCodes)) {
          if (normalizedQuery.includes(cityKey)) {
            areaCodesToSearch = codes
            break
          }
        }

        if (areaCodesToSearch.length === 0) {
          const stateMatch = searchQuery.match(/\b([A-Z]{2})\b/i)
          if (stateMatch) {
            allNumbers = await searchSignalWire({ InRegion: stateMatch[1].toUpperCase(), PageSize: '20' })
          }
        } else {
          for (const code of areaCodesToSearch) {
            const numbers = await searchSignalWire({ AreaCode: code, PageSize: '20' })
            allNumbers.push(...numbers)
            if (allNumbers.length >= 20) break
          }
        }
      }
    } else {
      return new Response(
        JSON.stringify({ error: 'Search parameters required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Transform SignalWire response to our format
    const numbers = allNumbers.slice(0, 25).map((num: any) => ({
      phone_number: num.phone_number,
      locality: num.locality || 'Unknown',
      region: num.region || 'Unknown',
      capabilities: {
        voice: num.capabilities?.voice === true || num.capabilities?.Voice === true,
        sms: num.capabilities?.sms === true || num.capabilities?.SMS === true,
        mms: num.capabilities?.mms === true || num.capabilities?.MMS === true,
        fax: num.capabilities?.fax === true || num.capabilities?.Fax === true,
      },
    }))

    return new Response(
      JSON.stringify({
        numbers,
        searchedQuery: query || areaCode || state || city,
        usedFallback,
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
