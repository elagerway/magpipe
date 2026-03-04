/**
 * Contact Lookup - Enriches contact data using Apollo.io API
 * Takes a phone number or email, returns enriched contact info
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const { phone, email } = await req.json();

    if (!phone && !email) {
      return new Response(
        JSON.stringify({ error: 'Phone number or email required' }),
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

    // Call Apollo API
    const apolloApiKey = Deno.env.get('APOLLO_API_KEY');
    if (!apolloApiKey) {
      return new Response(
        JSON.stringify({ error: 'Apollo API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Looking up contact for ${email ? `email: ${email}` : `phone: ${phone}`}`);

    // Build Apollo request body
    const apolloBody: Record<string, unknown> = {};
    if (email) apolloBody.email = email;
    // Apollo doesn't support direct phone lookup — use email when available
    // For phone-only lookups, we pass it but Apollo may not find a match
    if (phone && !email) {
      // Apollo doesn't have a phone lookup endpoint, so return not found for phone-only
      return new Response(
        JSON.stringify({ error: 'Apollo requires email for enrichment. Phone-only lookup not supported.', notFound: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apolloResponse = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      headers: {
        'x-api-key': apolloApiKey,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(apolloBody),
    });

    if (!apolloResponse.ok) {
      const errorText = await apolloResponse.text();
      console.error('Apollo API error:', apolloResponse.status, errorText);

      if (apolloResponse.status === 404 || apolloResponse.status === 422) {
        return new Response(
          JSON.stringify({ error: 'No data found', notFound: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Lookup service error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apolloData = await apolloResponse.json();
    console.log('Apollo response:', JSON.stringify(apolloData).substring(0, 500));

    const person = apolloData.person;
    if (!person) {
      return new Response(
        JSON.stringify({ error: 'No data found', notFound: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse Apollo response into our contact format
    const contact: Record<string, unknown> = {};

    // Name
    if (person.name) {
      contact.name = person.name;
    } else if (person.first_name || person.last_name) {
      contact.name = [person.first_name, person.last_name].filter(Boolean).join(' ');
    }
    contact.first_name = person.first_name || '';
    contact.last_name = person.last_name || '';

    // Email
    if (person.email) {
      contact.email = person.email;
    }

    // Location
    if (person.city || person.state || person.country) {
      contact.city = person.city;
      contact.region = person.state;
      contact.country = person.country;
      const addressParts = [person.city, person.state, person.country].filter(Boolean);
      if (addressParts.length > 0) {
        contact.address = addressParts.join(', ');
      }
    }

    // Employment
    if (person.title) {
      contact.job_title = person.title;
    }
    if (person.organization?.name) {
      contact.company = person.organization.name;
    }

    // Photo
    if (person.photo_url) {
      contact.avatar_url = person.photo_url;
    }

    // Social profiles
    if (person.linkedin_url) {
      contact.linkedin_url = person.linkedin_url;
    }
    if (person.twitter_url) {
      contact.twitter_url = person.twitter_url;
    }
    if (person.facebook_url) {
      contact.facebook_url = person.facebook_url;
    }

    console.log('Parsed contact data:', contact);

    return new Response(
      JSON.stringify({
        success: true,
        contact,
        raw: apolloData // Include raw data for debugging
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
