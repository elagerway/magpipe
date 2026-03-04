import { corsHeaders, handleCors } from '../_shared/cors.ts'
/**
 * Search Business Edge Function
 * Searches Google Places API for business info
 */

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const { query, location, lat, lng, intent, message } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Missing query parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');

    if (!GOOGLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Business search is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use provided coordinates or location text
    const searchLat = lat;
    const searchLng = lng;

    // If no coordinates AND no location text, ask user for their city
    if (!searchLat && !searchLng && !location) {
      return new Response(
        JSON.stringify({
          needs_location: true,
          error: `What city are you in? I need your location to find ${query} near you.`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Progressive radius search - start small, expand if needed
    const radiusSteps = [5000, 15000, 50000]; // 5km, 15km, 50km
    let placesData = null;
    let usedRadius = 0;

    for (const radius of radiusSteps) {
      const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
      // Include location in query if provided as text (e.g., "Pizza Hut Toronto")
      searchUrl.searchParams.set('query', location ? `${query} ${location}` : query);
      searchUrl.searchParams.set('key', GOOGLE_API_KEY);

      // Add location bias if we have coordinates
      if (searchLat && searchLng) {
        searchUrl.searchParams.set('location', `${searchLat},${searchLng}`);
        searchUrl.searchParams.set('radius', radius.toString());
        console.log(`[search-business] Searching with ${radius/1000}km radius`);
      } else if (location) {
        console.log(`[search-business] Searching with location text: ${location}`);
      }

      const placesResponse = await fetch(searchUrl.toString());
      placesData = await placesResponse.json();

      if (placesData.status === 'OK' && placesData.results && placesData.results.length > 0) {
        usedRadius = radius;
        console.log(`[search-business] Found results`);
        break;
      }

      // If using text location (no coords), don't retry with larger radius
      if (!searchLat || !searchLng) break;
    }

    if (!placesData || placesData.status !== 'OK' || !placesData.results || placesData.results.length === 0) {
      return new Response(
        JSON.stringify({
          error: `I couldn't find any businesses matching "${query}"${location ? ` near ${location}` : ''}. Try being more specific or adding a location.`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const place = placesData.results[0];

    // Get place details to get phone number
    const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    detailsUrl.searchParams.set('place_id', place.place_id);
    detailsUrl.searchParams.set('fields', 'formatted_phone_number,international_phone_number,name,formatted_address,website');
    detailsUrl.searchParams.set('key', GOOGLE_API_KEY);

    const detailsResponse = await fetch(detailsUrl.toString());
    const detailsData = await detailsResponse.json();
    const details = detailsData.result;

    if (!details || (!details.international_phone_number && !details.formatted_phone_number)) {
      return new Response(
        JSON.stringify({
          error: `I found ${details?.name || place.name} at ${details?.formatted_address || place.formatted_address}, but they don't have a phone number listed. Would you like me to search for another location?`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize phone number to E.164 format
    const rawPhone = details.international_phone_number || details.formatted_phone_number;
    const phoneDigits = rawPhone.replace(/\D/g, '');
    const normalizedPhone = phoneDigits.length === 10 ? `+1${phoneDigits}` : `+${phoneDigits}`;

    return new Response(
      JSON.stringify({
        business: {
          name: details.name,
          phone: details.formatted_phone_number || details.international_phone_number,
          phone_number: normalizedPhone,
          address: details.formatted_address,
          website: details.website || null,
        },
        intent,
        message,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Search business error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to search for business' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
