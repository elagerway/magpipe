/**
 * Contact Lookup - Enriches contact data using FullContact API
 * Takes a phone number, returns enriched contact info
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const { phone } = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'Phone number required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client for auth check
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify caller is authenticated (user token or service role key)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Check if it's the service role key (for server-to-server calls)
    const isServiceRole = token === supabaseKey;

    if (!isServiceRole) {
      // Verify user token
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Call FullContact API
    const fullContactApiKey = Deno.env.get('FULLCONTACT_API_KEY');
    if (!fullContactApiKey) {
      return new Response(
        JSON.stringify({ error: 'FullContact API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Looking up contact for phone: ${phone}`);

    const fcResponse = await fetch('https://api.fullcontact.com/v3/person.enrich', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${fullContactApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone }),
    });

    if (!fcResponse.ok) {
      const errorText = await fcResponse.text();
      console.error('FullContact API error:', fcResponse.status, errorText);

      if (fcResponse.status === 404 || fcResponse.status === 422) {
        return new Response(
          JSON.stringify({ error: 'No data found for this phone number', notFound: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Lookup service error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fcData = await fcResponse.json();
    console.log('FullContact response:', JSON.stringify(fcData).substring(0, 500));

    // Parse FullContact response into our contact format
    const contact: Record<string, unknown> = {};

    // FullContact API returns data at top level AND in details object
    const details = fcData.details || {};

    // Name - check both top level and details
    if (fcData.fullName) {
      contact.name = fcData.fullName;
    }
    const nameObj = fcData.name || details.name;
    if (nameObj) {
      contact.first_name = nameObj.given || '';
      contact.last_name = nameObj.family || '';
    }

    // Email - check both top level and details
    const emails = fcData.emails || details.emails;
    if (emails && emails.length > 0) {
      contact.email = emails[0].value || emails[0].address || emails[0];
    }

    // Location - check both top level and details
    const location = fcData.location || (details.locations && details.locations[0]);
    if (location) {
      contact.city = location.city;
      contact.region = location.region;
      contact.country = location.country;
      // Build address string
      const addressParts = [location.city, location.region, location.country].filter(Boolean);
      if (addressParts.length > 0) {
        contact.address = addressParts.join(', ');
      }
    }

    // Employment - check both top level and details
    const employment = fcData.employment || details.employment;
    if (employment && employment.length > 0) {
      const job = employment[0];
      contact.company = job.name || job.domain;
      contact.job_title = job.title || fcData.title;
    } else if (fcData.organization || fcData.title) {
      // Some responses have organization/title at top level
      contact.company = fcData.organization;
      contact.job_title = fcData.title;
    }

    // Photo - check both top level and details
    const photos = fcData.photos || details.photos;
    if (photos && photos.length > 0) {
      contact.avatar_url = photos[0].value || photos[0].url;
    } else if (fcData.avatar) {
      contact.avatar_url = fcData.avatar;
    }

    // Social profiles - check multiple locations
    // Top level linkedin/twitter fields
    if (fcData.linkedin) {
      contact.linkedin_url = fcData.linkedin;
    }
    if (fcData.twitter) {
      contact.twitter_url = fcData.twitter;
    }

    // Check details.profiles (object format like {linkedin: {url: ...}})
    const profilesObj = details.profiles;
    if (profilesObj && typeof profilesObj === 'object') {
      if (profilesObj.linkedin?.url && !contact.linkedin_url) {
        contact.linkedin_url = profilesObj.linkedin.url;
      }
      if (profilesObj.twitter?.url && !contact.twitter_url) {
        contact.twitter_url = profilesObj.twitter.url;
      }
      if (profilesObj.facebook?.url && !contact.facebook_url) {
        contact.facebook_url = profilesObj.facebook.url;
      }
    }

    // Check top-level profiles array
    if (fcData.profiles && Array.isArray(fcData.profiles)) {
      for (const profile of fcData.profiles) {
        const url = profile.url || profile.value;
        const network = (profile.network || profile.type || profile.service || '').toLowerCase();

        if (network.includes('linkedin') && !contact.linkedin_url) {
          contact.linkedin_url = url;
        } else if ((network.includes('twitter') || network.includes('x.com')) && !contact.twitter_url) {
          contact.twitter_url = url;
        } else if (network.includes('facebook') && !contact.facebook_url) {
          contact.facebook_url = url;
        }
      }
    }

    // Check socialProfiles array
    if (fcData.socialProfiles && Array.isArray(fcData.socialProfiles)) {
      for (const profile of fcData.socialProfiles) {
        const url = profile.url;
        const network = (profile.network || profile.type || profile.service || '').toLowerCase();

        if (network.includes('linkedin') && !contact.linkedin_url) {
          contact.linkedin_url = url;
        } else if ((network.includes('twitter') || network.includes('x')) && !contact.twitter_url) {
          contact.twitter_url = url;
        } else if (network.includes('facebook') && !contact.facebook_url) {
          contact.facebook_url = url;
        }
      }
    }

    console.log('Parsed contact data:', contact);

    return new Response(
      JSON.stringify({
        success: true,
        contact,
        raw: fcData // Include raw data for debugging
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in contact-lookup:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
