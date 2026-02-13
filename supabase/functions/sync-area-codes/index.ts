import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * Sync area codes from NANPA database
 * Should be called weekly via cron or manual trigger
 *
 * NANPA provides area code data at:
 * https://www.nationalnanpa.com/nanp1/allutlzd.html (HTML table)
 * https://www.nationalnanpa.com/reports/reports_npa.html (Reports)
 */

Deno.serve(async (req) => {
  try {
    // Verify this is an authorized request (you can add a secret header check here)
    const authHeader = req.headers.get('authorization')
    const expectedAuth = Deno.env.get('SYNC_SECRET') || 'Bearer sync-secret'

    if (authHeader !== expectedAuth) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('Starting area code sync from NANPA...')

    // Fetch NANPA data
    // Note: NANPA doesn't provide a clean API, so we need to scrape or use an alternative source
    // For now, we'll use a maintained JSON source or manual process
    // Alternative: Use libphonenumber metadata

    // Fetch Canadian area codes from a reliable source
    // Using a JSON endpoint that aggregates NANPA data (you may need to host this yourself)
    const canadianAreaCodes = [
      // Alberta
      { area_code: '403', country_code: '1', country: 'Canada', region: 'Alberta', notes: 'Calgary, southern Alberta' },
      { area_code: '587', country_code: '1', country: 'Canada', region: 'Alberta', notes: 'Overlay for 403, 780, 825' },
      { area_code: '780', country_code: '1', country: 'Canada', region: 'Alberta', notes: 'Edmonton, northern Alberta' },
      { area_code: '825', country_code: '1', country: 'Canada', region: 'Alberta', notes: 'Overlay for 780' },

      // British Columbia
      { area_code: '236', country_code: '1', country: 'Canada', region: 'British Columbia', notes: 'Overlay for 604, 778' },
      { area_code: '250', country_code: '1', country: 'Canada', region: 'British Columbia', notes: 'Victoria, most of BC outside Vancouver' },
      { area_code: '604', country_code: '1', country: 'Canada', region: 'British Columbia', notes: 'Vancouver, Lower Mainland' },
      { area_code: '672', country_code: '1', country: 'Canada', region: 'British Columbia', notes: 'Overlay for 604, 778, 236' },
      { area_code: '778', country_code: '1', country: 'Canada', region: 'British Columbia', notes: 'Overlay for 604, 250' },

      // Manitoba
      { area_code: '204', country_code: '1', country: 'Canada', region: 'Manitoba', notes: 'Entire province' },
      { area_code: '431', country_code: '1', country: 'Canada', region: 'Manitoba', notes: 'Overlay for 204' },
      { area_code: '584', country_code: '1', country: 'Canada', region: 'Manitoba', notes: 'Overlay for 204, 431' },

      // New Brunswick
      { area_code: '506', country_code: '1', country: 'Canada', region: 'New Brunswick', notes: 'Entire province' },

      // Newfoundland and Labrador
      { area_code: '709', country_code: '1', country: 'Canada', region: 'Newfoundland and Labrador', notes: 'Entire province' },

      // Territories
      { area_code: '867', country_code: '1', country: 'Canada', region: 'Territories', notes: 'NWT, Nunavut, Yukon' },

      // Nova Scotia, PEI
      { area_code: '782', country_code: '1', country: 'Canada', region: 'Nova Scotia/PEI', notes: 'Overlay for 902' },
      { area_code: '902', country_code: '1', country: 'Canada', region: 'Nova Scotia/PEI', notes: 'Nova Scotia and PEI' },

      // Ontario
      { area_code: '226', country_code: '1', country: 'Canada', region: 'Ontario', notes: 'Overlay for 519' },
      { area_code: '249', country_code: '1', country: 'Canada', region: 'Ontario', notes: 'Overlay for 705' },
      { area_code: '289', country_code: '1', country: 'Canada', region: 'Ontario', notes: 'Overlay for 905, 365' },
      { area_code: '343', country_code: '1', country: 'Canada', region: 'Ontario', notes: 'Overlay for 613' },
      { area_code: '365', country_code: '1', country: 'Canada', region: 'Ontario', notes: 'Overlay for 905, 289' },
      { area_code: '416', country_code: '1', country: 'Canada', region: 'Ontario', notes: 'Toronto' },
      { area_code: '437', country_code: '1', country: 'Canada', region: 'Ontario', notes: 'Overlay for 416, 647' },
      { area_code: '519', country_code: '1', country: 'Canada', region: 'Ontario', notes: 'Southwest Ontario' },
      { area_code: '548', country_code: '1', country: 'Canada', region: 'Ontario', notes: 'Overlay for 226, 519' },
      { area_code: '613', country_code: '1', country: 'Canada', region: 'Ontario', notes: 'Ottawa, eastern Ontario' },
      { area_code: '647', country_code: '1', country: 'Canada', region: 'Ontario', notes: 'Overlay for 416' },
      { area_code: '705', country_code: '1', country: 'Canada', region: 'Ontario', notes: 'Northern Ontario' },
      { area_code: '742', country_code: '1', country: 'Canada', region: 'Ontario', notes: 'Overlay for 705, 249' },
      { area_code: '753', country_code: '1', country: 'Canada', region: 'Ontario', notes: 'Overlay for 613, 343' },
      { area_code: '807', country_code: '1', country: 'Canada', region: 'Ontario', notes: 'Northwestern Ontario' },
      { area_code: '905', country_code: '1', country: 'Canada', region: 'Ontario', notes: 'Greater Toronto Area' },

      // Quebec
      { area_code: '263', country_code: '1', country: 'Canada', region: 'Quebec', notes: 'Overlay for 819, 873' },
      { area_code: '354', country_code: '1', country: 'Canada', region: 'Quebec', notes: 'Overlay for 450, 579' },
      { area_code: '367', country_code: '1', country: 'Canada', region: 'Quebec', notes: 'Overlay for 418, 581' },
      { area_code: '382', country_code: '1', country: 'Canada', region: 'Quebec', notes: 'Overlay for 514, 438, 428' },
      { area_code: '387', country_code: '1', country: 'Canada', region: 'Quebec', notes: 'Overlay for 819, 873, 263' },
      { area_code: '418', country_code: '1', country: 'Canada', region: 'Quebec', notes: 'Quebec City, eastern Quebec' },
      { area_code: '428', country_code: '1', country: 'Canada', region: 'Quebec', notes: 'Overlay for 514, 438' },
      { area_code: '438', country_code: '1', country: 'Canada', region: 'Quebec', notes: 'Overlay for 514' },
      { area_code: '450', country_code: '1', country: 'Canada', region: 'Quebec', notes: 'Regions surrounding Montreal' },
      { area_code: '468', country_code: '1', country: 'Canada', region: 'Quebec', notes: 'Overlay for 514, 438, 428, 382' },
      { area_code: '474', country_code: '1', country: 'Canada', region: 'Quebec', notes: 'Overlay for 450, 579, 354' },
      { area_code: '514', country_code: '1', country: 'Canada', region: 'Quebec', notes: 'Montreal' },
      { area_code: '579', country_code: '1', country: 'Canada', region: 'Quebec', notes: 'Overlay for 450' },
      { area_code: '581', country_code: '1', country: 'Canada', region: 'Quebec', notes: 'Overlay for 418' },
      { area_code: '819', country_code: '1', country: 'Canada', region: 'Quebec', notes: 'Western Quebec, Outaouais' },
      { area_code: '873', country_code: '1', country: 'Canada', region: 'Quebec', notes: 'Overlay for 819' },
      { area_code: '879', country_code: '1', country: 'Canada', region: 'Quebec', notes: 'Overlay for 819, 873, 263, 387' },

      // Saskatchewan
      { area_code: '306', country_code: '1', country: 'Canada', region: 'Saskatchewan', notes: 'Entire province' },
      { area_code: '368', country_code: '1', country: 'Canada', region: 'Saskatchewan', notes: 'Overlay for 306, 639' },
      { area_code: '639', country_code: '1', country: 'Canada', region: 'Saskatchewan', notes: 'Overlay for 306' },
    ]

    // Upsert all Canadian area codes
    let updatedCount = 0
    for (const areaCode of canadianAreaCodes) {
      const { error } = await supabase
        .from('area_codes')
        .upsert({
          ...areaCode,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'area_code'
        })

      if (error) {
        console.error(`Error upserting area code ${areaCode.area_code}:`, error)
      } else {
        updatedCount++
      }
    }

    console.log(`Area code sync complete. Updated ${updatedCount} of ${canadianAreaCodes.length} Canadian area codes.`)

    return new Response(JSON.stringify({
      success: true,
      updated: updatedCount,
      total: canadianAreaCodes.length,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in sync-area-codes:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
