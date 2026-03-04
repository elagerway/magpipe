import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14.10.0'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
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
      .select('id, email, name, stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check if user is an organization owner (only owners can manage billing)
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .single()

    if (membership && membership.role !== 'owner') {
      return new Response(JSON.stringify({ error: 'Only organization owners can manage billing' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create Stripe customer if one doesn't exist
    let customerId = profile.stripe_customer_id

    if (!customerId) {
      console.log('Creating new Stripe customer for user:', user.id)
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

      console.log('Created Stripe customer:', customerId)
    }

    // Parse request body
    const body = await req.json().catch(() => ({}))
    const { action, returnUrl = 'http://localhost:3000/settings' } = body

    // List Stripe charges (receipts/invoices)
    if (action === 'list_invoices') {
      const charges = await stripe.charges.list({
        customer: customerId,
        limit: 20
      })

      const invoices = charges.data.map(charge => ({
        id: charge.id,
        date: new Date(charge.created * 1000).toISOString(),
        amount: charge.amount / 100,
        description: charge.description || 'Credit purchase',
        status: charge.status,
        receipt_url: charge.receipt_url
      }))

      return new Response(JSON.stringify({ invoices }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl
    })

    return new Response(JSON.stringify({
      url: session.url
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error creating portal session:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
