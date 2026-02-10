import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    // Initialize Stripe
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey) {
      throw new Error('Stripe secret key not configured')
    }
    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient()
    })

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verify user authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, email, name, plan, stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check if user is an organization member - only owners can manage billing
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('status', 'approved')

    const hasNonOwnerMembership = memberships?.some(m => m.role !== 'owner')
    const hasOwnerMembership = memberships?.some(m => m.role === 'owner')

    if (hasNonOwnerMembership && !hasOwnerMembership) {
      return new Response(JSON.stringify({ error: 'Only organization owners can manage billing' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check if already on pro
    if (profile.plan === 'pro') {
      return new Response(JSON.stringify({ error: 'Already on Pro plan' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get or create Stripe customer
    let customerId = profile.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email,
        name: profile.name || undefined,
        metadata: {
          supabase_user_id: user.id
        }
      })
      customerId = customer.id

      // Save customer ID to database
      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    // Parse request body for success/cancel URLs
    const body = await req.json().catch(() => ({}))
    const successUrl = body.successUrl || 'http://localhost:3000/settings?billing=success'
    const cancelUrl = body.cancelUrl || 'http://localhost:3000/settings?billing=canceled'

    // Create checkout session
    const priceId = Deno.env.get('STRIPE_PRO_PRICE_ID')
    if (!priceId) {
      throw new Error('Stripe price ID not configured')
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: {
          supabase_user_id: user.id
        }
      },
      metadata: {
        supabase_user_id: user.id
      }
    })

    return new Response(JSON.stringify({
      sessionId: session.id,
      url: session.url
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error creating checkout session:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
